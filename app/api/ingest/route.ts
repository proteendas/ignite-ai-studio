import { NextRequest, NextResponse } from 'next/server';
import { v4 as uuidv4 } from 'uuid';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth/config';
import { sanitizeUpload } from '@/lib/ingest/sanitize';
import { parseDocument } from '@/lib/ingest/parse';
import { chunkText } from '@/lib/ingest/chunk';
import { getVectorStore } from '@/lib/db/vector';
import { embedTexts, activeEmbeddingsProviderId } from '@/lib/ai/embeddingsAdapter';
import {
  insertDocument,
  updateDocumentStatus,
  recordUsage,
  recordActivity,
} from '@/lib/db/sql/client';
import { checkRateLimit } from '@/lib/rateLimit';
import { VectorChunk } from '@/lib/types';

export const runtime = 'nodejs';

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const ownerId = session.user.id;

  const rl = checkRateLimit(`ingest:${ownerId}`, { limit: 10, windowMs: 60_000 });
  if (!rl.allowed) {
    return NextResponse.json({ error: 'Rate limit exceeded, try again shortly.' }, { status: 429 });
  }

  const formData = await req.formData();
  const file = formData.get('file');

  if (!file || !(file instanceof File)) {
    return NextResponse.json({ error: 'No file provided.' }, { status: 400 });
  }

  const sanitizeResult = sanitizeUpload({ name: file.name, type: file.type, size: file.size });
  if (!sanitizeResult.ok) {
    return NextResponse.json({ error: sanitizeResult.error }, { status: 400 });
  }

  const documentId = uuidv4();
  insertDocument({
    id: documentId,
    ownerId,
    filename: file.name,
    mimeType: file.type,
    sizeBytes: file.size,
    status: 'processing',
    chunkCount: 0,
  });

  try {
    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    const text = await parseDocument(buffer, file.type, file.name);

    if (!text || !text.trim()) {
      updateDocumentStatus(documentId, 'failed', 0, 'No extractable text found in document.');
      return NextResponse.json(
        { error: 'No extractable text found in document.', documentId },
        { status: 422 }
      );
    }

    const chunks = chunkText(text);
    if (chunks.length === 0) {
      updateDocumentStatus(documentId, 'failed', 0, 'Document produced no chunks after processing.');
      return NextResponse.json(
        { error: 'Document produced no chunks after processing.', documentId },
        { status: 422 }
      );
    }

    const embeddings = await embedTexts(chunks, ownerId);

    const vectorChunks: VectorChunk[] = chunks.map((chunkTextValue, index) => ({
      id: `${documentId}::${index}`,
      documentId,
      ownerId,
      filename: file.name,
      chunkIndex: index,
      text: chunkTextValue,
    }));

    const vectorStore = getVectorStore();
    await vectorStore.upsert(vectorChunks, embeddings);

    updateDocumentStatus(documentId, 'ready', chunks.length);

    // Track embedding usage (token estimate) + activity for the dashboard.
    const embedTokenEstimate = Math.ceil(chunks.join(' ').length / 4);
    recordUsage({
      id: uuidv4(),
      ownerId,
      provider: activeEmbeddingsProviderId(ownerId) ?? 'unknown',
      kind: 'embed',
      promptTokens: embedTokenEstimate,
    });
    recordActivity({
      id: uuidv4(),
      ownerId,
      type: 'upload',
      summary: `Ingested "${file.name}" (${chunks.length} chunks)`,
    });

    return NextResponse.json({
      documentId,
      filename: file.name,
      chunkCount: chunks.length,
      status: 'ready',
    });
  } catch (err) {
    console.error('Ingest failed:', err);
    const message = err instanceof Error ? err.message : 'Unknown ingest error';
    updateDocumentStatus(documentId, 'failed', 0, message);
    return NextResponse.json({ error: `Ingestion failed: ${message}`, documentId }, { status: 500 });
  }
}
