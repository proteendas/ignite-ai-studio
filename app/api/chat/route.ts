import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth/config';
import { resolveProvider, lightModelFor, type ChatOptions } from '@/lib/ai/providerAdapter';
import {
  buildRagSystemPrompt,
  buildSqlAnswerPrompt,
  buildGeneralSystemPrompt,
} from '@/lib/ai/prompts';
import { getVectorStore } from '@/lib/db/vector';
import { embedTexts } from '@/lib/ai/embeddingsAdapter';
import { classifyIntent, checkNeedsClarification } from '@/lib/intent/router';
import { translateAndRunNlToSql } from '@/lib/db/sql/nlToSql';
import {
  ensureThread,
  getCompressedHistory,
  recordExchange,
  estimateTokens,
} from '@/lib/db/chatHistory';
import {
  recordUsage,
  recordActivity,
  recordRequestLog,
  getDocumentById,
  listDocumentsByOwner,
} from '@/lib/db/sql/client';
import { checkRateLimit } from '@/lib/rateLimit';
import { v4 as uuidv4 } from 'uuid';
import { ChatMessage, ChatMode, Citation, Tone } from '@/lib/types';

export const runtime = 'nodejs';
// Streams a model response, which can outlast the default limit.
// Vercel caps serverless functions at 10s by default (60s on Hobby without this,
// 300s on Pro); other platforms ignore it.
export const maxDuration = 120;

interface ChatRequestBody {
  message: string;
  threadId: string;
  tone?: Tone;
  documentId?: string;
  mode?: ChatMode;
}

/** Max characters of any single retrieved chunk injected as context. */
const MAX_CONTEXT_CHUNK_CHARS = 1200;

const encoder = new TextEncoder();

function sseEvent(event: string, data: unknown): Uint8Array {
  return encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
}

function capChunk(text: string): string {
  return text.length > MAX_CONTEXT_CHUNK_CHARS
    ? `${text.slice(0, MAX_CONTEXT_CHUNK_CHARS)} […truncated]`
    : text;
}

async function handleDocumentRoute(
  ownerId: string,
  question: string,
  tone: Tone,
  history: ChatMessage[],
  documentId?: string
): Promise<{ messages: ChatMessage[]; citations: Citation[] }> {
  const vectorStore = getVectorStore();
  const [queryEmbedding] = await embedTexts([question], ownerId);
  const results = await vectorStore.search(queryEmbedding, { ownerId, topK: 5, documentId });

  if (process.env.NODE_ENV !== 'production' || process.env.DEBUG_RETRIEVAL === '1') {
    console.log(`[retrieval] query: "${question.slice(0, 80)}"`);
    console.table(
      results.map((r) => ({
        filename: r.filename,
        chunkIndex: r.chunkIndex,
        score: Number(r.score.toFixed(4)),
      }))
    );
  }

  const contextBlock = results
    .map((r) => `[doc:${r.filename}#${r.chunkIndex}]\n${capChunk(r.text)}`)
    .join('\n\n---\n\n');

  const citations: Citation[] = results.map((r) => ({
    documentId: r.documentId,
    filename: r.filename,
    chunkIndex: r.chunkIndex,
    snippet: r.text.slice(0, 200),
    score: r.score,
  }));

  const messages: ChatMessage[] = [
    { role: 'system', content: buildRagSystemPrompt(tone) },
    ...history,
    {
      role: 'user',
      content: contextBlock
        ? `Context:\n${contextBlock}\n\nQuestion: ${question}`
        : `Context: (no relevant documents found)\n\nQuestion: ${question}`,
    },
  ];

  return { messages, citations };
}

async function handleStructuredDataRoute(
  provider: Awaited<ReturnType<typeof resolveProvider>>,
  question: string,
  tone: Tone,
  history: ChatMessage[]
): Promise<{ messages: ChatMessage[]; citations: Citation[] }> {
  const { sql, rows } = await translateAndRunNlToSql(provider, question);

  const messages: ChatMessage[] = [
    { role: 'system', content: buildSqlAnswerPrompt(tone) },
    ...history,
    {
      role: 'user',
      content: `SQL executed: ${sql}\n\nResults (JSON):\n${JSON.stringify(rows, null, 2)}\n\nQuestion: ${question}`,
    },
  ];

  return { messages, citations: [] };
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const ownerId = session.user.id;

  const rl = await checkRateLimit(`chat:${ownerId}`, { limit: 30, windowMs: 60_000 });
  if (!rl.allowed) {
    return NextResponse.json({ error: 'Rate limit exceeded, try again shortly.' }, { status: 429 });
  }

  let body: ChatRequestBody;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body.' }, { status: 400 });
  }

  const { message, threadId, documentId } = body;
  const tone: Tone = body.tone ?? 'professional';
  const mode: ChatMode = body.mode ?? 'grounded';

  if (!message || !message.trim()) {
    return NextResponse.json({ error: 'message is required.' }, { status: 400 });
  }
  if (!threadId) {
    return NextResponse.json({ error: 'threadId is required.' }, { status: 400 });
  }
  if (mode === 'agent') {
    return NextResponse.json(
      { error: 'Agent mode is served by /api/agent, not /api/chat.' },
      { status: 400 }
    );
  }

  if (mode === 'grounded') {
    if (documentId) {
      const doc = await getDocumentById(documentId);
      if (!doc || doc.ownerId !== ownerId) {
        return NextResponse.json({ error: 'Document not found.' }, { status: 404 });
      }
      if (doc.status !== 'ready') {
        return NextResponse.json(
          {
            error: `This document is still being ingested (status: ${doc.status}). Wait until it shows Ready before chatting with it.`,
          },
          { status: 409 }
        );
      }
    } else {
      const hasReadyDoc = (await listDocumentsByOwner(ownerId)).some((d) => d.status === 'ready');
      if (!hasReadyDoc) {
        return NextResponse.json(
          {
            error:
              'Grounded mode needs at least one ingested document. Upload a document (paperclip or the Documents page) and wait for it to show Ready — or switch to General mode for open-ended chat.',
          },
          { status: 409 }
        );
      }
    }
  }

  let provider;
  try {
    provider = await resolveProvider(ownerId);
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'No AI provider configured.';
    return NextResponse.json({ error: msg }, { status: 503 });
  }

  const lightModel = lightModelFor(provider.id);
  const lightOpts: ChatOptions | undefined = lightModel ? { model: lightModel } : undefined;

  // Must complete before history is read, or the thread row may not exist yet.
  await ensureThread(threadId, ownerId);
  const history = await getCompressedHistory(threadId, provider);

  try {
    let citations: Citation[] = [];
    let route: string;
    let finalMessages: ChatMessage[];

    if (mode === 'general') {
      // General mode: no retrieval, no intent routing — plain LLM chat.
      route = 'general';
      finalMessages = [
        { role: 'system', content: buildGeneralSystemPrompt(tone) },
        ...history,
        { role: 'user', content: message },
      ];
    } else if (documentId) {
      // The user explicitly scoped this chat to one document (grounding chip),
      // so intent classification is pointless and risky: a mis-classification
      // would route a document question to SQL or split it into sub-queries.
      // Go straight to retrieval — this also saves two LLM calls per message.
      route = 'document';
      const result = await handleDocumentRoute(ownerId, message, tone, history, documentId);
      finalMessages = result.messages;
      citations = result.citations;
    } else {
      const clarification = await checkNeedsClarification(provider, message, lightOpts);
      if (clarification.ambiguous && clarification.question) {
        return NextResponse.json({
          needsClarification: true,
          clarificationQuestion: clarification.question,
          provider: provider.id,
        });
      }

      const classification = await classifyIntent(provider, message, lightOpts);
      route = classification.route;

      if (classification.route === 'compound' && classification.subQueries) {
        const subAnswers: string[] = [];
        const allCitations: Citation[] = [];

        for (const subQuery of classification.subQueries) {
          const subClassification = await classifyIntent(provider, subQuery, lightOpts);

          const { messages, citations: subCitations } =
            subClassification.route === 'structured-data'
              ? await handleStructuredDataRoute(provider, subQuery, tone, [])
              : await handleDocumentRoute(ownerId, subQuery, tone, [], documentId);

          const subAnswer = await provider.chat(messages, { temperature: 0.3 });
          subAnswers.push(`Q: ${subQuery}\nA: ${subAnswer}`);
          allCitations.push(...subCitations);
        }

        citations = allCitations;
        finalMessages = [
          {
            role: 'system',
            content:
              'Synthesize the following sub-question/answer pairs into one cohesive, well-organized ' +
              'final answer to the user\'s original compound question. Do not drop any sub-answer\'s ' +
              'content. Preserve any citation markers exactly as given.',
          },
          {
            role: 'user',
            content: `Original question: ${message}\n\n${subAnswers.join('\n\n')}`,
          },
        ];
      } else if (classification.route === 'structured-data') {
        const result = await handleStructuredDataRoute(provider, message, tone, history);
        finalMessages = result.messages;
        citations = result.citations;
      } else {
        // Grounded mode always retrieves for document-shaped (and 'general'-
        // classified) questions — answers must come from the corpus.
        const result = await handleDocumentRoute(ownerId, message, tone, history, documentId);
        finalMessages = result.messages;
        citations = result.citations;
        route = 'document';
      }
    }

    const stream = new ReadableStream<Uint8Array>({
      async start(controller) {
        controller.enqueue(
          sseEvent('meta', { provider: provider.id, route, mode, citations })
        );

        let fullText = '';
        try {
          for await (const chunk of provider.chatStream(finalMessages, { temperature: 0.3 })) {
            fullText += chunk;
            controller.enqueue(sseEvent('token', { text: chunk }));
          }
        } catch (streamErr) {
          const msg = streamErr instanceof Error ? streamErr.message : 'Streaming error.';
          controller.enqueue(sseEvent('error', { error: msg }));
          controller.close();
          return;
        }

        const documentRefs = Array.from(new Set(citations.map((c) => c.documentId)));
        // Awaited deliberately: on a serverless platform the function can be
        // frozen the moment the stream closes, so an unawaited write is not
        // guaranteed to reach the database — the conversation would silently
        // fail to persist.
        await recordExchange(
          threadId,
          message,
          fullText,
          JSON.stringify({ provider: provider.id, route, mode, citations }),
          documentRefs
        );

        // Usage + observability tracking (token counts estimated from text length).
        const promptTokens = Math.ceil(
          finalMessages.reduce((n, m) => n + m.content.length, 0) / 4
        );
        const completionTokens = estimateTokens(fullText);
        await recordUsage({
          id: uuidv4(),
          ownerId,
          provider: provider.id,
          kind: 'chat',
          promptTokens,
          completionTokens,
        });
        await recordRequestLog({
          id: uuidv4(),
          ownerId,
          route: '/api/chat',
          status: 200,
          provider: provider.id,
        });
        await recordActivity({ id: uuidv4(), ownerId, type: 'chat', summary: `Asked: "${message.slice(0, 60)}"` });

        controller.enqueue(sseEvent('done', { promptTokens, completionTokens }));
        controller.close();
      },
    });

    return new Response(stream, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        Connection: 'keep-alive',
      },
    });
  } catch (err) {
    console.error('Chat request failed:', err);
    const msg = err instanceof Error ? err.message : 'Unknown error.';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
