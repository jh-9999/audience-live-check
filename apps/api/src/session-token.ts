import { createHmac, randomUUID, timingSafeEqual } from "node:crypto";
import { z } from "zod";

export const CHECK_IN_DURATION_MS = 60_000;
export const HEARTBEAT_INTERVAL_MS = 3_000;

export type Clock = {
  readonly now: () => number;
};

export type IssuedSession = {
  readonly sessionToken: string;
  readonly expiresAt: string;
  readonly heartbeatIntervalMs: number;
};

export type VerificationResult =
  | { readonly ok: true; readonly receivedAt: string }
  | { readonly ok: false; readonly reason: "invalid" | "expired" };

const systemClock: Clock = { now: () => Date.now() };
const tokenSegmentPattern = /^[A-Za-z0-9_-]+$/;
const sessionPayloadSchema = z
  .object({
    sid: z.string().uuid(),
    iat: z.number().int().nonnegative().safe(),
    exp: z.number().int().positive().safe(),
  })
  .strict()
  .refine(
    (payload) => payload.exp - payload.iat === CHECK_IN_DURATION_MS,
    "invalid session duration",
  );

type SessionPayload = z.infer<typeof sessionPayloadSchema>;

export class SessionTokenService {
  private readonly signingSecret: Buffer;
  private readonly clock: Clock;

  public constructor(options: {
    readonly signingSecret: string;
    readonly clock?: Clock;
  }) {
    this.signingSecret = Buffer.from(options.signingSecret, "utf8");
    this.clock = options.clock ?? systemClock;
  }

  public issue(): IssuedSession {
    const issuedAtMs = this.clock.now();
    const expiresAtMs = issuedAtMs + CHECK_IN_DURATION_MS;
    const payload: SessionPayload = {
      sid: randomUUID(),
      iat: issuedAtMs,
      exp: expiresAtMs,
    };
    const payloadSegment = Buffer.from(JSON.stringify(payload)).toString(
      "base64url",
    );
    const signatureSegment = this.sign(payloadSegment).toString("base64url");

    return {
      sessionToken: `${payloadSegment}.${signatureSegment}`,
      expiresAt: new Date(expiresAtMs).toISOString(),
      heartbeatIntervalMs: HEARTBEAT_INTERVAL_MS,
    };
  }

  public verify(sessionToken: string): VerificationResult {
    const segments = sessionToken.split(".");
    if (segments.length !== 2) {
      return { ok: false, reason: "invalid" };
    }

    const [payloadSegment = "", signatureSegment = ""] = segments;
    const payloadBytes = decodeCanonicalBase64Url(payloadSegment);
    const providedSignature = decodeCanonicalBase64Url(signatureSegment);
    if (payloadBytes === null || providedSignature === null) {
      return { ok: false, reason: "invalid" };
    }

    const expectedSignature = this.sign(payloadSegment);
    if (
      providedSignature.length !== expectedSignature.length ||
      !timingSafeEqual(providedSignature, expectedSignature)
    ) {
      return { ok: false, reason: "invalid" };
    }

    const payload = parseSessionPayload(payloadBytes);
    if (payload === null) {
      return { ok: false, reason: "invalid" };
    }

    const now = this.clock.now();
    if (payload.exp <= now) {
      return { ok: false, reason: "expired" };
    }

    return { ok: true, receivedAt: new Date(now).toISOString() };
  }

  private sign(payloadSegment: string): Buffer {
    return createHmac("sha256", this.signingSecret)
      .update(payloadSegment)
      .digest();
  }
}

function decodeCanonicalBase64Url(segment: string): Buffer | null {
  if (!tokenSegmentPattern.test(segment)) {
    return null;
  }

  const decoded = Buffer.from(segment, "base64url");
  return decoded.toString("base64url") === segment ? decoded : null;
}

function parseSessionPayload(payloadBytes: Buffer): SessionPayload | null {
  let candidate: unknown;
  try {
    candidate = JSON.parse(payloadBytes.toString("utf8"));
  } catch (error) {
    if (error instanceof SyntaxError) {
      return null;
    }
    throw error;
  }

  const parsed = sessionPayloadSchema.safeParse(candidate);
  return parsed.success ? parsed.data : null;
}
