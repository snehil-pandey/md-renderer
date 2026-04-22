/**
 * services/renderer.js
 *
 * Assembles the final HTML document that is sent to the client.
 *
 * Two exported functions:
 *  renderPage(htmlContent, themeName, title)
 *    → Full themed HTML page wrapping the parsed Markdown content.
 *
 *  renderErrorPage(statusCode, message)
 *    → Minimal dark-themed error page with large error code.
 *
 * Design goals:
 *  - Zero external resources (no CDN, no web fonts, no external CSS/JS)
 *  - Inline CSS only — works fully offline and on air-gapped devices
 *  - Accessibility: lang attribute, charset, viewport meta
 *  - Security: Content-Security-Policy meta tag blocks inline scripts
 */

'use strict';

const { getTheme } = require('./themeEngine');

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

/** Escape a string for safe embedding in an HTML attribute value. */
function escapeAttr(str) {
  return String(str).replace(/[&"<>]/g, (c) => ({
    '&': '&amp;', '"': '&quot;', '<': '&lt;', '>': '&gt;',
  })[c]);
}

/** Escape a string for safe embedding in HTML text content. */
function escapeText(str) {
  return String(str).replace(/[&<>]/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;',
  })[c]);
}

/**
 * Derive a readable page <title> from Markdown source.
 * Pulls the first level-1 heading if present; falls back to a default.
 *
 * @param {string} markdownSource - Raw Markdown (used for the title scan).
 * @param {string} [fallback='Rendered Markdown']
 * @returns {string}
 */
function extractTitle(markdownSource, fallback = 'Rendered Markdown') {
  if (!markdownSource) return fallback;
  const match = markdownSource.match(/^#\s+(.+?)(\s+#+)?$/m);
  if (match) {
    return match[1].replace(/[`*_[\]]/g, '').trim() || fallback;
  }
  return fallback;
}

// ─────────────────────────────────────────────────────────────────────────────
// HTTP status → human-readable title
// ─────────────────────────────────────────────────────────────────────────────
const STATUS_TITLES = {
  400: 'Bad Request',
  403: 'Forbidden',
  404: 'Not Found',
  413: 'Payload Too Large',
  422: 'Unprocessable Content',
  500: 'Internal Server Error',
  502: 'Bad Gateway',
  503: 'Service Unavailable',
  504: 'Gateway Timeout',
};

function statusTitle(code) {
  return STATUS_TITLES[code] || 'Error';
}

// ─────────────────────────────────────────────────────────────────────────────
// renderPage — main themed document
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Build a complete, themed HTML document.
 *
 * @param {string} htmlContent   - Sanitized inner HTML from the parser.
 * @param {string} themeName     - Theme key (validated in themeEngine).
 * @param {string} markdownSource- Original Markdown text (for title extraction).
 * @returns {string} Full HTML document string.
 */
function renderPage(htmlContent, themeName, markdownSource = '') {
  const theme = getTheme(themeName);
  const title = extractTitle(markdownSource);

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <!-- Disallow inline scripts as a defence-in-depth CSP -->
  <meta http-equiv="Content-Security-Policy"
        content="default-src 'none'; style-src 'unsafe-inline'; img-src https: http: data:; script-src 'none';">
  <meta name="generator" content="md-renderer">
  <title>${escapeAttr(title)}</title>
  <style>
${theme.css}
  </style>
</head>
<body>
  <div class="container">
${htmlContent}
  </div>
</body>
</html>`;
}

// ─────────────────────────────────────────────────────────────────────────────
// renderErrorPage — minimal dark-themed error document
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Build a self-contained dark-mode error page.
 *
 * @param {number} statusCode - HTTP status code (400, 403, 404, …).
 * @param {string} message    - Short, developer-friendly error description.
 * @returns {string} Full HTML document string.
 */
function renderErrorPage(statusCode, message) {
  const code  = Number(statusCode) || 500;
  const title = statusTitle(code);

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="Content-Security-Policy"
        content="default-src 'none'; style-src 'unsafe-inline'; script-src 'none';">
  <title>${code} — ${escapeAttr(title)}</title>
  <style>
    /* ── Reset ── */
    *,*::before,*::after{box-sizing:border-box;margin:0;padding:0}
    html,body{height:100%}

    /* ── Dark canvas ── */
    body{
      font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;
      background:#0d1117;
      color:#e6edf3;
      display:flex;
      align-items:center;
      justify-content:center;
      min-height:100vh;
      padding:24px;
    }

    /* ── Card ── */
    .err{
      text-align:center;
      max-width:480px;
      width:100%;
    }

    /* ── Giant gradient code number ── */
    .err__code{
      font-size:clamp(5rem,20vw,8rem);
      font-weight:800;
      line-height:1;
      letter-spacing:-4px;
      background:linear-gradient(135deg,#ff6b6b 0%,#ffa94d 100%);
      -webkit-background-clip:text;
      -webkit-text-fill-color:transparent;
      background-clip:text;
      margin-bottom:.25em;
      user-select:none;
    }

    /* ── Status title ── */
    .err__title{
      font-size:1.3rem;
      font-weight:500;
      color:#8b949e;
      letter-spacing:.03em;
      margin-bottom:1.1rem;
    }

    /* ── Message bubble ── */
    .err__msg{
      font-size:.92rem;
      color:#6e7681;
      line-height:1.65;
      background:#161b22;
      border:1px solid #30363d;
      border-radius:8px;
      padding:14px 22px;
      word-break:break-word;
    }

    /* ── Back link ── */
    .err__back{
      display:inline-block;
      margin-top:2rem;
      color:#58a6ff;
      text-decoration:none;
      font-size:.875rem;
      border:1px solid #30363d;
      padding:8px 20px;
      border-radius:6px;
    }
    .err__back:hover{
      border-color:#58a6ff;
      background:rgba(88,166,255,.06);
    }

    /* ── Divider ── */
    .err__divider{
      width:40px;
      height:1px;
      background:#30363d;
      margin:1.4rem auto;
    }
  </style>
</head>
<body>
  <div class="err">
    <div class="err__code">${code}</div>
    <div class="err__title">${escapeText(title)}</div>
    <div class="err__divider"></div>
    <div class="err__msg">${escapeText(message)}</div>
    <a class="err__back" href="/">← Return home</a>
  </div>
</body>
</html>`;
}

module.exports = { renderPage, renderErrorPage, extractTitle };
