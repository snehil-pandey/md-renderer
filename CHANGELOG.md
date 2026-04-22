# Changelog

All notable changes to **md-renderer** are documented here.  
Format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).  
Versioning follows [Semantic Versioning](https://semver.org/).

---

## [2.0.0] — 2026-04-21

### Added

**Markdown extensions**
- KaTeX server-side math rendering — inline `$...$` and display `$$...$$`
- Mermaid diagram support via `mermaid.ink` — no server-side headless browser required
- Emoji shortcodes (`:rocket:` `:tada:`) via `markdown-it-emoji`
- Footnotes (`[^1]` / `[^1]: …`) via `markdown-it-footnote`
- Subscript (`H~2~O`) and superscript (`E=mc^2^`) via markdown-it-sub/sup
- Custom callout containers (`::: tip`, `::: warning`, `::: danger`, `::: info`, `::: note`)
- Definition lists (`Term\n: Definition`)
- Abbreviations (`*[API]: Application Programming Interface`)
- Collapsible `<details>` blocks

**Visual themes**
- All six themes completely redesigned with richer typography and layout
- SVG doodles injected per-theme as decorative, non-interactive background elements
- Colour-coded error pages (blue 404, amber 403, red/orange 5xx, purple 4xx)
- Grid-texture dark background on error pages

**URL support**
- Expanded allowlist: GitLab, Bitbucket, Codeberg, SourceHut, Gitea, Pastebin, HackMD
- Per-host path pattern validation (e.g. GitLab requires `/-/raw/` in path)
- `.mdx`, `.mdwn` added to accepted extensions

**JSON config mode**
- New `?config=<url>` parameter — fetches a JSON file that defines `md` + `theme`
- Config JSON must be hosted on an allowed domain
- Enables versioned, CI-friendly rendering configuration

**Infrastructure**
- `GET /health` now returns full theme metadata and allowed-host list
- `GET /cache-stats` exposes LRU memory statistics
- Inline KaTeX CSS (fonts stripped, system math stack used — fully offline)
- `getThemeMeta()` exported from themeEngine for external tooling

### Changed
- `validateMarkdownUrl()` now accepts an `opts` argument (`{ allowJson }`)
- `listAllowedHosts()` replaces the old `ALLOWED_HOSTS` Set (now returns descriptive strings)
- Sanitiser now allows `style` on `<span>` with property allowlist (required for KaTeX)
- Sanitiser `exclusiveFilter` strips all `on*` event-handler attributes
- Theme CSS now includes shared `CONTAINER_BASE`, `MATH_BASE`, `MERMAID_BASE`, `FOOTNOTE_BASE` mixins
- Error gradient colour varies by HTTP status class

### Fixed
- Table `align` attribute correctly emitted instead of stripped `style="text-align:…"`
- `themeEngine.js` octal-escape syntax error in template literals (replaced with Unicode escapes)

---

## [1.0.0] — 2026-04-21

### Added
- Initial release
- Express server with gzip compression (level 6)
- LRU in-memory cache (200 entries, 50 MB, 5-minute TTL)
- GitHub-only URL allowlist (`raw.githubusercontent.com`, `gist.githubusercontent.com`)
- markdown-it with task lists, heading anchors, highlight.js syntax highlighting
- Six themes: `scientific-doc`, `artistic-story`, `documentation`, `ancient-script`, `story`, `poem`
- sanitize-html post-render XSS sanitisation
- Hard 3-second AbortController upstream timeout
- 1 MB file-size limit (enforced via streaming byte counter)
- Styled HTML error pages for all HTTP error codes (400, 403, 404, 422, 500, 502, 503, 504)
- Graceful shutdown on SIGTERM / SIGINT
- `/health` and `/cache-stats` utility endpoints
