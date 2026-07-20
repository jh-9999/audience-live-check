# Live Check-In Demo Design System

## 0. Research Log

- User reference: white background, black text, black CTA, one-button mobile check-in → used as the direct visual contract.
- External visual research: skipped — the user explicitly requested a restrained single-purpose check-in screen, so external product patterns would add unnecessary surface.
- Imagen drafts: skipped — no imagery is needed; the button and connection state are the complete visual payload.

## 1. Atmosphere & Identity

Quiet and trustworthy. This is a short stop on the way to a presentation, not a destination. The signature is a single black action that becomes a calm connection status immediately after the tap.

## 2. Color

| Role | Token | Value | Usage |
|---|---|---|---|
| Canvas | `--color-canvas` | `#FFFFFF` | Page background |
| Ink | `--color-ink` | `#111111` | Body text and CTA background |
| Muted ink | `--color-muted` | `#666666` | Privacy note and supporting copy |
| Line | `--color-line` | `#E5E5E5` | Status boundary |
| Success | `--color-success` | `#147A45` | Connected and completed states |
| Error | `--color-error` | `#B42318` | Recoverable API errors |
| Focus | `--color-focus` | `#174EA6` | Keyboard focus ring |

### Rules

- Use only the tokens above. The page has no decorative accent colors.
- Success and error always include text, never color alone.
- The CTA must maintain high contrast against the canvas.

## 3. Typography

| Level | Size | Weight | Line height | Usage |
|---|---:|---:|---:|---|
| Display | `clamp(40px, 10vw, 72px)` | 700 | 1.05 | Service name |
| H1 | `clamp(24px, 5vw, 36px)` | 600 | 1.2 | One-line instruction |
| Body | `18px` | 400 | 1.6 | Supporting copy |
| Button | `18px` | 600 | 1.2 | Primary action |
| Caption | `14px` | 400 | 1.5 | Privacy note and status detail |

### Font Stack

- Primary: `Arial`, `Helvetica Neue`, `sans-serif` for reliable cross-platform rendering and Korean fallback.

## 4. Spacing & Layout

All spacing uses a 4px base unit.

| Token | Value | Usage |
|---|---:|---|
| `--space-2` | `8px` | Small inline gap |
| `--space-3` | `12px` | Status detail gap |
| `--space-4` | `16px` | Mobile page inset |
| `--space-6` | `24px` | Content group gap |
| `--space-8` | `32px` | Main vertical spacing |
| `--space-10` | `40px` | Desktop section spacing |
| `--space-16` | `64px` | Main content breathing room |

- Mobile content width: `calc(100% - 32px)`.
- Desktop content width: `560px` maximum.
- Main content is centered vertically with `min-height: 100dvh`.
- The page is one screen with no route navigation.

## 5. Components

### Check-In Button

- **Structure**: native `<button>` with one text label.
- **Variants**: idle, starting, active-disabled, completed-disabled, error-retry.
- **Spacing**: 16px vertical and 24px horizontal padding; minimum 52px height.
- **States**: default, hover, active, focus, disabled, loading.
- **Accessibility**: native keyboard button, visible focus ring, disabled during active request.
- **Motion**: 150ms opacity and transform feedback only.

### Connection Status

- **Structure**: status marker, status label, and one supporting sentence.
- **Variants**: active, completed, error.
- **Spacing**: 12px inline gap and 24px block gap.
- **States**: active, completed, error.
- **Accessibility**: `role="status"` and `aria-live="polite"` announce transitions.
- **Motion**: status content fades in once after the API response.

## 6. Motion & Interaction

| Type | Duration | Easing | Usage |
|---|---:|---|---|
| Press | `150ms` | `ease-out` | CTA press feedback |
| Status reveal | `220ms` | `ease-in-out` | API state transition |

- No decorative animation, polling indicator, chart, or moving background.
- `prefers-reduced-motion` removes transitions but preserves state changes.

## 7. Depth & Surface

Use a borders-only strategy. The canvas is white and the CTA is the only filled surface. Status uses a 1px line and semantic text color; no cards, shadows, or decorative panels.

## 8. Accessibility Constraints & Accepted Debt

### Constraints

- WCAG 2.2 AA target.
- Body text remains at least 16px.
- Button target is at least 52px high and full-width on mobile.
- Every state is announced with text and `aria-live`.
- Keyboard focus is visible and `prefers-reduced-motion` is respected.

### Accepted Debt

| Item | Location | Why accepted | Owner / Exit |
|---|---|---|---|
| No presenter dashboard | Whole app | The sample application's contract is attendee check-in only. | Add only if the presentation flow later requires a separate operator surface. |

## 9. Runtime & Data Flow

- One button press requests an opaque, HMAC-SHA256-signed session token once.
- The browser stores only the token, expiry, and heartbeat interval in
  localStorage so a refresh can resume the same short-lived session.
- The token payload contains only a random session ID, issued-at time, and
  expiry time. It contains no personal data, IP address, or User-Agent.
- Heartbeats are awaited sequentially every three seconds for approximately
  60 seconds and use `POST /api/check-ins/heartbeat` with Bearer Authorization.
- The token is removed immediately when it expires or when the loop fails.
- The existing AbortController remains the single owner of creation and
  heartbeat work, preventing duplicate loops after repeated clicks or React
  StrictMode restoration.
- `servedBy` is retained as development-only DOM metadata for Task-level
  observation. It adds no visible control or content to the restrained UI.
- Any Fargate Task with the same signing secret can verify the token without
  sticky sessions, Redis, a database, or a visual design change.
