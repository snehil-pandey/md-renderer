# md-renderer

> A production-grade Markdown-to-HTML rendering API.  
> Fast. Secure. Fully server-side. Zero client JavaScript.

---

## Why use an API instead of bundling a renderer?

Every non-trivial project eventually needs to render Markdown — READMEs, wikis,
changelogs, documentation pages. The naive approach is to add a renderer to each
project individually. That sounds simple but it compounds quickly:

| Problem | What actually happens |
|---|---|
| **Inconsistent output** | Three projects, three parsers, three slightly different HTML shapes |
| **Dependency drift** | Each project independently pins highlight.js, sanitize-html, markdown-it — all at different versions |
| **Security gaps** | XSS sanitisation done wrong (or not at all) in each place |
| **No caching** | The same README fetched and parsed on every request in every service |
| **Theme chaos** | Copy-pasting CSS across repos, they diverge immediately |
| **Maintenance overhead** | A CVE in sanitize-html means patching N projects, not one |

**md-renderer solves all of this in one place.**

You call `/?md=<url>&theme=<name>` and get back a complete, safe, themed HTML page.
Your application never touches a Markdown parser. It just embeds an `<iframe>` or
fetches the HTML — done. Upgrade the renderer once, every consumer benefits.

---

## Quick start

```bash
git clone <this-repo> && cd md-renderer
npm install
node server.js
# → http://localhost:3000/
```

```
# Render a remote file
GET /?md=https://raw.githubusercontent.com/user/repo/main/README.md&theme=documentation

# Use a JSON config file (see Config Mode below)
GET /?config=https://raw.githubusercontent.com/user/repo/main/.mdrc.json

# No params → serves this README with the default theme
GET /
```

---

## API reference

### `GET /`

| Parameter | Type   | Default         | Description |
|-----------|--------|-----------------|-------------|
| `md`      | string | local README.md | HTTPS URL to a `.md` file on an allowed host |
| `theme`   | string | `documentation` | Visual theme name (see table below) |
| `config`  | string | —               | HTTPS URL to a JSON config file (overrides `md` + `theme`) |

**Response:** `200 text/html` — complete themed HTML page.

All error responses are also styled HTML pages (never JSON). The HTTP status
code always reflects the actual error class (400, 403, 404, 422, 500, 502, 503, 504).

### `GET /health`

```json
{
  "status": "ok",
  "version": "2.0.0",
  "uptime": "42.50s",
  "themes": [ { "key": "documentation", "label": "Documentation", "isDefault": true }, … ],
  "allowedHosts": [ "raw.githubusercontent.com — GitHub raw content", … ]
}
```

### `GET /cache-stats`

```json
{ "entries": 12, "bytesUsed": 204800, "maxEntries": 200, "maxBytes": 52428800 }
```

---

## Supported Markdown features

| Feature | Syntax |
|---|---|
| **Headings** | `# H1` through `###### H6` |
| **Bold / italic** | `**bold**` `*italic*` |
| **Strikethrough** | `~~text~~` |
| **Task lists** | `- [x] done` / `- [ ] todo` |
| **Tables** | GFM pipe tables with alignment |
| **Code blocks** | ` ```lang ``` ` — 190+ languages highlighted |
| **Inline code** | `` `code` `` |
| **Mermaid diagrams** | ` ```mermaid ``` ` — rendered via mermaid.ink |
| **Inline math** | `$e = mc^2$` |
| **Display math** | `$$\int_0^1 x\,dx = \tfrac{1}{2}$$` |
| **Emoji** | `:rocket:` `:tada:` `:bug:` (GitHub shortcodes) |
| **Footnotes** | `[^1]` and `[^1]: definition` |
| **Subscript** | `H~2~O` |
| **Superscript** | `10^9^` |
| **Callout containers** | `::: tip`, `::: warning`, `::: danger`, `::: info`, `::: note` |
| **Definition lists** | `Term` then `: Definition` on next line |
| **Abbreviations** | `*[HTML]: HyperText Markup Language` |
| **Blockquotes** | `> quote` |
| **Auto-links** | `https://example.com` → clickable |
| **Smart typography** | `--` → en-dash, `---` → em-dash, `...` → ellipsis, smart quotes |
| **Heading anchors** | Every heading gets a self-link `#id` |

---

## Allowed source domains

For security, only the following platforms are accepted as Markdown sources.
All URLs must be HTTPS. Per-host path patterns are also validated.

| Host | Notes |
|---|---|
| `raw.githubusercontent.com` | GitHub raw file content |
| `gist.githubusercontent.com` | GitHub Gist raw content |
| `githubusercontent.com` | GitHub user content |
| `gitlab.com` | GitLab — path must contain `/-/raw/` or `/raw/` |
| `bitbucket.org` | Bitbucket — path must contain `/raw/` |
| `codeberg.org` | Codeberg (Forgejo) — path must contain `/raw/` |
| `git.sr.ht` | SourceHut — path must contain `/blob/` or `/tree/` |
| `gitea.com` | Gitea.com — path must contain `/raw/` |
| `git.disroot.org` | Disroot Gitea — path must contain `/raw/` |
| `pastebin.com` | Raw paste only (`/raw/<id>`) — extension check skipped |
| `hackmd.io` | Raw export (`/download`) — extension check skipped |

**Why not "any HTTPS URL"?**  
Allowing arbitrary URLs enables SSRF (Server-Side Request Forgery) attacks — the
server would become a proxy for reaching internal services, cloud metadata endpoints
(`169.254.169.254`), or localhost. The allowlist is the primary SSRF mitigation.

---

## JSON config mode

Instead of building a URL each time, you can check a small JSON file into your repo:

```json
{
  "md":    "https://raw.githubusercontent.com/acme/docs/main/guide.md",
  "theme": "documentation"
}
```

Host it anywhere on an allowed domain (e.g. GitHub raw), then call:

```
GET /?config=https://raw.githubusercontent.com/acme/docs/main/.mdrc.json
```

This is ideal for CI/CD pipelines, link-sharing, or embedding documentation in a
dashboard where you want a stable, version-controlled rendering configuration.

### Config JSON schema

```ts
{
  md?:    string,  // HTTPS URL to a Markdown file (must pass validator)
  theme?: string,  // Theme key — unknown values fall back to "documentation"
}
```

---

## Themes

| Key | Description | Default? |
|---|---|---|
| `documentation` | GitHub-style developer docs — clean headings, monospace code, responsive | ✅ |
| `scientific-doc` | Serif fonts, justified text, academic two-column feel | |
| `artistic-story` | Warm parchment tones, generous line-height, elegant serif reading | |
| `ancient-script` | Parchment background, brown ink, decorative borders — medieval scroll feel | |
| `story` | Minimal centered column, generous whitespace — fiction and long-form prose | |
| `poem` | Center-aligned, preserved line breaks, decorative star dividers | |

---

## How to create a custom theme

Themes live in `services/themeEngine.js`. Each theme is a plain JavaScript object.
To add yours:

### 1. Open `services/themeEngine.js`

Find the `THEMES` object (around line 80). Add a new key:

```js
'my-theme': {
  label: 'My Theme',
  description: 'One-liner for the /health endpoint and docs',
  doodle: `<svg class="doodle" …>…</svg>`,   // optional — can be ''
  css: `
    /* Your complete self-contained CSS here */
    body { background: #fff; color: #111; }
    .container { max-width: 800px; margin: 0 auto; }
    /* …etc */
  `,
},
```

### 2. Write the CSS

**Rules:**
- **No external resources.** No `@import`, no `url('https://…')` for fonts or images.
  Use system font stacks (`-apple-system, BlinkMacSystemFont, …`).
- **Target `.container`** for the main content wrapper.
- **Reuse shared mixins.** Import them at the bottom of your CSS string:
  ```js
  css: `
    /* your CSS */
    ${CONTAINER_BASE}   /* callout box colours */
    ${MATH_BASE}        /* .math-display, .katex-display */
    ${MERMAID_BASE}     /* .mermaid-diagram */
    ${FOOTNOTE_BASE}    /* .footnotes, .footnotes-sep */
    ${HLJS_LIGHT}       /* or HLJS_DARK for dark code blocks */
  `,
  ```
- **Target `.hljs-pre`** for code block containers and `pre.hljs-pre code` for the inner `<code>`.
- **Target `.mermaid-diagram`** for Mermaid figure wrappers.
- **Target `.math-display`** for block KaTeX math.
- **Target `.custom-container--tip/warning/danger/info/note`** for callout boxes.

### 3. Design the doodle (optional)

Add a decorative inline SVG. Guidelines:
- Keep it **under ~3 KB** (it's inlined in every page response).
- Set `pointer-events="none"` on the root `<svg>`.
- Add `class="doodle"` — your CSS positions it absolutely.
- Keep `opacity` low (≤ 0.15) so it never fights content.

```js
doodle: `
<svg class="doodle" xmlns="http://www.w3.org/2000/svg"
     viewBox="0 0 200 200" width="200" height="200"
     pointer-events="none" aria-hidden="true">
  <!-- your decorative SVG paths here -->
</svg>`,
```

Position it in your CSS:
```css
.doodle {
  position: fixed;
  bottom: 20px;
  right: 20px;
  opacity: 0.10;
  z-index: 0;
}
.container { position: relative; z-index: 1; }  /* always above the doodle */
```

### 4. Test it

```bash
node test.js          # runs the built-in test suite — checks your theme loads
node server.js        # start the server
# open http://localhost:3000/?theme=my-theme
```

The test suite checks that every theme has `label`, `description`, and CSS longer than
200 characters. If any check fails, the suite prints which assertion failed and why.

### 5. Document it

Add your theme to the table in this README and to `CHANGELOG.md`.

---

## Architecture

```
md-renderer/
│
├── server.js                 ← Express bootstrap, gzip, security headers,
│                               graceful shutdown (SIGTERM/SIGINT)
│
├── routes/
│   └── render.js             ← Request orchestration. Handles the three input
│                               modes (direct params, JSON config, local default).
│                               Delegates to services; sends HTML error pages.
│
├── services/
│   ├── fetcher.js            ← Fetches remote Markdown.
│   │                           AbortController 3s timeout.
│   │                           Streaming 1 MB byte limit.
│   │                           LRU cache integration (5 min TTL).
│   │                           Per-status HTTP error mapping.
│   │
│   ├── parser.js             ← markdown-it + full extension stack.
│   │                           KaTeX math (server-side, no browser JS).
│   │                           Mermaid → mermaid.ink image URL.
│   │                           Emoji, footnotes, containers, sub/sup,
│   │                           deflist, abbr, task lists, anchors, hljs.
│   │                           Runs sanitize-html after parsing.
│   │
│   ├── renderer.js           ← Builds the full HTML document.
│   │                           Injects theme CSS + KaTeX CSS inline.
│   │                           Injects SVG doodle into <body>.
│   │                           Dark-themed error pages with gradient codes.
│   │
│   └── themeEngine.js        ← Six themes. Each: label, description, CSS, doodle.
│                               getTheme(name) → fallback to 'documentation'.
│                               Shared CSS mixin strings for reuse.
│
└── utils/
    ├── validator.js          ← URL allowlist — 11 trusted platforms.
    │                           HTTPS-only. No credentials. Per-host path checks.
    │                           Extension whitelist (.md .markdown .mkd .mdx …).
    │
    ├── cache.js              ← LRU wrapper (200 entries, 50 MB, 5-min TTL).
    │                           get / set / has / stats.
    │
    └── sanitizer.js          ← sanitize-html post-render pass.
                                Tag + attribute allowlist.
                                KaTeX style property filter (safe CSS props only).
                                on* attribute stripping (defence-in-depth).
                                javascript: scheme blocking in hrefs.
```

---

## Performance characteristics

| Metric | Value |
|---|---|
| Rendering model | 100% server-side — zero client JavaScript |
| Gzip compression | Level 6 — ~65–70% size reduction on typical docs |
| Cache TTL | 5 minutes per URL |
| Cache capacity | 200 entries / 50 MB total |
| Upstream timeout | 3 seconds (AbortController) |
| Max file size | 1 MB (enforced during streaming — connection cancelled immediately) |
| Cold render (no cache) | ~15–40 ms for a typical README |
| Warm render (cache hit) | ~2–5 ms (no network I/O) |

The 1 MB / 3 s limits are enforced before any parsing work begins, so a slow or
massive upstream server cannot degrade the API for other users.

---

## Security model

| Layer | Mechanism |
|---|---|
| SSRF prevention | Allowlist of 11 trusted platforms; no arbitrary URLs |
| XSS — parse level | `html: false` in markdown-it strips raw HTML blocks |
| XSS — post-render | sanitize-html strips unlisted tags, attributes, schemes |
| XSS — event handlers | `exclusiveFilter` removes all `on*` attributes |
| XSS — hrefs | `javascript:` and `data:` schemes blocked in transform |
| XSS — KaTeX styles | Inline `style` filtered to KaTeX-safe CSS properties only |
| HTTPS only | Protocol check before allowlist lookup |
| Credential injection | `url.username / url.password` rejected |
| Content-Security-Policy | Meta tag blocks all scripts; allows only inline styles and HTTPS images |
| MIME sniffing | `X-Content-Type-Options: nosniff` on every response |
| Clickjacking | `X-Frame-Options: SAMEORIGIN` |

---

## Error codes

| Code | Cause |
|---|---|
| 400 | Malformed URL, wrong extension, bad config JSON |
| 403 | Domain not on the allowlist |
| 404 | Markdown file not found at the upstream URL |
| 413 | File exceeds 1 MB limit |
| 422 | Markdown parsing or sanitisation failed |
| 500 | Internal server error (renderer crash, missing local README) |
| 502 | Upstream returned an HTTP error or unreadable response |
| 503 | Rate-limited by the upstream server |
| 504 | Upstream did not respond within 3 seconds |

---

## Environment variables

| Variable | Default | Description |
|---|---|---|
| `PORT` | `3000` | TCP port the server listens on |
| `NODE_ENV` | `development` | Set to `production` to suppress stack traces in logs |

---

## Roadmap

These are planned but not yet implemented:

- **Interactive themes** — themes that include optional client-side enhancements
  (e.g. collapsible TOC sidebar, live search) gated behind a `?interactive=1` flag
- **Custom CSS injection** — `?css=<url>` to append user-provided CSS to any theme
- **Table of contents** — auto-generated TOC block from headings
- **Dark mode auto-switch** — themes that honour `prefers-color-scheme`
- **PDF export** — `?format=pdf` via headless rendering
- **Private source support** — Bearer-token header forwarding for private repos (opt-in)

---

*Built with Node.js · Express · markdown-it · KaTeX · highlight.js · sanitize-html · lru-cache*
