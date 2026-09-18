import { Spinner } from '@/components/ui/Spinner';

/** Route-transition fallback shown while a server component streams in. */
export default function Loading() {
  return (
    <div
      role="status"
      aria-live="polite"
      className="flex min-h-screen flex-col items-center justify-center gap-3 bg-base"
    >
      <Spinner />
      <p className="text-sm text-content-muted">Loading…</p>
    </div>
  );
}
