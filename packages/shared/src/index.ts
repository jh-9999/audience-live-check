import { z } from "zod";

export const healthResponseSchema = z.object({
  status: z.literal("ok"),
  service: z.literal("live-check-in-api"),
  version: z.literal("1.0.0"),
});

export const checkInResponseSchema = z.object({
  sessionToken: z.string().min(1),
  expiresAt: z.string().datetime({ offset: true }),
  heartbeatIntervalMs: z.number().int().positive(),
});

export const heartbeatResponseSchema = z.object({
  ok: z.literal(true),
  receivedAt: z.string().datetime({ offset: true }),
  servedBy: z.string().min(1),
});

export type HealthResponse = z.infer<typeof healthResponseSchema>;
export type CheckInResponse = z.infer<typeof checkInResponseSchema>;
export type HeartbeatResponse = z.infer<typeof heartbeatResponseSchema>;
