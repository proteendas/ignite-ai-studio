'use client';

import { useCallback, useRef, useState } from 'react';
import clsx from 'clsx';
import { Spinner } from '@/components/ui/Spinner';
import { Skeleton } from '@/components/ui/Skeleton';
import { useToast } from '@/components/ui/Toaster';

type UploadStatus = 'uploading' | 'processing' | 'ready' | 'failed';

interface UploadItem {
  id: number;
  filename: string;
  /** 0-100, meaningful during the "uploading" phase. */
  progress: number;
  status: UploadStatus;
  error?: string;
  chunkCount?: number;
}

interface IngestSuccess {
  documentId: string;
  filename: string;
  chunkCount: number;
  status: string;
}

const ACCEPTED_EXTENSIONS = ['.pdf', '.docx', '.txt', '.md'] as const;
const MAX_SIZE_BYTES = 20 * 1024 * 1024;

let uploadCounter = 0;

function extensionOf(name: string): string {
  const lower = name.toLowerCase();
  const dot = lower.lastIndexOf('.');
  return dot === -1 ? '' : lower.slice(dot);
}

const STATUS_LABEL: Record<UploadStatus, string> = {
  uploading: 'Uploading',
  processing: 'Processing',
  ready: 'Ready',
  failed: 'Failed',
};

export function UploadDropzone({ onUploaded }: { onUploaded: () => void }) {
  const { toast } = useToast();
  const [isDragging, setIsDragging] = useState(false);
  const [items, setItems] = useState<UploadItem[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);

  const patchItem = useCallback((id: number, patch: Partial<UploadItem>) => {
    setItems((prev) => prev.map((i) => (i.id === id ? { ...i, ...patch } : i)));
  }, []);

  const uploadFile = useCallback(
    (file: File) => {
      const id = ++uploadCounter;
      const base: UploadItem = {
        id,
        filename: file.name,
        progress: 0,
        status: 'uploading',
      };
      setItems((prev) => [base, ...prev]);

      // Client-side guards for immediate feedback (server re-validates).
      if (file.size > MAX_SIZE_BYTES) {
        const error = 'File exceeds the 20MB maximum.';
        patchItem(id, { status: 'failed', progress: 100, error });
        toast(`${file.name}: ${error}`, 'error');
        return;
      }
      if (!ACCEPTED_EXTENSIONS.includes(extensionOf(file.name) as (typeof ACCEPTED_EXTENSIONS)[number])) {
        const error = 'Unsupported file type. Allowed: PDF, DOCX, TXT, MD.';
        patchItem(id, { status: 'failed', progress: 100, error });
        toast(`${file.name}: ${error}`, 'error');
        return;
      }

      const formData = new FormData();
      formData.append('file', file);

      const xhr = new XMLHttpRequest();
      xhr.open('POST', '/api/ingest');

      xhr.upload.onprogress = (evt) => {
        if (evt.lengthComputable) {
          const pct = Math.round((evt.loaded / evt.total) * 100);
          // Cap at 99 until the server responds; hitting 100 flips to processing.
          patchItem(id, { progress: Math.min(pct, 99) });
        }
      };

      // Bytes fully sent — the server is now parsing + embedding.
      xhr.upload.onload = () => {
        patchItem(id, { status: 'processing', progress: 100 });
      };

      xhr.onload = () => {
        let data: Partial<IngestSuccess> & { error?: string } = {};
        try {
          data = JSON.parse(xhr.responseText) as typeof data;
        } catch {
          data = {};
        }

        if (xhr.status >= 200 && xhr.status < 300) {
          patchItem(id, {
            status: 'ready',
            progress: 100,
            chunkCount: data.chunkCount ?? 0,
          });
          toast(`"${file.name}" ingested (${data.chunkCount ?? 0} chunks)`, 'success');
          onUploaded();
        } else {
          const error = data.error || 'Upload failed.';
          patchItem(id, { status: 'failed', progress: 100, error });
          toast(`${file.name}: ${error}`, 'error');
        }
      };

      xhr.onerror = () => {
        const error = 'Network error during upload.';
        patchItem(id, { status: 'failed', progress: 100, error });
        toast(`${file.name}: ${error}`, 'error');
      };

      xhr.send(formData);
    },
    [onUploaded, patchItem, toast]
  );

  const handleFiles = useCallback(
    (fileList: FileList | null) => {
      if (!fileList) return;
      Array.from(fileList).forEach((file) => uploadFile(file));
    },
    [uploadFile]
  );

  const openBrowser = useCallback(() => inputRef.current?.click(), []);

  return (
    <div>
      <div
        role="button"
        tabIndex={0}
        aria-label="Upload documents: drag and drop files here, or activate to browse"
        onDragOver={(e) => {
          e.preventDefault();
          setIsDragging(true);
        }}
        onDragLeave={() => setIsDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setIsDragging(false);
          handleFiles(e.dataTransfer.files);
        }}
        onClick={openBrowser}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            openBrowser();
          }
        }}
        className={clsx(
          'focus-ignite flex cursor-pointer flex-col items-center justify-center rounded-lg border-2 border-dashed p-10 text-center transition-colors hover-glow',
          isDragging
            ? 'border-ignite bg-ignite/10 shadow-glow-sm'
            : 'border-surface-3 bg-surface-2 hover:border-ignite-light'
        )}
      >
        <i
          className={clsx(
            'bi bi-upload text-3xl',
            isDragging ? 'text-ignite-light' : 'text-ignite'
          )}
          aria-hidden="true"
        />
        <p className="mt-3 text-sm font-medium text-content">
          Drag &amp; drop a PDF, DOCX, TXT, or MD file here
        </p>
        <p className="mt-1 text-xs text-content-muted">or click to browse &middot; max 20MB</p>
        <input
          ref={inputRef}
          type="file"
          accept=".pdf,.docx,.txt,.md"
          multiple
          className="hidden"
          onChange={(e) => {
            handleFiles(e.target.files);
            // Reset so re-selecting the same file re-triggers onChange.
            e.target.value = '';
          }}
        />
      </div>

      {items.length > 0 && (
        <ul className="mt-4 space-y-2">
          {items.map((item) => (
            <li
              key={item.id}
              className="rounded-md border border-surface-3 bg-surface-2 px-3 py-2.5 text-sm"
            >
              <div className="flex items-center justify-between gap-3">
                <span className="flex min-w-0 items-center gap-2 text-content">
                  <i className="bi bi-file-earmark-text shrink-0 text-content-muted" aria-hidden="true" />
                  <span className="truncate">{item.filename}</span>
                </span>
                <span className="flex shrink-0 items-center gap-2">
                  {item.status === 'uploading' || item.status === 'processing' ? (
                    <>
                      {item.status === 'processing' ? (
                        <i className="bi bi-hourglass-split text-ignite-light" aria-hidden="true" />
                      ) : (
                        <Spinner className="text-ignite-light" />
                      )}
                      <span className="text-xs text-content-muted">
                        {item.status === 'uploading'
                          ? `${STATUS_LABEL.uploading}… ${item.progress}%`
                          : `${STATUS_LABEL.processing}…`}
                      </span>
                    </>
                  ) : item.status === 'ready' ? (
                    <span className="flex items-center gap-1.5 text-xs font-medium text-emerald-400">
                      <i className="bi bi-check-circle-fill" aria-hidden="true" />
                      {STATUS_LABEL.ready}
                      {typeof item.chunkCount === 'number' && (
                        <span className="text-content-muted">&middot; {item.chunkCount} chunks</span>
                      )}
                    </span>
                  ) : (
                    <span
                      className="flex items-center gap-1.5 text-xs font-medium text-ignite-light"
                      title={item.error}
                    >
                      <i className="bi bi-x-circle-fill" aria-hidden="true" />
                      {STATUS_LABEL.failed}
                    </span>
                  )}
                </span>
              </div>

              {item.status === 'uploading' && (
                <div
                  className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-surface-3"
                  role="progressbar"
                  aria-valuenow={item.progress}
                  aria-valuemin={0}
                  aria-valuemax={100}
                  aria-label={`Uploading ${item.filename}`}
                >
                  <div
                    className="h-full rounded-full bg-ignite transition-all duration-200"
                    style={{ width: `${item.progress}%` }}
                  />
                </div>
              )}

              {item.status === 'processing' && <Skeleton className="mt-2 h-1.5 w-full" />}

              {item.status === 'failed' && item.error && (
                <p className="mt-1.5 text-xs text-ignite-light">{item.error}</p>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
