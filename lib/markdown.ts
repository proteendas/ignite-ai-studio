import { unified } from 'unified';
import remarkParse from 'remark-parse';
import remarkGfm from 'remark-gfm';
import type { Nodes, Parents, Root, RootContent, Table } from 'mdast';

/**
 * Markdown helpers shared by the preview UI and the exporters. Generated
 * content is markdown (LLM output), so every non-markdown target (.txt, .docx,
 * tile previews) goes through the same GFM parse tree instead of regexes.
 */

export function parseMarkdown(text: string): Root {
  return unified().use(remarkParse).use(remarkGfm).parse(text);
}

/** Flattens inline content to text. Links keep their URL when it differs from the label. */
function inlineText(node: Nodes): string {
  switch (node.type) {
    case 'text':
    case 'inlineCode':
      return node.value;
    case 'break':
      return '\n';
    case 'image':
      return node.alt ?? '';
    case 'link': {
      const label = node.children.map(inlineText).join('');
      return label && label !== node.url ? `${label} (${node.url})` : node.url;
    }
    case 'html':
      return node.value.replace(/<[^>]+>/g, '');
    default:
      return 'children' in node ? (node as Parents).children.map(inlineText).join('') : '';
  }
}

function tableToText(table: Table): string {
  const rows = table.children.map((row) =>
    row.children.map((cell) => cell.children.map(inlineText).join('').trim())
  );
  const cols = Math.max(...rows.map((r) => r.length));
  const widths = Array.from({ length: cols }, (_, c) =>
    Math.max(3, ...rows.map((r) => (r[c] ?? '').length))
  );
  const fmt = (r: string[]) =>
    widths.map((w, c) => (r[c] ?? '').padEnd(w)).join('  ').trimEnd();
  const [header, ...body] = rows;
  return [fmt(header), widths.map((w) => '-'.repeat(w)).join('  '), ...body.map(fmt)].join('\n');
}

function blockToText(node: RootContent, indent = ''): string {
  switch (node.type) {
    case 'heading':
    case 'paragraph':
      return indent + inlineText(node).replace(/\n/g, `\n${indent}`);
    case 'thematicBreak':
      return `${indent}----------------------------------------`;
    case 'code':
      return node.value
        .split('\n')
        .map((l) => indent + '    ' + l)
        .join('\n');
    case 'blockquote':
      return node.children.map((c) => blockToText(c, indent + '  ')).join('\n\n');
    case 'list': {
      const start = node.start ?? 1;
      return node.children
        .map((item, i) => {
          const marker = node.ordered ? `${start + i}. ` : '• ';
          const check = item.checked == null ? '' : item.checked ? '[x] ' : '[ ] ';
          const pad = ' '.repeat(marker.length);
          const parts = item.children.map((c, j) => {
            const text = blockToText(c, indent + pad);
            return j === 0 ? indent + marker + check + text.slice(indent.length + pad.length) : text;
          });
          return parts.join(node.spread ? '\n\n' : '\n');
        })
        .join(node.spread ? '\n\n' : '\n');
    }
    case 'table':
      return tableToText(node)
        .split('\n')
        .map((l) => indent + l)
        .join('\n');
    case 'html':
      return indent + inlineText(node);
    default:
      return indent + inlineText(node);
  }
}

/** Converts markdown to readable plain text (no `**`, `#`, pipes, etc.). */
export function markdownToPlainText(text: string): string {
  return parseMarkdown(text)
    .children.map((n) => blockToText(n))
    .filter((s) => s.trim() !== '')
    .join('\n\n');
}

/**
 * Short title + one-paragraph summary for overview tiles. Prefers a heading or
 * an email "Subject:" line for the title; the excerpt is the first prose
 * block after it, as plain text.
 */
export function summarizeMarkdown(text: string): { title: string; excerpt: string } {
  const blocks = parseMarkdown(text)
    .children.filter((n) => n.type !== 'thematicBreak')
    .map((n) => ({ type: n.type, text: blockToText(n).trim() }))
    .filter((b) => b.text);

  if (blocks.length === 0) return { title: 'Untitled', excerpt: '' };

  const headingIdx = blocks.findIndex((b) => b.type === 'heading');
  const subjectIdx = blocks.findIndex((b) => /^subject\s*:/i.test(b.text));
  const titleIdx = subjectIdx >= 0 ? subjectIdx : headingIdx >= 0 ? headingIdx : 0;
  const title = blocks[titleIdx].text.replace(/^subject\s*:\s*/i, '').split('\n')[0];

  const rest = blocks.filter((b, i) => i !== titleIdx && b.type === 'paragraph');
  // Skip short salutations ("Dear X,", "Hi team,") so the excerpt carries substance.
  const body = rest.find((b) => b.text.length > 40) ?? rest[0];
  return { title, excerpt: body?.text.replace(/\s+/g, ' ') ?? '' };
}
