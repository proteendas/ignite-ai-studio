import ReactMarkdown, { type Components } from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Citation } from '@/lib/types';

const CITE_PREFIX = '#cite-';

/**
 * Grounded answers carry inline markers like `[doc:file.pdf#3]` (some models
 * emit fullwidth `【doc:file.pdf#3】`). Rewrite them into markdown links with a
 * sentinel href so the `a` renderer can turn them into citation chips.
 */
function linkifyCitations(text: string): string {
  return text.replace(/[\[【]doc:([^\]】\n]+?)#(\d+)[\]】]/g, (_m, file: string, idx: string) => {
    const label = `${file}#${idx}`.replace(/([\\\[\]*_`])/g, '\\$1');
    const href = `${CITE_PREFIX}${encodeURIComponent(file)}~${idx}`;
    return `[${label}](<${href}>)`;
  });
}

function buildComponents(citations?: Citation[], preserveLineBreaks?: boolean): Components {
  return {
    p: ({ children }) => (
      <p className={`my-2 leading-relaxed first:mt-0 last:mb-0${preserveLineBreaks ? ' whitespace-pre-line' : ''}`}>
        {children}
      </p>
    ),
    h1: ({ children }) => <h1 className="mb-2 mt-4 text-lg font-semibold first:mt-0">{children}</h1>,
    h2: ({ children }) => <h2 className="mb-2 mt-4 text-base font-semibold first:mt-0">{children}</h2>,
    h3: ({ children }) => <h3 className="mb-1.5 mt-3 font-semibold first:mt-0">{children}</h3>,
    h4: ({ children }) => <h4 className="mb-1 mt-3 font-semibold first:mt-0">{children}</h4>,
    ul: ({ children }) => <ul className="my-2 list-disc space-y-1 pl-5 marker:text-content-muted">{children}</ul>,
    ol: ({ children }) => <ol className="my-2 list-decimal space-y-1 pl-5 marker:text-content-muted">{children}</ol>,
    li: ({ children }) => <li className="leading-relaxed [&>ol]:my-1 [&>ul]:my-1">{children}</li>,
    strong: ({ children }) => <strong className="font-semibold text-content">{children}</strong>,
    em: ({ children }) => <em className="italic">{children}</em>,
    blockquote: ({ children }) => (
      <blockquote className="my-2 border-l-2 border-ignite/50 pl-3 text-content-muted">{children}</blockquote>
    ),
    hr: () => <hr className="my-3 border-surface-3" />,
    a: ({ href, children }) => {
      if (href?.startsWith(CITE_PREFIX)) {
        const [encFile, idx] = href.slice(CITE_PREFIX.length).split('~');
        const file = decodeURIComponent(encFile ?? '');
        const match = citations?.find(
          (c) => c.filename === file && String(c.chunkIndex) === idx
        );
        return (
          <span
            title={match?.snippet ? `${match.snippet}…` : `${file}#${idx}`}
            className="mx-0.5 inline-flex items-center gap-0.5 whitespace-nowrap rounded bg-ignite/15 px-1 py-px align-baseline text-[0.7rem] font-medium text-ignite-light"
          >
            <i className="bi bi-quote" aria-hidden="true" />
            {children}
          </span>
        );
      }
      return (
        <a
          href={href}
          target="_blank"
          rel="noopener noreferrer"
          className="text-ignite-light underline underline-offset-2 hover:text-ignite"
        >
          {children}
        </a>
      );
    },
    code: ({ className, children }) => {
      const isBlock = /language-/.test(className ?? '') || String(children).includes('\n');
      if (isBlock) {
        return <code className={className}>{children}</code>;
      }
      return (
        <code className="rounded bg-surface-3 px-1 py-0.5 font-mono text-[0.85em]">{children}</code>
      );
    },
    pre: ({ children }) => (
      <pre className="my-2 overflow-x-auto rounded-md border border-surface-3 bg-surface-1 p-3 font-mono text-xs leading-relaxed">
        {children}
      </pre>
    ),
    table: ({ children }) => (
      <div className="my-2 overflow-x-auto">
        <table className="w-full border-collapse text-left text-xs">{children}</table>
      </div>
    ),
    th: ({ children }) => (
      <th className="border border-surface-3 bg-surface-3/50 px-2 py-1 font-semibold">{children}</th>
    ),
    td: ({ children }) => <td className="border border-surface-3 px-2 py-1 align-top">{children}</td>,
  };
}

export function MarkdownContent({
  content,
  citations,
  isStreaming,
  preserveLineBreaks,
  className,
}: {
  content: string;
  citations?: Citation[];
  isStreaming?: boolean;
  /** Render single newlines inside a paragraph as line breaks (emails, sign-offs). */
  preserveLineBreaks?: boolean;
  className?: string;
}) {
  // Appending the cursor to the source keeps it inline at the end of the last
  // paragraph instead of dropping onto its own line below the rendered blocks.
  const source = linkifyCitations(content) + (isStreaming ? ' ▍' : '');

  return (
    <div className={`break-words${className ? ` ${className}` : ''}`}>
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={buildComponents(citations, preserveLineBreaks)}>
        {source}
      </ReactMarkdown>
    </div>
  );
}
