import type { z } from 'zod';

/** Per-invocation context passed to every tool (who is running it). */
export interface ToolContext {
  ownerId: string;
}

/**
 * Normalized outcome of a tool run. `summary` is a short human-readable
 * sentence (shown in the activity log); `data` carries the structured result
 * that gets fed back to the agent loop as an observation.
 */
export interface ToolResult {
  ok: boolean;
  summary: string;
  data?: unknown;
}

/**
 * A single agent tool. Adding a new capability to the agent means writing one
 * of these plus a registry entry — the ReAct loop itself never changes.
 *
 * `sideEffect` drives the human-in-the-loop policy: 'read' tools may be
 * auto-approved per-user via preferences; 'write' tools always require an
 * explicit approval in the UI.
 */
export interface ToolDefinition {
  name: string;
  description: string;
  sideEffect: 'read' | 'write';
  inputSchema: z.ZodTypeAny;
  execute(input: unknown, ctx: ToolContext): Promise<ToolResult>;
}
