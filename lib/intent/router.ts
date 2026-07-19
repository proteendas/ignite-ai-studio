import { AIProvider } from '@/lib/ai/providerAdapter';
import { buildClarificationCheckPrompt } from '@/lib/ai/prompts';

export type IntentRoute = 'document' | 'structured-data' | 'compound' | 'general';

export interface IntentClassification {
  route: IntentRoute;
  subQueries?: string[];
}

const CLASSIFIER_SYSTEM_PROMPT = `
You classify a user's question into exactly one of these categories:

- "document": the question is about unstructured content (facts, explanations, summaries, policies, narrative content) likely found in uploaded documents.
- "structured-data": the question is about structured/tabular data — counts, sums, prices, stock levels, orders, customers, dates, statuses — the kind of thing stored in a database table of products/orders.
- "compound": the question contains two or more distinct sub-questions that would need to be answered separately (potentially from different sources) and then combined.
- "general": small talk, meta questions about the assistant itself, or anything not groundable in documents or structured data.

Respond with STRICT JSON only, no markdown, no commentary, matching exactly:
{"route": "document"|"structured-data"|"compound"|"general", "subQueries": string[]|null}

"subQueries" must be non-null ONLY when route is "compound" — provide each independent sub-question as its own string, each further classified implicitly as document or structured-data by whichever router call handles it next. For all other routes, "subQueries" must be null.
`.trim();

function safeParseJson<T>(text: string): T | null {
  const cleaned = text
    .trim()
    .replace(/^```json\s*/i, '')
    .replace(/^```\s*/i, '')
    .replace(/```\s*$/i, '')
    .trim();
  try {
    return JSON.parse(cleaned) as T;
  } catch {
    return null;
  }
}

export async function classifyIntent(
  provider: AIProvider,
  question: string
): Promise<IntentClassification> {
  const raw = await provider.chat(
    [
      { role: 'system', content: CLASSIFIER_SYSTEM_PROMPT },
      { role: 'user', content: question },
    ],
    { temperature: 0 }
  );

  const parsed = safeParseJson<{ route?: string; subQueries?: string[] | null }>(raw);

  if (!parsed || !['document', 'structured-data', 'compound', 'general'].includes(parsed.route || '')) {
    // Fail safe: default to document-grounded RAG rather than erroring the request.
    return { route: 'document' };
  }

  const route = parsed.route as IntentRoute;
  if (route === 'compound') {
    const subQueries = Array.isArray(parsed.subQueries)
      ? parsed.subQueries.filter((q) => typeof q === 'string' && q.trim().length > 0)
      : [];
    if (subQueries.length < 2) {
      return { route: 'document' };
    }
    return { route: 'compound', subQueries };
  }

  return { route };
}

export interface ClarificationCheck {
  ambiguous: boolean;
  question: string | null;
}

export async function checkNeedsClarification(
  provider: AIProvider,
  question: string
): Promise<ClarificationCheck> {
  const raw = await provider.chat(
    [
      { role: 'system', content: buildClarificationCheckPrompt() },
      { role: 'user', content: question },
    ],
    { temperature: 0 }
  );

  const parsed = safeParseJson<{ ambiguous?: boolean; question?: string | null }>(raw);
  if (!parsed || typeof parsed.ambiguous !== 'boolean') {
    return { ambiguous: false, question: null };
  }
  return { ambiguous: parsed.ambiguous, question: parsed.ambiguous ? parsed.question ?? null : null };
}
