import type {
  HealthResponse,
  HeartbeatResponse,
} from "@live-check-in-demo/shared";
import cors from "cors";
import express, {
  type Express,
  type NextFunction,
  type Request,
  type Response,
} from "express";
import pino, { type Logger } from "pino";
import type { ApiConfig } from "./config.js";
import { loadConfig } from "./config.js";
import { SessionTokenService } from "./session-token.js";

type AppOptions = {
  readonly config?: ApiConfig;
  readonly tokenService?: SessionTokenService;
  readonly logger?: Logger;
};

const bearerTokenPattern = /^Bearer ([A-Za-z0-9_-]+\.[A-Za-z0-9_-]+)$/;

export function createApp(options: AppOptions = {}): Express {
  const config = options.config ?? loadConfig();
  const tokenService =
    options.tokenService ??
    new SessionTokenService({ signingSecret: config.signingSecret });
  const logger = options.logger ?? pino({ base: null });
  const app = express();

  app.disable("x-powered-by");
  app.use(
    cors({
      origin: config.webOrigin,
      allowedHeaders: ["Authorization", "Content-Type"],
    }),
  );
  app.use(express.json({ limit: "16kb" }));
  app.use(createRequestLogger(logger));

  app.get("/health", (_request, response) => {
    const health: HealthResponse = {
      status: "ok",
      service: "live-check-in-api",
      version: "1.0.0",
    };
    response.json(health);
  });

  app.post("/api/check-ins", (_request, response) => {
    response.status(201).json(tokenService.issue());
  });

  app.post("/api/check-ins/heartbeat", (request, response) => {
    const authorization = request.get("authorization") ?? "";
    const match = bearerTokenPattern.exec(authorization);
    const result =
      match?.[1] === undefined ? null : tokenService.verify(match[1]);

    if (result === null || !result.ok) {
      response.status(401).json({
        error: "invalid_session",
        message: "유효하지 않거나 만료된 session token입니다.",
      });
      return;
    }

    const heartbeat: HeartbeatResponse = {
      ok: true,
      receivedAt: result.receivedAt,
      servedBy: config.instanceId,
    };
    response.json(heartbeat);
  });

  app.use((_request, response) => {
    response
      .status(404)
      .json({ error: "not_found", message: "요청한 경로를 찾을 수 없습니다." });
  });
  app.use(createErrorHandler(logger));

  return app;
}

function createRequestLogger(logger: Logger) {
  return (request: Request, response: Response, next: NextFunction): void => {
    response.on("finish", () => {
      logger.info(
        { method: request.method, statusCode: response.statusCode },
        "request",
      );
    });
    next();
  };
}

function createErrorHandler(logger: Logger) {
  return (
    error: unknown,
    _request: Request,
    response: Response,
    _next: NextFunction,
  ): void => {
    const isInvalidJson = error instanceof SyntaxError;
    if (error instanceof Error) {
      logger.error({ errorType: error.constructor.name }, "request_error");
    } else {
      logger.error("request_error");
    }
    response.status(isInvalidJson ? 400 : 500).json(
      isInvalidJson
        ? {
            error: "invalid_json",
            message: "요청 본문 JSON이 올바르지 않습니다.",
          }
        : { error: "internal_error", message: "서버 오류가 발생했습니다." },
    );
  };
}
