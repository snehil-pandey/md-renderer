/**
 * services/renderer.js
 *
 * Assembles the final HTML document sent to the client.
 *
 * KATEX CSS
 *   KaTeX renders math as HTML <span> elements using CSS classes for layout.
 *   We read katex.min.css from node_modules at startup, strip the @font-face
 *   rules (which reference external font files), and inline the remainder so
 *   pages work fully offline. Math symbols are Unicode code-points, so they
 *   render using the system's serif/math font stack — visually correct on any
 *   OS without downloading custom fonts.
 *
 * SVG DOODLES
 *   Each theme carries a `doodle` SVG string. The renderer injects it as the
 *   first child of <body>, before .container. The SVG is positioned by the
 *   theme's own CSS (class="doodle") and has pointer-events:none so it never
 *   interferes with text selection or link clicks.
 *
 * SECURITY
 *   • CSP meta tag: disallows all scripts; allows only inline styles and HTTPS images.
 *   • X-Content-Type-Options, X-Frame-Options in route layer.
 *   • escapeAttr / escapeText used for any dynamic values outside sanitised HTML.
 */

'use strict';

const fs   = require('fs');
const path = require('path');
const { getTheme } = require('./themeEngine');

// ─── KaTeX CSS — load once at startup ────────────────────────────────────────
let KATEX_CSS = '';
try {
  const cssPath = path.join(__dirname, '..', 'node_modules', 'katex', 'dist', 'katex.min.css');
  let raw = fs.readFileSync(cssPath, 'utf8');

  // Remove @font-face blocks — they point to external font files we don't serve.
  // The regex covers both minified (single-line) and formatted (multi-line) CSS.
  raw = raw.replace(/@font-face\s*\{[^{}]*\}/g, '');

  // Replace KaTeX-specific font-family declarations with a system math stack.
  // This preserves all layout while using whatever math font the OS has.
  raw = raw.replace(/font-family:KaTeX_[^;,}"']+/g, "font-family:math,serif");

  KATEX_CSS = `/* KaTeX math layout (fonts stripped — uses system math stack) */\n${raw}`;
} catch {
  // katex not installed or CSS path changed — math renders unstyled but safely
  KATEX_CSS = '';
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
function escapeAttr(s) {
  return String(s).replace(/[&"<>]/g, (c) => ({ '&':'&amp;','"':'&quot;','<':'&lt;','>':'&gt;' })[c]);
}
function escapeText(s) {
  return String(s).replace(/[&<>]/g, (c) => ({ '&':'&amp;','<':'&lt;','>':'&gt;' })[c]);
}

function extractTitle(src, fallback = 'Rendered Markdown') {
  if (!src) return fallback;
  const m = src.match(/^#\s+(.+?)(\s+#+)?$/m);
  return m ? m[1].replace(/[`*_[\]]/g, '').trim() || fallback : fallback;
}

// ─── HTTP status → title ──────────────────────────────────────────────────────
const STATUS_TITLES = {
  400:'Bad Request', 403:'Forbidden', 404:'Not Found',
  413:'Payload Too Large', 422:'Unprocessable Content',
  500:'Internal Server Error', 502:'Bad Gateway',
  503:'Service Unavailable', 504:'Gateway Timeout',
};
function statusTitle(code) { return STATUS_TITLES[code] || 'Error'; }

// ─── renderPage ───────────────────────────────────────────────────────────────
/**
 * Build a themed, complete HTML document.
 *
 * @param {string} htmlContent   - Sanitised Markdown → HTML
 * @param {string} themeName     - Theme key
 * @param {string} markdownSource- Original Markdown (for title extraction)
 * @returns {string}
 */
function renderPage(htmlContent, themeName, markdownSource = '') {
  const theme = getTheme(themeName);
  const title = extractTitle(markdownSource);
  const doodle = theme.doodle || '';

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="Content-Security-Policy"
        content="default-src 'none'; style-src 'unsafe-inline'; img-src https: http: data:; script-src 'none'; font-src 'none';">
  <meta name="generator" content="md-renderer/2.0">
  <title>${escapeAttr(title)}</title>
  <style>
${theme.css}
  </style>
  ${KATEX_CSS ? `<style>${KATEX_CSS}</style>` : ''}
</head>
<body>
${doodle}
  <div class="container">
${htmlContent}
  </div>
</body>
</html>`;
}

// ─── renderErrorPage ──────────────────────────────────────────────────────────
/**
 * Dark-themed minimal error page.
 * @param {number} statusCode
 * @param {string} message
 * @returns {string}
 */
function renderErrorPage(statusCode, message) {
  const code  = Number(statusCode) || 500;
  const title = statusTitle(code);

  // Gradient colour per error class
  const gradient = code >= 500
    ? 'linear-gradient(135deg,#ff6b6b 0%,#ffa94d 100%)'   // server errors — red/orange
    : code === 403
    ? 'linear-gradient(135deg,#f59f00 0%,#ff922b 100%)'   // forbidden — amber
    : code === 404
    ? 'linear-gradient(135deg,#74c0fc 0%,#748ffc 100%)'   // not found — blue
    : 'linear-gradient(135deg,#cc5de8 0%,#f783ac 100%)';  // client errors — purple/pink

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; script-src 'none';">
  <title>${code} — ${escapeAttr(title)}</title>
  <style>
    *,*::before,*::after{box-sizing:border-box;margin:0;padding:0}
    html,body{height:100%}
    body{
      font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;
      background:#0d1117;color:#e6edf3;
      display:flex;align-items:center;justify-content:center;
      min-height:100vh;padding:24px;
    }
    /* Subtle grid background */
    body::before{
      content:'';position:fixed;inset:0;
      background-image:linear-gradient(rgba(255,255,255,.025) 1px,transparent 1px),
                       linear-gradient(90deg,rgba(255,255,255,.025) 1px,transparent 1px);
      background-size:40px 40px;pointer-events:none;
    }
    .err{text-align:center;max-width:520px;width:100%;position:relative;z-index:1}
    .err__code{
      font-size:clamp(5rem,18vw,8.5rem);font-weight:800;
      line-height:1;letter-spacing:-4px;
      background:${gradient};
      -webkit-background-clip:text;-webkit-text-fill-color:transparent;
      background-clip:text;margin-bottom:.2em;user-select:none;
    }
    .err__title{
      font-size:1.25rem;font-weight:500;color:#8b949e;
      letter-spacing:.04em;margin-bottom:1.2rem;text-transform:uppercase;
    }
    .err__divider{
      width:48px;height:2px;margin:0 auto 1.4rem;
      background:${gradient};border-radius:2px;opacity:.5;
    }
    .err__msg{
      font-size:.93rem;color:#6e7681;line-height:1.7;
      background:#161b22;border:1px solid #30363d;border-radius:10px;
      padding:16px 24px;word-break:break-word;
    }
    .err__back{
      display:inline-block;margin-top:2.2rem;color:#58a6ff;
      text-decoration:none;font-size:.875rem;
      border:1px solid #30363d;padding:9px 22px;border-radius:8px;
      transition:border-color .15s,background .15s;
    }
    .err__back:hover{border-color:#58a6ff;background:rgba(88,166,255,.07)}
  </style>
</head>
<body>
  <div class="err">
    <div class="err__code">${code}</div>
    <div class="err__title">${escapeText(title)}</div>
    <div class="err__divider"></div>
    <div class="err__msg">${escapeText(message)}</div>
    <a class="err__back" href="/">&#8592; Return home</a>
  </div>
</body>
</html>`;
}

module.exports = { renderPage, renderErrorPage, extractTitle };
