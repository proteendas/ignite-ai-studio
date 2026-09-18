/**
 * Timestamp formatting for display.
 *
 * The API returns ISO-8601 (`2026-09-18T16:47:49.028Z`) since every timestamp
 * goes through `toIso()` in the data layer. Rendering that string directly is a
 * bug — it shows the user a `T` and a `Z`.
 *
 * `parseTimestamp` also accepts the older SQLite shape (`2026-09-18 16:47:49`)
 * so a database written before the Postgres port still renders correctly.
 * Crucially it appends `Z` to that form: those values were UTC, but without a
 * zone designator browsers parse them as *local* time, which silently shifted
 * every displayed timestamp by the viewer's offset.
 */

function parseTimestamp(value: string): Date | null {
  if (!value) return null;
  const normalized = value.includes('T') ? value : `${value.replace(' ', 'T')}Z`;
  const date = new Date(normalized);
  return Number.isNaN(date.getTime()) ? null : date;
}

/** Date and time in the viewer's locale, e.g. "18/09/2026, 22:17:49". */
export function formatDateTime(value: string): string {
  const date = parseTimestamp(value);
  return date ? date.toLocaleString() : (value || '—');
}

/** Date only, e.g. "18/09/2026". */
export function formatDate(value: string): string {
  const date = parseTimestamp(value);
  return date ? date.toLocaleDateString() : (value || '—');
}

/** Time only, e.g. "22:17:49". */
export function formatTime(value: string): string {
  const date = parseTimestamp(value);
  return date ? date.toLocaleTimeString() : (value || '—');
}

/**
 * Compact relative age ("just now", "5m ago", "3d ago"), falling back to an
 * absolute date beyond a week where "37d ago" stops being useful.
 */
export function formatRelative(value: string): string {
  const date = parseTimestamp(value);
  if (!date) return value || '—';

  const seconds = Math.round((Date.now() - date.getTime()) / 1000);
  if (seconds < 0) return formatDateTime(value); // clock skew — do not say "in -3s"
  if (seconds < 45) return 'just now';
  if (seconds < 3600) return `${Math.round(seconds / 60)}m ago`;
  if (seconds < 86_400) return `${Math.round(seconds / 3600)}h ago`;
  if (seconds < 604_800) return `${Math.round(seconds / 86_400)}d ago`;
  return formatDate(value);
}
