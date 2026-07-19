# Spec — Agentic Tools & Human-in-the-Loop

## User stories
- As a user, I switch chat to **Agent** mode and ask IgniteAI to take real actions (read a GitHub repo, draft and send an email), not just answer questions.
- As a user, every action the agent wants to take is shown to me first; nothing external-facing executes without my explicit approval.
- As a user, I can edit an email draft (to/subject/body) before approving it.
- As a user, I see an auditable Agent Activity Log per thread: every proposed action, my approve/reject decision, and timestamps.
- As a user, I can opt in to auto-approving specific **read-only** tools I trust; write actions always ask.

## Architecture
- **Tool registry** (`lib/ai/tools/`): each tool is `{ name, description, sideEffect: 'read'|'write', inputSchema (zod), execute(input, ctx) }` registered in `registry.ts`. Adding a tool (calendar, Slack, Jira, web search) = one file + one registry entry; the loop never changes.
- **ReAct loop** (`lib/ai/agent/loop.ts`): plan → select tool → show planned action → wait for approval → execute → observe → repeat, **max 6 steps** (token control). Model output is strict JSON (`{thought, action}` | `{thought, final}`).
- **HITL gate**: every tool call is persisted to `agent_actions` (`proposed → approved/rejected → executed/failed`) with the paused loop state in `state_json`. The SSE stream emits `action_request` and closes; `POST /api/agent/actions/[id]` records the decision, executes on approve, and resumes the loop in a new SSE stream.
- **Connections** (`user_connections`): GitHub PAT and Gmail OAuth refresh token, AES-256-GCM encrypted like user API keys. Managed in Settings → Connections; only `{service, label, createdAt}` ever reaches the client.

## Tools (initial)
| Tool | Side effect | Notes |
|---|---|---|
| `github_get_file`, `github_list_issues`, `github_list_prs`, `github_commit_history` | read | Per-user PAT; outputs truncated (≤4000 chars) before re-entering the prompt. |
| `github_create_issue`, `github_comment_issue` | write | Exact payload shown for approval. |
| `email_send` | write | Gmail API via user OAuth (gmail.send scope, offline refresh token). Draft (to/subject/body) shown with Approve / Edit / Cancel. **Never auto-approvable.** Microsoft Graph: not yet implemented. |

## Acceptance criteria
- [ ] Agent mode reachable from the chat mode toggle; agent turns stream `meta / step / action_request / token / done / error` SSE events.
- [ ] Write actions and non-auto-approved read actions pause the loop until the user decides; the exact payload is displayed before execution.
- [ ] Rejecting an action feeds "user rejected" back to the loop so the agent adapts instead of erroring.
- [ ] Every decision is recorded with a timestamp and visible in the per-thread Agent Activity Log.
- [ ] Auto-approve rules: off by default, per-tool, read-only tools only, stored in `user_preferences.auto_approve_json`.
- [ ] Tool results are truncated before being fed back to the LLM (token efficiency).
- [ ] Missing connection/config → actionable tool error ("connect GitHub in Settings → Connections"), never a stack trace.

## Edge cases
- Model emits unparseable JSON twice in a row → treated as the final answer.
- Step cap reached → agent reports it hit the limit with its best partial result.
- Approval on an already-decided action → 409; action owned by another user → 403.
- `ENCRYPTION_KEY` unset → connections feature disabled with a clear message (same rule as user API keys).
