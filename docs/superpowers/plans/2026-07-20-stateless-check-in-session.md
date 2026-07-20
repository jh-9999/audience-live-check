# Stateless Check-In Session Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace process-local check-in sessions with 60-second HMAC-SHA256 tokens that any ECS/Fargate task sharing one secret can verify.

**Architecture:** A focused API token service issues and verifies a two-segment base64url token containing only `sid`, `iat`, and `exp`. Express accepts the token only as a Bearer credential on a fixed heartbeat endpoint; the React client stores it temporarily, sends sequential heartbeats, and preserves the existing AbortController loop ownership.

**Tech Stack:** Node.js 22 `crypto`, TypeScript, Express 5, Zod, React 19, Ky, Vitest, Supertest, Testing Library, Biome.

## Global Constraints

- Do not add Redis, a database, Terraform, AWS resources, or a new dependency.
- Do not put a token in a URL path or query string.
- Do not log tokens, signing secrets, IP addresses, or User-Agent values.
- Keep the existing UI design, 16kb JSON body limit, and error response shape.
- Production requires `CHECK_IN_SIGNING_SECRET` with at least 32 UTF-8 bytes.
- Tests inject explicit fixed test secrets; no real secret is committed.
- Commit and push each independently verified task to `origin/main`.

---

### Task 1: Stateless Session Token Service

**Files:**
- Create: `apps/api/src/session-token.test.ts`
- Create: `apps/api/src/session-token.ts`

**Interfaces:**
- Consumes: `signingSecret: string` and optional `Clock` with `now(): number`.
- Produces: `SessionTokenService.issue(): IssuedSession` and `SessionTokenService.verify(token): VerificationResult`.

- [ ] **Step 1: Write failing token-service tests**

Create tests that express the complete cryptographic contract before the module exists:

```ts
const TEST_SECRET = "test-signing-secret-a-is-at-least-32-bytes";

it("issues a minimal signed 60-second session", () => {
  const service = new SessionTokenService({
    signingSecret: TEST_SECRET,
    clock: { now: () => 10_000 },
  });

  const issued = service.issue();
  const [payloadSegment, signatureSegment] = issued.sessionToken.split(".");
  const payload = JSON.parse(
    Buffer.from(payloadSegment ?? "", "base64url").toString("utf8"),
  );

  expect(signatureSegment).toBeTruthy();
  expect(Object.keys(payload).sort()).toEqual(["exp", "iat", "sid"]);
  expect(payload).toMatchObject({ iat: 10_000, exp: 70_000 });
  expect(issued).toMatchObject({
    expiresAt: "1970-01-01T00:01:10.000Z",
    heartbeatIntervalMs: 3_000,
  });
});

it("verifies on another service with the same secret", () => {
  const issuer = new SessionTokenService({ signingSecret: TEST_SECRET });
  const verifier = new SessionTokenService({ signingSecret: TEST_SECRET });
  expect(verifier.verify(issuer.issue().sessionToken).ok).toBe(true);
});

it("rejects a token signed with a different secret", () => {
  const issuer = new SessionTokenService({ signingSecret: TEST_SECRET });
  const verifier = new SessionTokenService({
    signingSecret: "different-test-secret-is-also-32-bytes-long",
  });
  expect(verifier.verify(issuer.issue().sessionToken)).toEqual({
    ok: false,
    reason: "invalid",
  });
});

it("rejects a tampered token", () => {
  const service = new SessionTokenService({ signingSecret: TEST_SECRET });
  const issued = service.issue();
  const replacement = issued.sessionToken.endsWith("A") ? "B" : "A";
  const tampered = `${issued.sessionToken.slice(0, -1)}${replacement}`;
  expect(service.verify(tampered)).toEqual({
    ok: false,
    reason: "invalid",
  });
});

it("rejects a malformed token", () => {
  const service = new SessionTokenService({ signingSecret: TEST_SECRET });
  expect(service.verify("not-a-token")).toEqual({
    ok: false,
    reason: "invalid",
  });
});

it("rejects an expired token", () => {
  let now = 10_000;
  const service = new SessionTokenService({
    signingSecret: TEST_SECRET,
    clock: { now: () => now },
  });
  const issued = service.issue();
  now = 70_000;
  expect(service.verify(issued.sessionToken)).toEqual({
    ok: false,
    reason: "expired",
  });
});
```

- [ ] **Step 2: Run the focused test and verify RED**

Run:

```bash
npm run test --workspace apps/api -- src/session-token.test.ts
```

Expected: FAIL because `./session-token.js` does not exist.

- [ ] **Step 3: Implement the minimal token service**

Create `session-token.ts` with these exact public contracts:

```ts
export const CHECK_IN_DURATION_MS = 60_000;
export const HEARTBEAT_INTERVAL_MS = 3_000;

export type Clock = { readonly now: () => number };
export type IssuedSession = {
  readonly sessionToken: string;
  readonly expiresAt: string;
  readonly heartbeatIntervalMs: number;
};
export type VerificationResult =
  | { readonly ok: true; readonly receivedAt: string }
  | { readonly ok: false; readonly reason: "invalid" | "expired" };

export class SessionTokenService {
  public constructor(options: {
    readonly signingSecret: string;
    readonly clock?: Clock;
  });
  public issue(): IssuedSession;
  public verify(sessionToken: string): VerificationResult;
}
```

Implementation details:

```ts
const payload = { sid: randomUUID(), iat: now, exp: now + 60_000 };
const payloadSegment = Buffer.from(JSON.stringify(payload)).toString("base64url");
const signature = createHmac("sha256", signingSecret)
  .update(payloadSegment)
  .digest();
const sessionToken = `${payloadSegment}.${signature.toString("base64url")}`;
```

Verification must reject non-canonical base64url, require a 32-byte decoded
signature, calculate the expected digest, and call `timingSafeEqual` only after
lengths match. Parse the payload with a strict Zod schema for UUID and integer
timestamps, require `exp - iat === 60_000`, and treat `exp <= now` as expired.

- [ ] **Step 4: Run token tests and verify GREEN**

Run the focused test command again. Expected: all token-service tests pass with
no warnings or token output.

- [ ] **Step 5: Commit and push**

```bash
git add apps/api/src/session-token.ts apps/api/src/session-token.test.ts
git commit -m "feat(api): add stateless session tokens"
git push origin main
```

---

### Task 2: Bearer Heartbeat API and Secure Configuration

**Files:**
- Modify: `packages/shared/src/index.ts`
- Modify: `apps/api/src/config.ts`
- Modify: `apps/api/src/main.ts`
- Modify: `apps/api/src/app.ts`
- Modify: `apps/api/src/app.test.ts`
- Delete: `apps/api/src/session-store.ts`

**Interfaces:**
- Consumes: `SessionTokenService`, `CHECK_IN_SIGNING_SECRET`, and existing Express config.
- Produces: `POST /api/check-ins` token response and `POST /api/check-ins/heartbeat` Bearer endpoint.

- [ ] **Step 1: Replace API tests with failing stateless-session cases**

Define explicit test config:

```ts
const TEST_SECRET_A = "test-signing-secret-a-is-at-least-32-bytes";
const TEST_SECRET_B = "test-signing-secret-b-is-at-least-32-bytes";
const config = {
  port: 8080,
  webOrigin: "http://localhost:5173",
  instanceId: "test-api",
  signingSecret: TEST_SECRET_A,
  usesUnsafeDevelopmentSigningSecret: false,
} as const;
```

Add API tests for:

```ts
const issued = await request(taskA).post("/api/check-ins");
expect(issued.status).toBe(201);
expect(issued.body).not.toHaveProperty("sessionId");
expect(() => checkInResponseSchema.parse(issued.body)).not.toThrow();

const heartbeat = await request(taskB)
  .post("/api/check-ins/heartbeat")
  .set("Authorization", `Bearer ${issued.body.sessionToken}`);
expect(heartbeat.status).toBe(200);
expect(heartbeat.body.servedBy).toBe("task-b");
```

Also assert `401 invalid_session` for missing Authorization, malformed Bearer,
tampering, expiry, and a task using `TEST_SECRET_B`; assert the old path returns
404. Add an OPTIONS preflight assertion that allowed headers include both
`Authorization` and `Content-Type`.

Capture Pino output with an in-memory destination and assert a known issued
token and both test secrets are absent from logs and all error responses.

Add config tests:

```ts
expect(() => loadConfig({ NODE_ENV: "production" })).toThrow(
  "CHECK_IN_SIGNING_SECRET",
);
expect(() =>
  loadConfig({ NODE_ENV: "production", CHECK_IN_SIGNING_SECRET: "short" }),
).toThrow("at least 32 bytes");
expect(loadConfig({}).usesUnsafeDevelopmentSigningSecret).toBe(true);
```

- [ ] **Step 2: Run API tests and verify RED**

Run:

```bash
npm run test --workspace apps/api
```

Expected: FAIL because the response still exposes `sessionId`, the fixed
heartbeat route is absent, and signing-secret config is absent.

- [ ] **Step 3: Update shared contract and Express routes**

Change the shared response schema to:

```ts
export const checkInResponseSchema = z.object({
  sessionToken: z.string().min(1),
  expiresAt: z.string().datetime({ offset: true }),
  heartbeatIntervalMs: z.number().int().positive(),
});
```

In `createApp`, construct or inject `SessionTokenService`, then implement:

```ts
app.post("/api/check-ins", (_request, response) => {
  response.status(201).json(tokenService.issue());
});

app.post("/api/check-ins/heartbeat", (request, response) => {
  const match = /^Bearer ([A-Za-z0-9_-]+\.[A-Za-z0-9_-]+)$/.exec(
    request.get("authorization") ?? "",
  );
  const result = match === null ? null : tokenService.verify(match[1]);
  if (result === null || !result.ok) {
    response.status(401).json({
      error: "invalid_session",
      message: "유효하지 않거나 만료된 session token입니다.",
    });
    return;
  }
  response.json({
    ok: true,
    receivedAt: result.receivedAt,
    servedBy: config.instanceId,
  } satisfies HeartbeatResponse);
});
```

Configure CORS with `allowedHeaders: ["Authorization", "Content-Type"]` and
retain `express.json({ limit: "16kb" })`, safe logs, health, 404, and error
middleware. Delete the unused in-memory store.

- [ ] **Step 4: Implement fail-closed config and warning**

Add `NODE_ENV` and `CHECK_IN_SIGNING_SECRET` parsing. Use a named development
fallback only outside production and set
`usesUnsafeDevelopmentSigningSecret: true`. Reject missing or shorter-than-32-
byte production values before `listen()`. In `startServer`, emit only:

```ts
console.warn(JSON.stringify({
  event: "unsafe_development_signing_secret",
  message: "Set CHECK_IN_SIGNING_SECRET before deployment.",
}));
```

Never include the fallback or configured secret in the warning.

- [ ] **Step 5: Run API and shared checks and verify GREEN**

```bash
npm run build --workspace packages/shared
npm run test --workspace apps/api
npm run typecheck --workspace apps/api
```

Expected: all API tests pass and TypeScript reports no errors.

- [ ] **Step 6: Commit and push**

```bash
git add packages/shared/src/index.ts apps/api/src
git commit -m "feat(api): accept signed bearer check-ins"
git push origin main
```

---

### Task 3: Token-Aware Web Heartbeat Loop

**Files:**
- Create: `apps/web/src/api-client.test.ts`
- Modify: `apps/web/src/api-client.ts`
- Modify: `apps/web/src/check-in-storage.ts`
- Modify: `apps/web/src/check-in-storage.test.ts`
- Modify: `apps/web/src/use-check-in.ts`
- Modify: `apps/web/src/CheckInApp.tsx`
- Modify: `apps/web/src/CheckInApp.test.tsx`

**Interfaces:**
- Consumes: `CheckInResponse.sessionToken` and `HeartbeatResponse.servedBy`.
- Produces: Bearer heartbeat calls, recoverable token storage, and hook state with `servedBy: string | null`.

- [ ] **Step 1: Write failing API-client, storage, and loop tests**

Update test fixtures to:

```ts
return {
  sessionToken: "test.session-token",
  expiresAt,
  heartbeatIntervalMs: 3_000,
};
```

Add an API-client test using an injected Fetch-compatible function. Inspect
the emitted `Request` and assert:

```ts
expect(request.url).toBe("http://localhost:8080/api/check-ins/heartbeat");
expect(request.headers.get("authorization")).toBe(
  "Bearer test.session-token",
);
expect(request.url).not.toContain("test.session-token");
```

Add storage tests that a valid token is restored and an expired, malformed, or
legacy `sessionId` record is deleted immediately.

Extend the component tests to assert:

- two rapid clicks call `createCheckIn` once;
- StrictMode restoration starts exactly one heartbeat loop;
- a pending heartbeat prevents another heartbeat even when timers advance;
- the second call begins only after the first resolves and 3 seconds elapse;
- unmount aborts the active request;
- expiry clears localStorage;
- the latest response sets development metadata `data-served-by="task-b"`.

- [ ] **Step 2: Run web tests and verify RED**

```bash
npm run test --workspace apps/web
```

Expected: FAIL because fixtures still require `sessionId`, the client uses the
old URL, and state does not retain `servedBy`.

- [ ] **Step 3: Implement the token-aware API client and storage**

Expose a small `createApiClient(fetchImplementation = globalThis.fetch)`
factory so the network boundary can be tested without a listener:

```ts
export type ApiClient = {
  readonly createCheckIn: (signal: AbortSignal) => Promise<CheckInResponse>;
  readonly sendHeartbeat: (
    sessionToken: string,
    signal: AbortSignal,
  ) => Promise<HeartbeatResponse>;
};

export function createApiClient(
  fetchImplementation: typeof globalThis.fetch = globalThis.fetch,
): ApiClient;
```

Keep the current `createCheckIn` and `sendHeartbeat` named exports by
delegating to the default client. Heartbeat implementation:

```ts
api.post("api/check-ins/heartbeat", {
  signal,
  headers: { authorization: `Bearer ${sessionToken}` },
});
```

Change the storage Zod schema to `sessionToken`, `expiresAt`, and
`heartbeatIntervalMs`. Keep the in-memory fallback and remove invalid or
expired records during every read.

- [ ] **Step 4: Update hook state without changing visible UI**

Add `servedBy: string | null` to `CheckInState`. Await every heartbeat, save its
`servedBy`, and wait only after that call resolves. Reset it for a new session,
retain it through completion, and keep the existing controller guard,
microtask restoration, retry behavior, and unmount abort.

In `CheckInApp`, add only development metadata:

```tsx
<section
  className="check-in-panel"
  aria-labelledby="service-title"
  data-served-by={import.meta.env.DEV ? (servedBy ?? undefined) : undefined}
>
```

Do not change labels, layout, or styles.

- [ ] **Step 5: Run web checks and verify GREEN**

```bash
npm run test --workspace apps/web
npm run typecheck --workspace apps/web
```

Expected: all web tests pass and TypeScript reports no errors.

- [ ] **Step 6: Commit and push**

```bash
git add apps/web/src
git commit -m "feat(web): send stateless heartbeat tokens"
git push origin main
```

---

### Task 4: Runtime and SketchCatch Documentation

**Files:**
- Modify: `.env.example`
- Modify: `README.md`
- Modify: `DESIGN.md`

**Interfaces:**
- Consumes: final API and environment contracts from Tasks 1-3.
- Produces: local, ECS/Fargate, and SketchCatch configuration instructions.

- [ ] **Step 1: Update environment example without a secret value**

Add only the variable name and generation guidance:

```dotenv
# Generate a value with: openssl rand -base64 32
CHECK_IN_SIGNING_SECRET=
```

- [ ] **Step 2: Update README deployment and API contracts**

Document:

- `POST /api/check-ins` returns `sessionToken`, `expiresAt`, and interval;
- `POST /api/check-ins/heartbeat` takes Bearer Authorization;
- all Fargate tasks need the same secret from Secrets Manager;
- no sticky session, Redis, or database is needed for one-to-three-task scale;
- SketchCatch Web needs `VITE_API_BASE_URL`;
- SketchCatch API needs `WEB_ORIGIN`, `PORT`, `INSTANCE_ID`, and
  `CHECK_IN_SIGNING_SECRET`;
- one button press creates one issuance request and about 20 sequential
  heartbeats over 60 seconds for ALB/CloudWatch observation;
- a production secret can be generated with `openssl rand -base64 32` and must
  never be stored in Git.

Remove every statement that sessions live in process memory or require ALB
stickiness.

- [ ] **Step 3: Update DESIGN.md behavior notes**

Keep the visual design system intact and add a concise runtime/data-flow
section describing the signed token, temporary localStorage lifecycle,
unchanged one-button UI, and development-only `servedBy` observation.

- [ ] **Step 4: Check documentation and source for stale or leaked content**

```bash
rg -n "sticky|session ID|sessionId|CheckInSessionStore|MAX_ACTIVE_SESSIONS" \
  README.md DESIGN.md apps packages
rg -n "CHECK_IN_SIGNING_SECRET=. +" .env.example
git diff --check
```

Expected: no stale memory-session guidance, no old frontend/API session ID
contract, no populated secret assignment, and no whitespace errors.

- [ ] **Step 5: Commit and push**

```bash
git add .env.example README.md DESIGN.md
git commit -m "docs: explain stateless Fargate check-ins"
git push origin main
```

---

### Task 5: Full Verification and Requirement Audit

**Files:**
- Verify all files changed in Tasks 1-4.

**Interfaces:**
- Consumes: complete implementation and explicit objective checklist.
- Produces: fresh command evidence and a final remote commit state.

- [ ] **Step 1: Run all required gates independently**

```bash
npm run lint
npm run typecheck
npm run build
npm test
```

Expected: each command exits 0. If Supertest listener creation is blocked by
the sandbox, rerun the unchanged `npm test` command with local-listener
permission and report both results accurately.

- [ ] **Step 2: Audit every explicit requirement against source and tests**

Confirm source evidence for random UUID, `sid`/`iat`/`exp`, HMAC-SHA256,
`timingSafeEqual`, fixed endpoint, Bearer header, 60-second expiry, sequential
3-second loop, AbortController ownership, temporary storage, `servedBy`,
production fail-closed config, explicit CORS headers, safe logs, and unchanged
body limit/security middleware.

Confirm test evidence for issuance, normal heartbeat, same-secret cross-task,
wrong-secret rejection, tampering, expiry, missing Authorization, duplicate
click/loop prevention, storage recovery/cleanup, and log/error non-disclosure.

- [ ] **Step 3: Inspect final Git state and push any verification-only fix**

```bash
git diff --check
git status --short --branch
git log -5 --oneline --decorate
git push origin main
```

Expected: local `main` matches `origin/main` and only intentional content is in
the implementation commits.
