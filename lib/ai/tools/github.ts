import { z } from 'zod';
import { getUserConnection } from '@/lib/db/sql/client';
import { decryptSecret, isEncryptionConfigured } from '@/lib/crypto';
import type { ToolContext, ToolDefinition, ToolResult } from './types';

/**
 * GitHub tools for the agent. All calls use the user's own Personal Access
 * Token, stored AES-256-GCM-encrypted in user_connections (service 'github').
 * The token is decrypted server-side per call and never leaves this module.
 */

const GITHUB_API = 'https://api.github.com';
const FILE_TRUNCATE_AT = 4000;
const TRUNCATION_MARK = '\n…[truncated by IgniteAI to save tokens]';

const MISSING_CONNECTION: ToolResult = {
  ok: false,
  summary:
    'No GitHub connection found. Ask the user to connect a GitHub Personal Access Token in ' +
    'Settings → Connections before using GitHub tools.',
};

function resolveGithubToken(ownerId: string): string | null {
  if (!isEncryptionConfigured()) return null;
  const conn = getUserConnection(ownerId, 'github');
  if (!conn) return null;
  try {
    return decryptSecret({ ciphertext: conn.ciphertext, iv: conn.iv, authTag: conn.authTag });
  } catch {
    return null;
  }
}

async function githubFetch(
  token: string,
  path: string,
  init?: RequestInit
): Promise<{ status: number; json: unknown }> {
  const res = await fetch(`${GITHUB_API}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/vnd.github+json',
      'User-Agent': 'IgniteAI-Studio',
      ...(init?.body ? { 'Content-Type': 'application/json' } : {}),
      ...(init?.headers ?? {}),
    },
  });
  let json: unknown = null;
  try {
    json = await res.json();
  } catch {
    json = null;
  }
  return { status: res.status, json };
}

function apiError(status: number, json: unknown): ToolResult {
  const message =
    json && typeof json === 'object' && 'message' in json
      ? String((json as { message: unknown }).message)
      : 'Unknown GitHub API error';
  return { ok: false, summary: `GitHub API returned ${status}: ${message}` };
}

const repoSchema = z
  .string()
  .regex(/^[\w.-]+\/[\w.-]+$/, 'repo must be in "owner/name" format');

const issueStateSchema = z.enum(['open', 'closed', 'all']).optional();

interface IssueLike {
  number: number;
  title: string;
  state: string;
  user?: { login?: string } | null;
  created_at: string;
  body?: string | null;
  pull_request?: unknown;
}

function mapIssueLike(item: IssueLike) {
  return {
    number: item.number,
    title: item.title,
    state: item.state,
    user: item.user?.login ?? 'unknown',
    created_at: item.created_at,
    excerpt: (item.body ?? '').slice(0, 300),
  };
}

export const githubGetFile: ToolDefinition = {
  name: 'github_get_file',
  description:
    'Read the contents of a file from a GitHub repository. Large files are truncated to 4000 characters.',
  sideEffect: 'read',
  inputSchema: z.object({
    repo: repoSchema,
    path: z.string().min(1),
    ref: z.string().optional(),
  }),
  async execute(input, ctx: ToolContext): Promise<ToolResult> {
    const { repo, path, ref } = input as { repo: string; path: string; ref?: string };
    const token = resolveGithubToken(ctx.ownerId);
    if (!token) return MISSING_CONNECTION;

    const encodedPath = path.split('/').map(encodeURIComponent).join('/');
    const query = ref ? `?ref=${encodeURIComponent(ref)}` : '';
    const { status, json } = await githubFetch(token, `/repos/${repo}/contents/${encodedPath}${query}`);
    if (status !== 200) return apiError(status, json);

    if (Array.isArray(json)) {
      return {
        ok: false,
        summary: `"${path}" in ${repo} is a directory, not a file. Ask for a specific file path.`,
      };
    }

    const file = json as { content?: string; encoding?: string };
    if (!file.content || file.encoding !== 'base64') {
      return { ok: false, summary: `GitHub returned no readable content for ${path} in ${repo}.` };
    }

    let text = Buffer.from(file.content, 'base64').toString('utf8');
    if (text.length > FILE_TRUNCATE_AT) {
      text = text.slice(0, FILE_TRUNCATE_AT) + TRUNCATION_MARK;
    }
    return { ok: true, summary: `Read ${path} from ${repo}`, data: { repo, path, content: text } };
  },
};

export const githubListIssues: ToolDefinition = {
  name: 'github_list_issues',
  description: 'List the 10 most recent issues in a GitHub repository (excludes pull requests).',
  sideEffect: 'read',
  inputSchema: z.object({ repo: repoSchema, state: issueStateSchema }),
  async execute(input, ctx: ToolContext): Promise<ToolResult> {
    const { repo, state } = input as { repo: string; state?: 'open' | 'closed' | 'all' };
    const token = resolveGithubToken(ctx.ownerId);
    if (!token) return MISSING_CONNECTION;

    const { status, json } = await githubFetch(
      token,
      `/repos/${repo}/issues?state=${state ?? 'open'}&per_page=20`
    );
    if (status !== 200) return apiError(status, json);

    // GitHub's issues endpoint returns PRs too; filter them out, keep 10.
    const issues = (json as IssueLike[])
      .filter((item) => !item.pull_request)
      .slice(0, 10)
      .map(mapIssueLike);
    return { ok: true, summary: `Listed ${issues.length} issues in ${repo}`, data: { issues } };
  },
};

export const githubListPrs: ToolDefinition = {
  name: 'github_list_prs',
  description: 'List the 10 most recent pull requests in a GitHub repository.',
  sideEffect: 'read',
  inputSchema: z.object({ repo: repoSchema, state: issueStateSchema }),
  async execute(input, ctx: ToolContext): Promise<ToolResult> {
    const { repo, state } = input as { repo: string; state?: 'open' | 'closed' | 'all' };
    const token = resolveGithubToken(ctx.ownerId);
    if (!token) return MISSING_CONNECTION;

    const { status, json } = await githubFetch(
      token,
      `/repos/${repo}/pulls?state=${state ?? 'open'}&per_page=10`
    );
    if (status !== 200) return apiError(status, json);

    const prs = (json as IssueLike[]).slice(0, 10).map(mapIssueLike);
    return { ok: true, summary: `Listed ${prs.length} pull requests in ${repo}`, data: { pullRequests: prs } };
  },
};

export const githubCommitHistory: ToolDefinition = {
  name: 'github_commit_history',
  description:
    'Show the 10 most recent commits in a GitHub repository, optionally scoped to a file path.',
  sideEffect: 'read',
  inputSchema: z.object({ repo: repoSchema, path: z.string().optional() }),
  async execute(input, ctx: ToolContext): Promise<ToolResult> {
    const { repo, path } = input as { repo: string; path?: string };
    const token = resolveGithubToken(ctx.ownerId);
    if (!token) return MISSING_CONNECTION;

    const query = path ? `&path=${encodeURIComponent(path)}` : '';
    const { status, json } = await githubFetch(token, `/repos/${repo}/commits?per_page=10${query}`);
    if (status !== 200) return apiError(status, json);

    const commits = (
      json as Array<{
        sha: string;
        commit: { message: string; author?: { name?: string; date?: string } | null };
      }>
    )
      .slice(0, 10)
      .map((c) => ({
        sha7: c.sha.slice(0, 7),
        message: c.commit.message.split('\n')[0],
        author: c.commit.author?.name ?? 'unknown',
        date: c.commit.author?.date ?? '',
      }));
    return { ok: true, summary: `Fetched ${commits.length} commits from ${repo}`, data: { commits } };
  },
};

export const githubCreateIssue: ToolDefinition = {
  name: 'github_create_issue',
  description: 'Create a new issue in a GitHub repository. This is a write action.',
  sideEffect: 'write',
  inputSchema: z.object({
    repo: repoSchema,
    title: z.string().min(1),
    body: z.string(),
  }),
  async execute(input, ctx: ToolContext): Promise<ToolResult> {
    const { repo, title, body } = input as { repo: string; title: string; body: string };
    const token = resolveGithubToken(ctx.ownerId);
    if (!token) return MISSING_CONNECTION;

    const { status, json } = await githubFetch(token, `/repos/${repo}/issues`, {
      method: 'POST',
      body: JSON.stringify({ title, body }),
    });
    if (status !== 201) return apiError(status, json);

    const issue = json as { number: number; html_url: string };
    return {
      ok: true,
      summary: `Created issue #${issue.number} in ${repo}`,
      data: { number: issue.number, url: issue.html_url },
    };
  },
};

export const githubCommentIssue: ToolDefinition = {
  name: 'github_comment_issue',
  description: 'Post a comment on an existing GitHub issue or pull request. This is a write action.',
  sideEffect: 'write',
  inputSchema: z.object({
    repo: repoSchema,
    issueNumber: z.number().int().positive(),
    body: z.string().min(1),
  }),
  async execute(input, ctx: ToolContext): Promise<ToolResult> {
    const { repo, issueNumber, body } = input as { repo: string; issueNumber: number; body: string };
    const token = resolveGithubToken(ctx.ownerId);
    if (!token) return MISSING_CONNECTION;

    const { status, json } = await githubFetch(token, `/repos/${repo}/issues/${issueNumber}/comments`, {
      method: 'POST',
      body: JSON.stringify({ body }),
    });
    if (status !== 201) return apiError(status, json);

    const comment = json as { html_url: string };
    return {
      ok: true,
      summary: `Commented on issue #${issueNumber} in ${repo}`,
      data: { url: comment.html_url },
    };
  },
};

export const githubTools: ToolDefinition[] = [
  githubGetFile,
  githubListIssues,
  githubListPrs,
  githubCommitHistory,
  githubCreateIssue,
  githubCommentIssue,
];
