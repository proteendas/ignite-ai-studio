// ~700 tokens per chunk (~4 chars/token) with ~12% overlap so context
// survives chunk boundaries without bloating the index.
const DEFAULT_CHUNK_SIZE = 2800;
const DEFAULT_OVERLAP = 350;

/**
 * Recursive character splitter: tries to break on paragraph, then sentence,
 * then word boundaries so chunks don't cut mid-sentence when avoidable.
 */
export function chunkText(
  text: string,
  chunkSize: number = DEFAULT_CHUNK_SIZE,
  overlap: number = DEFAULT_OVERLAP
): string[] {
  const normalized = text.replace(/\r\n/g, '\n').replace(/[ \t]+/g, ' ').trim();
  if (!normalized) return [];
  if (normalized.length <= chunkSize) return [normalized];

  const separators = ['\n\n', '\n', '. ', ' '];
  const chunks: string[] = [];
  let start = 0;

  while (start < normalized.length) {
    let end = Math.min(start + chunkSize, normalized.length);

    if (end < normalized.length) {
      let splitAt = -1;
      for (const sep of separators) {
        const idx = normalized.lastIndexOf(sep, end);
        if (idx > start) {
          splitAt = idx + sep.length;
          break;
        }
      }
      if (splitAt > start) {
        end = splitAt;
      }
    }

    const chunk = normalized.slice(start, end).trim();
    if (chunk) chunks.push(chunk);

    if (end >= normalized.length) break;
    start = Math.max(end - overlap, start + 1);
  }

  return chunks;
}
