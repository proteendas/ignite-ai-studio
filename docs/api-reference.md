# API reference

Every HTTP endpoint in the application. All routes live in [`app/api/`](../app/api/).

## Conventions

- **Base URL** — the app's own origin. There is no separate API host.
- **Auth** — a NextAuth JWT session cookie. Routes marked *Session* return
  `401 {"error":"Unauthorized"}` without one. [`middleware.ts`](../middleware.ts) blocks
  unauthenticated `/api/*` requests before they reach the handler, except under `/api/auth/`.
- **Content type** — `application/json` in and out, except `/api/ingest` (multipart) and
  `/api/chat` + `/api/agent` (Server-Sent Events out).
- **Ownership** — every resource is scoped to the session user. Requesting another user's
  resource returns **404**, not 403, so ids cannot be probed.
- **Errors** — always `{"error": "<human-readable message>"}`.
- **Rate limits** — enforced from a Postgres table, so they hold across instances and serverless
  invocations. They fail *open*: if the database is unreachable, requests are allowed.
- **Long-running routes** — `/api/ingest`, `/api/chat`, `/api/agent`, `/api/agent/actions/[id]`
  and `/api/generate-content` declare `maxDuration`, since they legitimately exceed a serverless
  platform's default timeout.

### Shared status codes

| Code | Meaning |
| --- | --- |
| 400 | Malformed JSON or failed validation |
| 401 | No session |
| 404 | Not found, or not owned by you |
| 409 | Conflict — usually a document that is not `ready` |
| 422 | Understood but unprocessable — e.g. a PDF with no extractable text |
| 429 | Rate limit exceeded |
| 500 | Unhandled server error |
| 503 | No AI provider configured or reachable |

---

## Authentication

### `POST /api/auth/register`
Public. Creates a credentials account.

**Body** `{ "email": string, "password": string (min 8), "name"?: string }`
**201** `{ "id", "email", "name" }`
**Errors** 400 validation · 409 `A user with this email already exists` · 500

Emails are trimmed on input and lowercased in the data layer so lookups always agree.

### `POST /api/auth/change-password`
*Session.* Rate limit 5/min per user.

**Body** `{ "currentPassword": string, "newPassword": string (min 8) }`
**200** `{ "message": "Password updated." }`
**Errors** 400 · 401 wrong current password · 429

### `POST /api/auth/forgot-password`
Public. Rate limit 5 per 15 min **per IP**.

**Body** `{ "email": string }`
**200** `{ "message": "If an account exists for that address, a reset link is on its way." }`

Always returns the same 200 body whether or not the address exists — this endpoint is
deliberately not an account-enumeration oracle. OAuth-only accounts (no password) are treated
like unknown addresses. The link expires in **1 hour** and is single-use.

### `POST /api/auth/reset-password`
Public. Rate limit 10 per 15 min per IP.

**Body** `{ "token": string, "password": string (min 8) }`
**200** `{ "message": "Password updated. You can sign in now." }`
**Errors** 400 invalid/expired/already-used token · 429

Sends a courtesy "your password changed" notification, whose failure never fails the reset.

### `POST /api/auth/verify-email`
Public. Rate limit 10 per 15 min per IP.

**Body** `{ "token": string }`
**200** `{ "message": "Email verified." }`
**Errors** 400 invalid or expired token · 429

### `POST /api/auth/resend-verification`
*Session.* Rate limit 3 per 15 min per user. Sends to the session user's own address only, so it
cannot be pointed at an arbitrary inbox.

**200** `{ "message": string, "delivered": boolean }` — `delivered` is `false` when
`RESEND_API_KEY` is unset and the link went to the server log instead.
**200** `{ "message": "This address is already verified.", "verified": true }`
**Errors** 404 account not found · 429 · 502 mailer failed

### `GET /api/auth/status`
*Session.* Account state for the verification banner and settings.

**200** `{ "email", "name", "provider", "emailVerified": boolean, "emailVerifiedAt", "createdAt" }`

### `/api/auth/[...nextauth]`
NextAuth's own handler: sign-in, sign-out, session, CSRF, OAuth callbacks.

---

## Chat

### `POST /api/chat`
*Session.* Rate limit 30/min. **Responds with Server-Sent Events**, not JSON.

**Body**
```json
{
  "message":    "string (required)",
  "threadId":   "string (required)",
  "mode":       "grounded | general",
  "tone":       "professional | casual | technical | persuasive | formal | playful",
  "documentId": "string (optional — grounds the turn on one document)"
}
```

**200** an SSE stream of tokens, followed by citation and usage metadata.

**Errors**
- 400 invalid JSON · `message is required.` · `threadId is required.`
- 404 `Document not found.`
- 409 document still ingesting — *"Wait until it shows Ready before chatting with it."*
- 429 · 503 no provider · 500

### `GET /api/threads`
*Session.* **200** `{ "threads": ChatThread[] }` — pinned first, then most recently updated.

### `POST /api/threads`
*Session.* **Body** `{ "title"?: string }` · **201** `{ "thread": ChatThread }`

### `GET /api/threads/[id]`
*Session.* **200** `{ "thread": ChatThread, "messages": ChatMessage[] }` · **404**

### `PATCH /api/threads/[id]`
*Session.* Rename or pin. **Body** `{ "title"?: string, "pinned"?: boolean }`
**200** `{ "thread": ChatThread }` · **400** · **404**

### `DELETE /api/threads/[id]`
*Session.* Also deletes the thread's messages and summary. **200** `{ "ok": true }` · **404**

---

## Documents

### `POST /api/ingest`
*Session.* Rate limit 10/min. **`multipart/form-data`** with a single `file` field.

Accepts PDF, DOCX, TXT and Markdown. Runs parse → sanitize → chunk → embed → store
synchronously, so the response arrives only once the document is `ready`.

**200** `{ "documentId", "filename", "chunkCount", "status": "ready" }`
**Errors**
- 400 `No file provided.`, or a sanitizer rejection (type, size, filename)
- 422 no extractable text — typically a scanned PDF with no text layer
- 429 · 500 `Ingestion failed: …` (includes `documentId`, whose row is marked `failed`)

### `GET /api/documents`
*Session.* **200** `{ "documents": DocumentRecord[] }`

### `GET /api/documents/[id]`
*Session.* **200** `{ "document": DocumentRecord }` · **404**

### `DELETE /api/documents/[id]`
*Session.* Removes the row **and** its chunks from the vector store. **200** `{ "ok": true }` · **404**

---

## Content generation

### `POST /api/generate-content`
*Session.* Rate limit 15/min.

**Body**
```json
{
  "documentId":  "string (required)",
  "contentType": "social-post | blog-draft | ad-copy | email | product-description",
  "tone":        "professional | casual | technical | persuasive | formal | playful",
  "channels":    ["linkedin", "x", "email", "landing-page", "blog", "ad-copy", "general"]
}
```

Several channels batch-generate one tailored variant each.

**200** `{ "outputs": [{ "channel", "content" }], "provider", "usage" }`
**Errors** 400 · 404 document not found · 409 document not `ready` · 422 no content in
document · 429 · 503 · 500

### `GET /api/content-library`
*Session.* **200** `{ "items": GeneratedContentRecord[] }`

### `POST /api/content-library`
*Session.* **Body** `{ "documentId"?, "contentType", "tone", "channel", "output" }`
**201** `{ "item": GeneratedContentRecord }` · **400**

### `DELETE /api/content-library/[id]`
*Session.* **200** `{ "ok": true }` · **404**

---

## Agent

### `POST /api/agent`
*Session.* Rate limit 10/min. **Server-Sent Events.**

**Body** `{ "message": string, "threadId": string }`

Runs the ReAct loop (max 6 steps). The stream emits reasoning, tool observations, and either a
final answer or an approval card. When a side-effecting tool is proposed, the loop **pauses** —
its state is persisted on the `agent_actions` row — and resumes only after a decision.

**Errors** 400 · 429 · 503 · 500

### `GET /api/agent/actions?threadId=…`
*Session.* **200** `{ "actions": AgentActionView[] }` — the thread's activity log.

### `POST /api/agent/actions/[id]`
*Session.* Rate limit 10/min. Approve or reject a proposed action. **Server-Sent Events** on
approval, since execution resumes the loop.

**Body** `{ "decision": "approve" | "reject", "payload"?: object }`

`payload` replaces the proposed tool input, which is how the UI's *Edit* option works.

**Errors** 400 · 404 · 409 action already decided · 429

---

## Settings

### `GET /api/keys`
*Session.* **200** `{ "keys": [{ "provider", "keyPreview", "createdAt" }], "encryptionConfigured": boolean }`
Only a short preview is ever returned — never the key.

### `POST /api/keys`
*Session.* **Body** `{ "provider": string, "apiKey": string }`
**200** `{ "provider", "keyPreview" }`
**Errors** 400 · 503 when `ENCRYPTION_KEY` is not configured
Saving a provider that already has a key replaces it.

### `DELETE /api/keys/[provider]`
*Session.* **200** `{ "ok": true }`

### `GET /api/preferences`
*Session.* **200** `{ "preferences": { defaultProvider, defaultModel, defaultTone, theme, connectionType, autoApprove } }`

### `PUT /api/preferences`
*Session.* **Body** any subset of the above. `defaultProvider: null` means auto-select.
**200** `{ "preferences": … }` · **400** invalid provider or connection type

### `GET /api/connections`
*Session.* **200** `{ "connections": [{ "service", "label", "createdAt" }], "encryptionConfigured": boolean }`

### `POST /api/connections`
*Session.* Stores a GitHub token, encrypted. **Body** `{ "service": "github", "token": string }`
**200** `{ "service": "github", "label": string }` · **400** · **503** encryption not configured

### `DELETE /api/connections/[service]`
*Session.* **200** `{ "ok": true }`

### `GET /api/connections/google/start`
*Session.* Redirects into the Gmail OAuth consent flow.

### `GET /api/connections/google/callback`
*Session.* OAuth callback; stores the encrypted refresh token and redirects back to Settings.

### `POST /api/account/delete`
*Session.* **Irreversible.** Deletes the user and every owned row: documents, threads, messages,
summaries, generated content, keys, connections, agent actions, usage, logs, activity,
preferences and auth tokens. **200** `{ "ok": true }`

---

## Dashboard and observability

### `GET /api/usage`
*Session.* **200** `{ "usage": { totalPromptTokens, totalCompletionTokens, byProvider, documentCount, contentCount } }`

### `GET /api/activity`
*Session.* **200** `{ "activity": ActivityEvent[] }` — 20 most recent.

### `GET /api/observability`
*Session.* **200** `{ "requests": RequestLog[], "errors": ErrorLog[], "usage": … }` — 50 most
recent of each.

### `GET /api/provider-health`
*Session.* **200** `{ "providers": [{ "id", "configured", "source": "user" | "env", "reachable" }] }`

---

## Onboarding

### `GET /api/onboarding/status`
*Session.* **200** `{ "onboarded": boolean }` — drives the self-gating tour.

### `POST /api/onboarding/complete`
*Session.* **200** `{ "ok": true }`

---

## Maintenance mode

With `MAINTENANCE_MODE=true`, **every** `/api/*` route returns:

```json
{ "error": "IgniteAI Studio is under maintenance. Please try again shortly." }
```

with status **503**, and every page is rewritten to `/maintenance`.
