/**
 * utils/sanitizer.js
 *
 * Post-render HTML sanitization layer using sanitize-html.
 *
 * Why sanitize after parsing?
 *   markdown-it renders Markdown → HTML.  Even with `html: false` in
 *   markdown-it (which drops raw HTML blocks), plugin output and edge-cases
 *   can emit attributes we don't want.  A second pass with sanitize-html
 *   gives a defence-in-depth guarantee against XSS.
 *
 * Policy:
 *   - Only a curated set of tags and attributes are allowed.
 *   - All href/src values are scheme-checked (no javascript:, data:, etc.).
 *   - External links get rel="noopener noreferrer" automatically.
 *   - Inline event handlers (onclick, onerror, …) are stripped.
 *   - <script>, <style>, <iframe>, <object>, <embed> are never allowed.
 */

'use strict';

const sanitizeHtml = require('sanitize-html');

// ─── Allowed HTML tags ────────────────────────────────────────────────────────
const ALLOWED_TAGS = [
  // Structure
  'div', 'span', 'section', 'article', 'header', 'footer', 'main',
  // Headings
  'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
  // Text
  'p', 'br', 'hr', 'wbr',
  // Inline formatting
  'strong', 'b', 'em', 'i', 'u', 's', 'del', 'ins', 'mark',
  'sub', 'sup', 'small', 'abbr', 'cite', 'q', 'dfn', 'var', 'samp', 'kbd',
  // Lists
  'ul', 'ol', 'li', 'dl', 'dt', 'dd',
  // Blockquote / pre / code
  'blockquote', 'pre', 'code',
  // Tables
  'table', 'thead', 'tbody', 'tfoot', 'tr', 'th', 'td', 'caption', 'colgroup', 'col',
  // Media
  'a', 'img', 'figure', 'figcaption',
  // Task-list checkboxes (markdown-it-task-lists output)
  'input',
  // Highlight.js wraps tokens in <span class="hljs-*">
];

// ─── Allowed attributes per tag ──────────────────────────────────────────────
const ALLOWED_ATTRS = {
  // Headings get IDs from markdown-it-anchor
  h1: ['id'], h2: ['id'], h3: ['id'], h4: ['id'], h5: ['id'], h6: ['id'],
  // Links
  a: ['href', 'title', 'name', 'target', 'rel'],
  // Images
  img: ['src', 'alt', 'title', 'width', 'height', 'loading'],
  // Tables
  th: ['align', 'scope', 'colspan', 'rowspan'],
  td: ['align', 'colspan', 'rowspan'],
  col: ['span', 'width'],
  colgroup: ['span'],
  // Code / pre get class for syntax-highlighting hooks
  code: ['class'],
  pre: ['class'],
  // Generic class/id for theme styling
  div: ['class', 'id'],
  span: ['class', 'id'],
  section: ['class', 'id'],
  // Abbreviations
  abbr: ['title'],
  // Task-list checkboxes: type="checkbox" checked disabled only
  input: ['type', 'checked', 'disabled', 'class'],
};

// ─── Sanitize configuration ───────────────────────────────────────────────────
const SANITIZE_OPTIONS = {
  allowedTags: ALLOWED_TAGS,
  allowedAttributes: ALLOWED_ATTRS,

  // Allow only safe URL schemes in href/src
  allowedSchemes: ['https', 'http', 'mailto'],
  allowedSchemesAppliedToAttributes: ['href', 'src', 'action'],
  allowProtocolRelative: false,

  // Discard unknown tags entirely rather than keeping their children
  disallowedTagsMode: 'discard',

  // Defence-in-depth: strip any attribute whose name starts with "on"
  // (covers onclick, onerror, onload, onmouseover, etc.)
  // sanitize-html's allowedAttributes already excludes these, but this
  // exclusiveFilter provides an extra guarantee for edge cases.
  exclusiveFilter: (frame) => {
    // Remove any remaining on* attributes from surviving tags
    if (frame.attribs) {
      for (const attr of Object.keys(frame.attribs)) {
        if (/^on/i.test(attr)) delete frame.attribs[attr];
      }
    }
    return false; // false = keep the element, just with cleaned attribs
  },

  // Force external links to be safe
  transformTags: {
    a: (tagName, attribs) => {
      const href = (attribs.href || '').trim();

      // Strip any href that somehow slipped through with a bad scheme
      const safe =
        href.startsWith('https://') ||
        href.startsWith('http://') ||
        href.startsWith('mailto:') ||
        href.startsWith('#');

      return {
        tagName,
        attribs: {
          ...attribs,
          href: safe ? href : '#',
          // Open external links in new tab safely
          target: href.startsWith('#') ? undefined : '_blank',
          rel: href.startsWith('#') ? undefined : 'noopener noreferrer',
        },
      };
    },

    // Ensure checkbox inputs are really just read-only checkboxes
    input: (_tagName, attribs) => {
      if (attribs.type !== 'checkbox') return false; // drop non-checkboxes
      return {
        tagName: 'input',
        attribs: {
          type: 'checkbox',
          ...(attribs.checked !== undefined ? { checked: '' } : {}),
          disabled: '',
          class: attribs.class || '',
        },
      };
    },
  },
};

/**
 * Sanitize an HTML string, stripping any tags/attributes not in the allowlist.
 *
 * @param {string} html - Raw HTML from the Markdown parser.
 * @returns {string} Safe HTML, ready to embed in a page.
 */
function sanitize(html) {
  return sanitizeHtml(html, SANITIZE_OPTIONS);
}

module.exports = { sanitize };
// (module.exports stays the same — the block below is a no-op re-export guard)
