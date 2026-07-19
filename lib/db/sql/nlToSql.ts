import { AIProvider } from '@/lib/ai/providerAdapter';
import { runReadOnlyQuery } from './client';

const ALLOWED_TABLES: Record<string, string[]> = {
  products: ['id', 'name', 'category', 'price', 'stock'],
  orders: ['id', 'product_id', 'customer_name', 'quantity', 'order_date', 'status'],
};

const SCHEMA_DESCRIPTION = `
Table products(id INTEGER, name TEXT, category TEXT, price REAL, stock INTEGER)
Table orders(id INTEGER, product_id INTEGER REFERENCES products(id), customer_name TEXT, quantity INTEGER, order_date TEXT, status TEXT)
`.trim();

export interface NlToSqlResult {
  sql: string;
  rows: unknown[];
}

/**
 * Guards against anything that isn't a single, read-only SELECT against the
 * allow-listed demo tables/columns. Rejects multiple statements, DML/DDL
 * keywords, and any table not in ALLOWED_TABLES. This is a defense-in-depth
 * layer on top of runReadOnlyQuery()'s use of `.prepare().all()`, which
 * already blocks multi-statement execution at the driver level.
 */
export function validateReadOnlySql(sql: string): { ok: true } | { ok: false; error: string } {
  const trimmed = sql.trim().replace(/;+\s*$/, '');

  if (!/^select\s/i.test(trimmed)) {
    return { ok: false, error: 'Only SELECT statements are permitted.' };
  }

  const forbiddenPattern = /\b(insert|update|delete|drop|alter|create|attach|detach|pragma|replace|vacuum)\b/i;
  if (forbiddenPattern.test(trimmed)) {
    return { ok: false, error: 'Query contains a forbidden keyword.' };
  }

  if (trimmed.includes(';')) {
    return { ok: false, error: 'Multiple statements are not permitted.' };
  }

  const tableMatches = trimmed.match(/\bfrom\s+([a-zA-Z_][a-zA-Z0-9_]*)|\bjoin\s+([a-zA-Z_][a-zA-Z0-9_]*)/gi) || [];
  const referencedTables = tableMatches
    .map((m) => m.replace(/\b(from|join)\s+/i, '').toLowerCase())
    .filter(Boolean);

  if (referencedTables.length === 0) {
    return { ok: false, error: 'Could not determine which table(s) the query references.' };
  }

  for (const table of referencedTables) {
    if (!ALLOWED_TABLES[table]) {
      return { ok: false, error: `Table "${table}" is not permitted for querying.` };
    }
  }

  return { ok: true };
}

function ensureLimit(sql: string, maxRows = 100): string {
  if (/\blimit\s+\d+/i.test(sql)) return sql;
  return `${sql.trim().replace(/;+\s*$/, '')} LIMIT ${maxRows}`;
}

export async function translateAndRunNlToSql(
  provider: AIProvider,
  question: string
): Promise<NlToSqlResult> {
  const systemPrompt = [
    'You translate natural-language questions into a single read-only SQLite SELECT statement ' +
      'against the following schema. Only use these tables and columns — never invent columns ' +
      'or tables.',
    SCHEMA_DESCRIPTION,
    'Respond with ONLY the SQL statement, no markdown code fences, no explanation, no trailing ' +
      'semicolon required. The statement must start with SELECT and must not modify data.',
  ].join('\n\n');

  const rawSql = await provider.chat(
    [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: question },
    ],
    { temperature: 0 }
  );

  const cleanedSql = rawSql
    .trim()
    .replace(/^```sql\s*/i, '')
    .replace(/^```\s*/i, '')
    .replace(/```\s*$/i, '')
    .trim();

  const validation = validateReadOnlySql(cleanedSql);
  if (!validation.ok) {
    throw new Error(`Generated SQL failed validation: ${validation.error}\nSQL: ${cleanedSql}`);
  }

  const finalSql = ensureLimit(cleanedSql);
  const rows = runReadOnlyQuery(finalSql);

  return { sql: finalSql, rows };
}
