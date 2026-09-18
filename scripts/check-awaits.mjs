/**
 * Static guard against unawaited async database calls.
 *
 * Every function in lib/db/sql/client.ts is async. Before the Postgres port
 * they were synchronous, so "fire and forget" call sites worked; afterwards the
 * same code silently races, and a Promise handed to NextResponse.json()
 * serialises to `{}` — which React then refuses to render (error #31).
 *
 * TypeScript cannot catch this: NextResponse.json() accepts `any`, and an
 * ignored Promise is legal in a statement position. So it is checked here.
 *
 * Usage: node scripts/check-awaits.mjs
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, extname } from 'node:path';

const ASYNC_EXPORTS = [
  // lib/db/sql/client.ts
  'getUserByEmail', 'createUser', 'getUserById', 'updateUserPassword', 'markOnboarded',
  'markEmailVerified', 'createAuthToken', 'consumeAuthToken', 'purgeStaleAuthTokens',
  'deleteUserData', 'insertDocument', 'updateDocumentStatus', 'listDocumentsByOwner',
  'getDocumentById', 'deleteDocument', 'createChatThread', 'getChatThread', 'listChatThreads',
  'updateChatThread', 'touchChatThread', 'deleteChatThread', 'insertChatMessage',
  'listThreadMessages', 'getRecentMessages', 'countThreadMessages', 'getThreadSummary',
  'upsertThreadSummary', 'insertAgentAction', 'getAgentAction', 'updateAgentAction',
  'listAgentActions', 'upsertUserConnection', 'getUserConnection', 'listUserConnections',
  'deleteUserConnection', 'getCachedEmbeddings', 'putCachedEmbeddings', 'runReadOnlyQuery',
  'getUserPreferences', 'upsertUserPreferences', 'upsertUserApiKey', 'listUserApiKeys',
  'getUserApiKey', 'deleteUserApiKey', 'saveGeneratedContent', 'listGeneratedContent',
  'deleteGeneratedContent', 'recordUsage', 'getUsageSummary', 'recordRequestLog',
  'recordErrorLog', 'listRequestLogs', 'listErrorLogs', 'recordActivity', 'listActivity',
  'countDocuments', 'countGeneratedContent', 'consumeRateLimit',
  // other modules that became async in the port
  'checkRateLimit', 'activeEmbeddingsProviderId', 'resolveConnectionType', 'resolveProvider',
  'resolveEmbeddingsProvider', 'resolveProviderKeys', 'resolveKeyForProvider',
  'listConfiguredProviders', 'issueToken', 'ensureThread', 'getHistoryWindow', 'recordExchange',
];

// Files that legitimately declare or implement these names rather than call them.
const SKIP = new Set([
  'lib/db/sql/client.ts',
  'lib/rateLimit.ts',
  'lib/db/vector/types.ts',
  'lib/db/vector/pgvector.ts',
  'lib/db/vector/chroma.ts',
  'lib/db/vector/faiss.ts',
  'lib/db/vector/azureSearch.ts',
]);

const pattern = new RegExp(`(?<![\\w.$])(${ASYNC_EXPORTS.join('|')})\\s*\\(`, 'g');

function walk(dir, out = []) {
  for (const entry of readdirSync(dir)) {
    if (entry === 'node_modules' || entry === '.next' || entry.startsWith('.')) continue;
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (['.ts', '.tsx'].includes(extname(full))) out.push(full);
  }
  return out;
}

const problems = [];
for (const file of ['app', 'lib', 'components'].flatMap((d) => walk(d))) {
  if (SKIP.has(file)) continue;
  const lines = readFileSync(file, 'utf8').split('\n');
  lines.forEach((line, i) => {
    const trimmed = line.trim();
    if (
      trimmed.startsWith('import') || trimmed.startsWith('//') || trimmed.startsWith('*') ||
      trimmed.startsWith('/**') || /^(export )?(async )?function /.test(trimmed)
    ) return;
    pattern.lastIndex = 0;
    let m;
    while ((m = pattern.exec(line)) !== null) {
      const before = line.slice(0, m.index);
      if (/\bawait\s+$/.test(before)) continue;   // awaited
      if (/\breturn\s+$/.test(before)) continue;  // returned to the caller
      if (/\bvoid\s+$/.test(before)) continue;    // explicitly discarded
      if (before.trimEnd().endsWith('.')) continue; // property access
      problems.push(`${file}:${i + 1}  ${trimmed.slice(0, 100)}`);
    }
  });
}

if (problems.length) {
  console.error(`\n${problems.length} unawaited async call(s) found:\n`);
  for (const p of problems) console.error('  ' + p);
  console.error(
    '\nEach of these returns a Promise. Ignoring it races the database write, and a Promise\n' +
    'passed to NextResponse.json() serialises to {} — which React refuses to render.\n' +
    'Add `await`, or `void` if the result is genuinely fire-and-forget.\n'
  );
  process.exit(1);
}
console.log('No unawaited async database calls found.');
