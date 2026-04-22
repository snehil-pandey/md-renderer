/**
 * services/parser.js
 *
 * Converts raw Markdown text into sanitized HTML using markdown-it.
 *
 * Plugin stack:
 *  - markdown-it core           — CommonMark + linkify + typographer
 *  - markdown-it-task-lists     — GitHub-style [ ] / [x] checkboxes
 *  - markdown-it-anchor         — Auto-linked heading anchors (#id)
 *  - highlight.js               — Server-side syntax highlighting for fenced code
 *
 * Security:
 *  - `html: false` — raw HTML blocks in Markdown are escaped, not injected
 *  - Output passes through sanitize-html (see utils/sanitizer.js)
 *
 * Error shape: { code: 422, message: string }
 */

'use strict';

const MarkdownIt  = require('markdown-it');
const taskLists   = require('markdown-it-task-lists');
const anchor      = require('markdown-it-anchor');
const hljs        = require('highlight.js');
const { sanitize } = require('../utils/sanitizer');

// ── Syntax highlighter ────────────────────────────────────────────────────────
/**
 * Called by markdown-it for every fenced code block.
 * Returns a full <pre><code> block so the default fence renderer is bypassed.
 *
 * @param {string} str  - Raw source code inside the fence.
 * @param {string} lang - Language tag (e.g. "js", "python", "").
 * @returns {string} HTML string.
 */
function highlight(str, lang) {
  // Wrap in our own classes so CSS themes can target them consistently.
  const wrap = (inner, detectedLang) =>
    `<pre class="hljs-pre"><code class="hljs${detectedLang ? ` language-${detectedLang}` : ''}">${inner}</code></pre>`;

  if (lang && hljs.getLanguage(lang)) {
    try {
      const result = hljs.highlight(str, { language: lang, ignoreIllegals: true });
      return wrap(result.value, lang);
    } catch {
      // Fall through to auto-detection
    }
  }

  // Try auto-detection (works well for short snippets)
  try {
    const result = hljs.highlightAuto(str);
    return wrap(result.value, result.language || '');
  } catch {
    // Final fallback: plain escaped text
    return wrap(MarkdownIt().utils.escapeHtml(str), '');
  }
}

// ── markdown-it instance ──────────────────────────────────────────────────────
const md = new MarkdownIt({
  // html: false — do not pass raw HTML through from Markdown source.
  //              This is the primary XSS defence at the parse level.
  html: false,

  // xhtmlOut: true — self-close void elements (<br />, <img />, …)
  xhtmlOut: true,

  // breaks: false — don't convert single \n to <br> (GitHub default)
  breaks: false,

  // linkify: true — auto-link plain URLs in text
  linkify: true,

  // typographer: true — smart quotes, dashes, ellipsis
  typographer: true,

  // highlight — our hljs-backed function above
  highlight,
})
  // GitHub-style [ ] and [x] task-list items
  .use(taskLists, {
    enabled: true,   // render as <input type="checkbox">
    label: true,     // wrap in <label> for accessibility
    labelAfter: false,
  })
  // Auto-generate id attributes on headings and a self-link anchor
  .use(anchor, {
    permalink: anchor.permalink.headerLink({
      safariReaderFix: true,
    }),
    slugify: (s) =>
      s
        .toLowerCase()
        .replace(/[^\w\s-]/g, '')  // strip non-word chars
        .replace(/\s+/g, '-')       // spaces → hyphens
        .replace(/^-+|-+$/g, ''),  // trim leading/trailing hyphens
  });

// ── Table alignment — ensure align attr survives sanitization ─────────────────
// markdown-it renders `style="text-align:…"` on <th>/<td>.
// Our sanitizer strips style; instead, we convert to an `align` attribute.
const originalTableCellOpen = md.renderer.rules.th_open || defaultRule;
const originalTdOpen        = md.renderer.rules.td_open || defaultRule;

function defaultRule(tokens, idx, options, _env, self) {
  return self.renderToken(tokens, idx, options);
}

function convertStyleToAlign(tokens, idx, options, env, self) {
  const token = tokens[idx];
  // Find the `style` attribute emitted by markdown-it for alignment
  const styleIdx = token.attrIndex('style');
  if (styleIdx >= 0) {
    const style = token.attrs[styleIdx][1];
    const match  = style.match(/text-align:\s*(left|center|right)/);
    if (match) {
      token.attrs.splice(styleIdx, 1);            // remove `style`
      token.attrSet('align', match[1]);           // add `align`
    }
  }
  return self.renderToken(tokens, idx, options);
}

md.renderer.rules.th_open = convertStyleToAlign;
md.renderer.rules.td_open = convertStyleToAlign;

// ── Public API ────────────────────────────────────────────────────────────────
/**
 * Parse Markdown text and return sanitized HTML.
 *
 * @param {string} markdownText - Raw Markdown source.
 * @returns {string} Safe HTML string.
 * @throws {{ code: 422, message: string }}
 */
function parseMarkdown(markdownText) {
  if (typeof markdownText !== 'string') {
    throw { code: 422, message: 'Markdown input is not a string.' };
  }

  let rawHtml;
  try {
    rawHtml = md.render(markdownText);
  } catch (err) {
    throw { code: 422, message: `Markdown parsing failed: ${err.message}` };
  }

  // Post-render sanitization pass (defence-in-depth against XSS)
  let safeHtml;
  try {
    safeHtml = sanitize(rawHtml);
  } catch (err) {
    throw { code: 422, message: `HTML sanitization failed: ${err.message}` };
  }

  return safeHtml;
}

module.exports = { parseMarkdown };
