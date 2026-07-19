import { describe, expect, it } from "vitest";
import { SessionTokenService } from "./session-token.js";

const TEST_SECRET_A = "test-signing-secret-a-is-at-least-32-bytes";
const TEST_SECRET_B = "test-signing-secret-b-is-at-least-32-bytes";

describe("stateless session token", () => {
  it("issues a minimal signed session that expires after 60 seconds", () => {
    const service = new SessionTokenService({
      signingSecret: TEST_SECRET_A,
      clock: { now: () => 10_000 },
    });

    const issued = service.issue();
    const [payloadSegment, signatureSegment] = issued.sessionToken.split(".");
    const payload: unknown = JSON.parse(
      Buffer.from(payloadSegment ?? "", "base64url").toString("utf8"),
    );

    expect(signatureSegment).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(payload).toEqual({
      sid: expect.stringMatching(
        /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
      ),
      iat: 10_000,
      exp: 70_000,
    });
    expect(issued).toMatchObject({
      expiresAt: "1970-01-01T00:01:10.000Z",
      heartbeatIntervalMs: 3_000,
    });
  });

  it("verifies a token on another instance with the same secret", () => {
    const issuer = new SessionTokenService({
      signingSecret: TEST_SECRET_A,
      clock: { now: () => 10_000 },
    });
    const verifier = new SessionTokenService({
      signingSecret: TEST_SECRET_A,
      clock: { now: () => 20_000 },
    });

    expect(verifier.verify(issuer.issue().sessionToken)).toEqual({
      ok: true,
      receivedAt: "1970-01-01T00:00:20.000Z",
    });
  });

  it("rejects a token signed with a different secret", () => {
    const issuer = new SessionTokenService({
      signingSecret: TEST_SECRET_A,
      clock: { now: () => 10_000 },
    });
    const verifier = new SessionTokenService({
      signingSecret: TEST_SECRET_B,
      clock: { now: () => 20_000 },
    });

    expect(verifier.verify(issuer.issue().sessionToken)).toEqual({
      ok: false,
      reason: "invalid",
    });
  });

  it("rejects a token whose signature was tampered with", () => {
    const service = new SessionTokenService({
      signingSecret: TEST_SECRET_A,
      clock: { now: () => 10_000 },
    });
    const issued = service.issue();
    const [payloadSegment, signatureSegment = ""] =
      issued.sessionToken.split(".");
    const replacement = signatureSegment.startsWith("A") ? "B" : "A";
    const tampered = `${payloadSegment}.${replacement}${signatureSegment.slice(1)}`;

    expect(service.verify(tampered)).toEqual({
      ok: false,
      reason: "invalid",
    });
  });

  it.each([
    "",
    "not-a-token",
    "payload.signature.extra",
    "payload.invalid+base64",
  ])("rejects malformed token %j", (sessionToken) => {
    const service = new SessionTokenService({
      signingSecret: TEST_SECRET_A,
      clock: { now: () => 10_000 },
    });

    expect(service.verify(sessionToken)).toEqual({
      ok: false,
      reason: "invalid",
    });
  });

  it("rejects an expired token", () => {
    let now = 10_000;
    const service = new SessionTokenService({
      signingSecret: TEST_SECRET_A,
      clock: { now: () => now },
    });
    const issued = service.issue();

    now = 70_000;

    expect(service.verify(issued.sessionToken)).toEqual({
      ok: false,
      reason: "expired",
    });
  });
});
