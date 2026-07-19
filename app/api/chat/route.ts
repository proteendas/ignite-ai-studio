import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth/config';
import { resolveProvider } from '@/lib/ai/providerAdapter';
import { buildRagSystemPrompt, buildSqlAnswerPrompt } from '@/lib/ai/prompts';
import { getVectorStore } from '@/lib/db/vector';
import { embedTexts } from '@/lib/ai/embeddingsAdapter';
import { classifyIntent, checkNeedsClarification } from '@/lib/intent/router';
import { translateAndRunNlToSql } from '@/lib/db/sql/nlToSql';
import { ensureThread, getHistoryWindow, recordExchange } from '@/lib/db/chatHistory';
import { recordUsage, recordActivity, recordRequestLog } from '@/lib/db/sql/client';
import { checkRateLimit } from '@/lib/rateLimit';
import { v4 as uuidv4 } from 'uuid';
import { ChatMessage, Citation, Tone } from '@/lib/types';

export const runtime = 'nodejs';

interface ChatRequestBody {
  message: string;
  threadId: string;
  tone?: Tone;
  documentId?: string;
}

const encoder = new TextEncoder();

function sseEvent(event: string, data: unknown): Uint8Array {
  return encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
}

async function handleDocumentRoute(
  provider: ReturnType<typeof resolveProvider>,
  ownerId: string,
  question: string,
  tone: Tone,
  history: ChatMessage[],
  documentId?: string
): Promise<{ messages: ChatMessage[]; citations: Citation[] }> {
  const vectorStore = getVectorStore();
  const [queryEmbedding] = await embedTexts([question], ownerId);
  const results = await vectorStore.search(queryEmbedding, { ownerId, topK: 5, documentId });

  const contextBlock = results
    .map((r) => `[doc:${r.filename}#${r.chunkIndex}]\n${r.text}`)
    .join('\n\n---\n\n');

  const citations: Citation[] = results.map((r) => ({
    documentId: r.documentId,
    filename: r.filename,
    chunkIndex: r.chunkIndex,
    snippet: r.text.slice(0, 200),
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
  provider: ReturnType<typeof resolveProvider>,
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

  const rl = checkRateLimit(`chat:${ownerId}`, { limit: 30, windowMs: 60_000 });
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

  if (!message || !message.trim()) {
    return NextResponse.json({ error: 'message is required.' }, { status: 400 });
  }
  if (!threadId) {
    return NextResponse.json({ error: 'threadId is required.' }, { status: 400 });
  }

  let provider;
  try {
    provider = resolveProvider(ownerId);
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'No AI provider configured.';
    return NextResponse.json({ error: msg }, { status: 503 });
  }

  ensureThread(threadId, ownerId);
  const history = getHistoryWindow(threadId);

  try {
    const clarification = await checkNeedsClarification(provider, message);
    if (clarification.ambiguous && clarification.question) {
      return NextResponse.json({
        needsClarification: true,
        clarificationQuestion: clarification.question,
        provider: provider.id,
      });
    }

    const classification = await classifyIntent(provider, message);

    let citations: Citation[] = [];
    let route = classification.route;
    let finalMessages: ChatMessage[];

    if (classification.route === 'compound' && classification.subQueries) {
      const subAnswers: string[] = [];
      const allCitations: Citation[] = [];

      for (const subQuery of classification.subQueries) {
        const subClassification = await classifyIntent(provider, subQuery);
        const handler =
          subClassification.route === 'structured-data' ? handleStructuredDataRoute : handleDocumentRoute;

        const { messages, citations: subCitations } =
          subClassification.route === 'structured-data'
            ? await handleStructuredDataRoute(provider, subQuery, tone, [])
            : await handleDocumentRoute(provider, ownerId, subQuery, tone, [], documentId);

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
      const result = await handleDocumentRoute(provider, ownerId, message, tone, history, documentId);
      finalMessages = result.messages;
      citations = result.citations;
      route = 'document';
    }

    const stream = new ReadableStream<Uint8Array>({
      async start(controller) {
        controller.enqueue(
          sseEvent('meta', { provider: provider.id, route, citations })
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

        recordExchange(threadId, message, fullText, JSON.stringify({ provider: provider.id, route, citations }));

        // Usage + observability tracking (token counts estimated from text length).
        recordUsage({
          id: uuidv4(),
          ownerId,
          provider: provider.id,
          kind: 'chat',
          promptTokens: Math.ceil(finalMessages.reduce((n, m) => n + m.content.length, 0) / 4),
          completionTokens: Math.ceil(fullText.length / 4),
        });
        recordRequestLog({
          id: uuidv4(),
          ownerId,
          route: '/api/chat',
          status: 200,
          provider: provider.id,
        });
        recordActivity({ id: uuidv4(), ownerId, type: 'chat', summary: `Asked: "${message.slice(0, 60)}"` });

        controller.enqueue(sseEvent('done', {}));
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
