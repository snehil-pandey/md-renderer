/**
 * services/parser.js
 *
 * Converts raw Markdown to sanitised HTML using markdown-it with a full
 * extension stack modelled on what GitHub + GitLab render natively.
 *
 * EXTENSION STACK
 * ┌──────────────────────────┬────────────────────────────────────────────────┐
 * │ Extension                │ Syntax                                         │
 * ├──────────────────────────┼────────────────────────────────────────────────┤
 * │ Task lists               │ - [x] done  / - [ ] todo                       │
 * │ Heading anchors          │ auto-id + self-link                             │
 * │ Syntax highlighting      │ ```lang … ``` (highlight.js server-side)        │
 * │ Mermaid diagrams         │ ```mermaid … ``` → mermaid.ink SVG image        │
 * │ KaTeX inline math        │ $e = mc^2$                                      │
 * │ KaTeX display math       │ $$\int_0^\infty e^{-x}\,dx = 1$$              │
 * │ Footnotes                │ [^1] / [^1]: text                               │
 * │ Subscript / Superscript  │ H~2~O  /  E=mc^2^                              │
 * │ Emoji                    │ :rocket: :tada: (GitHub shortcodes)             │
 * │ Custom containers        │ ::: warning … :::                               │
 * │ Definition lists         │ Term \n: Definition                             │
 * │ Abbreviations            │ *[HTML]: HyperText Markup Language              │
 * │ Tables                   │ GFM-style pipe tables                           │
 * │ Linkify                  │ bare https:// → <a>                             │
 * │ Typographer              │ smart quotes, dashes, ellipsis                  │
 * └──────────────────────────┴────────────────────────────────────────────────┘
 *
 * MERMAID APPROACH
 *   Server-side Mermaid rendering requires a headless browser (Puppeteer),
 *   which is far too heavy for low-end hardware targets. Instead we detect
 *   ```mermaid fences and convert them to <img> tags pointing to mermaid.ink —
 *   a public, free SVG rendering service. This keeps the server dependency-free
 *   while producing the same visual output. Diagrams render on first page load
 *   (one tiny HTTP request from the *browser*, not the server).
 *
 * KATEX APPROACH
 *   katex.renderToString() generates pure HTML+CSS (no fonts needed for basic
 *   math). The output uses <span> elements with inline style attributes for
 *   positioning. Our sanitiser preserves KaTeX-safe CSS properties only.
 */

'use strict';

const MarkdownIt  = require('markdown-it');
const taskLists   = require('markdown-it-task-lists');
const anchor      = require('markdown-it-anchor');
const hljs        = require('highlight.js');
const emoji       = require('markdown-it-emoji');
const footnote    = require('markdown-it-footnote');
const sub         = require('markdown-it-sub');
const sup         = require('markdown-it-sup');
const container   = require('markdown-it-container');
const deflist     = require('markdown-it-deflist');
const abbr        = require('markdown-it-abbr');
const katex       = require('katex');

const { sanitize } = require('../utils/sanitizer');

// ─── Syntax highlighter ───────────────────────────────────────────────────────
function highlight(str, lang) {
  const wrap = (inner, l) =>
    `<pre class="hljs-pre"><code class="hljs${l ? ` language-${l}` : ''}">${inner}</code></pre>`;

  if (lang && hljs.getLanguage(lang)) {
    try { return wrap(hljs.highlight(str, { language: lang, ignoreIllegals: true }).value, lang); }
    catch {}
  }
  try {
    const r = hljs.highlightAuto(str);
    return wrap(r.value, r.language || '');
  } catch {
    return wrap(MarkdownIt().utils.escapeHtml(str), '');
  }
}

// ─── Mermaid → mermaid.ink image URL ─────────────────────────────────────────
// mermaid.ink accepts base64-encoded Mermaid source and returns an SVG.
// No npm dependencies required; the browser makes one lightweight request.
function mermaidToImg(source) {
  const encoded = Buffer.from(source.trim()).toString('base64');
  const url = `https://mermaid.ink/img/${encoded}?type=svg`;
  return (
    `<figure class="mermaid-diagram">` +
    `<img src="${url}" alt="Mermaid diagram" loading="lazy" style="max-width:100%;display:block">` +
    `</figure>`
  );
}

// ─── KaTeX render helpers ─────────────────────────────────────────────────────
function renderMath(src, displayMode) {
  try {
    return katex.renderToString(src, {
      displayMode,
      throwOnError: false,
      output: 'html',        // pure HTML spans, no MathML
      strict: false,
    });
  } catch (e) {
    // Render a visible error rather than crashing the whole page
    return `<span class="math-error" title="${e.message}">${src}</span>`;
  }
}

// ─── Inline KaTeX plugin for markdown-it ─────────────────────────────────────
// Handles:  $inline math$   and   $$\ndisplay math\n$$
function mathPlugin(md) {
  // ── Display math: $$ ... $$ (block-level) ─────────────────────────────────
  md.block.ruler.before('fence', 'math_block', (state, start, end, silent) => {
    let pos = state.bMarks[start] + state.tShift[start];
    const max = state.eMarks[start];
    if (pos + 2 > max) return false;
    if (state.src.slice(pos, pos + 2) !== '$$') return false;

    pos += 2;
    let firstLine = state.src.slice(pos, max).trim();
    if (firstLine.endsWith('$$')) {
      firstLine = firstLine.slice(0, -2).trim();
      if (silent) return true;
      const token = state.push('math_block', 'math', 0);
      token.content = firstLine;
      token.map = [start, state.line];
      state.line = start + 1;
      return true;
    }

    // Multi-line: search for closing $$
    let nextLine = start;
    let hasEnding = false;
    while (++nextLine < end) {
      const lineStart = state.bMarks[nextLine] + state.tShift[nextLine];
      const lineEnd   = state.eMarks[nextLine];
      const line      = state.src.slice(lineStart, lineEnd).trim();
      if (line === '$$') { hasEnding = true; break; }
    }
    if (!hasEnding) return false;
    if (silent) return true;

    const lines = [];
    for (let i = start + 1; i < nextLine; i++) {
      lines.push(state.src.slice(state.bMarks[i] + state.tShift[i], state.eMarks[i]));
    }
    const token = state.push('math_block', 'math', 0);
    token.content = (firstLine ? firstLine + '\n' : '') + lines.join('\n');
    token.map = [start, nextLine + 1];
    state.line = nextLine + 1;
    return true;
  }, { alt: ['paragraph', 'reference', 'blockquote', 'list'] });

  // ── Inline math: $...$ ─────────────────────────────────────────────────────
  md.inline.ruler.before('escape', 'math_inline', (state, silent) => {
    if (state.src[state.pos] !== '$') return false;
    if (state.src[state.pos + 1] === '$') return false;   // leave for block rule

    let pos = state.pos + 1;
    let found = false;
    while (pos < state.posMax) {
      if (state.src[pos] === '$' && state.src[pos - 1] !== '\\') { found = true; break; }
      pos++;
    }
    if (!found || pos === state.pos + 1) return false;

    const content = state.src.slice(state.pos + 1, pos);
    if (content.trim().length === 0) return false;

    if (!silent) {
      const token  = state.push('math_inline', '', 0);
      token.markup = '$';
      token.content = content;
    }
    state.pos = pos + 1;
    return true;
  });

  // ── Renderers ─────────────────────────────────────────────────────────────
  md.renderer.rules.math_inline = (tokens, idx) =>
    renderMath(tokens[idx].content, false);

  md.renderer.rules.math_block = (tokens, idx) =>
    `<div class="math-display">${renderMath(tokens[idx].content, true)}</div>\n`;
}

// ─── Custom container variants ────────────────────────────────────────────────
// Supports:  ::: tip, ::: warning, ::: danger, ::: info, ::: details
const CONTAINER_TYPES = ['tip', 'warning', 'danger', 'info', 'note', 'details'];

// ─── markdown-it instance ─────────────────────────────────────────────────────
const md = new MarkdownIt({
  html:       false,    // raw HTML in source is escaped (XSS guard)
  xhtmlOut:   true,
  breaks:     false,    // \n in para → <br> only when true (GitHub = false)
  linkify:    true,
  typographer: true,
  highlight,
})
  .use(mathPlugin)
  .use(taskLists, { enabled: true, label: true, labelAfter: false })
  .use(anchor, {
    permalink: anchor.permalink.headerLink({ safariReaderFix: true }),
    slugify: (s) => s.toLowerCase().replace(/[^\w\s-]/g,'').replace(/\s+/g,'-').replace(/^-+|-+$/g,''),
  })
  .use(emoji.full)
  .use(footnote)
  .use(sub)
  .use(sup)
  .use(deflist)
  .use(abbr);

// Register container types
for (const type of CONTAINER_TYPES) {
  md.use(container, type, {
    render(tokens, idx) {
      const token = tokens[idx];
      const info  = token.info.trim().slice(type.length).trim();
      if (token.nesting === 1) {
        const label = info || (type.charAt(0).toUpperCase() + type.slice(1));
        return `<div class="custom-container custom-container--${type}">\n`
             + `<p class="custom-container__title">${md.utils.escapeHtml(label)}</p>\n`;
      }
      return '</div>\n';
    },
  });
}

// ─── Custom fence renderer: intercept ```mermaid ──────────────────────────────
const defaultFence = md.renderer.rules.fence || ((t, i, o, _e, self) => self.renderToken(t, i, o));

md.renderer.rules.fence = (tokens, idx, options, env, self) => {
  const token = tokens[idx];
  const lang  = (token.info || '').trim().toLowerCase();

  if (lang === 'mermaid') {
    return mermaidToImg(token.content);
  }
  return defaultFence(tokens, idx, options, env, self);
};

// ─── Table align → attribute (sanitiser strips style) ────────────────────────
function alignRule(tokens, idx, options, _env, self) {
  const token   = tokens[idx];
  const styleIdx = token.attrIndex('style');
  if (styleIdx >= 0) {
    const m = token.attrs[styleIdx][1].match(/text-align:\s*(left|center|right)/);
    if (m) { token.attrs.splice(styleIdx, 1); token.attrSet('align', m[1]); }
  }
  return self.renderToken(tokens, idx, options);
}
md.renderer.rules.th_open = alignRule;
md.renderer.rules.td_open = alignRule;

// ─── Public API ───────────────────────────────────────────────────────────────
/**
 * Parse Markdown text → sanitised HTML.
 * @param {string} markdownText
 * @returns {string}
 * @throws {{ code: 422, message: string }}
 */
function parseMarkdown(markdownText) {
  if (typeof markdownText !== 'string') {
    throw { code: 422, message: 'Markdown input is not a string.' };
  }
  let raw;
  try { raw = md.render(markdownText); }
  catch (e) { throw { code: 422, message: `Markdown parsing failed: ${e.message}` }; }

  try { return sanitize(raw); }
  catch (e) { throw { code: 422, message: `HTML sanitisation failed: ${e.message}` }; }
}

module.exports = { parseMarkdown };
