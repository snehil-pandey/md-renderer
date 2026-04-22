# md-renderer

> A production-grade Markdown-to-HTML rendering API with themes, caching, and security.

---

## Quick Start

Fetch and render any Markdown file from GitHub by passing its raw URL:

```
http://localhost:3000/?md=https://raw.githubusercontent.com/user/repo/main/README.md&theme=documentation
```

Or open `http://localhost:3000/` with no parameters to see **this page**.

---

## Supported Themes

| Theme name       | Description                                |
|------------------|--------------------------------------------|
| `scientific-doc` | Serif fonts, academic layout, justified text |
| `artistic-story` | Warm parchment tones, elegant prose reading |
| `documentation`  | GitHub-style dev docs *(default)*           |
| `ancient-script` | Parchment background, brown ink, scroll feel|
| `story`          | Minimal centered column for fiction          |
| `poem`           | Centered, spacious, decorative HR dividers   |

Switch themes by adding `?theme=<name>` to the URL.

---

## API Reference

### `GET /`

| Parameter | Type   | Default         | Description                        |
|-----------|--------|-----------------|------------------------------------|
| `md`      | string | local README.md | Raw GitHub URL to a `.md` file     |
| `theme`   | string | `documentation` | Visual theme name                  |

### `GET /health`

Returns JSON with server uptime and available themes.

### `GET /cache-stats`

Returns JSON with LRU cache memory usage.

---

## Features

- [x] GitHub Flavored Markdown (GFM)
- [x] Syntax-highlighted code blocks (via highlight.js)
- [x] Task lists with checkboxes
- [x] Tables with column alignment
- [x] Auto-linked headings with anchor IDs
- [x] LRU in-memory cache (5 min TTL)
- [x] Gzip compression
- [x] Strict URL allowlist (GitHub raw domains only)
- [x] XSS sanitization (sanitize-html)
- [x] Hard 3-second upstream timeout
- [x] 1 MB file size limit
- [x] Styled HTML error pages for all HTTP error codes

---

## Code Example

```javascript
// Fetch a rendered page programmatically
const res  = await fetch('http://localhost:3000/?md=https://raw.githubusercontent.com/...');
const html = await res.text();
console.log(html.substring(0, 200));
```

```python
# Python equivalent
import httpx
r = httpx.get("http://localhost:3000/", params={"md": "...", "theme": "poem"})
print(r.text[:200])
```

---

## Blockquote Example

> "The best tool is the one that stays out of your way."
>
> Optimised for low-end devices — no client-side JavaScript, no external fonts,
> everything rendered server-side in a single HTTP round-trip.

---

## Performance Notes

- **Zero client JS** — the entire page is server-side rendered HTML + inline CSS.
- **LRU cache** holds up to 200 files (50 MB total). Cache hits skip all network I/O.
- **Gzip** compression at level 6 reduces payload by ~70% on typical Markdown docs.
- **Upstream timeout** is hard-capped at 3 seconds via `AbortController`.
- **1 MB** file size limit prevents memory exhaustion on constrained hardware.

---

## Error Codes

| Code | Meaning                             |
|------|-------------------------------------|
| 400  | Invalid or malformed URL            |
| 403  | Domain not in allowlist             |
| 404  | Markdown file not found             |
| 413  | File exceeds 1 MB limit             |
| 422  | Markdown could not be parsed        |
| 500  | Internal server error               |
| 502  | Upstream server unreachable         |
| 503  | Rate-limited by upstream            |
| 504  | Upstream timed out (> 3 s)          |

---

*Built with Node.js · Express · markdown-it · highlight.js · sanitize-html · lru-cache*
