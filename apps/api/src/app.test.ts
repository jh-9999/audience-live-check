import {
  checkInResponseSchema,
  healthResponseSchema,
  heartbeatResponseSchema,
} from "@live-check-in-demo/shared";
import pino, { type DestinationStream, type Logger } from "pino";
import request from "supertest";
import { describe, expect, it } from "vitest";
import { createApp } from "./app.js";
import { loadConfig } from "./config.js";
import { type Clock, SessionTokenService } from "./session-token.js";

const TEST_SECRET_A = "test-signing-secret-a-is-at-least-32-bytes";
const TEST_SECRET_B = "test-signing-secret-b-is-at-least-32-bytes";
const WEB_ORIGIN = "http://localhost:5173";

type TestAppOptions = {
  readonly signingSecret?: string;
  readonly instanceId?: string;
  readonly clock?: Clock;
  readonly logger?: Logger;
};

function createTestApp(options: TestAppOptions = {}) {
  const signingSecret = options.signingSecret ?? TEST_SECRET_A;
  const config = {
    port: 8080,
    webOrigin: WEB_ORIGIN,
    instanceId: options.instanceId ?? "test-api",
    signingSecret,
    usesUnsafeDevelopmentSigningSecret: false,
  } as const;
  const tokenService = new SessionTokenService({
    signingSecret,
    ...(options.clock === undefined ? {} : { clock: options.clock }),
  });

  return createApp({
    config,
    tokenService,
    logger: options.logger ?? pino({ enabled: false }),
  });
}

function bearer(sessionToken: string): string {
  return `Bearer ${sessionToken}`;
}

function tamperSignature(sessionToken: string): string {
  const [payloadSegment, signatureSegment = ""] = sessionToken.split(".");
  const replacement = signatureSegment.startsWith("A") ? "B" : "A";
  return `${payloadSegment}.${replacement}${signatureSegment.slice(1)}`;
}

function createLogCapture(): {
  readonly logger: Logger;
  readonly output: string[];
} {
  const output: string[] = [];
  const destination: DestinationStream = {
    write(message): void {
      output.push(message);
    },
  };
  return {
    logger: pino({ base: null }, destination),
    output,
  };
}

describe("check-in API", () => {
  it("returns the health contract", async () => {
    const response = await request(createTestApp()).get("/health");

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      status: "ok",
      service: "live-check-in-api",
      version: "1.0.0",
    });
    expect(() => healthResponseSchema.parse(response.body)).not.toThrow();
  });

  it("issues an opaque signed token without exposing the session ID", async () => {
    const response = await request(createTestApp()).post("/api/check-ins");

    expect(response.status).toBe(201);
    expect(response.body).not.toHaveProperty("sessionId");
    expect(response.body.sessionToken).toMatch(
      /^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/,
    );
    expect(response.body.heartbeatIntervalMs).toBe(3_000);
    expect(() => checkInResponseSchema.parse(response.body)).not.toThrow();
  });

  it("accepts a valid Bearer heartbeat", async () => {
    const app = createTestApp({ instanceId: "task-a" });
    const checkIn = await request(app).post("/api/check-ins");
    const heartbeat = await request(app)
      .post("/api/check-ins/heartbeat")
      .set("Authorization", bearer(String(checkIn.body.sessionToken)));

    expect(heartbeat.status).toBe(200);
    expect(heartbeat.body).toMatchObject({ ok: true, servedBy: "task-a" });
    expect(() => heartbeatResponseSchema.parse(heartbeat.body)).not.toThrow();
  });

  it("verifies a task A token on task B when both use the same secret", async () => {
    const taskA = createTestApp({ instanceId: "task-a" });
    const taskB = createTestApp({ instanceId: "task-b" });
    const checkIn = await request(taskA).post("/api/check-ins");
    const heartbeat = await request(taskB)
      .post("/api/check-ins/heartbeat")
      .set("Authorization", bearer(String(checkIn.body.sessionToken)));

    expect(heartbeat.status).toBe(200);
    expect(heartbeat.body.servedBy).toBe("task-b");
  });

  it("rejects a task A token on a task with a different secret", async () => {
    const taskA = createTestApp({ signingSecret: TEST_SECRET_A });
    const wrongTask = createTestApp({ signingSecret: TEST_SECRET_B });
    const checkIn = await request(taskA).post("/api/check-ins");
    const heartbeat = await request(wrongTask)
      .post("/api/check-ins/heartbeat")
      .set("Authorization", bearer(String(checkIn.body.sessionToken)));

    expect(heartbeat.status).toBe(401);
    expect(heartbeat.body).toEqual({
      error: "invalid_session",
      message: "유효하지 않거나 만료된 session token입니다.",
    });
  });

  it("rejects a tampered token", async () => {
    const app = createTestApp();
    const checkIn = await request(app).post("/api/check-ins");
    const heartbeat = await request(app)
      .post("/api/check-ins/heartbeat")
      .set(
        "Authorization",
        bearer(tamperSignature(String(checkIn.body.sessionToken))),
      );

    expect(heartbeat.status).toBe(401);
    expect(heartbeat.body.error).toBe("invalid_session");
  });

  it("rejects an expired token", async () => {
    let now = 10_000;
    const app = createTestApp({ clock: { now: () => now } });
    const checkIn = await request(app).post("/api/check-ins");
    now = 70_000;
    const heartbeat = await request(app)
      .post("/api/check-ins/heartbeat")
      .set("Authorization", bearer(String(checkIn.body.sessionToken)));

    expect(heartbeat.status).toBe(401);
    expect(heartbeat.body.error).toBe("invalid_session");
  });

  it.each([
    undefined,
    "Basic abc",
    "Bearer",
    "Bearer malformed",
  ])("rejects a missing or malformed Authorization header: %j", async (authorization) => {
    const operation = request(createTestApp()).post("/api/check-ins/heartbeat");
    if (authorization !== undefined) {
      operation.set("Authorization", authorization);
    }

    const response = await operation;

    expect(response.status).toBe(401);
    expect(response.body.error).toBe("invalid_session");
  });

  it("does not keep the session-ID heartbeat route", async () => {
    const response = await request(createTestApp()).post(
      "/api/check-ins/00000000-0000-4000-8000-000000000000/heartbeat",
    );

    expect(response.status).toBe(404);
    expect(response.body.error).toBe("not_found");
  });

  it("allows Authorization and Content-Type in CORS preflight", async () => {
    const response = await request(createTestApp())
      .options("/api/check-ins/heartbeat")
      .set("Origin", WEB_ORIGIN)
      .set("Access-Control-Request-Method", "POST")
      .set("Access-Control-Request-Headers", "Authorization, Content-Type");

    expect(response.status).toBe(204);
    expect(response.headers["access-control-allow-origin"]).toBe(WEB_ORIGIN);
    expect(
      String(response.headers["access-control-allow-headers"]).toLowerCase(),
    ).toContain("authorization");
    expect(
      String(response.headers["access-control-allow-headers"]).toLowerCase(),
    ).toContain("content-type");
  });

  it("returns a consistent JSON 404 and CORS header", async () => {
    const response = await request(createTestApp())
      .get("/unknown")
      .set("Origin", WEB_ORIGIN);

    expect(response.status).toBe(404);
    expect(response.body.error).toBe("not_found");
    expect(response.headers["access-control-allow-origin"]).toBe(WEB_ORIGIN);
  });

  it("returns a consistent JSON 400 for malformed JSON", async () => {
    const response = await request(createTestApp())
      .post("/api/check-ins")
      .set("content-type", "application/json")
      .send("{");

    expect(response.status).toBe(400);
    expect(response.body).toEqual({
      error: "invalid_json",
      message: "요청 본문 JSON이 올바르지 않습니다.",
    });
  });

  it("keeps the 16kb JSON request body limit", async () => {
    const response = await request(createTestApp())
      .post("/api/check-ins")
      .set("content-type", "application/json")
      .send({ padding: "x".repeat(20_000) });

    expect(response.status).not.toBe(201);
    expect(response.body.error).toBe("internal_error");
  });

  it("does not expose a token or secret in logs and error responses", async () => {
    const capture = createLogCapture();
    const app = createTestApp({ logger: capture.logger });
    const checkIn = await request(app).post("/api/check-ins");
    const sessionToken = String(checkIn.body.sessionToken);
    const response = await request(app)
      .post("/api/check-ins/heartbeat")
      .set("Authorization", bearer(tamperSignature(sessionToken)));
    const logs = capture.output.join("");
    const errorBody = JSON.stringify(response.body);

    expect(logs).not.toContain(sessionToken);
    expect(logs).not.toContain(TEST_SECRET_A);
    expect(errorBody).not.toContain(sessionToken);
    expect(errorBody).not.toContain(TEST_SECRET_A);
  });
});

describe("API configuration", () => {
  it("loads development defaults and supports environment overrides", () => {
    const defaults = loadConfig({});
    const overridden = loadConfig({
      NODE_ENV: "test",
      PORT: "9090",
      WEB_ORIGIN: "http://localhost:4173",
      INSTANCE_ID: "qa-api",
      CHECK_IN_SIGNING_SECRET: TEST_SECRET_A,
    });

    expect(defaults.port).toBe(8080);
    expect(defaults.usesUnsafeDevelopmentSigningSecret).toBe(true);
    expect(overridden).toEqual({
      port: 9090,
      webOrigin: "http://localhost:4173",
      instanceId: "qa-api",
      signingSecret: TEST_SECRET_A,
      usesUnsafeDevelopmentSigningSecret: false,
    });
  });

  it("uses the unsafe development fallback when the configured secret is empty", () => {
    const config = loadConfig({ CHECK_IN_SIGNING_SECRET: "" });

    expect(config.usesUnsafeDevelopmentSigningSecret).toBe(true);
    expect(
      Buffer.byteLength(config.signingSecret, "utf8"),
    ).toBeGreaterThanOrEqual(32);
  });

  it("fails closed when the production signing secret is missing", () => {
    expect(() => loadConfig({ NODE_ENV: "production" })).toThrow(
      "CHECK_IN_SIGNING_SECRET",
    );
  });

  it("fails closed when the production signing secret is shorter than 32 bytes", () => {
    expect(() =>
      loadConfig({
        NODE_ENV: "production",
        CHECK_IN_SIGNING_SECRET: "short",
      }),
    ).toThrow("at least 32 bytes");
  });
});
