/**
 * Extracts plain text from an uploaded document. `filename` is used as a
 * fallback signal for text formats, since browsers report .txt/.md with
 * inconsistent (or empty) MIME types.
 */
export async function parseDocument(
  buffer: Buffer,
  mimeType: string,
  filename?: string
): Promise<string> {
  if (mimeType === 'application/pdf') {
    const pdfParse = (await import('pdf-parse')).default;
    const result = await pdfParse(buffer);
    return result.text;
  }

  if (mimeType === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document') {
    const mammoth = await import('mammoth');
    const result = await mammoth.extractRawText({ buffer });
    return result.value;
  }

  // Everything else we accept (txt, md, and the empty/octet-stream MIME
  // variants browsers send for them) is UTF-8 text.
  const lowerName = (filename ?? '').toLowerCase();
  const isTextMime =
    mimeType.startsWith('text/') || mimeType === 'application/octet-stream' || mimeType === '';
  const isTextExt = lowerName.endsWith('.txt') || lowerName.endsWith('.md');
  if (isTextMime || isTextExt) {
    return buffer.toString('utf-8');
  }

  throw new Error(`Unsupported mime type for parsing: ${mimeType}`);
}
