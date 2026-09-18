# Features

What the product does, from a user's point of view.

## Documents

Upload PDF, DOCX, TXT or Markdown at `/documents`. Each upload runs the ingestion pipeline:
parse → sanitize → chunk → embed → store. A document moves through `processing` → `ready`, or
`failed` with the reason attached. Chunks and their embeddings are written to `document_chunks`
in Postgres via pgvector.

- **Chatting is blocked until a document is `ready`.** An answer is never built on a
  half-indexed file; the chat endpoint returns 409 if you try.
- **Scanned PDFs with no text layer produce zero chunks.** The app does not do OCR — run the
  file through OCR first.
- Deleting a document also removes its embedded chunks from the vector store.
- Ingestion runs inline, so very large documents can exceed a serverless function's time limit.
  On a VM there is no such ceiling.

## Chat

Three modes, shown as a visible toggle so it is never ambiguous which one is active:

| Mode | Behaviour |
| --- | --- |
| **Grounded** | Retrieves from your documents and answers only from what it found, with citations. |
| **General** | No retrieval. Answers from the model's own knowledge. |
| **Agent** | Can call tools to take real actions, with approval required for side effects. |

Other behaviour:

- **Citations.** Grounded answers carry citation badges and a Sources panel listing the exact
  chunks used and their similarity scores, so any claim can be traced to its passage.
- **Threads.** Conversations persist and can be renamed, pinned and deleted.
- **Rolling summaries.** Older turns are compressed into a thread summary so prompts carry only
  the last few turns verbatim. This keeps token use flat as a thread grows.
- **Clarification.** Vague questions get a clarifying question rather than a confident guess.
- **Tone.** A per-chat tone selector, with a default set in Settings.
- **Attachments.** Attach a document from the composer to ground the conversation on it.
- **Token counter.** A running estimate for the session (~4 characters per token).

## Intent-aware routing

Questions are classified and routed automatically:

- **Document questions** go to vector retrieval over your uploads.
- **Structured-data questions** are translated to SQL and run against the demo `products` and
  `orders` tables. Generated SQL is constrained to read-only statements.

## Agent and human-in-the-loop

The agent runs a ReAct loop capped at 6 steps over the tool registry.

- **Every side effect is gated.** Any tool call that writes or sends is surfaced as an
  Approve / Edit / Cancel card before it runs. The loop pauses, its state is persisted, and it
  resumes after your decision.
- **Auto-approve is opt-in and read-only.** Off by default, and never available for write
  actions.
- **Everything is logged.** A per-thread Agent Activity Log records each proposal, your
  decision, and the result.

Available tools: GitHub (read repositories, issues and pull requests; create issues) and Gmail
(draft and send). See [agent-tools](./agent-tools.md).

## Content generator

Turn an ingested document into marketing and communication content, grounded strictly in that
document's facts.

- **Types:** social post, blog draft, ad copy, email, product description.
- **Channels:** LinkedIn, X, email, landing page, blog, ad placement, general. Select several to
  batch-generate a tailored variant per channel.
- **Tones:** professional, casual, technical, persuasive, formal, playful.
- **Output:** edit in place, regenerate variations, export `.txt` / `.md` / `.docx`, or save to
  the content library.

## Dashboard and observability

- **Dashboard** — token usage, document and content counts, a recent activity feed, and quick
  actions.
- **Observability** — per-user request logs, error logs, and per-provider usage and cost
  tracking.
- **Provider health** — reachability of each configured provider.

## Settings

- **Provider API keys** — add your own key per provider, encrypted at rest with AES-256-GCM.
  Users' own keys take precedence over the server's env keys.
- **Preferences** — connection type (cloud / local / auto), default provider, default model,
  default tone, theme.
- **Connections** — GitHub token and Gmail OAuth for agent tools.
- **Auto-approve** — per-tool opt-in for read-only tools.
- **Change password** and **delete account**.

## Account lifecycle

- **Register / sign in** with credentials, or Google / GitHub when configured.
- **Forgot and reset password** — a single-use link valid for one hour. The endpoint answers
  identically whether or not the address is registered, so it cannot be used to discover which
  accounts exist.
- **Email verification** — a 24-hour single-use link, with a dismissible reminder banner in the
  app. Verification is a nudge, not a gate; nothing is withheld until it is done.
- **Delete account** — removes documents, embeddings, chats, generated content, keys,
  connections, logs and preferences.

## Help, support and legal

- **Help centre** (`/help`) — task-oriented answers.
- **Support** (`/support`) — composes a structured support email.
- **Legal** (`/legal`) — 13 policies, all readable signed in *and* signed out.

## System states

Dedicated screens for 404, 403, 500, maintenance, offline, and session expiry, plus reusable
empty, no-results, loading, error and success blocks. Maintenance mode is a single env flag
(`MAINTENANCE_MODE=true`) that takes the whole app offline behind one page.

## Theming and accessibility

Dark-mode-first with a light theme, remembered per browser. Full keyboard support including
custom dropdowns, visible focus rings, ARIA semantics, and automatic honouring of reduced-motion
preferences. See [ui-design-system](./ui-design-system.md).
