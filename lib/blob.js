// Wrapper around @vercel/blob for the round 2/3 media files.
//
// CRITICAL: the raw Blob URL (https://*.public.blob.vercel-storage.com/...)
// must NEVER be sent to the client. It's a public URL by construction (Blob
// doesn't do private/signed reads in the basic tier used here) - so anyone
// who obtained it could skip the whole reveal-token/session flow entirely.
// Instead, /api/reveal/[token].js fetches the bytes here, server-side, and
// streams them back through our own domain. The client only ever sees our
// own URL.

import { head } from '@vercel/blob';

/**
 * Resolves a stored pathname to its current Blob URL (server-side only),
 * then fetches and returns the raw bytes + content type so the caller can
 * stream them back without ever exposing the Blob URL itself.
 * @param {string} pathname - e.g. "round2-loop.mp4"
 */
export async function fetchBlobAsset(pathname) {
  const meta = await head(pathname, {
    token: process.env.BLOB_READ_WRITE_TOKEN,
  });

  const res = await fetch(meta.url, { cache: 'no-store' });
  if (!res.ok) {
    throw new Error(`Failed to fetch blob asset ${pathname}: ${res.status}`);
  }

  const arrayBuffer = await res.arrayBuffer();
  return {
    buffer: Buffer.from(arrayBuffer),
    contentType: meta.contentType || res.headers.get('content-type') || 'application/octet-stream',
  };
}
