// @vitest-environment node

import type {
  CheckInResponse,
  HeartbeatResponse,
} from "@live-check-in-demo/shared";
import { describe, expect, it, vi } from "vitest";
import { createApiClient } from "./api-client";

const checkInResponse: CheckInResponse = {
  sessionToken: "payload.signature",
  expiresAt: "2099-01-01T00:00:00.000Z",
  heartbeatIntervalMs: 3_000,
};

const heartbeatResponse: HeartbeatResponse = {
  ok: true,
  receivedAt: "2099-01-01T00:00:03.000Z",
  servedBy: "task-b",
};

function jsonResponse(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
}

function toRequest(input: RequestInfo | URL, init?: RequestInit): Request {
  return input instanceof Request ? input : new Request(input, init);
}

function requestCompatibleSignal(): AbortSignal {
  return new Request("http://localhost").signal;
}

describe("API client", () => {
  it("parses a signed-token check-in response", async () => {
    const fetchImplementation = vi.fn(
      async (_input: RequestInfo | URL, _init?: RequestInit) =>
        jsonResponse(checkInResponse),
    );
    const client = createApiClient(fetchImplementation as typeof fetch);

    await expect(
      client.createCheckIn(requestCompatibleSignal()),
    ).resolves.toEqual(checkInResponse);
  });

  it("sends the token only in the heartbeat Authorization header", async () => {
    const fetchImplementation = vi.fn(
      async (_input: RequestInfo | URL, _init?: RequestInit) =>
        jsonResponse(heartbeatResponse),
    );
    const client = createApiClient(fetchImplementation as typeof fetch);

    await expect(
      client.sendHeartbeat(
        checkInResponse.sessionToken,
        requestCompatibleSignal(),
      ),
    ).resolves.toEqual(heartbeatResponse);

    expect(fetchImplementation).toHaveBeenCalledTimes(1);
    const call = fetchImplementation.mock.calls[0];
    expect(call).toBeDefined();
    const request = toRequest(call?.[0] ?? "", call?.[1]);
    expect(request.url).toBe("http://localhost:8080/api/check-ins/heartbeat");
    expect(request.headers.get("authorization")).toBe(
      `Bearer ${checkInResponse.sessionToken}`,
    );
    expect(request.url).not.toContain(checkInResponse.sessionToken);
  });
});
