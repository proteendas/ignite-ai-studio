import { Document, Packer, Paragraph, TextRun } from 'docx';

/**
 * Client-safe export helpers for generated content. Each function turns a
 * string into a downloadable file in the browser. Not for server use — they
 * rely on `document`/`URL` and trigger a real download.
 */

/** Ensures `filename` ends with `.ext` (case-insensitive), appending if needed. */
function withExtension(filename: string, ext: string): string {
  const base = filename.trim() || 'generated-content';
  return base.toLowerCase().endsWith(`.${ext}`) ? base : `${base}.${ext}`;
}

/** Splits text into lines on any newline style; each line becomes a paragraph. */
function toLines(text: string): string[] {
  return text.split(/\r?\n/);
}

/** Creates an object URL for `blob`, clicks a temporary anchor, then cleans up. */
function triggerDownload(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

export function exportAsTxt(filename: string, text: string): void {
  const body = toLines(text).join('\n');
  const blob = new Blob([body], { type: 'text/plain;charset=utf-8' });
  triggerDownload(blob, withExtension(filename, 'txt'));
}

export function exportAsMarkdown(filename: string, text: string): void {
  const body = toLines(text).join('\n');
  const blob = new Blob([body], { type: 'text/markdown;charset=utf-8' });
  triggerDownload(blob, withExtension(filename, 'md'));
}

export async function exportAsDocx(filename: string, text: string): Promise<void> {
  const paragraphs = toLines(text).map(
    (line) => new Paragraph({ children: [new TextRun(line)] })
  );

  const doc = new Document({
    sections: [{ children: paragraphs }],
  });

  const blob = await Packer.toBlob(doc);
  triggerDownload(blob, withExtension(filename, 'docx'));
}
