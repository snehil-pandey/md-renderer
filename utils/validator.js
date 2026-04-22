/**
 * utils/validator.js
 *
 * Validates incoming Markdown URLs against a strict allowlist.
 * Only raw GitHub content domains are permitted.
 * Returns a structured result so callers can send typed HTTP errors.
 */

'use strict';

// Only these hostnames are trusted sources for Markdown files.
const ALLOWED_HOSTS = new Set([
  'raw.githubusercontent.com',
  'githubusercontent.com',
]);

// Accepted file extensions (case-insensitive).
const ALLOWED_EXTENSIONS = ['.md', '.markdown', '.mkd', '.mdown'];

/**
 * Validate a candidate Markdown URL.
 *
 * @param {string|undefined} urlString - The raw query-param value.
 * @returns {{ valid: true, url: URL } | { valid: false, code: number, message: string }}
 */
function validateMarkdownUrl(urlString) {
  // ── 1. Presence check ────────────────────────────────────────────────────
  if (!urlString || typeof urlString !== 'string') {
    return { valid: false, code: 400, message: 'Missing "md" query parameter.' };
  }

  const trimmed = urlString.trim();
  if (trimmed.length === 0) {
    return { valid: false, code: 400, message: 'URL is empty.' };
  }

  // ── 2. Length guard (prevents absurd inputs) ──────────────────────────────
  if (trimmed.length > 2048) {
    return { valid: false, code: 400, message: 'URL exceeds maximum allowed length.' };
  }

  // ── 3. Parse – reject anything that is not a valid URL ───────────────────
  let url;
  try {
    url = new URL(trimmed);
  } catch {
    return { valid: false, code: 400, message: 'Malformed URL — could not be parsed.' };
  }

  // ── 4. Protocol – HTTPS only ──────────────────────────────────────────────
  if (url.protocol !== 'https:') {
    return {
      valid: false,
      code: 400,
      message: 'Only HTTPS URLs are accepted. Received: ' + url.protocol,
    };
  }

  // ── 5. Hostname – strict allowlist ───────────────────────────────────────
  const host = url.hostname.toLowerCase();
  if (!ALLOWED_HOSTS.has(host)) {
    return {
      valid: false,
      code: 403,
      message:
        `Domain "${host}" is not permitted. ` +
        'Only raw.githubusercontent.com and githubusercontent.com are allowed.',
    };
  }

  // ── 6. Path – must end with a Markdown extension ──────────────────────────
  const pathname = url.pathname.toLowerCase();
  const hasValidExtension = ALLOWED_EXTENSIONS.some((ext) => pathname.endsWith(ext));
  if (!hasValidExtension) {
    return {
      valid: false,
      code: 400,
      message:
        'URL must point to a Markdown file (.md, .markdown, .mkd, or .mdown).',
    };
  }

  // ── 7. No user-info (prevents credential injection) ───────────────────────
  if (url.username || url.password) {
    return { valid: false, code: 400, message: 'URLs with credentials are not allowed.' };
  }

  return { valid: true, url };
}

module.exports = { validateMarkdownUrl };
