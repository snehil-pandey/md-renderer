/**
 * routes/render.js
 *
 * This file is intentionally thin. Its only job is HTTP:
 *   read the request → build a config → call the pipeline → send the response.
 *
 * All rendering decisions, error handling, and content assembly happen in
 * services/pipeline.js and the modules it calls. If you need to change how
 * Markdown is parsed, touch parser.js. If you need a new theme, touch
 * themeEngine.js. If you need a new query parameter, touch configParser.js.
 * This file should rarely need to change.
 */

'use strict';

const express = require('express');
const { fromQuery, fromJson } = require('../utils/configParser');
const { validateMarkdownUrl }  = require('../utils/validator');
const { fetchMarkdown }        = require('../services/fetcher');
const { run }                  = require('../services/pipeline');
const { getThemeMeta }         = require('../services/themeEngine');
const { listAllowedHosts }     = require('../utils/validator');
const { renderErrorPage }      = require('../services/renderer');
const { stats }                = require('../utils/cache');

const router = express.Router();

// Common response headers applied to every rendered page.
function setPageHeaders(res, extra = {}) {
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'SAMEORIGIN');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('Cache-Control', 'no-cache, no-store');
  for (const [k, v] of Object.entries(extra)) res.setHeader(k, v);
}

// ── GET / ─────────────────────────────────────────────────────────────────────
router.get('/', async (req, res) => {
  let configResult;

  if (req.query.config) {
    // ── Config-URL mode: fetch the JSON file, merge with query params ──────
    const urlResult = validateMarkdownUrl(req.query.config, { allowJson: true });
    if (!urlResult.valid) {
      setPageHeaders(res);
      return res.status(urlResult.code).send(renderErrorPage(urlResult.code, urlResult.message));
    }

    let rawJson;
    try {
      const fetched = await fetchMarkdown(urlResult.url);
      rawJson = fetched.content;
    } catch (e) {
      setPageHeaders(res);
      return res.status(e.code || 502).send(renderErrorPage(e.code || 502, e.message));
    }

    configResult = fromJson(rawJson, req.query);
  } else {
    // ── Direct-params mode ─────────────────────────────────────────────────
    configResult = fromQuery(req.query);
  }

  if (configResult.error) {
    setPageHeaders(res);
    return res
      .status(configResult.error.code)
      .send(renderErrorPage(configResult.error.code, configResult.error.message));
  }

  // Hand off to the pipeline. It returns { html, status, headers }.
  const result = await run(configResult.config);

  setPageHeaders(res, result.headers);
  res.status(result.status).send(result.html);
});

// ── GET /health ───────────────────────────────────────────────────────────────
router.get('/health', (_req, res) => {
  res.json({
    status:       'ok',
    version:      '3.0.0',
    uptime:       process.uptime().toFixed(2) + 's',
    themes:       getThemeMeta(),
    allowedHosts: listAllowedHosts(),
  });
});

// ── GET /cache-stats ──────────────────────────────────────────────────────────
router.get('/cache-stats', (_req, res) => {
  res.json(stats());
});

module.exports = router;
