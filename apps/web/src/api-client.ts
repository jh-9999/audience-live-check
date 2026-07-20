import {
  type CheckInResponse,
  checkInResponseSchema,
  type HeartbeatResponse,
  heartbeatResponseSchema,
} from "@live-check-in-demo/shared";
import ky from "ky";

const configuredBaseUrl = import.meta.env["VITE_API_BASE_URL"];
const apiBaseUrl = configuredBaseUrl ?? "http://localhost:8080";

export type ApiClient = {
  readonly createCheckIn: (signal: AbortSignal) => Promise<CheckInResponse>;
  readonly sendHeartbeat: (
    sessionToken: string,
    signal: AbortSignal,
  ) => Promise<HeartbeatResponse>;
};

export function createApiClient(
  fetchImplementation: typeof globalThis.fetch = globalThis.fetch,
): ApiClient {
  const api = ky.create({
    prefixUrl: apiBaseUrl.replace(/\/$/, ""),
    timeout: 10_000,
    retry: 0,
    headers: { "content-type": "application/json" },
    fetch: fetchImplementation,
  });

  return {
    async createCheckIn(signal): Promise<CheckInResponse> {
      const payload: unknown = await api
        .post("api/check-ins", { signal })
        .json();
      return checkInResponseSchema.parse(payload);
    },

    async sendHeartbeat(sessionToken, signal): Promise<HeartbeatResponse> {
      const payload: unknown = await api
        .post("api/check-ins/heartbeat", {
          signal,
          headers: { authorization: `Bearer ${sessionToken}` },
        })
        .json();
      return heartbeatResponseSchema.parse(payload);
    },
  };
}

const defaultClient = createApiClient();

export const createCheckIn = defaultClient.createCheckIn;
export const sendHeartbeat = defaultClient.sendHeartbeat;
