// Single shared Redis client for the whole app.
//
// NOTE: @vercel/kv is deprecated (Vercel folded KV into a Marketplace
// Upstash Redis integration in Dec 2024 and no longer recommends the old
// package for new projects) - so this talks to Upstash directly via
// @upstash/redis, which @upstash/ratelimit expects natively anyway. The
// Marketplace integration still injects the same env var names
// (KV_REST_API_URL / KV_REST_API_TOKEN), so nothing else about the setup
// changes: attach the Redis integration in the Vercel dashboard and these
// vars appear automatically.

import { Redis } from '@upstash/redis';

export const redis = new Redis({
  url: process.env.KV_REST_API_URL,
  token: process.env.KV_REST_API_TOKEN,
});
