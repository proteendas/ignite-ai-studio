import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth/config';
import { resolveProvider } from '@/lib/ai/providerAdapter';
import { buildContentGenPrompt } from '@/lib/ai/prompts';
import { getVectorStore } from '@/lib/db/vector';
import { getDocumentById, recordUsage, recordActivity } from '@/lib/db/sql/client';
import { v4 as uuidv4 } from 'uuid';
import { checkRateLimit } from '@/lib/rateLimit';
import { ContentType, Tone, Channel } from '@/lib/types';

export const runtime = 'nodejs';

interface GenerateContentBody {
  documentId?: string;
  contentType?: ContentType;
  tone?: Tone;
  /** Single-channel (legacy) request. */
  channel?: Channel;
  /** Batch request: one output is generated per channel. Takes precedence over `channel`. */
  channels?: Channel[];
  /** When true, generation uses a higher temperature for a distinct alternative. */
  variation?: boolean;
}

interface ChannelResult {
  channel: Channel;
  output: string;
}

const MAX_CONTEXT_CHUNKS = 40;

const VALID_CHANNELS: Channel[] = [
  'linkedin',
  'x',
  'email',
  'landing-page',
  'blog',
  'ad-copy',
  'general',
];

/** Deduplicates while preserving first-seen order. */
function uniqueChannels(channels: Channel[]): Channel[] {
  const seen = new Set<Channel>();
  const out: Channel[] = [];
  for (const ch of channels) {
    if (!seen.has(ch)) {
      seen.add(ch);
      out.push(ch);
    }
  }
  return out;
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const ownerId = session.user.id;

  const rl = checkRateLimit(`generate-content:${ownerId}`, { limit: 15, windowMs: 60_000 });
  if (!rl.allowed) {
    return NextResponse.json({ error: 'Rate limit exceeded, try again shortly.' }, { status: 429 });
  }

  let body: GenerateContentBody;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body.' }, { status: 400 });
  }

  const { documentId, contentType, tone, variation } = body;

  // A batch request is any request that supplies a `channels` array; the
  // response shape differs (results[] vs a single output) so legacy
  // single-`channel` callers keep working unchanged.
  const isBatch = Array.isArray(body.channels);
  const requestedChannels: Channel[] = isBatch
    ? (body.channels as Channel[])
    : body.channel
    ? [body.channel]
    : [];

  if (!documentId || !contentType || !tone || requestedChannels.length === 0) {
    return NextResponse.json(
      { error: 'documentId, contentType, tone, and at least one channel are required.' },
      { status: 400 }
    );
  }

  const channels = uniqueChannels(requestedChannels);
  const invalid = channels.filter((ch) => !VALID_CHANNELS.includes(ch));
  if (invalid.length > 0) {
    return NextResponse.json(
      { error: `Unknown channel(s): ${invalid.join(', ')}.` },
      { status: 400 }
    );
  }

  const doc = getDocumentById(documentId);
  if (!doc || doc.ownerId !== ownerId) {
    return NextResponse.json({ error: 'Document not found.' }, { status: 404 });
  }
  if (doc.status !== 'ready') {
    return NextResponse.json({ error: `Document is not ready (status: ${doc.status}).` }, { status: 409 });
  }

  let provider;
  try {
    provider = resolveProvider(ownerId);
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'No AI provider configured.';
    return NextResponse.json({ error: msg }, { status: 503 });
  }

  try {
    const vectorStore = getVectorStore();
    const allChunks = await vectorStore.getAllChunks(documentId, ownerId);

    if (allChunks.length === 0) {
      return NextResponse.json({ error: 'No content found for this document.' }, { status: 422 });
    }

    const usedChunks = allChunks.slice(0, MAX_CONTEXT_CHUNKS);
    const truncated = allChunks.length > MAX_CONTEXT_CHUNKS;

    // The document context is identical across channels, so build it once and
    // reuse it for every channel in the batch.
    const contextBlock = usedChunks
      .map((c) => `[doc:${c.filename}#${c.chunkIndex}]\n${c.text}`)
      .join('\n\n---\n\n');

    const temperature = variation ? 0.9 : 0.5;

    const results: ChannelResult[] = [];

    for (const channel of channels) {
      const systemPrompt = buildContentGenPrompt(contentType, tone, channel);

      const userPrompt = [
        `Source document: ${doc.filename}`,
        truncated
          ? `Note: only the first ${MAX_CONTEXT_CHUNKS} of ${allChunks.length} chunks are included below due to length.`
          : '',
        `Document content:\n${contextBlock}`,
        variation
          ? `Generate a fresh, distinctly different alternative: ${contentType} for ${channel}, in a ${tone} tone.`
          : `Generate: ${contentType} for ${channel}, in a ${tone} tone.`,
      ]
        .filter(Boolean)
        .join('\n\n');

      const output = await provider.chat(
        [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
        { temperature }
      );

      // Record usage + activity per channel so batch generations are fully
      // accounted for in the dashboard.
      recordUsage({
        id: uuidv4(),
        ownerId,
        provider: provider.id,
        kind: 'generate',
        promptTokens: Math.ceil((systemPrompt.length + userPrompt.length) / 4),
        completionTokens: Math.ceil(output.length / 4),
      });
      recordActivity({
        id: uuidv4(),
        ownerId,
        type: 'generate',
        summary: `Generated ${contentType} for ${channel} from "${doc.filename}"`,
      });

      results.push({ channel, output });
    }

    if (isBatch) {
      return NextResponse.json({
        results,
        provider: provider.id,
        documentId,
        contentType,
        tone,
        chunksUsed: usedChunks.length,
        chunksTruncated: truncated,
      });
    }

    // Legacy single-channel response shape.
    const only = results[0];
    return NextResponse.json({
      output: only.output,
      provider: provider.id,
      documentId,
      contentType,
      tone,
      channel: only.channel,
      chunksUsed: usedChunks.length,
      chunksTruncated: truncated,
    });
  } catch (err) {
    console.error('Content generation failed:', err);
    const msg = err instanceof Error ? err.message : 'Unknown error.';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
