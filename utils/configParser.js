/**
 * utils/configParser.js
 *
 * Everything that comes into the API — whether from query params or a remote
 * JSON file — gets normalised into a single RenderConfig object here.
 *
 * That single object is all the pipeline (services/pipeline.js) ever sees.
 * Routes don't make rendering decisions. The pipeline doesn't parse URLs.
 * Each layer only knows what it needs.
 *
 * RenderConfig shape
 * ──────────────────
 * {
 *   mdUrl      : URL | null      — validated URL object, or null if using local README
 *   title      : string | null   — overrides the first-heading title extraction
 *   favicon    : string | null   — https URL, data: URI, or single emoji character
 *   theme      : string          — built-in theme key (falls back to 'documentation')
 *   customTheme: object | null   — inline theme definition from JSON config
 *     ├ renderOn : always 'client' — JSON-defined themes ALWAYS render in the browser.
 *     │            renderOn is a codebase-only field. Users cannot set it.
 *     │            Reasoning: custom CSS is untrusted, potentially heavy, and may
 *     │            depend on browser APIs. Server-side rendering is a privilege
 *     │            reserved for built-in themes that have been reviewed.
 *     ├ label    : string             — display name
 *     ├ css      : string             — complete self-contained CSS
 *     └ doodle   : string             — raw SVG string, or ''
 * }
 *
 * Sources and precedence
 * ──────────────────────
 * When ?config=<url> is given, the JSON at that URL is fetched and its fields
 * become the base. Query params (?theme=, ?title=) layered on top of that base,
 * but the JSON's customTheme object is only ever sourced from the JSON —
 * you can't pass an inline theme object through a query string.
 *
 * Inline theme in JSON (full example)
 * ─────────────────────────────────────
 * {
 *   "md":      "https://raw.githubusercontent.com/...",
 *   "title":   "My Docs",
 *   "favicon": "https://example.com/icon.png",
 *   "theme": {
 *     "label":  "Dark Night",
 *     "css":    "body { background: #0d1117; color: #c9d1d9; } .container { max-width: 900px; margin: 0 auto; }",
 *     "doodle": ""
 *   }
 * }
 *
 * Note: there is no "renderOn" field for user-defined themes. They always
 * render in the browser (client-side). Only built-in themes in themeEngine.js
 * can use renderOn: 'server'.
 *
 * Or reference a built-in theme by name:
 * {
 *   "md":    "https://...",
 *   "theme": "poem"
 * }
 */

'use strict';

const { listThemes, DEFAULT_THEME } = require('../services/themeEngine');
const { validateMarkdownUrl }        = require('./validator');

// Minimum CSS length — catches empty or placeholder CSS before the pipeline
// wastes time on a page that will look broken.
const MIN_CSS_LENGTH = 20;

/**
 * Build a RenderConfig from raw query params (no JSON config involved).
 *
 * @param {object} query  — Express req.query
 * @returns {{ config: RenderConfig } | { error: { code, message } }}
 */
function fromQuery(query) {
  const { md, theme, title, favicon } = query;

  let mdUrl = null;
  if (md) {
    const v = validateMarkdownUrl(md);
    if (!v.valid) return { error: { code: v.code, message: v.message } };
    mdUrl = v.url;
  }

  return {
    config: {
      mdUrl,
      title:       title   ? String(title).slice(0, 200)   : null,
      favicon:     favicon ? String(favicon).slice(0, 2048) : null,
      theme:       resolveThemeName(theme),
      customTheme: null,
    },
  };
}

/**
 * Build a RenderConfig by merging a fetched JSON config with query params.
 * Query params act as overrides so a single config file can be shared while
 * individual links can still pin a different theme or title.
 *
 * @param {string} rawJson  — The fetched config file content (string)
 * @param {object} query    — Express req.query (for overrides)
 * @returns {{ config: RenderConfig } | { error: { code, message } }}
 */
function fromJson(rawJson, query) {
  // ── 1. Parse ───────────────────────────────────────────────────────────────
  let parsed;
  try {
    parsed = JSON.parse(rawJson);
  } catch {
    return { error: { code: 400, message: 'Config file is not valid JSON.' } };
  }

  if (typeof parsed !== 'object' || Array.isArray(parsed) || parsed === null) {
    return { error: { code: 400, message: 'Config JSON must be a plain object, not an array or scalar.' } };
  }

  // ── 2. Resolve md URL ──────────────────────────────────────────────────────
  // query.md overrides json.md (so a shared config can still be overridden per-link)
  const rawMd = query.md || parsed.md || null;
  let mdUrl = null;
  if (rawMd) {
    const v = validateMarkdownUrl(String(rawMd));
    if (!v.valid) return { error: { code: v.code, message: v.message } };
    mdUrl = v.url;
  }

  // ── 3. Title and favicon ───────────────────────────────────────────────────
  const title   = String(query.title   || parsed.title   || '').slice(0, 200) || null;
  const favicon = String(query.favicon || parsed.favicon || '').slice(0, 2048) || null;

  if (favicon) {
    const faviconError = validateFavicon(favicon);
    if (faviconError) return { error: { code: 400, message: faviconError } };
  }

  // ── 4. Theme — can be a string or an inline object ─────────────────────────
  const themeField = query.theme || parsed.theme;

  if (themeField && typeof themeField === 'object') {
    // Inline custom theme definition
    const result = validateCustomTheme(themeField);
    if (result.error) return { error: { code: 400, message: result.error } };

    return {
      config: {
        mdUrl,
        title,
        favicon,
        theme:       null,     // no built-in theme selected
        customTheme: result.theme,
      },
    };
  }

  return {
    config: {
      mdUrl,
      title,
      favicon,
      theme:       resolveThemeName(themeField),
      customTheme: null,
    },
  };
}

// ─── Internal helpers ─────────────────────────────────────────────────────────

/**
 * Map a raw theme string to a valid key, falling back to the default.
 * @param {string|undefined} raw
 * @returns {string}
 */
function resolveThemeName(raw) {
  if (!raw) return DEFAULT_THEME;
  const key = String(raw).toLowerCase().trim();
  return listThemes().includes(key) ? key : DEFAULT_THEME;
}

/**
 * Validate an inline theme object from a JSON config.
 * Returns either { theme } or { error: string }.
 *
 * @param {object} raw
 * @returns {{ theme: object } | { error: string }}
 */
function validateCustomTheme(raw) {
  if (typeof raw !== 'object' || Array.isArray(raw)) {
    return { error: 'theme must be an object when defined inline.' };
  }

  const css = String(raw.css || '').trim();
  if (css.length < MIN_CSS_LENGTH) {
    return {
      error: `Inline theme CSS is too short (${css.length} chars). ` +
             `Write at least the body and .container rules. See README § "Defining a theme in JSON".`,
    };
  }

  // User-defined themes always render client-side. renderOn is not a user-facing
  // field — it only exists in the built-in theme objects inside themeEngine.js.
  // If someone passes renderOn in their JSON we silently ignore it rather than
  // erroring, because the safe behaviour (client render) is already applied.
  const renderOn = 'client';
  const label    = String(raw.label   || 'Custom Theme').slice(0, 60);
  const doodle   = typeof raw.doodle === 'string' ? raw.doodle : '';

  // Block the most obvious injection vectors in doodle SVG.
  // (The SVG is injected into the body, not processed by sanitize-html.)
  if (doodle && /<script/i.test(doodle)) {
    return { error: 'Inline doodle SVG must not contain <script> elements.' };
  }
  if (doodle && /on\w+\s*=/i.test(doodle)) {
    return { error: 'Inline doodle SVG must not contain event-handler attributes (onclick, etc.).' };
  }

  return {
    theme: { renderOn, label, css, doodle, description: 'User-defined inline theme' },
  };
}

/**
 * Validate a favicon value.
 * Accepted formats:
 *   - https:// URL (any host — favicon fetched by browser, not our server)
 *   - data: URI
 *   - Single emoji character (converted to SVG data URI by the renderer)
 *
 * @param {string} value
 * @returns {string|null} error message, or null if valid
 */
function validateFavicon(value) {
  if (value.startsWith('data:image/')) return null;
  if (value.startsWith('https://'))    return null;

  // Check for single emoji (Unicode range rough check)
  // Emoji are typically 1–2 code points; anything longer is suspicious
  if ([...value].length <= 2) return null;  // treat as emoji

  return `favicon must be a https:// URL, a data:image/… URI, or a single emoji character. Got: "${value.slice(0,40)}"`;
}

module.exports = { fromQuery, fromJson };
