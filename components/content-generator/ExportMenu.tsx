'use client';

import { useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/Button';
import { useToast } from '@/components/ui/Toaster';
import { exportContent, type ExportFormat } from '@/lib/export';

const EXPORT_FORMATS: { value: ExportFormat; label: string; icon: string }[] = [
  { value: 'docx', label: 'Word (.docx)', icon: 'bi-filetype-docx' },
  { value: 'md', label: 'Markdown (.md)', icon: 'bi-filetype-md' },
  { value: 'txt', label: 'Plain text (.txt)', icon: 'bi-filetype-txt' },
];

/** "Export ▾" dropdown that converts markdown content to the chosen format and downloads it. */
export function ExportMenu({
  filename,
  content,
  align = 'right',
  direction = 'down',
}: {
  filename: string;
  content: string;
  align?: 'left' | 'right';
  direction?: 'up' | 'down';
}) {
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDocMouseDown = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setOpen(false);
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', onDocMouseDown);
    document.addEventListener('keydown', onKeyDown, true);
    return () => {
      document.removeEventListener('mousedown', onDocMouseDown);
      document.removeEventListener('keydown', onKeyDown, true);
    };
  }, [open]);

  const handleExport = async (fmt: ExportFormat) => {
    setOpen(false);
    setBusy(true);
    try {
      await exportContent(fmt, filename, content);
      toast(`Exported as .${fmt}.`, 'success');
    } catch {
      toast('Export failed.', 'error');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="relative" ref={menuRef}>
      <Button
        variant="secondary"
        onClick={() => setOpen((o) => !o)}
        disabled={busy}
        aria-haspopup="menu"
        aria-expanded={open}
      >
        <i className="bi bi-download" aria-hidden="true" />
        Export
        <i className="bi bi-chevron-down text-xs" aria-hidden="true" />
      </Button>
      {open && (
        <div
          role="menu"
          className={`absolute z-20 w-52 overflow-hidden rounded-md border border-surface-3 bg-surface-2 py-1 shadow-glow-sm ${
            align === 'right' ? 'right-0' : 'left-0'
          } ${direction === 'up' ? 'bottom-full mb-1' : 'mt-1'}`}
        >
          {EXPORT_FORMATS.map((fmt) => (
            <button
              key={fmt.value}
              type="button"
              role="menuitem"
              onClick={() => void handleExport(fmt.value)}
              className="focus-ignite flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-content transition-colors hover:bg-surface-3"
            >
              <i className={`bi ${fmt.icon} text-content-muted`} aria-hidden="true" />
              {fmt.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
