import os from "node:os";
import { z } from "zod";

const environmentSchema = z.object({
  NODE_ENV: z
    .enum(["development", "test", "production"])
    .default("development"),
  PORT: z.coerce.number().int().positive().default(8080),
  WEB_ORIGIN: z.string().url().default("http://localhost:5173"),
  INSTANCE_ID: z.string().trim().min(1).optional(),
  CHECK_IN_SIGNING_SECRET: z.string().optional(),
});

const MIN_SIGNING_SECRET_BYTES = 32;
const UNSAFE_DEVELOPMENT_SIGNING_SECRET =
  "unsafe-development-only-check-in-secret";

export type ApiConfig = {
  readonly port: number;
  readonly webOrigin: string;
  readonly instanceId: string;
  readonly signingSecret: string;
  readonly usesUnsafeDevelopmentSigningSecret: boolean;
};

export function loadConfig(
  environment: NodeJS.ProcessEnv = process.env,
): ApiConfig {
  const parsed = environmentSchema.parse({
    NODE_ENV: environment["NODE_ENV"],
    PORT: environment["PORT"],
    WEB_ORIGIN: environment["WEB_ORIGIN"],
    INSTANCE_ID: environment["INSTANCE_ID"],
    CHECK_IN_SIGNING_SECRET: environment["CHECK_IN_SIGNING_SECRET"],
  });

  const configuredSigningSecret = parsed.CHECK_IN_SIGNING_SECRET;
  const isSigningSecretMissing =
    configuredSigningSecret === undefined ||
    configuredSigningSecret.length === 0;

  if (parsed.NODE_ENV === "production" && isSigningSecretMissing) {
    throw new Error("CHECK_IN_SIGNING_SECRET is required in production");
  }
  if (
    !isSigningSecretMissing &&
    configuredSigningSecret !== undefined &&
    Buffer.byteLength(configuredSigningSecret, "utf8") <
      MIN_SIGNING_SECRET_BYTES
  ) {
    throw new Error("CHECK_IN_SIGNING_SECRET must be at least 32 bytes");
  }

  return {
    port: parsed.PORT,
    webOrigin: parsed.WEB_ORIGIN,
    instanceId: (parsed.INSTANCE_ID ?? os.hostname()) || "local-api",
    signingSecret: isSigningSecretMissing
      ? UNSAFE_DEVELOPMENT_SIGNING_SECRET
      : configuredSigningSecret,
    usesUnsafeDevelopmentSigningSecret: isSigningSecretMissing,
  };
}
