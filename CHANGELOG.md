# Changelog

All notable changes to md-renderer are documented here.
Format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).
Versioning follows [Semantic Versioning](https://semver.org/).

---

## [3.0.0] — 2026-04-22

### Added

**`utils/configParser.js` — new central input normalisation layer**

Everything that arrives at the API (query params, JSON config file, inline theme object) now goes through a single `fromQuery()` or `fromJson()` call and comes out as one `RenderConfig` shape. Before this, the route file was doing input parsing, URL validation, and rendering decisions in the same breath, which made the JSON config path repeat logic from the direct-params path. The configParser eliminates that.

`RenderConfig` fields:
- `mdUrl` — validated `URL` object, or `null` for the local README
- `title` — explicit page title, or `null` (falls back to first H1 in Markdown)
- `favicon` — `https://` URL, `data:image/` URI, or single emoji character
- `theme` — built-in theme key string
- `customTheme` — inline theme object (from JSON config only)

**`services/pipeline.js` — new render orchestration layer**

The pipeline is the only place that knows the full sequence: fetch → parse → render → return. Routes hand it a `RenderConfig` and get back `{ html, status, headers }`. Previously the route file assembled this sequence itself while also handling HTTP concerns, which meant two places to update whenever the sequence changed.

**JSON config: inline theme objects**

The `theme` field in a JSON config file can now be an object instead of a string:

```json
{
  "md":    "https://raw.githubusercontent.com/...",
  "title": "My Docs",
  "favicon": "📖",
  "theme": {
    "label":  "My Custom Theme",
    "css":    "body { ... } .container { max-width: 800px; margin: 0 auto; }",
    "doodle": ""
  }
}
```

**JSON config: `title` and `favicon` fields**

`title` overrides the page `<title>` tag (the first H1 heading is used otherwise).

`favicon` accepts three formats:
- `"https://example.com/icon.png"` — standard URL, fetched by the browser
- `"data:image/png;base64,…"` — inline data URI
- A single emoji character — converted to an inline SVG data URI on the server

**`renderOn: "server" | "client"` on built-in themes**

Built-in themes in `themeEngine.js` now carry a `renderOn` field:
- `"server"` — server parses Markdown and sends complete HTML. Browser needs no JavaScript.
- `"client"` — server embeds raw Markdown in an HTML shell; browser parses it using markdown-it, DOMPurify, and highlight.js loaded from jsDelivr CDN.

All six built-in themes currently use `renderOn: "server"`. The `"client"` path is ready for future themes that need browser APIs or interactive features.

**`renderOn` is a codebase-only field. Users cannot set it.**

Themes defined in JSON config files **always render client-side**, regardless of whether `renderOn` appears in the JSON. If it does appear, it is silently ignored. The server never parses Markdown from user-supplied CSS configurations — that would mean running potentially heavy, unreviewed CSS transformations on the server for every request.

This is enforced in `configParser.validateCustomTheme()`: the function always sets `renderOn: 'client'` and never reads the field from user input.

**`renderClientPage()` in renderer.js**

New renderer function for client-side themes. Embeds the raw Markdown as a JSON string in an `<application/json>` script element, then loads the CDN scripts with `defer`. A small inline `DOMContentLoaded` handler renders the Markdown once all scripts are ready. The theme's CSS is still applied server-side so the page has correct colours and layout even before JS runs.

CSP for client pages: `script-src https://cdn.jsdelivr.net 'unsafe-inline'` (necessary for the inline init script and the CDN libraries). Server pages retain `script-src 'none'`.

**Explicit title and emoji favicon on server-rendered pages**

`renderPage()` now accepts `title` and `favicon` in its options object. Both work for all render modes.

### Changed

- `routes/render.js` reduced to a thin HTTP layer (~50 lines). All input logic moved to `configParser`, all rendering to `pipeline`.
- `renderer.js` functions now take an `options` object instead of positional arguments. Callers: `renderPage(html, { theme, title, favicon, markdownSource })`.
- `getThemeMeta()` now includes `renderOn` in each entry, which appears in the `/health` response.
- `/health` endpoint now shows `renderOn` per theme and the full allowed-host list.

### Fixed

- `getThemeMeta()` was not including `renderOn` in the returned objects despite the pipeline reading it from the theme. Fixed.
- `markdown-it-emoji` v3 exports `{ full, light, bare }` rather than a single function. Fixed by calling `.use(emoji.full)`.
- CSS unicode escapes (`\2715`, `\2736`) in themeEngine template literals caused a strict-mode syntax error in Node 22. Replaced with literal Unicode characters.

---

## [2.0.0] — 2026-04-21

### Added

- KaTeX server-side math rendering — inline `$...$` and display `$$...$$`
- Mermaid diagram support via `mermaid.ink` — `\`\`\`mermaid\`\`\`` blocks converted to `<img>` pointing at the public SVG renderer
- Emoji shortcodes via `markdown-it-emoji`
- Footnotes via `markdown-it-footnote`
- Subscript and superscript via `markdown-it-sub` / `markdown-it-sup`
- Custom callout containers (`::: tip`, `::: warning`, `::: danger`, `::: info`, `::: note`)
- Definition lists and abbreviations
- SVG doodles per theme — decorative, non-interactive, pointer-events:none
- Colour-coded error pages (blue 404, amber 403, red/orange 5xx, purple 4xx)
- Expanded URL allowlist: GitLab, Bitbucket, Codeberg, SourceHut, Gitea, Pastebin, HackMD
- Per-host path pattern validation
- `?config=<url>` parameter for JSON config files
- Inline KaTeX CSS (fonts stripped, system math stack used)
- `getThemeMeta()` for structured theme metadata at `/health`

### Changed

- All six themes redesigned with richer typography
- `validateMarkdownUrl()` now accepts `{ allowJson }` option
- Sanitiser allows `style` on `<span>` with a property allowlist (required for KaTeX)
- Table `align` attribute emitted instead of stripped `style="text-align:…"`

### Fixed

- `themeEngine.js` octal-escape syntax error in template literals
- Table alignment lost after sanitisation pass

---

## [1.0.0] — 2026-04-21

### Added

- Express server with gzip compression (level 6, threshold 1 KB)
- LRU in-memory cache (200 entries, 50 MB, 5-minute TTL)
- GitHub-only URL allowlist (`raw.githubusercontent.com`, `gist.githubusercontent.com`)
- markdown-it with task lists, heading anchors, highlight.js syntax highlighting
- Six themes: `scientific-doc`, `artistic-story`, `documentation`, `ancient-script`, `story`, `poem`
- sanitize-html post-render XSS sanitisation
- Hard 3-second AbortController upstream timeout
- 1 MB file-size limit via streaming byte counter
- Styled HTML error pages for all HTTP error codes
- Graceful shutdown on SIGTERM / SIGINT
- `/health` and `/cache-stats` utility endpoints
