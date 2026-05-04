/**
 * services/pipeline.js
 *
 * The render pipeline. This is the only place that knows the full sequence:
 *   fetch → parse → render → respond
 *
 * Every other module has one job. This one composes them.
 * Routes hand it a RenderConfig. They get back { html, status, headers }.
 *
 * The pipeline handles both render modes transparently:
 *   renderOn: 'server'  — markdown is parsed here, HTML is returned fully formed
 *   renderOn: 'client'  — raw markdown is embedded in the page; the browser parses it
 *
 * Why split this out from the route?
 * The route's job is HTTP: read params, set headers, send the response.
 * The pipeline's job is rendering: fetch, parse, theme, assemble.
 * When I mixed these in routes/render.js, adding the JSON config path meant
 * duplicating fetch-then-parse logic in two branches. A shared pipeline
 * eliminates that.
 *
 * Exports
 * ───────
 *   run(config)  → Promise<{ html: string, status: number, headers: object }>
 */

'use strict';

const fs = require('fs');
const path = require('path');

const { fetchMarkdown } = require('./fetcher');
const { parseMarkdown } = require('./parser');
const { renderPage, renderClientPage, renderErrorPage } = require('./renderer');
const { getTheme } = require('./themeEngine');

const DEFAULT_README = path.join(__dirname, '..', 'README.md');

/**
 * Run the full render pipeline for a validated RenderConfig.
 *
 * @param {object} config  — RenderConfig from configParser
 * @returns {Promise<{ html: string, status: number, headers: object }>}
 */
async function run(config) {
  const { mdUrl, theme: themeName, customTheme, title, favicon } = config;

  // ── 1. Fetch markdown source ───────────────────────────────────────────────
  let markdownSource;
  const responseHeaders = {};

  if (!mdUrl) {
    // No URL → serve the local README
    try {
      markdownSource = fs.readFileSync(DEFAULT_README, 'utf8');
    } catch {
      return err(500,
        'The default README.md is missing from the server. ' +
        'Pass ?md=<url> to render a remote file.'
      );
    }
  } else {
    try {
      const result = await fetchMarkdown(mdUrl);
      markdownSource = result.content;
      responseHeaders['X-Cache'] = result.fromCache ? 'HIT' : 'MISS';
    } catch (e) {
      return err(e.code || 502, e.message || 'Failed to fetch the Markdown file.');
    }
  }

  // ── 2. Resolve which theme object to use ──────────────────────────────────
  // customTheme (from JSON config) takes priority over named built-in theme.
  const themeObj = customTheme || getTheme(themeName);

  // ── 3. Decide where to render ─────────────────────────────────────────────
  // Built-in themes carry renderOn: 'server' (set in themeEngine.js).
  // User-defined themes from JSON configs always have renderOn: 'client'
  // (enforced in configParser.validateCustomTheme — users cannot override this).
  // Anything without an explicit renderOn falls back to server rendering.
  const renderOn = themeObj.renderOn || 'server';

  let html;
  try {
    if (renderOn === 'client') {
      // Hand the raw markdown to the browser. The server's job here is limited
      // to: fetch (with caching), embed, and send back a shell page. Parsing
      // CPU stays on the client, which matters when many concurrent requests
      // would otherwise all trigger markdown-it + KaTeX on the same process.
      html = renderClientPage(markdownSource, { theme: themeObj, title, favicon });
    } else {
      // Server-side: parse the markdown into HTML here, return a complete page.
      const htmlContent = parseMarkdown(markdownSource);
      html = renderPage(htmlContent, { theme: themeObj, title, favicon, markdownSource });
    }
  } catch (e) {
    return err(e.code || 500, e.message || 'Render failed.');
  }

  return { html, status: 200, headers: responseHeaders };
}

/**
 * Build a typed error result (avoids throwing across async boundaries).
 * @param {number} status
 * @param {string} message
 * @returns {{ html: string, status: number, headers: object }}
 */
function err(status, message) {
  return {
    html:    renderErrorPage(status, message),
    status,
    headers: {},
  };
}

module.exports = { run };
