/**
 * routes/render.js
 *
 * Handles GET / — the single rendering endpoint.
 *
 * INPUT MODES
 * ───────────
 * Mode A — Direct params (simplest):
 *   /?md=<markdown_url>&theme=<theme>
 *
 * Mode B — JSON config URL (advanced):
 *   /?config=<url_to_config.json>
 *
 *   The config JSON must be hosted on an allowed domain and may contain:
 *   {
 *     "md":    "https://raw.githubusercontent.com/…/README.md",
 *     "theme": "documentation",
 *     "title": "Optional custom page title"
 *   }
 *   Any key present in the JSON overrides the corresponding query param.
 *
 * Mode C — No params:
 *   Serves the local README.md with the default theme.
 *
 * WHY A JSON CONFIG?
 *   When embedding this API in another tool or CI pipeline, repeatedly
 *   constructing a long ?md=…&theme=… URL is cumbersome and fragile.
 *   A JSON config file checked into your repo is versioned, readable, and
 *   can be updated without changing the API call site. It also lets a team
 *   publish "view this doc with our branded theme" links that are stable.
 */

'use strict';

const express = require('express');
const path    = require('path');
const fs      = require('fs');

const { validateMarkdownUrl, listAllowedHosts } = require('../utils/validator');
const { fetchMarkdown }   = require('../services/fetcher');
const { parseMarkdown }   = require('../services/parser');
const { renderPage, renderErrorPage } = require('../services/renderer');
const { DEFAULT_THEME, getThemeMeta } = require('../services/themeEngine');

const router = express.Router();
const DEFAULT_README = path.join(__dirname, '..', 'README.md');

// ─── Shared helpers ───────────────────────────────────────────────────────────
function htmlHeaders(res) {
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'SAMEORIGIN');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('Cache-Control', 'no-cache, no-store');
}

function sendError(res, code, message) {
  htmlHeaders(res);
  res.status(code).send(renderErrorPage(code, message));
}

// ─── JSON config fetcher ──────────────────────────────────────────────────────
async function resolveConfig(configUrl) {
  // Validate the config URL itself (must be on an allowed host, .json ext)
  const validation = validateMarkdownUrl(configUrl, { allowJson: true });
  if (!validation.valid) {
    return { error: { code: validation.code, message: validation.message } };
  }

  let raw;
  try {
    const result = await fetchMarkdown(validation.url);
    raw = result.content;
  } catch (err) {
    return { error: { code: err.code || 502, message: err.message || 'Failed to fetch config.' } };
  }

  let config;
  try {
    config = JSON.parse(raw);
  } catch {
    return { error: { code: 400, message: 'Config URL did not return valid JSON.' } };
  }

  if (typeof config !== 'object' || Array.isArray(config)) {
    return { error: { code: 400, message: 'Config JSON must be a plain object.' } };
  }

  return { config };
}

// ─── GET / ────────────────────────────────────────────────────────────────────
router.get('/', async (req, res) => {
  let { md: mdUrl, theme, config: configUrl } = req.query;

  // ── Mode B: JSON config ──────────────────────────────────────────────────
  if (configUrl) {
    const { config, error } = await resolveConfig(configUrl);
    if (error) return sendError(res, error.code, error.message);

    // JSON fields override query params (query params are ignored in config mode)
    mdUrl = config.md   || mdUrl;
    theme = config.theme || theme;
    // config.title is handled inside renderPage via markdown source
  }

  // ── Default theme ────────────────────────────────────────────────────────
  if (!theme) theme = DEFAULT_THEME;

  let markdownSource;

  // ── Mode C: no md param → serve local README ─────────────────────────────
  if (!mdUrl) {
    try {
      markdownSource = fs.readFileSync(DEFAULT_README, 'utf8');
    } catch {
      return sendError(res, 500,
        'The default README.md is missing from the server. ' +
        'Provide ?md=<url> to render a remote file.');
    }
  } else {
    // ── Mode A: validate + fetch remote markdown ──────────────────────────
    const validation = validateMarkdownUrl(mdUrl);
    if (!validation.valid) return sendError(res, validation.code, validation.message);

    try {
      const result = await fetchMarkdown(validation.url);
      markdownSource = result.content;
      res.setHeader('X-Cache', result.fromCache ? 'HIT' : 'MISS');
    } catch (err) {
      return sendError(res, err.code || 502, err.message || 'Failed to fetch Markdown.');
    }
  }

  // ── Parse ─────────────────────────────────────────────────────────────────
  let htmlContent;
  try {
    htmlContent = parseMarkdown(markdownSource);
  } catch (err) {
    return sendError(res, err.code || 422, err.message || 'Markdown parsing failed.');
  }

  // ── Render ───────────────────────────────────────────────────────────────
  let page;
  try {
    page = renderPage(htmlContent, theme, markdownSource);
  } catch (err) {
    return sendError(res, 500, `Render failed: ${err.message}`);
  }

  htmlHeaders(res);
  res.status(200).send(page);
});

// ─── GET /health ──────────────────────────────────────────────────────────────
router.get('/health', (_req, res) => {
  res.setHeader('Content-Type', 'application/json');
  res.status(200).json({
    status: 'ok',
    version: '2.0.0',
    uptime: process.uptime().toFixed(2) + 's',
    themes: getThemeMeta(),
    allowedHosts: listAllowedHosts(),
  });
});

// ─── GET /cache-stats ─────────────────────────────────────────────────────────
router.get('/cache-stats', (_req, res) => {
  const { stats } = require('../utils/cache');
  res.setHeader('Content-Type', 'application/json');
  res.status(200).json(stats());
});

module.exports = router;
