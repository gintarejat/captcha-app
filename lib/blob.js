// Wrapper around @vercel/blob for the round 2/3 media files.
//
// The store is created with `--access private` (see captcha-app-media in
// the Vercel dashboard), so the raw Blob URL is useless to anyone without
// a valid token even if it somehow leaked - defense in depth on top of the
// real control, which is that the URL is never sent to the client at all.
// /api/reveal/[token].js fetches the bytes here, server-side, and streams
// them back through our own domain.

import { get } from '@vercel/blob';

/**
 * Fetches a private blob's stream + content type, server-side only.
 * @param {string} pathname - e.g. "round2-loop.mp4"
 */
export async function fetchBlobAsset(pathname) {
  const result = await get(pathname, {
    access: 'private',
    token: process.env.BLOB_READ_WRITE_TOKEN,
  });

  if (!result || result.statusCode !== 200) {
    throw new Error(`Blob asset not found: ${pathname}`);
  }

  return {
    stream: result.stream,
    contentType: result.blob?.contentType || 'application/octet-stream',
  };
}
