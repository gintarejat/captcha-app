// Server-only client for the PRIVATE captcha-content GitHub repo.
//
// CRITICAL: this file must never be imported by any client-side code path.
// There is no client-side code path in this project (no bundler/framework),
// but if this ever gets ported into a bundler-based frontend, this file
// must stay strictly server-only (API routes only), because it holds the
// logic that reaches the GitHub PAT and the real answers.
//
// Uses plain fetch against the GitHub Contents API - a JSON file and a text
// file don't justify pulling in @octokit/rest.

const GITHUB_API = 'https://api.github.com';

function requireEnv(name) {
  const value = process.env[name];
  if (!value) throw new Error(`${name} env var is required`);
  return value;
}

async function fetchContentFile(path) {
  const repo = requireEnv('GITHUB_CONTENT_REPO'); // e.g. "yourusername/captcha-content"
  const branch = process.env.GITHUB_CONTENT_BRANCH || 'main';
  const token = requireEnv('GITHUB_CONTENT_TOKEN');

  const url = `${GITHUB_API}/repos/${repo}/contents/${encodeURIComponent(path)}?ref=${encodeURIComponent(branch)}`;
  const res = await fetch(url, {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/vnd.github.raw+json',
      'X-GitHub-Api-Version': '2022-11-28',
    },
    // never cache content fetches - answers/codes must always be current
    cache: 'no-store',
  });

  if (!res.ok) {
    throw new Error(`GitHub content fetch failed for ${path}: ${res.status} ${res.statusText}`);
  }
  return res.text();
}

// NOTE on caching: these are plain module-level variables, which only ever
// help within a single warm serverless container - they do NOT persist
// across container instances (confirmed empirically in the scamnot project:
// Vercel does not share in-memory state like a Map across invocations/
// instances). That's fine here because staleness is harmless: worst case is
// one warm instance serves content.json from a minute ago while another
// re-fetches. This is NOT used for anything that needs cross-instance
// consistency (rate limits and code-claim counts live in KV instead, see
// lib/kv.js and lib/ratelimit.js).
let tasksCache = null;
let codesCache = null;
let bundleInstructionsCache = null;

/**
 * Fetches all 3 task definitions (prompts + acceptableAnswers + media refs).
 */
export async function getTasks() {
  if (tasksCache) return tasksCache;
  const raw = await fetchContentFile('tasks.json');
  tasksCache = JSON.parse(raw);
  return tasksCache;
}

export async function getCodes() {
  if (codesCache) return codesCache;
  const raw = await fetchContentFile('codes.json');
  codesCache = JSON.parse(raw).codes;
  return codesCache;
}

export async function getBundleInstructions() {
  if (bundleInstructionsCache) return bundleInstructionsCache;
  bundleInstructionsCache = await fetchContentFile('bundle-instructions.txt');
  return bundleInstructionsCache;
}

/** Returns a single task by id, or throws if not found. */
export async function getTaskById(id) {
  const tasks = await getTasks();
  const task = tasks.find((t) => t.id === id);
  if (!task) throw new Error(`Unknown task id: ${id}`);
  return task;
}

/**
 * Strips everything except prompt/type/media - used whenever we send task
 * data to the client. acceptableAnswers must NEVER cross this boundary.
 */
export function toClientSafeTask(task) {
  return {
    id: task.id,
    order: task.order,
    type: task.type,
    prompt: task.prompt,
    media: task.media ? { mimeType: task.media.mimeType } : null, // no blobPathname either
  };
}
