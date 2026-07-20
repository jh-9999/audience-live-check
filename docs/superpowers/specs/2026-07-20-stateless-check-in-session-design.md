# Stateless Check-In Session Design

## Context

The API currently stores each 60-second check-in session in an in-process
`Map`. A heartbeat succeeds only when it reaches the same process that created
the session. With an ALB distributing traffic across up to three ECS/Fargate
tasks, a heartbeat can reach a different task and fail as `invalid_session`.

The application will replace process-local session state with a short-lived,
HMAC-SHA256-signed session token. No database, Redis deployment, sticky
session, or AWS infrastructure change is part of this work.

## Chosen Approach

Use a compact custom token built only with Node.js `crypto`:

```text
base64url(JSON payload).base64url(HMAC-SHA256(payload segment))
```

The payload contains only:

- `sid`: a session ID generated with `crypto.randomUUID()`
- `iat`: issued-at time as Unix epoch milliseconds
- `exp`: expiry time as Unix epoch milliseconds, 60 seconds after issuance

The token is opaque to the browser contract. It contains no IP address,
User-Agent, personal data, or deployment metadata.

Alternatives considered:

1. A JWT library would provide a standard container but adds a dependency and
   features this single-purpose, 60-second token does not need.
2. A custom binary payload would be smaller but harder to inspect and test,
   with no meaningful benefit at this traffic level.

The compact JSON format is preferred because it is dependency-free, explicit,
and easy to validate.

## API and Token Flow

### Session issuance

`POST /api/check-ins` creates a token and returns `201` with:

```json
{
  "sessionToken": "<opaque signed token>",
  "expiresAt": "2026-07-20T00:01:00.000Z",
  "heartbeatIntervalMs": 3000
}
```

The session ID remains inside the signed payload and is not exposed as a URL
component. The API keeps no server-side session record or cleanup timer.

### Heartbeat validation

The browser calls `POST /api/check-ins/heartbeat` with:

```http
Authorization: Bearer <sessionToken>
Content-Type: application/json
```

The old `POST /api/check-ins/:sessionId/heartbeat` route is removed. Tokens are
never accepted in a path or query string.

Validation performs these steps:

1. Parse a single Bearer credential without logging it.
2. Require exactly two non-empty base64url token segments.
3. Recompute HMAC-SHA256 over the payload segment.
4. Require the decoded signature to have the SHA-256 digest length, then use
   `crypto.timingSafeEqual` for comparison.
5. Decode and schema-check the payload, including UUID and finite integer
   timestamps.
6. Reject tokens whose expiry is at or before the current clock time.

Missing, malformed, tampered, wrongly signed, and expired tokens return `401`
using the existing JSON error shape:

```json
{
  "error": "invalid_session",
  "message": "유효하지 않거나 만료된 session token입니다."
}
```

A valid heartbeat returns `ok`, `receivedAt`, and `servedBy`. `servedBy`
continues to use `INSTANCE_ID`, falling back to the hostname.

## Components

### `apps/api/src/session-token.ts`

A focused token service owns session issuance and verification. It accepts a
signing secret and injectable clock, allowing two separately created API apps
to prove cross-task verification without shared state. Token parsing failures
are represented as a small result union and never include token contents.

### `apps/api/src/config.ts`

`ApiConfig` gains `signingSecret` and an unsafe-development-default indicator.
In production, `CHECK_IN_SIGNING_SECRET` is mandatory and must contain at least
32 UTF-8 bytes. Missing or short production secrets fail during configuration
loading before the server listens.

For local development only, a clearly named unsafe built-in value may be used
when the variable is absent. Server startup emits a warning containing no
secret. Tests always inject a fixed explicit secret of at least 32 bytes.

### Express application

The app receives a token service or creates one from `config.signingSecret`.
The existing `16kb` JSON body limit, `x-powered-by` removal, consistent JSON
errors, health endpoint, and method/status-only request logs remain in place.
CORS explicitly permits `Authorization` and `Content-Type`.

### Shared and frontend contracts

`CheckInResponse` replaces `sessionId` with `sessionToken`. The API client sends
that token only in the Authorization header. Local storage temporarily keeps
`sessionToken`, `expiresAt`, and `heartbeatIntervalMs`; invalid or expired data
is deleted when read and active data is deleted when the loop completes or
fails.

The existing `AbortController` guard remains the single owner of check-in
creation and the heartbeat loop. Each heartbeat is awaited before the next
3-second wait, so calls are sequential. The latest heartbeat `servedBy` value
is retained in hook state and exposed as development-only DOM metadata without
adding visible UI.

## Security and Logging

- The same secret must be injected into every Fargate task, preferably from
  AWS Secrets Manager through the task definition.
- A different secret intentionally makes cross-task validation fail.
- Neither token nor secret is logged, returned in an error, embedded in a URL,
  or printed by tests.
- Request logs remain limited to HTTP method and response status.
- Error logs remain limited to safe error type labels.
- No raw Authorization header, request body, IP address, or User-Agent is
  included in application logs or token payloads.

## Test Strategy

API tests cover:

- normal token issuance and schema validation;
- normal Bearer heartbeat;
- issuance by task A and verification by task B with the same secret;
- rejection by a task using a different secret;
- tampered, expired, malformed, and missing credentials;
- explicit CORS preflight support for Authorization and Content-Type;
- production secret fail-closed behavior and development fallback behavior;
- absence of known token/secret marker strings from logs and error responses;
- unchanged health, 404, invalid JSON, and body-limit behavior.

Web tests cover:

- one create request despite duplicate button clicks;
- one heartbeat loop under React StrictMode and refresh recovery;
- Authorization-token propagation through the API-client interface;
- sequential heartbeat behavior and AbortController cancellation;
- storage recovery, malformed-data cleanup, and expiry cleanup;
- retention of the latest `servedBy` value without changing the visible UI.

The final gate runs `npm run lint`, `npm run typecheck`, `npm run build`, and
`npm test`. Any sandbox-only local-listener restriction is distinguished from
an application failure and the same test command is rerun with local listener
permission.

## Deployment Contract

SketchCatch should analyze and deploy the existing Web and API application
units. The deployment must configure:

- Web build: `VITE_API_BASE_URL`
- API runtime: `WEB_ORIGIN`, `PORT`, `INSTANCE_ID`, and
  `CHECK_IN_SIGNING_SECRET`

Every API task must receive the exact same production signing secret. A button
press generates one session-issuance request followed by sequential heartbeats
approximately every three seconds for about 60 seconds, producing useful ALB
and CloudWatch observation traffic while remaining stateless across scale-out.
