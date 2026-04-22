/**
 * utils/validator.js
 *
 * Validates incoming Markdown source URLs against a curated security allowlist.
 *
 * WHY an allowlist instead of "any HTTPS URL"?
 * Allowing arbitrary URLs would let an attacker use this server as a proxy
 * to reach internal services (SSRF), exfiltrate data via side-channels,
 * or retrieve content that masquerades as Markdown. The allowlist restricts
 * fetches to well-known public code-hosting platforms.
 *
 * SUPPORTED PLATFORMS
 *   GitHub     → raw.githubusercontent.com, gist.githubusercontent.com
 *   GitLab     → gitlab.com (/-/raw/ paths)
 *   Bitbucket  → bitbucket.org (/raw/ paths)
 *   Codeberg   → codeberg.org (/raw/ paths, Forgejo)
 *   SourceHut  → git.sr.ht (/blob/ paths)
 *   Gitea      → gitea.com, git.disroot.org
 *   Pastebin   → pastebin.com (/raw/ only)
 *   HackMD     → hackmd.io (raw export)
 */

'use strict';

const MARKDOWN_EXTS = new Set(['.md', '.markdown', '.mkd', '.mdown', '.mdx', '.mdwn']);

// Per-hostname rules.
// pathCheck(pathname) → true if path looks like a raw endpoint.
const ALLOWED_HOSTS = [
  { host: 'raw.githubusercontent.com',  note: 'GitHub raw content' },
  { host: 'gist.githubusercontent.com', note: 'GitHub Gist raw' },
  { host: 'githubusercontent.com',       note: 'GitHub user content' },
  {
    host: 'gitlab.com', note: 'GitLab raw file',
    pathCheck: (p) => p.includes('/-/raw/') || p.includes('/raw/'),
  },
  {
    host: 'bitbucket.org', note: 'Bitbucket raw file',
    pathCheck: (p) => p.includes('/raw/'),
  },
  {
    host: 'codeberg.org', note: 'Codeberg raw file',
    pathCheck: (p) => p.includes('/raw/'),
  },
  {
    host: 'git.sr.ht', note: 'SourceHut blob',
    pathCheck: (p) => p.includes('/blob/') || p.includes('/tree/'),
  },
  {
    host: 'gitea.com', note: 'Gitea.com raw file',
    pathCheck: (p) => p.includes('/raw/'),
  },
  {
    host: 'git.disroot.org', note: 'Disroot Gitea raw file',
    pathCheck: (p) => p.includes('/raw/'),
  },
  {
    host: 'pastebin.com', note: 'Pastebin raw paste',
    pathCheck: (p) => p.startsWith('/raw/'),
    skipExtCheck: true,
  },
  {
    host: 'hackmd.io', note: 'HackMD raw export',
    pathCheck: (p) => p.endsWith('/download') || p.startsWith('/s/'),
    skipExtCheck: true,
  },
];

const HOST_MAP = new Map(ALLOWED_HOSTS.map((e) => [e.host, e]));

function hasValidExtension(pathname) {
  const lower = pathname.toLowerCase();
  for (const ext of MARKDOWN_EXTS) {
    if (lower.endsWith(ext)) return true;
  }
  return false;
}

/**
 * Validate a candidate Markdown / config URL.
 * @param {string|undefined} urlString
 * @param {{ allowJson?: boolean }} opts
 * @returns {{ valid: true, url: URL } | { valid: false, code: number, message: string }}
 */
function validateMarkdownUrl(urlString, opts = {}) {
  if (!urlString || typeof urlString !== 'string' || !urlString.trim()) {
    return { valid: false, code: 400, message: 'Missing or empty URL parameter.' };
  }
  const trimmed = urlString.trim();
  if (trimmed.length > 2048) {
    return { valid: false, code: 400, message: 'URL exceeds the 2048-character limit.' };
  }

  let url;
  try { url = new URL(trimmed); }
  catch { return { valid: false, code: 400, message: 'Malformed URL — could not be parsed.' }; }

  if (url.protocol !== 'https:') {
    return { valid: false, code: 400, message: `Only HTTPS URLs are accepted. Got: "${url.protocol}"` };
  }
  if (url.username || url.password) {
    return { valid: false, code: 400, message: 'URLs with embedded credentials are not allowed.' };
  }

  const host = url.hostname.toLowerCase();
  const rule = HOST_MAP.get(host);
  if (!rule) {
    return {
      valid: false, code: 403,
      message: `Domain "${host}" is not on the allowlist. Supported: GitHub, GitLab, Bitbucket, Codeberg, SourceHut, Gitea, Pastebin, HackMD.`,
    };
  }

  if (rule.pathCheck && !rule.pathCheck(url.pathname)) {
    return {
      valid: false, code: 400,
      message: `URL path does not match the expected raw-file pattern for ${rule.note}.`,
    };
  }

  if (!rule.skipExtCheck && !opts.allowJson) {
    if (!hasValidExtension(url.pathname)) {
      return {
        valid: false, code: 400,
        message: `URL must point to a Markdown file (.md .markdown .mkd .mdown .mdx). Got: "${url.pathname.split('/').pop()}"`,
      };
    }
  }

  if (opts.allowJson) {
    const lower = url.pathname.toLowerCase();
    if (!lower.endsWith('.json') && !hasValidExtension(lower)) {
      return { valid: false, code: 400, message: 'Config URL must point to a .json or .md file.' };
    }
  }

  return { valid: true, url };
}

function listAllowedHosts() {
  return ALLOWED_HOSTS.map((h) => `${h.host} — ${h.note}`);
}

module.exports = { validateMarkdownUrl, listAllowedHosts };
