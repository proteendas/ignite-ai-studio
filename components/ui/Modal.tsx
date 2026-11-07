'use client';

import { ReactNode, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';

/**
 * Centered dialog rendered into <body>. Closes on Escape, backdrop click, or
 * the close button; locks page scroll while open and returns focus to the
 * element that opened it.
 */
export function Modal({
  open,
  onClose,
  title,
  header,
  footer,
  children,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  /** Extra content under the title (badges, metadata). */
  header?: ReactNode;
  footer?: ReactNode;
  children: ReactNode;
}) {
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const previouslyFocused = document.activeElement as HTMLElement | null;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    panelRef.current?.focus();

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      document.body.style.overflow = prevOverflow;
      previouslyFocused?.focus();
    };
  }, [open, onClose]);

  if (!open || typeof document === 'undefined') return null;

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        tabIndex={-1}
        className="flex max-h-[90vh] w-full max-w-3xl flex-col overflow-hidden rounded-lg border border-surface-3 bg-surface-1 shadow-glow-sm outline-none"
      >
        <div className="flex items-start justify-between gap-3 border-b border-surface-3 px-5 py-4">
          <div className="min-w-0 space-y-2">
            <h2 className="text-base font-semibold text-content">{title}</h2>
            {header}
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="focus-ignite -mr-1 shrink-0 rounded-md p-1.5 text-content-muted transition-colors hover:bg-surface-2 hover:text-content"
          >
            <i className="bi bi-x-lg" aria-hidden="true" />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto px-5 py-4">{children}</div>
        {footer && (
          <div className="flex flex-wrap items-center justify-end gap-2 border-t border-surface-3 px-5 py-3">
            {footer}
          </div>
        )}
      </div>
    </div>,
    document.body
  );
}
