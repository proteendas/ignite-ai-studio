'use client';

import { createContext, useContext, useState, useCallback, ReactNode } from 'react';

type ToastKind = 'success' | 'error' | 'info';

interface Toast {
  id: number;
  kind: ToastKind;
  message: string;
}

interface ToastContextValue {
  toast: (message: string, kind?: ToastKind) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

export function useToast(): ToastContextValue {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast must be used within <ToasterProvider>');
  return ctx;
}

let counter = 0;

const KIND_ICON: Record<ToastKind, string> = {
  success: 'bi-check-circle-fill',
  error: 'bi-exclamation-octagon-fill',
  info: 'bi-info-circle-fill',
};

// Status colors stay within the red/black system; success uses a muted green
// dot only (constitution #7 permits minimal status dots).
const KIND_ACCENT: Record<ToastKind, string> = {
  success: 'text-emerald-400',
  error: 'text-ignite-light',
  info: 'text-content-muted',
};

export function ToasterProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const toast = useCallback((message: string, kind: ToastKind = 'info') => {
    const id = ++counter;
    setToasts((prev) => [...prev, { id, kind, message }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 4000);
  }, []);

  return (
    <ToastContext.Provider value={{ toast }}>
      {children}
      <div
        className="pointer-events-none fixed right-4 top-4 z-50 flex w-80 max-w-[calc(100vw-2rem)] flex-col gap-2"
        aria-live="polite"
        aria-atomic="true"
      >
        {toasts.map((t) => (
          <div
            key={t.id}
            role="status"
            className="pointer-events-auto flex animate-toast-in items-start gap-2 rounded-lg border border-surface-3 bg-surface-2 px-4 py-3 text-sm text-content shadow-glow-sm"
          >
            <i className={`bi ${KIND_ICON[t.kind]} ${KIND_ACCENT[t.kind]} mt-0.5`} aria-hidden="true" />
            <span className="flex-1">{t.message}</span>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}
