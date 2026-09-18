import { v4 as uuidv4 } from 'uuid';
import type { AIProvider } from '@/lib/ai/providerAdapter';
import type { AgentActionView, ChatMessage } from '@/lib/types';
import type { ToolDefinition, ToolResult } from '@/lib/ai/tools/types';
import { getTool } from '@/lib/ai/tools/registry';
import { buildAgentSystemPrompt } from './prompts';
import {
  getUserPreferences,
  insertAgentAction,
  updateAgentAction,
  insertChatMessage,
  recordUsage,
  recordActivity,
  recordRequestLog,
  type AgentActionRecord,
} from '@/lib/db/sql/client';

export const MAX_STEPS = 6;
const OBSERVATION_TRUNCATE_AT = 3000;

/** Serializable loop context, persisted to agent_actions.state_json on pause. */
export interface AgentLoopState {
  originalMessage: string;
  messages: ChatMessage[];
  step: number;
}

export type AgentLoopEvent =
  | { type: 'step'; index: number; thought: string; tool?: string }
  | { type: 'action_request'; action: AgentActionView }
  | { type: 'final'; text: string };

export function createInitialState(message: string): AgentLoopState {
  return {
    originalMessage: message,
    messages: [
      { role: 'system', content: buildAgentSystemPrompt() },
      { role: 'user', content: message },
    ],
    step: 0,
  };
}

// ---------------------------------------------------------------------------
// Defensive JSON parsing of model output
// ---------------------------------------------------------------------------

interface ParsedAgentTurn {
  thought: string;
  action?: { tool: string; input: Record<string, unknown> };
  final?: string;
}

/**
 * Extracts the first balanced top-level JSON object from raw model output,
 * tolerating markdown fences and surrounding prose. Returns null when nothing
 * parseable is found.
 */
function parseAgentTurn(raw: string): ParsedAgentTurn | null {
  const cleaned = raw.replace(/```(?:json)?/gi, '').trim();
  const start = cleaned.indexOf('{');
  if (start === -1) return null;

  let depth = 0;
  let inString = false;
  let escaped = false;
  let end = -1;
  for (let i = start; i < cleaned.length; i++) {
    const ch = cleaned[i];
    if (escaped) {
      escaped = false;
      continue;
    }
    if (ch === '\\') {
      if (inString) escaped = true;
      continue;
    }
    if (ch === '"') {
      inString = !inString;
      continue;
    }
    if (inString) continue;
    if (ch === '{') depth++;
    if (ch === '}') {
      depth--;
      if (depth === 0) {
        end = i;
        break;
      }
    }
  }
  if (end === -1) return null;

  let parsed: unknown;
  try {
    parsed = JSON.parse(cleaned.slice(start, end + 1));
  } catch {
    return null;
  }
  if (!parsed || typeof parsed !== 'object') return null;

  const obj = parsed as Record<string, unknown>;
  const thought = typeof obj.thought === 'string' ? obj.thought : '';
  if (typeof obj.final === 'string') {
    return { thought, final: obj.final };
  }
  if (obj.action && typeof obj.action === 'object') {
    const action = obj.action as Record<string, unknown>;
    if (typeof action.tool === 'string' && action.input && typeof action.input === 'object') {
      return { thought, action: { tool: action.tool, input: action.input as Record<string, unknown> } };
    }
  }
  return null;
}

// ---------------------------------------------------------------------------
// Human-readable summaries + observation formatting
// ---------------------------------------------------------------------------

export function summarizeAction(tool: string, input: Record<string, unknown>): string {
  const s = (key: string) => String(input[key] ?? '');
  switch (tool) {
    case 'github_get_file':
      return `Read file ${s('path')} from repo ${s('repo')}`;
    case 'github_list_issues':
      return `List ${input.state ? s('state') : 'open'} issues in ${s('repo')}`;
    case 'github_list_prs':
      return `List ${input.state ? s('state') : 'open'} pull requests in ${s('repo')}`;
    case 'github_commit_history':
      return input.path
        ? `View commit history for ${s('path')} in ${s('repo')}`
        : `View commit history for ${s('repo')}`;
    case 'github_create_issue':
      return `Create issue "${s('title')}" in ${s('repo')}`;
    case 'github_comment_issue':
      return `Comment on issue #${s('issueNumber')} in ${s('repo')}`;
    case 'email_send':
      return `Send an email to ${s('to')}: "${s('subject')}"`;
    default:
      return `Run ${tool}`;
  }
}

/** Truncated (≤3000 chars) JSON rendering of a tool result, as an observation message. */
export function buildObservationMessage(tool: string, result: ToolResult): ChatMessage {
  let json = JSON.stringify(result);
  if (json.length > OBSERVATION_TRUNCATE_AT) {
    json = json.slice(0, OBSERVATION_TRUNCATE_AT) + '…[truncated by IgniteAI to save tokens]';
  }
  return { role: 'user', content: `Observation for ${tool}: ${json}` };
}

export function mapActionToView(record: AgentActionRecord): AgentActionView {
  let payload: Record<string, unknown> = {};
  try {
    payload = JSON.parse(record.payloadJson) as Record<string, unknown>;
  } catch {
    payload = {};
  }
  let result: unknown;
  if (record.resultJson) {
    try {
      result = JSON.parse(record.resultJson);
    } catch {
      result = undefined;
    }
  }
  return {
    id: record.id,
    threadId: record.threadId,
    tool: record.tool,
    summary: record.summary,
    payload,
    status: record.status,
    result,
    createdAt: record.createdAt,
    decidedAt: record.decidedAt,
  };
}

// ---------------------------------------------------------------------------
// Tool execution with audit trail
// ---------------------------------------------------------------------------

/**
 * Runs a tool for an approved action and records executed/failed + result on
 * the agent_actions row. Never throws — failures come back as ok:false.
 */
export async function executeToolForAction(
  actionId: string,
  tool: ToolDefinition,
  input: unknown,
  ownerId: string
): Promise<ToolResult> {
  let result: ToolResult;
  try {
    result = await tool.execute(input, { ownerId });
  } catch (err) {
    result = {
      ok: false,
      summary: `Tool ${tool.name} threw an error: ${err instanceof Error ? err.message : String(err)}`,
    };
  }
  await updateAgentAction(actionId, {
    status: result.ok ? 'executed' : 'failed',
    resultJson: JSON.stringify(result),
  });
  return result;
}

// ---------------------------------------------------------------------------
// The ReAct loop
// ---------------------------------------------------------------------------

/**
 * Drives the think-act-observe loop from a given (possibly resumed) state.
 * Yields step/action_request/final events. On action_request the generator
 * returns — the paused state has already been persisted on the agent_actions
 * row, and the decision route resumes by rebuilding the state and calling
 * this again.
 */
export async function* runAgentLoop(opts: {
  provider: AIProvider;
  ownerId: string;
  threadId: string;
  state: AgentLoopState;
}): AsyncGenerator<AgentLoopEvent, void, unknown> {
  const { provider, ownerId, threadId, state } = opts;
  const preferences = await getUserPreferences(ownerId);
  let consecutiveParseFailures = 0;

  while (state.step < MAX_STEPS) {
    state.step += 1;

    const raw = await provider.chat(state.messages, { temperature: 0 });
    const turn = parseAgentTurn(raw);

    if (!turn) {
      consecutiveParseFailures += 1;
      if (consecutiveParseFailures >= 2) {
        // Model refuses to speak JSON; take its text as the final answer.
        yield { type: 'final', text: raw.trim() };
        return;
      }
      state.messages.push({ role: 'assistant', content: raw });
      state.messages.push({
        role: 'user',
        content:
          'Your last response was not valid JSON. Respond with a single strict JSON object: either ' +
          '{"thought": "...", "action": {"tool": "...", "input": {...}}} or {"thought": "...", "final": "..."}.',
      });
      continue;
    }
    consecutiveParseFailures = 0;

    if (turn.final !== undefined) {
      yield { type: 'step', index: state.step, thought: turn.thought };
      yield { type: 'final', text: turn.final };
      return;
    }

    const actionRequest = turn.action!;
    const tool = getTool(actionRequest.tool);
    state.messages.push({ role: 'assistant', content: raw });

    if (!tool) {
      state.messages.push({
        role: 'user',
        content: `Observation: tool "${actionRequest.tool}" does not exist. Use only the tools listed in the system prompt.`,
      });
      yield { type: 'step', index: state.step, thought: turn.thought };
      continue;
    }

    const validation = tool.inputSchema.safeParse(actionRequest.input);
    if (!validation.success) {
      const issues = validation.error.issues
        .map((i) => `${i.path.join('.') || '(root)'}: ${i.message}`)
        .join('; ');
      state.messages.push({
        role: 'user',
        content: `Observation: invalid input for ${tool.name} — ${issues}. Fix the input and try again.`,
      });
      yield { type: 'step', index: state.step, thought: turn.thought, tool: tool.name };
      continue;
    }

    yield { type: 'step', index: state.step, thought: turn.thought, tool: tool.name };

    const input = validation.data as Record<string, unknown>;
    const summary = summarizeAction(tool.name, input);
    const actionId = uuidv4();
    const record = await insertAgentAction({
      id: actionId,
      threadId,
      ownerId,
      tool: tool.name,
      summary,
      payloadJson: JSON.stringify(input),
      status: 'proposed',
      stateJson: JSON.stringify(state),
    });

    // HITL gate: only read-only tools the user explicitly opted into skip the
    // approval UI. email_send (and every other write tool) can never be
    // auto-approved.
    const autoApproved =
      tool.sideEffect === 'read' &&
      tool.name !== 'email_send' &&
      preferences.autoApprove[tool.name] === true;

    if (!autoApproved) {
      yield { type: 'action_request', action: mapActionToView(record) };
      return; // Pause; the decision route resumes from stateJson.
    }

    await updateAgentAction(actionId, { status: 'approved', decided: true });
    const result = await executeToolForAction(actionId, tool, input, ownerId);
    state.messages.push(buildObservationMessage(tool.name, result));
  }

  yield {
    type: 'final',
    text:
      `I reached my limit of ${MAX_STEPS} steps before fully completing this task. ` +
      'Here is where I got to — ask me to continue with a narrower request if you would like me to keep going.',
  };
}

// ---------------------------------------------------------------------------
// Shared SSE stream driver (used by POST /api/agent and the decision route so
// both emit the exact same event vocabulary: meta, step, action_request,
// token, done, error)
// ---------------------------------------------------------------------------

const encoder = new TextEncoder();

function sseEvent(event: string, data: unknown): Uint8Array {
  return encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
}

const TOKEN_CHUNK_SIZE = 80;

export function createAgentSseStream(opts: {
  provider: AIProvider;
  ownerId: string;
  threadId: string;
  state: AgentLoopState;
  route: string;
}): ReadableStream<Uint8Array> {
  const { provider, ownerId, threadId, state, route } = opts;

  return new ReadableStream<Uint8Array>({
    async start(controller) {
      controller.enqueue(sseEvent('meta', { provider: provider.id }));
      try {
        for await (const event of runAgentLoop({ provider, ownerId, threadId, state })) {
          if (event.type === 'step') {
            controller.enqueue(
              sseEvent('step', { index: event.index, thought: event.thought, tool: event.tool })
            );
          } else if (event.type === 'action_request') {
            controller.enqueue(sseEvent('action_request', { action: event.action }));
            controller.close();
            return;
          } else {
            // final: stream the answer as token events, then persist + close.
            const text = event.text;
            for (let i = 0; i < text.length; i += TOKEN_CHUNK_SIZE) {
              controller.enqueue(sseEvent('token', { text: text.slice(i, i + TOKEN_CHUNK_SIZE) }));
            }

            const promptTokens = Math.ceil(
              state.messages.reduce((n, m) => n + m.content.length, 0) / 4
            );
            const completionTokens = Math.ceil(text.length / 4);

            await insertChatMessage({
              id: uuidv4(),
              threadId,
              role: 'assistant',
              content: text,
              metaJson: JSON.stringify({ provider: provider.id, route: 'agent' }),
              tokenCount: completionTokens,
            });
            await recordUsage({
              id: uuidv4(),
              ownerId,
              provider: provider.id,
              kind: 'chat',
              promptTokens,
              completionTokens,
            });
            await recordActivity({
              id: uuidv4(),
              ownerId,
              type: 'agent',
              summary: `Agent answered: "${state.originalMessage.slice(0, 60)}"`,
            });
            await recordRequestLog({
              id: uuidv4(),
              ownerId,
              route,
              status: 200,
              provider: provider.id,
            });

            controller.enqueue(sseEvent('done', { promptTokens, completionTokens }));
            controller.close();
            return;
          }
        }
        // Generator ended without a final or a pause (should not happen).
        controller.enqueue(sseEvent('done', {}));
        controller.close();
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Agent loop failed.';
        controller.enqueue(sseEvent('error', { error: msg }));
        controller.close();
      }
    },
  });
}
