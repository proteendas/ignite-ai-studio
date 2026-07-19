import { z } from 'zod';
import type { ToolDefinition } from './types';
import { githubTools } from './github';
import { emailSend } from './email';

/**
 * Central tool registry. To add a capability to the agent: write one
 * ToolDefinition file and append it here — the ReAct loop, HITL gate, and UI
 * all pick it up automatically.
 */
const TOOLS: ToolDefinition[] = [...githubTools, emailSend];

export function listTools(): ToolDefinition[] {
  return TOOLS;
}

export function getTool(name: string): ToolDefinition | undefined {
  return TOOLS.find((t) => t.name === name);
}

/**
 * Renders a zod schema as a compact JSON-ish shape string for the system
 * prompt, e.g. {"repo": "string", "state": "\"open\"|\"closed\"|\"all\" (optional)"}.
 * Handles the subset of zod types used by tool input schemas.
 */
function describeSchema(schema: z.ZodTypeAny): string {
  if (schema instanceof z.ZodObject) {
    const shape = schema.shape as Record<string, z.ZodTypeAny>;
    const fields = Object.entries(shape).map(
      ([key, value]) => `"${key}": ${describeSchema(value)}`
    );
    return `{${fields.join(', ')}}`;
  }
  if (schema instanceof z.ZodOptional || schema instanceof z.ZodDefault) {
    const inner = describeSchema((schema._def as { innerType: z.ZodTypeAny }).innerType);
    return `${inner} (optional)`;
  }
  if (schema instanceof z.ZodEnum) {
    return (schema.options as string[]).map((o) => `"${o}"`).join('|');
  }
  if (schema instanceof z.ZodString) return '"string"';
  if (schema instanceof z.ZodNumber) return 'number';
  if (schema instanceof z.ZodBoolean) return 'boolean';
  return '"unknown"';
}

/**
 * Compact plain-text catalog of every registered tool for the agent system
 * prompt: name, read/write classification, description, and input shape.
 */
export function toolCatalogForPrompt(): string {
  return TOOLS.map(
    (tool) =>
      `- ${tool.name} [${tool.sideEffect}]: ${tool.description}\n  Input: ${describeSchema(tool.inputSchema)}`
  ).join('\n');
}
