/**
 * services/fetcher.js
 *
 * Fetches raw Markdown content from a validated remote URL.
 *
 * Features:
 *  - Hard 3-second AbortController timeout
 *  - 1 MB body size limit (checked via Content-Length header AND streaming)
 *  - LRU cache hit avoids all network I/O
 *  - Content-Type guard (rejects obvious non-Markdown responses)
 *  - Typed error objects so the route layer can return the right HTTP status
 *
 * Error shape: { code: number, message: string }
 * On success  : { content: string, fromCache: boolean }
 */

'use strict';

const cache = require('../utils/cache');

const MAX_BYTES     = 1024 * 1024;   // 1 MB hard limit
const TIMEOUT_MS    = 3_000;         // 3 seconds upstream timeout
const USER_AGENT    = 'md-renderer/1.0 (https://github.com/md-renderer)';

// Content-Type values that unambiguously mean "not a Markdown file"
const REJECTED_TYPES = ['text/html', 'application/json', 'application/xml'];

/**
 * Fetch and return raw Markdown text.
 *
 * @param {URL} url - A pre-validated URL object.
 * @returns {Promise<{ content: string, fromCache: boolean }>}
 * @throws {{ code: number, message: string }}
 */
async function fetchMarkdown(url) {
  const cacheKey = url.toString();

  // ── Cache hit ─────────────────────────────────────────────────────────────
  const cached = cache.get(cacheKey);
  if (cached !== undefined) {
    return { content: cached, fromCache: true };
  }

  // ── Setup AbortController for the hard timeout ────────────────────────────
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

  let response;
  try {
    response = await fetch(url.toString(), {
      method: 'GET',
      signal: controller.signal,
      headers: {
        'User-Agent': USER_AGENT,
        'Accept': 'text/plain, text/markdown, text/x-markdown, */*;q=0.8',
        // Prefer uncompressed so we can measure bytes ourselves
        'Accept-Encoding': 'identity',
      },
      // Node 18+ fetch respects redirect by default (follow up to 20)
      redirect: 'follow',
    });
  } catch (err) {
    clearTimeout(timer);

    if (err.name === 'AbortError') {
      throw { code: 504, message: 'Upstream server did not respond within 3 seconds.' };
    }
    // Network-level failure (DNS, TCP, TLS, etc.)
    throw { code: 502, message: `Could not reach upstream server: ${err.message}` };
  } finally {
    clearTimeout(timer);
  }

  // ── HTTP status mapping ───────────────────────────────────────────────────
  if (response.status === 404) {
    throw { code: 404, message: 'Markdown file not found at the given URL.' };
  }
  if (response.status === 401 || response.status === 403) {
    throw { code: 403, message: 'Access to this file is forbidden by the upstream server.' };
  }
  if (response.status === 429) {
    throw { code: 503, message: 'Upstream server rate-limited this request. Try again shortly.' };
  }
  if (response.status >= 500) {
    throw { code: 502, message: `Upstream server returned HTTP ${response.status}.` };
  }
  if (!response.ok) {
    throw { code: 502, message: `Unexpected upstream HTTP status: ${response.status}.` };
  }

  // ── Content-Type guard ────────────────────────────────────────────────────
  const contentType = (response.headers.get('content-type') || '').toLowerCase();
  const isRejected = REJECTED_TYPES.some((t) => contentType.includes(t));
  if (isRejected) {
    throw {
      code: 400,
      message: `Upstream returned "${contentType}", which is not a Markdown file.`,
    };
  }

  // ── Content-Length pre-check (not always present, treat as advisory) ───────
  const clHeader = response.headers.get('content-length');
  if (clHeader) {
    const declared = parseInt(clHeader, 10);
    if (!isNaN(declared) && declared > MAX_BYTES) {
      throw {
        code: 413,
        message: `File is ${(declared / 1024).toFixed(0)} KB — exceeds the 1 MB limit.`,
      };
    }
  }

  // ── Stream body with a running byte counter ───────────────────────────────
  if (!response.body) {
    throw { code: 502, message: 'Upstream returned an empty response body.' };
  }

  const reader = response.body.getReader();
  const chunks = [];
  let totalBytes = 0;

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      totalBytes += value.byteLength;
      if (totalBytes > MAX_BYTES) {
        // Cancel the stream to free the connection
        await reader.cancel('File too large');
        throw {
          code: 413,
          message: `File exceeds the 1 MB size limit (stopped at ${(totalBytes / 1024).toFixed(0)} KB).`,
        };
      }
      chunks.push(value);
    }
  } catch (err) {
    // Re-throw our own typed errors unchanged
    if (err && err.code) throw err;
    // Unexpected read error
    throw { code: 502, message: `Stream read failed: ${err.message}` };
  }

  // ── Decode UTF-8 ──────────────────────────────────────────────────────────
  const buffer = Buffer.concat(chunks.map((c) => Buffer.from(c)));
  const content = buffer.toString('utf8');

  // Basic sanity: if the entire response is empty, reject it
  if (content.trim().length === 0) {
    throw { code: 404, message: 'The remote file is empty.' };
  }

  // ── Store in cache ────────────────────────────────────────────────────────
  cache.set(cacheKey, content);

  return { content, fromCache: false };
}

module.exports = { fetchMarkdown };
