# md-renderer

I built this because I kept writing the same Markdown rendering code in every project. Add a dependency, wire up a parser, handle sanitisation, pick fonts, repeat. Six months later you have three apps each doing it slightly differently, one of them with an XSS hole you don't know about yet.

md-renderer is a single HTTP endpoint. You give it a URL to a Markdown file and it gives you back a complete HTML page, already themed and safe to display. That's the whole thing.

---

## How it works

```
GET /?md=https://raw.githubusercontent.com/you/repo/main/README.md&theme=documentation
```

The server fetches the file, runs it through markdown-it with a full extension stack, sanitises the output, applies your chosen theme (inline CSS, no external requests), and returns a complete HTML document. The browser gets HTML. No client-side parsing, no blank flash, no JavaScript required to see the content.

If you pass the same URL again within five minutes, the server returns the cached version without touching the network. The cache holds up to 50 MB across 200 entries.

---

## Running it locally

```bash
git clone <this-repo> && cd md-renderer
npm install
node server.js
# open http://localhost:3000
```

No `.env` file needed. The only env var is `PORT` (default `3000`).

```bash
PORT=8080 node server.js
```

---

## The endpoint

### `GET /`

| Parameter | Type | Default | What it does |
|---|---|---|---|
| `md` | string | — | URL to a Markdown file. Must be on an [allowed host](#allowed-hosts). |
| `theme` | string | `documentation` | Theme name. Unknown values fall back to `documentation`. |
| `title` | string | first `# Heading` | Overrides the page `<title>` tag. |
| `favicon` | string | — | `https://` URL, `data:image/` URI, or a single emoji. |
| `config` | string | — | URL to a [JSON config file](#json-config-files). Covers all of the above plus inline themes. |

When `md` is omitted, the server renders its own README (this file).

### `GET /health`

Returns JSON. Shows uptime, all available themes with their `renderOn` values, and the allowed-host list.

### `GET /cache-stats`

Returns JSON. Shows how many entries are in the LRU cache and how many bytes they occupy.

---

## JSON config files

Instead of cramming everything into a URL, you can put the configuration in a JSON file hosted anywhere on an [allowed host](#allowed-hosts) and point the API at it:

```
GET /?config=https://raw.githubusercontent.com/you/repo/main/.mdrc.json
```

The JSON file can contain:

```json
{
  "md":      "https://raw.githubusercontent.com/you/repo/main/guide.md",
  "title":   "My Guide",
  "favicon": "📖",
  "theme":   "documentation"
}
```

Or use an **inline theme object** instead of a theme name (see [Defining a theme in JSON](#defining-a-theme-in-json)):

```json
{
  "md":    "https://raw.githubusercontent.com/you/repo/main/guide.md",
  "title": "Dark Docs",
  "theme": {
    "label":  "Dark Night",
    "css":    "body { background: #0d1117; color: #c9d1d9; font-family: system-ui; } .container { max-width: 900px; margin: 0 auto; padding: 2rem; }",
    "doodle": ""
  }
}
```

Themes defined this way always render in the browser (client-side). That choice is not configurable — it's described in detail under [renderOn: server vs client](#renderon-server-vs-client).

Query parameters act as overrides when you use a config file. So you can share one config across multiple links while still pinning a different theme or title per-link:

```
# Uses the config's md URL, but overrides the theme
GET /?config=https://raw.githubusercontent.com/.../config.json&theme=poem
```

---

## What Markdown features are supported

I use markdown-it with the following extensions loaded:

| Feature | Syntax |
|---|---|
| Tables | `\| A \| B \|` pipe syntax |
| Task lists | `- [x] done` / `- [ ] todo` |
| Code blocks | ` ```lang ``` ` with syntax highlighting (190+ languages via highlight.js) |
| Mermaid diagrams | ` ```mermaid ``` ` — rendered as an SVG image via mermaid.ink |
| Inline math | `$e = mc^2$` |
| Display math | `$$\int_0^1 x\,dx$$` (KaTeX, server-side, no browser JS) |
| Emoji shortcodes | `:rocket:` `:tada:` (GitHub-compatible names) |
| Footnotes | `[^1]` and `[^1]: definition` |
| Subscript | `H~2~O` |
| Superscript | `10^9^` |
| Callout boxes | `::: tip`, `::: warning`, `::: danger`, `::: info`, `::: note` |
| Definition lists | `Term` followed by `: Definition` |
| Abbreviations | `*[API]: Application Programming Interface` |
| Blockquotes | `> text` |
| Heading anchors | Every heading gets a self-link `#id` |
| Linkify | Bare `https://` URLs become clickable |
| Smart typography | `--` → en-dash, `---` → em-dash, `...` → ellipsis |
| Strikethrough | `~~text~~` |

The parser runs with `html: false`, which means raw HTML tags in your Markdown are escaped rather than passed through. The rendered output then goes through sanitize-html before it's sent to the browser.

---

## Allowed hosts

The API only fetches Markdown from these domains. This isn't arbitrary gatekeeping — it's how I prevent the server from being used as a proxy to reach internal services or cloud metadata endpoints. Letting any HTTPS URL through would mean anyone could point the API at `http://169.254.169.254/latest/meta-data/` or your internal Postgres admin panel.

| Host | Notes |
|---|---|
| `raw.githubusercontent.com` | GitHub raw file |
| `gist.githubusercontent.com` | GitHub Gist raw |
| `githubusercontent.com` | GitHub user content |
| `gitlab.com` | Path must contain `/-/raw/` or `/raw/` |
| `bitbucket.org` | Path must contain `/raw/` |
| `codeberg.org` | Path must contain `/raw/` |
| `git.sr.ht` | Path must contain `/blob/` or `/tree/` |
| `gitea.com` | Path must contain `/raw/` |
| `git.disroot.org` | Path must contain `/raw/` |
| `pastebin.com` | Only `/raw/<id>` paths |
| `hackmd.io` | Only `/download` paths |

Config JSON files must also be hosted on an allowed host. Favicon URLs are not restricted — they're fetched by the browser, not the server.

---

## Themes

All six built-in themes have `renderOn: "server"`, meaning Markdown is parsed on the server and the browser receives complete HTML. The browser needs no JavaScript to render the page.

| Key | Description |
|---|---|
| `documentation` ← default | GitHub-style developer docs. Clean, readable, familiar. |
| `scientific-doc` | Serif fonts, justified paragraphs, ruled headings. Good for long papers or technical notes. |
| `artistic-story` | Warm parchment background, generous line spacing, vine SVG doodle. |
| `ancient-script` | Dark parchment, Celtic knotwork doodle, brown ink. Decorative borders around the content area. |
| `story` | Narrow centered column, quill doodle, minimal decoration. Designed for fiction or essays. |
| `poem` | Center-aligned, mandala doodle, star-symbol `hr` dividers. |

---

## Designing a theme

A theme is a plain JavaScript object with four fields. Open `services/themeEngine.js` and add yours to the `THEMES` object:

```js
'my-theme': {
  label:       'My Theme',
  description: 'Short description for /health and docs.',
  renderOn:    'server',   // or 'client' — see below
  doodle:      '',         // SVG string, or '' for no doodle
  css:         `
    /* Your complete CSS here. No @import, no external url() for fonts. */

    body {
      font-family: Georgia, serif;
      background: #fefefe;
      color: #1a1a1a;
      padding: 48px 20px;
    }

    .container {
      max-width: 800px;
      margin: 0 auto;
    }

    /* Reuse the shared mixins defined at the top of themeEngine.js */
    ${CONTAINER_BASE}   /* callout boxes: tip, warning, danger, info, note */
    ${MATH_BASE}        /* .math-display for block KaTeX, .math-error */
    ${MERMAID_BASE}     /* .mermaid-diagram figure wrapper */
    ${FOOTNOTE_BASE}    /* .footnotes section */
    ${HLJS_LIGHT}       /* syntax highlight colours — or HLJS_DARK */
  `,
},
```

### What CSS selectors to target

| Selector | What it styles |
|---|---|
| `body` | Page background, base font, base colour |
| `.container` | The content wrapper. Always set `max-width` and `margin: 0 auto`. |
| `h1`–`h6` | Heading sizes, weights, border rules |
| `pre.hljs-pre` | Code block outer wrapper |
| `pre.hljs-pre code` | Code block inner `<code>` element |
| `.math-display` | Block-level KaTeX math (display mode) |
| `.mermaid-diagram` | Mermaid figure container |
| `.custom-container--tip` | `::: tip` callout |
| `.custom-container--warning` | `::: warning` callout |
| `.custom-container--danger` | `::: danger` callout |
| `.custom-container--info` | `::: info` callout |
| `.custom-container--note` | `::: note` callout |
| `.footnotes` | The footnote section at the bottom |
| `a.header-anchor` | The self-link anchor on headings (usually hidden until hover) |
| `.doodle` | Your SVG doodle — position it with `position: fixed` or `absolute` |

### The doodle field

The doodle is an SVG string injected directly into `<body>`, before `.container`. Keep it small (under 3 KB) because it's inlined in every response. Position it with your CSS:

```js
doodle: `
<svg class="doodle" xmlns="http://www.w3.org/2000/svg"
     viewBox="0 0 200 200" width="180" height="180"
     pointer-events="none" aria-hidden="true">
  <!-- your paths here -->
</svg>`,
```

```css
.doodle {
  position: fixed;
  bottom: 20px;
  right: 20px;
  opacity: 0.08;
  z-index: 0;
  pointer-events: none;
}
.container {
  position: relative;
  z-index: 1;  /* always sits above the doodle */
}
```

Rules for doodles:
- No `<script>` elements.
- No `on*` event-handler attributes (`onclick`, `onmouseover`, etc.).
- `pointer-events="none"` on the root `<svg>` (so it never blocks text selection).
- Opacity ≤ 0.15 — it should accent the page, not compete with the content.

### renderOn: server vs client

This is a codebase field — it lives in `services/themeEngine.js` on built-in theme definitions. **It is not something users can set in a JSON config.**

`renderOn: "server"` means the server parses the Markdown and sends complete HTML. The browser renders a static page with no JavaScript required. All six built-in themes work this way.

`renderOn: "client"` means the server fetches and caches the raw Markdown, then sends an HTML shell with it embedded as a JSON string. The browser loads markdown-it, DOMPurify, and highlight.js from jsDelivr CDN and parses it there. The server's CPU handles only the HTTP layer and cache lookup.

**All JSON-defined (user) themes always use `renderOn: "client"`.**

The reason is simple: the server hasn't reviewed user CSS. It might be heavy. It might expect browser APIs to run alongside it. Parsing and rendering server-side on untrusted inputs is a CPU risk we don't want to take. The client-side path already caches the raw Markdown and offloads all parsing to the browser, so the server stays fast regardless of how complex the user theme is.

When you add a new built-in theme to `themeEngine.js`, you choose:
- `renderOn: "server"` — for lightweight, dependency-free themes where server-side rendering is clearly safe and beneficial.
- `renderOn: "client"` — for themes that need JavaScript for interactive features (live search, collapsible TOC, animated elements). The server still caches the Markdown and handles fetch; the browser handles display.

### Defining a theme in JSON

If you don't want to edit `themeEngine.js` — for example, you're using the hosted API and want a custom look — you can define the theme inline in your config JSON. These themes **always render in the browser**. That is not configurable.

```json
{
  "md":     "https://raw.githubusercontent.com/you/repo/main/guide.md",
  "title":  "API Reference",
  "favicon": "🔧",
  "theme": {
    "label":  "Blueprint",
    "doodle": "",
    "css": "body { font-family: 'Courier New', monospace; background: #0a0a1a; color: #00ff88; padding: 40px 20px; } .container { max-width: 900px; margin: 0 auto; } h1, h2 { color: #00ccff; border-bottom: 1px solid #00ccff44; padding-bottom: .3em; } a { color: #00ff88; } code { background: rgba(0,255,136,.1); padding: .15em .4em; border-radius: 3px; color: #00ff88; } pre.hljs-pre { background: #050510; border: 1px solid #00ccff33; border-radius: 6px; padding: 18px; overflow-x: auto; } pre.hljs-pre code { background: none; padding: 0; } blockquote { border-left: 3px solid #00ccff; padding: .5em 1em; color: #88aacc; } table { border-collapse: collapse; width: 100%; } th, td { border: 1px solid #00ccff33; padding: 7px 12px; } th { background: rgba(0,204,255,.08); }"
  }
}
```

**JSON theme rules:**
- `css` is required and must be at least 20 characters. The server rejects placeholder values.
- `label` is optional — defaults to `"Custom Theme"`.
- `doodle` is optional — set it to `""` if you don't want one. Must not contain `<script>` or `on*` attributes.
- `renderOn` is **not a valid field here**. JSON themes always render client-side. If you include `renderOn` in your JSON, it is silently ignored.
- CSS runs in the browser under the page's CSP. External scripts and `@font-face` are blocked. HTTPS `background-image` URLs are allowed.
- Because rendering happens in the browser, the user needs JavaScript enabled to see the page content.

---

## How I structured the code

```
md-renderer/
│
├── server.js
│     Bootstrap: Express, gzip (level 6), security headers, graceful shutdown.
│     Delegates everything to routes.
│
├── routes/render.js
│     HTTP layer only. Reads query params or fetches config JSON,
│     calls configParser to normalise inputs, calls the pipeline,
│     sends the response. No rendering logic here.
│
├── utils/configParser.js          ← NEW in v3
│     Turns raw query params or a fetched JSON string into a single
│     RenderConfig object. Validates inline themes, favicons, and
│     merges query-param overrides on top of JSON config fields.
│
├── services/pipeline.js           ← NEW in v3
│     The render sequence: fetch → (parse if server-side) → render.
│     This is the only place that knows the full sequence.
│     Routes hand it a RenderConfig. They get { html, status, headers }.
│
├── services/
│   ├── fetcher.js      Fetches remote Markdown. AbortController 3s timeout.
│   │                   Streaming 1 MB byte limit. LRU cache integration.
│   │
│   ├── parser.js       markdown-it + 12 plugins + KaTeX math + Mermaid.
│   │                   Runs sanitize-html after parsing.
│   │
│   ├── renderer.js     renderPage() for server mode.
│   │                   renderClientPage() for client mode (embeds raw MD).
│   │                   renderErrorPage() for all error responses.
│   │                   Handles favicon, explicit titles, KaTeX CSS injection.
│   │
│   └── themeEngine.js  Six built-in themes. getTheme(name) with fallback.
│                       Shared CSS mixin strings (CONTAINER_BASE, MATH_BASE…).
│                       getThemeMeta() for /health.
│
└── utils/
    ├── validator.js    URL allowlist — 11 platforms, per-host path checks.
    ├── cache.js        LRU wrapper: 200 entries, 50 MB, 5-min TTL.
    ├── sanitizer.js    sanitize-html config: tag allowlist, on* stripping,
    │                   KaTeX style filtering, javascript: href blocking.
    └── configParser.js (described above)
```

The design rule I followed: each module has one job and doesn't know about the others except through explicit imports. The pipeline is the only thing that assembles them. If I want to swap markdown-it for a different parser, I touch `parser.js` and nothing else. If I want a different cache backend, I touch `cache.js`.

---

## Hosting it

### Option 1: Railway (easiest)

Railway runs Node.js apps directly from a GitHub repo with zero configuration files.

1. Push this repo to GitHub.
2. Go to [railway.app](https://railway.app) → New Project → Deploy from GitHub.
3. Select your repo. Railway detects `package.json` and runs `npm start` automatically.
4. Your API is live at `https://<your-project>.railway.app`.

To redeploy on every push, Railway does this automatically once connected.

### Option 2: Render

1. Push to GitHub.
2. Go to [render.com](https://render.com) → New → Web Service.
3. Connect your repo. Set:
   - **Environment**: Node
   - **Build command**: `npm install`
   - **Start command**: `node server.js`
4. Render gives you a `https://<name>.onrender.com` URL.

Render's free tier spins the service down after 15 minutes of inactivity. The first request after a cold start takes ~30 seconds. Paid tier keeps it warm.

### Option 3: Fly.io

Fly runs your app in a persistent VM near your users.

```bash
npm install -g flyctl
fly auth login
fly launch        # detects Node, writes fly.toml automatically
fly deploy
```

Free tier: up to 3 shared-CPU VMs with 256 MB RAM — enough for this server.

### GitHub Actions CI/CD (deploy on push)

Create `.github/workflows/deploy.yml`. The example below deploys to Railway, but the same pattern works for Render and Fly with their respective CLI tools.

```yaml
name: Deploy

on:
  push:
    branches: [main]

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '20'
          cache: 'npm'
      - run: npm ci
      - run: node test.js

  deploy:
    needs: test          # only deploy if tests pass
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      # Railway
      - name: Install Railway CLI
        run: npm install -g @railway/cli

      - name: Deploy to Railway
        run: railway up --service md-renderer
        env:
          RAILWAY_TOKEN: ${{ secrets.RAILWAY_TOKEN }}
```

Get `RAILWAY_TOKEN` from your Railway account settings → Tokens, then add it to your GitHub repo under Settings → Secrets → Actions.

For **Render**, replace the deploy step with:
```yaml
      - name: Trigger Render deploy hook
        run: curl -X POST ${{ secrets.RENDER_DEPLOY_HOOK_URL }}
```
Get the deploy hook URL from your Render service → Settings → Deploy Hook.

For **Fly.io**:
```yaml
      - uses: superfly/flyctl-actions/setup-flyctl@master
      - run: flyctl deploy --remote-only
        env:
          FLY_API_TOKEN: ${{ secrets.FLY_API_TOKEN }}
```

### Why not GitHub Pages?

GitHub Pages serves static files. This server needs to run Node.js to fetch remote URLs, cache them, and run the markdown parser. You can't run a persistent HTTP server on GitHub Pages. What you *can* do is use GitHub Actions to test and deploy *to* one of the platforms above.

If you genuinely need zero-infrastructure hosting and can live with the cold-start tradeoff, Render's free tier is the closest thing.

---

## Security

| Layer | What it does |
|---|---|
| URL allowlist | Fetches only from 11 trusted platforms. Prevents SSRF. |
| HTTPS enforcement | Non-HTTPS URLs are rejected before any fetch happens. |
| `html: false` in markdown-it | Raw HTML in Markdown source is escaped, not injected. |
| sanitize-html pass | Post-render tag and attribute allowlist. |
| `on*` attribute stripping | `onclick`, `onerror`, `onload`, etc. removed from all tags. |
| KaTeX style filtering | Inline `style` on `<span>` limited to a small set of layout properties. |
| `javascript:` blocking | Href values with `javascript:` scheme are replaced with `#`. |
| CSP meta tag (server mode) | `script-src 'none'` — no scripts can run on rendered pages. |
| CSP meta tag (client mode) | `script-src https://cdn.jsdelivr.net 'unsafe-inline'` — only the CDN and the inline init script. |
| Doodle SVG validation | `<script>` tags and `on*` attributes in inline doodles are rejected at config parse time. |
| 3-second timeout | AbortController cuts off slow upstream servers before they can hold up the process. |
| 1 MB limit | Byte counter during streaming; connection cancelled immediately if exceeded. |

---

## What's coming

These aren't on a timeline — just things I plan to add as the need comes up:

- Custom CSS injection via `?css=<url>` that appends to any built-in theme
- Auto-generated table of contents from headings
- `prefers-color-scheme` media query support in themes so dark-mode systems get a dark page automatically
- A `?format=pdf` parameter that renders and returns a PDF
- Per-request Bearer token forwarding for private repositories

---

## Error reference

| Code | When it happens |
|---|---|
| 400 | Malformed URL, wrong extension, bad JSON config, short CSS, script in doodle |
| 403 | Domain not on the allowlist |
| 404 | File not found at the upstream URL |
| 413 | File exceeds 1 MB |
| 422 | Markdown parsing failed (rare — markdown-it is very permissive) |
| 500 | Server error (render crash, missing local README) |
| 502 | Upstream returned an HTTP error |
| 503 | Rate-limited by upstream |
| 504 | Upstream did not respond within 3 seconds |

All error responses are styled HTML pages with the correct HTTP status code. You'll never get a JSON error from the rendering endpoint.

---

## Contributing a theme

1. Add your theme object to `THEMES` in `services/themeEngine.js`.
2. Run `node test.js` — the suite automatically checks every theme in the object.
3. Add an entry to `CHANGELOG.md` under the current version.
4. Open a PR. Include a screenshot.

That's it. No build step, no compilation, no extra dependencies unless your theme genuinely needs them (and if it does, explain why in the PR description).
