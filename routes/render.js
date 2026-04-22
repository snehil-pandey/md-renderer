/**
 * routes/render.js
 *
 * Single Express router that handles GET / requests.
 *
 * Query parameters:
 *   md    — HTTPS URL to a .md file on raw.githubusercontent.com (optional)
 *   theme — Theme name (optional, defaults to "documentation")
 *
 * Behaviour:
 *   1. If ?md is absent → load ./README.md from the local filesystem.
 *   2. Validate the URL (validator) → 400 / 403 on violation.
 *   3. Fetch the markdown (fetcher) → 502 / 504 / 404 / 413 on failure.
 *   4. Parse markdown to HTML (parser) → 422 on failure.
 *   5. Render full themed HTML page (renderer).
 *   6. Send with appropriate headers.
 *
 * All error branches return a styled HTML error page, not JSON.
 */

'use strict';

const express = require('express');
const path    = require('path');
const fs      = require('fs');

const { validateMarkdownUrl } = require('../utils/validator');
const { fetchMarkdown }       = require('../services/fetcher');
const { parseMarkdown }       = require('../services/parser');
const { renderPage, renderErrorPage } = require('../services/renderer');
const { DEFAULT_THEME, listThemes }   = require('../services/themeEngine');

const router = express.Router();

// Absolute path to the fallback README.md
const DEFAULT_README = path.join(__dirname, '..', 'README.md');

// ─────────────────────────────────────────────────────────────────────────────
// Shared response helpers
// ─────────────────────────────────────────────────────────────────────────────

function htmlHeaders(res) {
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'SAMEORIGIN');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  // Content is dynamic — do not cache at the CDN/browser level by default
  res.setHeader('Cache-Control', 'no-cache, no-store');
}

function sendError(res, code, message) {
  htmlHeaders(res);
  res.status(code).send(renderErrorPage(code, message));
}

// ─────────────────────────────────────────────────────────────────────────────
// GET /
// ─────────────────────────────────────────────────────────────────────────────
router.get('/', async (req, res) => {
  const { md: mdUrl, theme = DEFAULT_THEME } = req.query;

  let markdownSource;

  // ── Step 1: Obtain raw Markdown ─────────────────────────────────────────
  if (!mdUrl) {
    // No URL supplied → serve the local default README
    try {
      markdownSource = fs.readFileSync(DEFAULT_README, 'utf8');
    } catch {
      return sendError(res, 500,
        'Default README.md is missing from the server. ' +
        'Provide a ?md=<url> parameter to render a remote file.');
    }
  } else {
    // ── Validate the URL ──────────────────────────────────────────────────
    const validation = validateMarkdownUrl(mdUrl);
    if (!validation.valid) {
      return sendError(res, validation.code, validation.message);
    }

    // ── Fetch from upstream ───────────────────────────────────────────────
    try {
      const result = await fetchMarkdown(validation.url);
      markdownSource = result.content;

      // Expose cache status in a response header (useful for debugging)
      res.setHeader('X-Cache', result.fromCache ? 'HIT' : 'MISS');
    } catch (err) {
      const code = (err && err.code) ? err.code : 502;
      const msg  = (err && err.message) ? err.message : 'Failed to fetch Markdown file.';
      return sendError(res, code, msg);
    }
  }

  // ── Step 2: Parse Markdown → HTML ────────────────────────────────────────
  let htmlContent;
  try {
    htmlContent = parseMarkdown(markdownSource);
  } catch (err) {
    const code = (err && err.code) ? err.code : 422;
    const msg  = (err && err.message) ? err.message : 'Failed to parse Markdown.';
    return sendError(res, code, msg);
  }

  // ── Step 3: Render full themed HTML page ─────────────────────────────────
  let page;
  try {
    page = renderPage(htmlContent, theme, markdownSource);
  } catch (err) {
    return sendError(res, 500, `Render failed: ${err.message}`);
  }

  // ── Step 4: Send ─────────────────────────────────────────────────────────
  htmlHeaders(res);
  res.status(200).send(page);
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /health — lightweight liveness probe (no heavy work)
// ─────────────────────────────────────────────────────────────────────────────
router.get('/health', (_req, res) => {
  res.setHeader('Content-Type', 'application/json');
  res.status(200).json({
    status: 'ok',
    uptime: process.uptime().toFixed(2) + 's',
    themes: listThemes(),
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /cache-stats — expose LRU cache metrics (optional, remove in prod)
// ─────────────────────────────────────────────────────────────────────────────
router.get('/cache-stats', (_req, res) => {
  const { stats } = require('../utils/cache');
  res.setHeader('Content-Type', 'application/json');
  res.status(200).json(stats());
});

module.exports = router;
