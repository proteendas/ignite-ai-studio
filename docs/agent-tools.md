# Agent and tools

The agent turns the assistant from something that answers into something that acts — under a
human-in-the-loop gate that makes every side effect explicit.

## The loop

[`lib/ai/agent/loop.ts`](../lib/ai/agent/loop.ts) runs a ReAct loop capped at **6 steps**
(`MAX_STEPS`). Each step the model either proposes a tool call or produces a final answer.

```
step < MAX_STEPS:
  model proposes
    ├─ final answer ────────────► stream it, done
    └─ tool call
         ├─ unknown tool ───────► observation: error, continue
         ├─ read tool + user auto-approved
         │      └─ execute now, feed result back as an observation
         └─ otherwise
                ├─ persist agent_action (status 'proposed') WITH loop state
                ├─ stream approval card to the UI
                └─ STOP — resume only on a decision
```

Hitting the step cap ends the loop with an explanation rather than silently truncating.

## Human-in-the-loop

The gate is driven by one field on each tool: `sideEffect`.

| `sideEffect` | Behaviour |
| --- | --- |
| `'read'` | May be auto-approved, per tool, per user. **Off by default.** |
| `'write'` | **Always** requires explicit approval. No setting can bypass this. |

When an action is proposed, the paused loop state is serialised into
`agent_actions.state_json`. That is what lets the proposal survive the gap between the agent
asking and the human answering — minutes, or a page reload. `POST /api/agent/actions/[id]`
rehydrates it and resumes.

The user can **Approve**, **Edit** (approve with a modified payload, sent as `payload` on the
decision request) or **Cancel**. Every proposal and decision is recorded and shown in the
per-thread Agent Activity Log.

## Registered tools

From [`lib/ai/tools/`](../lib/ai/tools/):

| Tool | Side effect | Purpose |
| --- | --- | --- |
| `github_get_file` | read | Read a file from a repository |
| `github_list_issues` | read | List issues, filterable by state |
| `github_list_prs` | read | List pull requests |
| `github_commit_history` | read | Recent commits |
| `github_create_issue` | **write** | Open an issue |
| `github_comment_issue` | **write** | Comment on an issue |
| `email_send` | **write** | Send email via the connected Gmail account |

## Connections

Tools authenticate through per-user connections stored in `user_connections`, encrypted with
AES-256-GCM exactly like provider keys.

- **GitHub** — a personal access token, pasted in Settings. Scope it as narrowly as the task
  allows.
- **Gmail** — OAuth via `/api/connections/google/start` → `/api/connections/google/callback`,
  which stores an encrypted refresh token. Requires `GOOGLE_CLIENT_ID` and
  `GOOGLE_CLIENT_SECRET`.

Both require `ENCRYPTION_KEY`. Removing a connection revokes the agent's access immediately.

## The tool contract

```ts
export interface ToolDefinition {
  name: string;
  description: string;            // shown to the model — be precise
  sideEffect: 'read' | 'write';   // drives the approval gate
  inputSchema: z.ZodTypeAny;      // validated before execution
  execute(input: unknown, ctx: ToolContext): Promise<ToolResult>;
}

export interface ToolContext { ownerId: string }

export interface ToolResult {
  ok: boolean;
  summary: string;   // one human sentence, shown in the activity log
  data?: unknown;    // structured result, fed back as the agent's observation
}
```

## Adding a tool

1. **Write a `ToolDefinition`** in `lib/ai/tools/`.
2. **Append it** to the `TOOLS` array in
   [`registry.ts`](../lib/ai/tools/registry.ts).

That is the whole change. The ReAct loop, the approval gate, the system prompt catalogue and the
UI all read from the registry — none of them need touching. `toolCatalogForPrompt()` renders
the zod schema into the prompt automatically.

### What to get right

- **`sideEffect` is a security boundary, not a label.** Anything that writes, sends, spends or
  mutates external state is `'write'`. If you are unsure, it is `'write'`.
- **Write a description the model can act on.** It is the only thing telling the model when the
  tool applies.
- **Keep `inputSchema` tight.** It is validated before execution and rendered into the prompt;
  loose schemas produce malformed calls. `describeSchema()` handles objects, optionals,
  defaults, enums, strings, numbers and booleans.
- **Never trust `ownerId` from the input.** Take it from `ToolContext`, which comes from the
  session.
- **Return errors as `{ ok: false, summary }`, do not throw.** The summary becomes the agent's
  observation, so a good message lets the model recover; an exception just ends the step.
- **Make `summary` readable.** It is what the user sees in the activity log when deciding.

## Security notes

- Tools run server-side only; credentials never reach the browser.
- Ingested documents are sanitised to reduce the risk of prompt-injection instructions in a file
  steering the agent. The approval gate is the real backstop: injected text cannot produce a
  side effect without a human clicking Approve.
- The agent is rate limited to 10 requests per minute per user, as are approval decisions.
- Auto-approve applies only to read tools, and only per tool and per user.

See [security](./security.md).
