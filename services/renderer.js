/**
 * services/renderer.js
 *
 * Two public functions:
 *
 *   renderPage(htmlContent, options)
 *     Called when renderOn === 'server'. Receives the already-parsed HTML
 *     and wraps it in a complete, themed document.
 *
 *   renderClientPage(rawMarkdown, options)
 *     Called when renderOn === 'client'. The server has already fetched
 *     and cached the markdown source. This function embeds it as a JSON
 *     string in the page and includes a small inline script that runs
 *     markdown-it in the browser. The server does zero parsing work.
 *     The theme's CSS is still applied server-side so the page looks right
 *     before the JS finishes — progressive enhancement, not a blank flash.
 *
 *   renderErrorPage(statusCode, message)
 *     Dark-themed error page. Not themed — always the same dark layout
 *     regardless of what theme the request was using.
 *
 * options shape
 * ─────────────
 * {
 *   theme        : object    — theme definition ({ css, doodle, renderOn, label })
 *   title        : string|null  — explicit page title; overrides h1 extraction
 *   favicon      : string|null  — https URL, data: URI, or emoji char
 *   markdownSource: string      — raw Markdown (used for h1 title extraction)
 * }
 *
 * KaTeX CSS
 * ─────────
 * We read katex.min.css at startup and strip @font-face rules, then replace
 * KaTeX font-family values with a system math stack. The result is inlined
 * once per page. Math renders using whatever font the OS provides, which is
 * always correct on modern systems and means zero external requests.
 *
 * Favicon handling
 * ────────────────
 * Three accepted formats:
 *   https://… URL        → <link rel="icon" href="…">
 *   data:image/… URI     → <link rel="icon" href="…"> (inlined)
 *   single emoji char    → converted to an inline SVG data URI
 */

'use strict';

const fs   = require('fs');
const path = require('path');
const { getTheme } = require('./themeEngine');

// ─── KaTeX CSS — stripped and inlined once at startup ────────────────────────
let KATEX_CSS = '';
try {
  const cssPath = path.join(__dirname, '..', 'node_modules', 'katex', 'dist', 'katex.min.css');
  let raw = fs.readFileSync(cssPath, 'utf8');
  raw = raw.replace(/@font-face\s*\{[^{}]*\}/g, '');
  raw = raw.replace(/font-family:KaTeX_[^;,}"']+/g, 'font-family:math,serif');
  KATEX_CSS = raw;
} catch { KATEX_CSS = ''; }

// ─── Helpers ──────────────────────────────────────────────────────────────────
function esc(s) {
  return String(s).replace(/[&"<>]/g, c => ({ '&':'&amp;','"':'&quot;','<':'&lt;','>':'&gt;' })[c]);
}
function escText(s) {
  return String(s).replace(/[&<>]/g, c => ({ '&':'&amp;','<':'&lt;','>':'&gt;' })[c]);
}

/** Pull the first H1 text out of Markdown source for use as <title>. */
function extractTitle(src) {
  if (!src) return null;
  const m = src.match(/^#\s+(.+?)(\s+#+)?$/m);
  return m ? m[1].replace(/[`*_[\]]/g, '').trim() : null;
}

/**
 * Build the <link rel="icon"> tag from the favicon option.
 * Supports https URLs, data URIs, and emoji.
 */
function faviconTag(favicon) {
  if (!favicon) return '';

  // Emoji → tiny inline SVG
  if (!favicon.startsWith('http') && !favicon.startsWith('data:')) {
    const emoji  = [...favicon][0] || '';
    const svgSrc = `data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'><text y='.9em' font-size='90'>${emoji}</text></svg>`;
    return `<link rel="icon" href="${esc(svgSrc)}">`;
  }

  return `<link rel="icon" href="${esc(favicon)}">`;
}

// ─── HTTP status → readable title ─────────────────────────────────────────────
const STATUS_TITLES = {
  400:'Bad Request', 403:'Forbidden', 404:'Not Found',
  413:'Payload Too Large', 422:'Unprocessable Content',
  500:'Internal Server Error', 502:'Bad Gateway',
  503:'Service Unavailable', 504:'Gateway Timeout',
};

// ─── renderPage — server-side ─────────────────────────────────────────────────
/**
 * @param {string} htmlContent   — sanitised Markdown → HTML
 * @param {object} options       — { theme, title, favicon, markdownSource }
 * @returns {string}
 */
function renderPage(htmlContent, options = {}) {
  const { theme, title: explicitTitle, favicon, markdownSource = '' } = options;

  const resolvedTheme = theme || getTheme('documentation');
  const pageTitle     = explicitTitle || extractTitle(markdownSource) || 'Rendered Markdown';
  const doodle        = resolvedTheme.doodle || '';

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="Content-Security-Policy"
        content="default-src 'none'; style-src 'unsafe-inline'; img-src https: http: data: blob:; script-src 'none'; font-src 'none';">
  <meta name="generator" content="md-renderer/3.0">
  ${faviconTag(favicon)}
  <title>${esc(pageTitle)}</title>
  <style>${resolvedTheme.css}</style>
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

// ─── renderClientPage — client-side ──────────────────────────────────────────
/**
 * The server embeds the raw Markdown as a JSON string and ships a small
 * inline script that renders it using markdown-it loaded from jsDelivr.
 *
 * Why jsDelivr and not self-hosted?
 *   Bundling and inlining markdown-it (~72KB) + DOMPurify (~45KB) for every
 *   client-side response would make each page ~120KB heavier than the
 *   server-rendered equivalent. jsDelivr is globally cached — on a browser
 *   that has visited any page using the same CDN URLs, the scripts are
 *   already in the disk cache. Net transfer: near zero.
 *
 *   If you need fully offline client-side rendering, replace the CDN
 *   <script src> with a local /static/ route that serves these files.
 *
 * CSP adjustment:
 *   Client pages relax script-src to allow jsDelivr and unsafe-inline
 *   (needed for the tiny initialisation script). Style-src remains
 *   unsafe-inline (same as server pages). No other permissions change.
 *
 * @param {string} rawMarkdown   — raw Markdown source (embedded as JSON string)
 * @param {object} options       — { theme, title, favicon }
 * @returns {string}
 */
function renderClientPage(rawMarkdown, options = {}) {
  const { theme, title: explicitTitle, favicon } = options;
  const resolvedTheme = theme || getTheme('documentation');

  // We don't have HTML yet (no server parsing), so title comes from explicit
  // option or a fast regex over the raw Markdown.
  const pageTitle = explicitTitle || extractTitle(rawMarkdown) || 'Rendered Markdown';
  const doodle    = resolvedTheme.doodle || '';

  // The raw Markdown is JSON.stringified so it's safe to embed inside a JS string.
  const encodedMd = JSON.stringify(rawMarkdown);

  // CDN versions — pin these so cached copies are reused across pages.
  const MD_IT_CDN  = 'https://cdn.jsdelivr.net/npm/markdown-it@14/dist/markdown-it.min.js';
  const PURIFY_CDN = 'https://cdn.jsdelivr.net/npm/dompurify@3/dist/purify.min.js';
  const HLJS_CDN   = 'https://cdn.jsdelivr.net/npm/highlight.js@11/build/highlight.min.js';
  const HLJS_CSS   = 'https://cdn.jsdelivr.net/npm/highlight.js@11/styles/github.min.css';

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="Content-Security-Policy"
        content="default-src 'none'; style-src 'unsafe-inline' https://cdn.jsdelivr.net; img-src https: http: data: blob:; script-src https://cdn.jsdelivr.net 'unsafe-inline'; font-src 'none';">
  <meta name="generator" content="md-renderer/3.0 client-render">
  ${faviconTag(favicon)}
  <title>${esc(pageTitle)}</title>
  <style>${resolvedTheme.css}</style>
  <link rel="stylesheet" href="${HLJS_CSS}">
  ${KATEX_CSS ? `<style>${KATEX_CSS}</style>` : ''}
</head>
<body>
${doodle}
<div class="container" id="md-container">
  <p style="color:#888;font-family:system-ui;padding:2rem">Rendering…</p>
</div>
<script type="application/json" id="md-source">${encodedMd}</script>
<script src="${MD_IT_CDN}" defer></script>
<script src="${PURIFY_CDN}" defer></script>
<script src="${HLJS_CDN}" defer></script>
<script>
// Runs after all defer scripts have loaded.
// markdown-it, DOMPurify, and hljs are now available as globals.
document.addEventListener('DOMContentLoaded', function () {
  var raw  = JSON.parse(document.getElementById('md-source').textContent);
  var cont = document.getElementById('md-container');

  var md = window.markdownit({
    html:       false,
    linkify:    true,
    typographer: true,
    highlight: function (str, lang) {
      if (lang && window.hljs && window.hljs.getLanguage(lang)) {
        try {
          return '<pre class="hljs-pre"><code class="hljs language-' + lang + '">' +
                 window.hljs.highlight(str, { language: lang, ignoreIllegals: true }).value +
                 '</code></pre>';
        } catch (e) {}
      }
      return '<pre class="hljs-pre"><code class="hljs">' +
             md.utils.escapeHtml(str) + '</code></pre>';
    }
  });

  var rawHtml  = md.render(raw);
  var safeHtml = window.DOMPurify
    ? DOMPurify.sanitize(rawHtml, { FORBID_TAGS: ['script','style'], FORBID_ATTR: ['onerror','onclick','onload'] })
    : rawHtml;  // fallback: DOMPurify not loaded yet (should not happen with defer)

  cont.innerHTML = safeHtml;
});
</script>
</body>
</html>`;
}

// ─── renderErrorPage ──────────────────────────────────────────────────────────
/**
 * @param {number} statusCode
 * @param {string} message
 * @returns {string}
 */
function renderErrorPage(statusCode, message) {
  const code  = Number(statusCode) || 500;
  const title = STATUS_TITLES[code] || 'Error';
  const gradient = code >= 500
    ? 'linear-gradient(135deg,#ff6b6b,#ffa94d)'
    : code === 403
    ? 'linear-gradient(135deg,#f59f00,#ff922b)'
    : code === 404
    ? 'linear-gradient(135deg,#74c0fc,#748ffc)'
    : 'linear-gradient(135deg,#cc5de8,#f783ac)';

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; script-src 'none';">
  <title>${code} — ${esc(title)}</title>
  <style>
    *,*::before,*::after{box-sizing:border-box;margin:0;padding:0}
    html,body{height:100%}
    body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;
         background:#0d1117;color:#e6edf3;
         display:flex;align-items:center;justify-content:center;
         min-height:100vh;padding:24px}
    body::before{content:'';position:fixed;inset:0;
      background-image:linear-gradient(rgba(255,255,255,.025) 1px,transparent 1px),
                       linear-gradient(90deg,rgba(255,255,255,.025) 1px,transparent 1px);
      background-size:40px 40px;pointer-events:none}
    .e{text-align:center;max-width:520px;width:100%;position:relative;z-index:1}
    .e__code{font-size:clamp(5rem,18vw,8.5rem);font-weight:800;line-height:1;
             letter-spacing:-4px;background:${gradient};
             -webkit-background-clip:text;-webkit-text-fill-color:transparent;
             background-clip:text;margin-bottom:.2em;user-select:none}
    .e__title{font-size:1.2rem;font-weight:500;color:#8b949e;
              letter-spacing:.04em;margin-bottom:1.2rem;text-transform:uppercase}
    .e__bar{width:48px;height:2px;margin:0 auto 1.4rem;
            background:${gradient};border-radius:2px;opacity:.5}
    .e__msg{font-size:.93rem;color:#6e7681;line-height:1.7;
            background:#161b22;border:1px solid #30363d;border-radius:10px;
            padding:16px 24px;word-break:break-word}
    .e__back{display:inline-block;margin-top:2rem;color:#58a6ff;
             text-decoration:none;font-size:.875rem;
             border:1px solid #30363d;padding:9px 22px;border-radius:8px}
    .e__back:hover{border-color:#58a6ff;background:rgba(88,166,255,.07)}
  </style>
</head>
<body>
  <div class="e">
    <div class="e__code">${code}</div>
    <div class="e__title">${escText(title)}</div>
    <div class="e__bar"></div>
    <div class="e__msg">${escText(message)}</div>
    <a class="e__back" href="/">&#8592; Return home</a>
  </div>
</body>
</html>`;
}

module.exports = { renderPage, renderClientPage, renderErrorPage, extractTitle };
