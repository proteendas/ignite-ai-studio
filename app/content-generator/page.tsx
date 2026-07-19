'use client';

import { useCallback, useEffect, useState } from 'react';
import { ProtectedShell } from '@/components/layout/ProtectedShell';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { Spinner } from '@/components/ui/Spinner';
import { Skeleton } from '@/components/ui/Skeleton';
import { useToast } from '@/components/ui/Toaster';
import { DocumentPicker } from '@/components/content-generator/DocumentPicker';
import { ToneChannelSelector } from '@/components/content-generator/ToneChannelSelector';
import { BatchOutputs, type BatchResult } from '@/components/content-generator/BatchOutputs';
import { DocumentRecord, ContentType, Tone, Channel } from '@/lib/types';

interface GenerateResponse {
  results: BatchResult[];
  provider: string;
}

interface LibraryItem {
  id: string;
  documentId: string | null;
  contentType: string;
  tone: string;
  channel: string;
  output: string;
  createdAt: string;
}

const CHANNEL_LABEL: Record<Channel, string> = {
  linkedin: 'LinkedIn',
  x: 'X',
  email: 'Email',
  'landing-page': 'Landing Page',
  blog: 'Blog',
  'ad-copy': 'Ad Placement',
  general: 'General',
};

export default function ContentGeneratorPage() {
  const { toast } = useToast();

  const [documents, setDocuments] = useState<DocumentRecord[]>([]);
  const [documentId, setDocumentId] = useState('');
  const [contentType, setContentType] = useState<ContentType>('social-post');
  const [tone, setTone] = useState<Tone>('persuasive');
  const [channels, setChannels] = useState<Channel[]>(['linkedin']);

  const [results, setResults] = useState<BatchResult[]>([]);
  const [provider, setProvider] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);
  const [regeneratingChannel, setRegeneratingChannel] = useState<Channel | null>(null);

  const [library, setLibrary] = useState<LibraryItem[]>([]);
  const [libraryLoading, setLibraryLoading] = useState(true);

  useEffect(() => {
    fetch('/api/documents')
      .then((res) => (res.ok ? res.json() : { documents: [] }))
      .then((data) => setDocuments(data.documents ?? []))
      .catch(() => setDocuments([]));
  }, []);

  const fetchLibrary = useCallback(async () => {
    try {
      const res = await fetch('/api/content-library');
      if (res.ok) {
        const data = (await res.json()) as { items: LibraryItem[] };
        setLibrary(data.items ?? []);
      }
    } catch {
      /* non-fatal: library list stays as-is */
    } finally {
      setLibraryLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchLibrary();
  }, [fetchLibrary]);

  /** Maps non-OK responses to a clear, status-specific message. */
  const errorMessageFor = (status: number, fallback?: string): string => {
    if (status === 503)
      return 'No AI provider is configured. Add a provider key in Settings and try again.';
    if (status === 409)
      return 'That document is still processing. Wait until its status is “ready”, then retry.';
    if (status === 429) return 'Too many requests — wait a moment and try again.';
    return fallback || 'Generation failed.';
  };

  const handleGenerate = async () => {
    if (!documentId) {
      toast('Select a source document first.', 'error');
      return;
    }
    if (channels.length === 0) {
      toast('Select at least one channel.', 'error');
      return;
    }

    setIsGenerating(true);
    setResults([]);
    setProvider('');

    try {
      const res = await fetch('/api/generate-content', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ documentId, contentType, tone, channels, variation: false }),
      });
      const data = (await res.json().catch(() => ({}))) as Partial<GenerateResponse> & {
        error?: string;
      };

      if (!res.ok) {
        toast(errorMessageFor(res.status, data.error), 'error');
        return;
      }

      setResults(data.results ?? []);
      setProvider(data.provider ?? '');
      toast(
        `Generated ${data.results?.length ?? 0} output${(data.results?.length ?? 0) === 1 ? '' : 's'}.`,
        'success'
      );
    } catch {
      toast('Network error during generation.', 'error');
    } finally {
      setIsGenerating(false);
    }
  };

  const handleRegenerate = async (channel: Channel) => {
    if (!documentId) return;
    setRegeneratingChannel(channel);
    try {
      const res = await fetch('/api/generate-content', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ documentId, contentType, tone, channels: [channel], variation: true }),
      });
      const data = (await res.json().catch(() => ({}))) as Partial<GenerateResponse> & {
        error?: string;
      };

      if (!res.ok) {
        toast(errorMessageFor(res.status, data.error), 'error');
        return;
      }

      const fresh = data.results?.[0];
      if (fresh) {
        setResults((prev) =>
          prev.map((r) => (r.channel === channel ? { ...r, output: fresh.output } : r))
        );
        if (data.provider) setProvider(data.provider);
        toast(`Regenerated a variation for ${CHANNEL_LABEL[channel]}.`, 'success');
      }
    } catch {
      toast('Network error during regeneration.', 'error');
    } finally {
      setRegeneratingChannel(null);
    }
  };

  const handleOutputChange = (channel: Channel, value: string) => {
    setResults((prev) => prev.map((r) => (r.channel === channel ? { ...r, output: value } : r)));
  };

  const handleDeleteSaved = async (id: string) => {
    setLibrary((prev) => prev.filter((item) => item.id !== id));
    try {
      const res = await fetch(`/api/content-library/${id}`, { method: 'DELETE' });
      if (!res.ok) {
        toast('Could not delete saved item.', 'error');
        fetchLibrary();
        return;
      }
      toast('Removed from library.', 'success');
    } catch {
      toast('Network error while deleting.', 'error');
      fetchLibrary();
    }
  };

  const readyCount = documents.filter((d) => d.status === 'ready').length;

  return (
    <ProtectedShell>
      <div className="mx-auto max-w-3xl space-y-6">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-semibold text-content">
            <i className="bi bi-megaphone text-ignite" aria-hidden="true" />
            Content Generator
          </h1>
          <p className="mt-1 text-sm text-content-muted">
            Generate marketing copy strictly grounded in one of your ingested documents. Pick
            several channels to batch-generate a tailored variant for each.
          </p>
        </div>

        <Card className="space-y-5">
          <DocumentPicker documents={documents} value={documentId} onChange={setDocumentId} />
          <ToneChannelSelector
            contentType={contentType}
            tone={tone}
            channels={channels}
            onContentTypeChange={setContentType}
            onToneChange={setTone}
            onChannelsChange={setChannels}
          />
          <div className="flex items-center gap-3">
            <Button
              onClick={handleGenerate}
              disabled={isGenerating || !documentId || channels.length === 0 || readyCount === 0}
            >
              {isGenerating ? <Spinner /> : <i className="bi bi-stars" aria-hidden="true" />}
              {isGenerating
                ? 'Generating…'
                : channels.length > 1
                ? `Generate ${channels.length} variants`
                : 'Generate'}
            </Button>
          </div>
        </Card>

        {isGenerating && (
          <Card className="space-y-3" aria-label="Generating content">
            {channels.length > 1 && (
              <div className="flex flex-wrap gap-2">
                {channels.map((c) => (
                  <Skeleton key={c} className="h-8 w-24" />
                ))}
              </div>
            )}
            <Skeleton className="h-6 w-40" />
            <Skeleton className="h-48 w-full" />
          </Card>
        )}

        {!isGenerating && results.length > 0 && (
          <Card>
            <BatchOutputs
              results={results}
              provider={provider}
              documentId={documentId}
              contentType={contentType}
              tone={tone}
              onOutputChange={handleOutputChange}
              onRegenerate={handleRegenerate}
              onSaved={fetchLibrary}
              regeneratingChannel={regeneratingChannel}
            />
          </Card>
        )}

        <Card className="space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="flex items-center gap-2 text-sm font-semibold text-content">
              <i className="bi bi-bookmark-star text-content-muted" aria-hidden="true" />
              Saved content
            </h2>
            {library.length > 0 && <Badge tone="neutral">{library.length}</Badge>}
          </div>

          {libraryLoading ? (
            <div className="space-y-2">
              <Skeleton className="h-16 w-full" />
              <Skeleton className="h-16 w-full" />
            </div>
          ) : library.length === 0 ? (
            <p className="text-sm text-content-muted">
              Nothing saved yet. Use “Save” on a generated output to keep it here.
            </p>
          ) : (
            <ul className="divide-y divide-surface-3">
              {library.map((item) => (
                <li key={item.id} className="flex items-start justify-between gap-3 py-3">
                  <div className="min-w-0">
                    <div className="mb-1 flex flex-wrap items-center gap-1.5">
                      <Badge tone="brand">{item.contentType}</Badge>
                      <Badge tone="neutral">
                        {CHANNEL_LABEL[item.channel as Channel] ?? item.channel}
                      </Badge>
                      <Badge tone="neutral">{item.tone}</Badge>
                    </div>
                    <p className="line-clamp-2 whitespace-pre-wrap break-words text-sm text-content-muted">
                      {item.output}
                    </p>
                    <p className="mt-1 text-xs text-content-muted">
                      {new Date(item.createdAt).toLocaleString()}
                    </p>
                  </div>
                  <Button
                    variant="danger"
                    onClick={() => handleDeleteSaved(item.id)}
                    aria-label="Delete saved content"
                  >
                    <i className="bi bi-trash" aria-hidden="true" />
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </ProtectedShell>
  );
}
