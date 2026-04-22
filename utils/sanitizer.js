/**
 * utils/sanitizer.js
 *
 * Post-render HTML sanitisation layer.
 *
 * Defence-in-depth:
 *   markdown-it already escapes raw HTML (html:false), but plugins
 *   (emoji, footnotes, KaTeX, containers) generate trusted HTML that
 *   needs to survive the sanitiser. This allowlist is tuned so that
 *   all plugin output passes through intact while genuine XSS vectors
 *   (script, event handlers, dangerous schemes) are stripped.
 *
 * KaTeX note:
 *   KaTeX renders math to <span> elements with inline `style` attributes
 *   for sizing and positioning. We allow `style` on spans but NOT on
 *   arbitrary elements, and we validate it below. The alternative —
 *   stripping style — would break all math rendering.
 */

'use strict';

const sanitizeHtml = require('sanitize-html');

const ALLOWED_TAGS = [
  // Structure
  'div','span','section','article','header','footer','main','nav','aside',
  // Headings
  'h1','h2','h3','h4','h5','h6',
  // Text
  'p','br','hr','wbr',
  // Inline
  'strong','b','em','i','u','s','del','ins','mark',
  'sub','sup','small','abbr','cite','q','dfn','var','samp','kbd',
  // Lists
  'ul','ol','li','dl','dt','dd',
  // Quote / code
  'blockquote','pre','code',
  // Tables
  'table','thead','tbody','tfoot','tr','th','td','caption','colgroup','col',
  // Media
  'a','img','figure','figcaption','picture','source',
  // Forms (checkboxes only for task lists)
  'input','label',
  // Highlight.js + KaTeX use spans heavily
  // Footnotes use <section class="footnotes"> and <hr class="footnotes-sep">
  // Containers use <div class="custom-container ...">
  // Emoji are plain Unicode text / <img> — already covered
  // Math: KaTeX uses nested spans with style — covered by span rule
  // Details/summary for collapsible containers
  'details','summary',
];

const ALLOWED_ATTRS = {
  // Anchors
  h1:['id'], h2:['id'], h3:['id'], h4:['id'], h5:['id'], h6:['id'],
  a: ['href','title','name','target','rel','id'],
  img: ['src','alt','title','width','height','loading','class'],
  // Tables
  th: ['align','scope','colspan','rowspan'],
  td: ['align','colspan','rowspan'],
  col: ['span','width'],
  colgroup: ['span'],
  // Code highlighting
  code: ['class'],
  pre:  ['class'],
  // Containers, emoji wrappers, KaTeX, footnotes all use div/span with class
  div:     ['class','id','data-info'],
  span:    ['class','id','style'],   // style needed for KaTeX layout
  section: ['class','id'],
  // Task lists
  input: ['type','checked','disabled','class','id'],
  label: ['for','class'],
  // Details
  details: ['class','open'],
  summary: ['class'],
  // Generic
  abbr: ['title'],
  figure: ['class'],
  figcaption: ['class'],
};

// CSS properties KaTeX actually emits — anything else is stripped
const SAFE_CSS_PROPS = new Set([
  'height','width','vertical-align','top','bottom','left','right',
  'margin-top','margin-bottom','margin-left','margin-right',
  'padding-top','padding-bottom','padding-left','padding-right',
  'font-size','min-width','max-width','min-height','max-height',
  'display','position','border','border-radius','overflow',
]);

function filterKatexStyle(styleValue) {
  if (!styleValue) return undefined;
  const parts = styleValue.split(';').map(s => s.trim()).filter(Boolean);
  const safe = parts.filter(decl => {
    const prop = decl.split(':')[0].trim().toLowerCase();
    return SAFE_CSS_PROPS.has(prop);
  });
  return safe.length ? safe.join(';') + ';' : undefined;
}

const SANITIZE_OPTIONS = {
  allowedTags: ALLOWED_TAGS,
  allowedAttributes: ALLOWED_ATTRS,
  allowedSchemes: ['https','http','mailto'],
  allowedSchemesAppliedToAttributes: ['href','src','action'],
  allowProtocolRelative: false,
  disallowedTagsMode: 'discard',

  // Strip on* attributes and filter span style to KaTeX-safe props only
  exclusiveFilter: (frame) => {
    if (frame.attribs) {
      for (const attr of Object.keys(frame.attribs)) {
        if (/^on/i.test(attr)) delete frame.attribs[attr];
      }
      // Filter style on spans to only KaTeX-safe properties
      if (frame.tag === 'span' && frame.attribs.style) {
        const filtered = filterKatexStyle(frame.attribs.style);
        if (filtered) frame.attribs.style = filtered;
        else delete frame.attribs.style;
      }
    }
    return false;
  },

  transformTags: {
    a: (tagName, attribs) => {
      const href = (attribs.href || '').trim();
      const safe = href.startsWith('https://') || href.startsWith('http://')
                || href.startsWith('mailto:') || href.startsWith('#');
      return {
        tagName,
        attribs: {
          ...attribs,
          href: safe ? href : '#',
          ...(href.startsWith('#') ? {} : { target: '_blank', rel: 'noopener noreferrer' }),
        },
      };
    },
    input: (_t, attribs) => {
      if (attribs.type !== 'checkbox') return false;
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

function sanitize(html) {
  return sanitizeHtml(html, SANITIZE_OPTIONS);
}

module.exports = { sanitize };
