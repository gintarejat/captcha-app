// Builds the downloadable zip. It contains ONLY the obfuscated instructions
// text (author-controlled, lives in captcha-content/bundle-instructions.txt)
// with the {{REVEAL_URL}} marker substituted for a real, per-session reveal
// URL. It never contains the actual video/image - those only ever come from
// Blob, streamed server-side through /api/reveal/[token].js.

import JSZip from 'jszip';
import { getBundleInstructions } from './content.js';

/**
 * @param {string} revealUrl - fully-qualified per-session reveal URL
 * @returns {Promise<Buffer>} zip file bytes
 */
export async function buildBundleZip(revealUrl) {
  const template = await getBundleInstructions();
  if (!template.includes('{{REVEAL_URL}}')) {
    throw new Error('bundle-instructions.txt is missing the {{REVEAL_URL}} marker');
  }
  const instructions = template.replaceAll('{{REVEAL_URL}}', revealUrl);

  const zip = new JSZip();
  zip.file('instructions.txt', instructions);
  return zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' });
}
