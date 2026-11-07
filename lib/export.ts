import {
  AlignmentType,
  BorderStyle,
  Document,
  ExternalHyperlink,
  HeadingLevel,
  LevelFormat,
  Packer,
  Paragraph,
  ShadingType,
  Table,
  TableCell,
  TableRow,
  TextRun,
  WidthType,
  type ParagraphChild,
} from 'docx';
import type { BlockContent, DefinitionContent, PhrasingContent, RootContent } from 'mdast';
import { toString } from 'mdast-util-to-string';
import { markdownToPlainText, parseMarkdown } from './markdown';

/**
 * Client-safe export helpers for generated content. Content is markdown, so
 * each format gets a real conversion: .md keeps the source, .txt strips the
 * syntax to readable text, and .docx maps the markdown structure onto native
 * Word headings, lists, tables and character formatting. Not for server use —
 * they rely on `document`/`URL` and trigger a real download.
 */

/** Ensures `filename` ends with `.ext` (case-insensitive), appending if needed. */
function withExtension(filename: string, ext: string): string {
  const base = filename.trim() || 'generated-content';
  return base.toLowerCase().endsWith(`.${ext}`) ? base : `${base}.${ext}`;
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
  const blob = new Blob([markdownToPlainText(text) + '\n'], { type: 'text/plain;charset=utf-8' });
  triggerDownload(blob, withExtension(filename, 'txt'));
}

export function exportAsMarkdown(filename: string, text: string): void {
  const body = text.replace(/\r\n/g, '\n');
  const blob = new Blob([body], { type: 'text/markdown;charset=utf-8' });
  triggerDownload(blob, withExtension(filename, 'md'));
}

// ---------------------------------------------------------------------------
// Markdown → docx
// ---------------------------------------------------------------------------

const MONO = 'Consolas';
/** Letter page (12240 twips) minus 1" margins on each side. */
const CONTENT_WIDTH = 9360;
const BODY_SPACING = { after: 160 };
const ORDERED_REF = 'md-ordered';

interface RunStyle {
  bold?: boolean;
  italics?: boolean;
  strike?: boolean;
  code?: boolean;
  link?: boolean;
}

function textRuns(value: string, style: RunStyle): TextRun[] {
  // Soft line breaks inside a paragraph are kept as line breaks — generated
  // copy (emails, sign-offs) relies on them.
  return value.split('\n').map(
    (line, i) =>
      new TextRun({
        text: line,
        break: i > 0 ? 1 : undefined,
        bold: style.bold,
        italics: style.italics,
        strike: style.strike,
        font: style.code ? MONO : undefined,
        shading: style.code ? { type: ShadingType.CLEAR, color: 'auto', fill: 'F2F2F2' } : undefined,
        style: style.link ? 'Hyperlink' : undefined,
      })
  );
}

function inlineRuns(nodes: PhrasingContent[], style: RunStyle = {}): ParagraphChild[] {
  return nodes.flatMap((node): ParagraphChild[] => {
    switch (node.type) {
      case 'text':
        return textRuns(node.value, style);
      case 'strong':
        return inlineRuns(node.children, { ...style, bold: true });
      case 'emphasis':
        return inlineRuns(node.children, { ...style, italics: true });
      case 'delete':
        return inlineRuns(node.children, { ...style, strike: true });
      case 'inlineCode':
        return textRuns(node.value, { ...style, code: true });
      case 'break':
        return [new TextRun({ text: '', break: 1 })];
      case 'link':
        return [
          new ExternalHyperlink({
            link: node.url,
            children: inlineRuns(node.children, { ...style, link: true }) as TextRun[],
          }),
        ];
      case 'image':
        return node.alt ? textRuns(`[${node.alt}]`, { ...style, italics: true }) : [];
      case 'html':
        return textRuns(node.value.replace(/<[^>]+>/g, ''), style);
      default:
        return [];
    }
  });
}

const HEADINGS = [
  HeadingLevel.HEADING_1,
  HeadingLevel.HEADING_2,
  HeadingLevel.HEADING_3,
  HeadingLevel.HEADING_4,
  HeadingLevel.HEADING_5,
  HeadingLevel.HEADING_6,
] as const;

interface BlockCtx {
  /** Left indent in twips (blockquotes / continuation paragraphs). */
  indent: number;
  quote: boolean;
  /** Counter so every ordered list restarts at its own start number. */
  nextListInstance: () => number;
}

function quoteProps(ctx: BlockCtx) {
  return {
    indent: ctx.indent ? { left: ctx.indent } : undefined,
    border: ctx.quote
      ? { left: { style: BorderStyle.SINGLE, size: 12, color: 'BFBFBF', space: 8 } }
      : undefined,
  };
}

function tableBlock(node: Extract<RootContent, { type: 'table' }>): Table {
  const align = node.align ?? [];
  const toAlign = (a: string | null | undefined) =>
    a === 'center' ? AlignmentType.CENTER : a === 'right' ? AlignmentType.RIGHT : AlignmentType.LEFT;

  // Explicit DXA widths: percentage-only tables collapse to one character per
  // column in Pages/QuickLook/LibreOffice. Size columns by content length.
  const cols = Math.max(...node.children.map((r) => r.children.length));
  const lengths = Array.from({ length: cols }, (_, c) =>
    Math.max(4, ...node.children.map((r) => (r.children[c] ? toString(r.children[c]).length : 0)))
  );
  const floor = CONTENT_WIDTH * 0.12;
  const raw = lengths.map((l) => l / lengths.reduce((a, b) => a + b, 0));
  const widths = raw.map((f) => Math.max(floor, f * CONTENT_WIDTH));
  const scale = CONTENT_WIDTH / widths.reduce((a, b) => a + b, 0);
  const columnWidths = widths.map((w) => Math.round(w * scale));

  return new Table({
    width: { size: CONTENT_WIDTH, type: WidthType.DXA },
    columnWidths,
    rows: node.children.map(
      (row, r) =>
        new TableRow({
          tableHeader: r === 0,
          children: row.children.map(
            (cell, c) =>
              new TableCell({
                width: { size: columnWidths[c] ?? floor, type: WidthType.DXA },
                shading: r === 0 ? { type: ShadingType.CLEAR, color: 'auto', fill: 'EDEDED' } : undefined,
                margins: { top: 60, bottom: 60, left: 100, right: 100 },
                children: [
                  new Paragraph({
                    alignment: toAlign(align[c]),
                    children: inlineRuns(cell.children, { bold: r === 0 }),
                  }),
                ],
              })
          ),
        })
    ),
  });
}

function blocks(
  nodes: (RootContent | BlockContent | DefinitionContent)[],
  ctx: BlockCtx
): (Paragraph | Table)[] {
  return nodes.flatMap((node): (Paragraph | Table)[] => {
    switch (node.type) {
      case 'heading':
        return [
          new Paragraph({
            heading: HEADINGS[node.depth - 1],
            spacing: { before: 240, after: 120 },
            children: inlineRuns(node.children),
            ...quoteProps(ctx),
          }),
        ];
      case 'paragraph':
        return [
          new Paragraph({
            spacing: BODY_SPACING,
            children: inlineRuns(node.children, { italics: ctx.quote || undefined }),
            ...quoteProps(ctx),
          }),
        ];
      case 'blockquote':
        return blocks(node.children, { ...ctx, indent: ctx.indent + 360, quote: true });
      case 'code':
        return node.value.split('\n').map(
          (line) =>
            new Paragraph({
              spacing: { after: 0 },
              indent: { left: ctx.indent + 240 },
              shading: { type: ShadingType.CLEAR, color: 'auto', fill: 'F2F2F2' },
              children: [new TextRun({ text: line || ' ', font: MONO, size: 20 })],
            })
        );
      case 'thematicBreak':
        return [
          new Paragraph({
            border: { bottom: { style: BorderStyle.SINGLE, size: 6, color: 'BFBFBF', space: 1 } },
            children: [],
          }),
        ];
      case 'table':
        return [tableBlock(node), new Paragraph({ children: [] })];
      case 'list':
        return listBlocks(node, ctx, 0);
      case 'html':
        return [new Paragraph({ children: textRuns(node.value.replace(/<[^>]+>/g, ''), {}) })];
      default:
        return [];
    }
  });
}

function listBlocks(
  list: Extract<RootContent, { type: 'list' }>,
  ctx: BlockCtx,
  level: number
): (Paragraph | Table)[] {
  const instance = list.ordered ? ctx.nextListInstance() : 0;
  const out: (Paragraph | Table)[] = [];

  for (const item of list.children) {
    item.children.forEach((child, i) => {
      if (child.type === 'list') {
        out.push(...listBlocks(child, ctx, Math.min(level + 1, 8)));
        return;
      }
      if (i === 0 && child.type === 'paragraph') {
        const check = item.checked == null ? [] : [new TextRun(item.checked ? '☑ ' : '☐ ')];
        out.push(
          new Paragraph({
            ...(list.ordered
              ? { numbering: { reference: ORDERED_REF, level, instance } }
              : { bullet: { level } }),
            spacing: { after: list.spread ? 120 : 40 },
            children: [...check, ...inlineRuns(child.children)],
          })
        );
        return;
      }
      // Continuation paragraphs/blocks of a list item: indent under the text.
      out.push(...blocks([child], { ...ctx, indent: 720 * (level + 1) }));
    });
  }
  return out;
}

export function markdownToDocx(text: string): Document {
  let instance = 0;
  const children = blocks(parseMarkdown(text).children, {
    indent: 0,
    quote: false,
    nextListInstance: () => ++instance,
  });

  return new Document({
    styles: {
      default: {
        document: { run: { font: 'Calibri', size: 22 }, paragraph: { spacing: { after: 120, line: 276 } } },
      },
    },
    numbering: {
      config: [
        {
          reference: ORDERED_REF,
          levels: Array.from({ length: 9 }, (_, level) => ({
            level,
            format: [LevelFormat.DECIMAL, LevelFormat.LOWER_LETTER, LevelFormat.LOWER_ROMAN][level % 3],
            text: `%${level + 1}.`,
            alignment: AlignmentType.START,
            style: { paragraph: { indent: { left: 720 * (level + 1), hanging: 360 } } },
          })),
        },
      ],
    },
    sections: [{ children }],
  });
}

export async function exportAsDocx(filename: string, text: string): Promise<void> {
  const blob = await Packer.toBlob(markdownToDocx(text));
  triggerDownload(blob, withExtension(filename, 'docx'));
}

export type ExportFormat = 'txt' | 'md' | 'docx';

export async function exportContent(fmt: ExportFormat, filename: string, text: string): Promise<void> {
  if (fmt === 'txt') exportAsTxt(filename, text);
  else if (fmt === 'md') exportAsMarkdown(filename, text);
  else await exportAsDocx(filename, text);
}
