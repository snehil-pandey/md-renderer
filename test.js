'use strict';
/**
 * test.js — unit test suite for md-renderer v3
 * Run with: node test.js
 */

const { validateMarkdownUrl, listAllowedHosts } = require('./utils/validator');
const { fromQuery, fromJson }   = require('./utils/configParser');
const { parseMarkdown }         = require('./services/parser');
const { renderPage, renderClientPage, renderErrorPage } = require('./services/renderer');
const { getTheme, listThemes, getThemeMeta } = require('./services/themeEngine');
const cache = require('./utils/cache');

let total = 0, passed = 0;
const fails = [];

function check(label, ok) {
  total++;
  if (ok) {
    passed++;
    process.stdout.write('  \u2713 ' + label + '\n');
  } else {
    fails.push(label);
    process.stdout.write('  \u2717 ' + label + '\n');
  }
}

// ─── 1. Validator ─────────────────────────────────────────────────────────────
console.log('\n=== VALIDATOR ===');
check('github raw',       validateMarkdownUrl('https://raw.githubusercontent.com/u/r/main/README.md').valid);
check('gist raw',         validateMarkdownUrl('https://gist.githubusercontent.com/u/a/raw/f.md').valid);
check('gitlab /-/raw/',   validateMarkdownUrl('https://gitlab.com/u/r/-/raw/main/README.md').valid);
check('gitlab no raw → blocked', !validateMarkdownUrl('https://gitlab.com/u/r/README.md').valid);
check('bitbucket /raw/',  validateMarkdownUrl('https://bitbucket.org/u/r/raw/main/README.md').valid);
check('codeberg /raw/',   validateMarkdownUrl('https://codeberg.org/u/r/raw/b/README.md').valid);
check('sourcehut /blob/', validateMarkdownUrl('https://git.sr.ht/~u/r/blob/HEAD/README.md').valid);
check('pastebin /raw/',   validateMarkdownUrl('https://pastebin.com/raw/abc123').valid);
check('pastebin non-raw → blocked', !validateMarkdownUrl('https://pastebin.com/abc123').valid);
check('hackmd /download', validateMarkdownUrl('https://hackmd.io/abc/download').valid);
check('evil.com → 403',   validateMarkdownUrl('https://evil.com/f.md').code === 403);
check('http → 400',       validateMarkdownUrl('http://raw.githubusercontent.com/f.md').code === 400);
check('no ext → 400',     !validateMarkdownUrl('https://raw.githubusercontent.com/u/r/main/f.exe').valid);
check('.mdx ok',          validateMarkdownUrl('https://raw.githubusercontent.com/u/r/main/f.mdx').valid);
check('allowJson .json',  validateMarkdownUrl('https://raw.githubusercontent.com/u/r/main/config.json', { allowJson: true }).valid);
check('listAllowedHosts() is array', Array.isArray(listAllowedHosts()) && listAllowedHosts().length > 5);

// ─── 2. ConfigParser — fromQuery ─────────────────────────────────────────────
console.log('\n=== CONFIG PARSER: fromQuery ===');
{
  const { config } = fromQuery({ theme: 'poem' });
  check('fromQuery: no md → mdUrl null', config.mdUrl === null);
  check('fromQuery: theme resolved', config.theme === 'poem');
  check('fromQuery: customTheme null', config.customTheme === null);
}
{
  const { config } = fromQuery({ theme: 'invalid-theme' });
  check('fromQuery: unknown theme → documentation', config.theme === 'documentation');
}
{
  const { error } = fromQuery({ md: 'https://evil.com/f.md' });
  check('fromQuery: blocked domain → error', error && error.code === 403);
}
{
  const { config } = fromQuery({ title: 'My Title', favicon: '🦊' });
  check('fromQuery: title captured', config.title === 'My Title');
  check('fromQuery: emoji favicon captured', config.favicon === '🦊');
}

// ─── 3. ConfigParser — fromJson ───────────────────────────────────────────────
console.log('\n=== CONFIG PARSER: fromJson ===');
{
  const json = JSON.stringify({ md: 'https://raw.githubusercontent.com/u/r/main/README.md', theme: 'story', title: 'Hello' });
  const { config } = fromJson(json, {});
  check('fromJson: mdUrl resolved', config.mdUrl !== null);
  check('fromJson: theme resolved', config.theme === 'story');
  check('fromJson: title captured', config.title === 'Hello');
}
{
  // renderOn is NOT a user-facing field — JSON themes are always client-side.
  // We omit it from the JSON to show the normal usage. Even if someone passes
  // renderOn in their JSON, configParser ignores it and still sets 'client'.
  const json = JSON.stringify({
    md: 'https://raw.githubusercontent.com/u/r/main/README.md',
    theme: { label: 'Night', css: 'body{background:#111;color:#eee}.container{max-width:800px;margin:0 auto}', doodle: '' }
  });
  const { config } = fromJson(json, {});
  check('fromJson: inline theme parsed', config.customTheme !== null);
  check('fromJson: JSON theme always renderOn client', config.customTheme.renderOn === 'client');
  check('fromJson: inline theme label', config.customTheme.label === 'Night');

  // Verify renderOn is ignored even if user tries to set it
  const jsonWithRenderOn = JSON.stringify({
    md: 'https://raw.githubusercontent.com/u/r/main/README.md',
    theme: { renderOn: 'server', label: 'Attempt', css: 'body{color:red}.container{max-width:800px;margin:0 auto}', doodle: '' }
  });
  const { config: cWithRO } = fromJson(jsonWithRenderOn, {});
  check('fromJson: user renderOn:server is ignored → still client', cWithRO.customTheme.renderOn === 'client');
}
{
  // query param overrides JSON field
  const json = JSON.stringify({ theme: 'poem' });
  const { config } = fromJson(json, { theme: 'story' });
  check('fromJson: query theme overrides JSON', config.theme === 'story');
}
{
  // Invalid JSON
  const { error } = fromJson('not json', {});
  check('fromJson: invalid JSON → 400', error && error.code === 400);
}
{
  // CSS too short
  const json = JSON.stringify({ theme: { renderOn: 'server', css: 'a{}' } });
  const { error } = fromJson(json, {});
  check('fromJson: short CSS → error', !!error);
}
{
  // Script in doodle
  const json = JSON.stringify({ theme: { renderOn: 'server', css: 'body{color:red}.container{max-width:800px}', doodle: '<svg><script>alert(1)</script></svg>' } });
  const { error } = fromJson(json, {});
  check('fromJson: script in doodle → error', !!error);
}
{
  // Favicon variants
  const j1 = JSON.stringify({ favicon: 'https://example.com/icon.png' });
  const j2 = JSON.stringify({ favicon: 'data:image/png;base64,abc' });
  const j3 = JSON.stringify({ favicon: '🚀' });
  const j4 = JSON.stringify({ favicon: 'not-a-url-not-emoji-too-long-string' });
  check('fromJson: https favicon ok', !fromJson(j1, {}).error);
  check('fromJson: data: favicon ok', !fromJson(j2, {}).error);
  check('fromJson: emoji favicon ok', !fromJson(j3, {}).error);
  check('fromJson: bad favicon → error', !!fromJson(j4, {}).error);
}

// ─── 4. Parser ────────────────────────────────────────────────────────────────
console.log('\n=== PARSER ===');
check('headings',          parseMarkdown('# H1\n## H2').includes('<h1'));
check('bold',              parseMarkdown('**bold**').includes('<strong>'));
check('task list',         parseMarkdown('- [x] Done').includes('checkbox'));
check('table',             parseMarkdown('|A|B|\n|---|---|\n|1|2|').includes('<table'));
check('hljs code block',   parseMarkdown('```js\nlet x=1;\n```').includes('hljs'));
check('blockquote',        parseMarkdown('> Q').includes('<blockquote'));
check('link noopener',     parseMarkdown('[x](https://github.com)').includes('noopener'));
check('inline math katex', parseMarkdown('$e=mc^2$').includes('katex'));
check('display math',      parseMarkdown('$$\nx\n$$').includes('math-display'));
check('emoji shortcode',   parseMarkdown(':rocket:').length > 5);
check('mermaid → img',     parseMarkdown('```mermaid\ngraph LR\nA-->B\n```').includes('mermaid.ink'));
check('footnote',          parseMarkdown('x[^1]\n\n[^1]: y').includes('footnote'));
check('subscript',         parseMarkdown('H~2~O').includes('<sub>'));
check('superscript',       parseMarkdown('10^9^').includes('<sup>'));
check('container tip',     parseMarkdown('::: tip\nHello\n:::').includes('custom-container--tip'));
// XSS
check('XSS: script stripped',    !parseMarkdown('<script>alert(1)</script>').includes('<script'));
check('XSS: onerror not in attr',!/<[^>]+onerror/i.test(parseMarkdown('![x](x)')));
check('XSS: js: href blocked',   !parseMarkdown('[x](javascript:alert(1))').includes('href="javascript'));

// ─── 5. Renderer ─────────────────────────────────────────────────────────────
console.log('\n=== RENDERER: server mode ===');
const md = '# Test Page\n\nHello world.';
const html = parseMarkdown(md);
const theme = getTheme('documentation');
const page = renderPage(html, { theme, markdownSource: md });

check('DOCTYPE present',        page.startsWith('<!DOCTYPE'));
check('charset UTF-8',          page.includes('charset="UTF-8"'));
check('CSP meta tag',           page.includes('Content-Security-Policy'));
check('script-src none',        page.includes("script-src 'none'"));
check('title from h1',          page.includes('<title>Test Page</title>'));
check('container div',          page.includes('class="container"'));
check('theme CSS inlined',      page.includes('<style>') && page.includes('font-family'));
check('doodle injected',        page.includes('class="doodle"'));
check('KaTeX CSS inlined',      page.includes('katex'));
check('no script tag',          !page.includes('<script'));

// Explicit title override
const withTitle = renderPage(html, { theme, title: 'Custom Title', markdownSource: md });
check('explicit title overrides h1', withTitle.includes('<title>Custom Title</title>'));

// Favicon variants
const withHttpFav  = renderPage(html, { theme, favicon: 'https://example.com/fav.png', markdownSource: md });
const withEmojiFav = renderPage(html, { theme, favicon: '🦊', markdownSource: md });
check('https favicon tag present', withHttpFav.includes('rel="icon"') && withHttpFav.includes('example.com'));
check('emoji favicon → SVG data URI', withEmojiFav.includes('rel="icon"') && withEmojiFav.includes('data:image/svg'));

// All 6 themes render complete documents
console.log('\n=== RENDERER: all themes ===');
for (const name of listThemes()) {
  const t = getTheme(name);
  const p = renderPage(html, { theme: t, markdownSource: md });
  check('[' + name + '] complete document', p.startsWith('<!DOCTYPE') && p.endsWith('</html>'));
}

// Client-side render mode
console.log('\n=== RENDERER: client mode ===');
const clientPage = renderClientPage('# Hello\nworld', { theme });
check('client page DOCTYPE',           clientPage.startsWith('<!DOCTYPE'));
check('client page embeds md-source',  clientPage.includes('md-source'));
check('client page CSP allows CDN',    clientPage.includes('cdn.jsdelivr.net'));
check('client page script-src CDN',    clientPage.includes("script-src https://cdn.jsdelivr.net"));
check('client page inline script',     clientPage.includes('DOMContentLoaded'));
check('client page no server parsing', !clientPage.includes('<h1'));  // not pre-parsed

// Error pages
console.log('\n=== RENDERER: error pages ===');
for (const [code, frag] of [
  [400,'Bad Request'],[403,'Forbidden'],[404,'Not Found'],
  [422,'Unprocessable'],[500,'Internal'],[502,'Bad Gateway'],
  [503,'Service'],[504,'Gateway'],
]) {
  const ep = renderErrorPage(code, 'Test');
  check('error ' + code + ' has "' + frag + '"', ep.includes(frag) && ep.includes(String(code)));
}
const ep404 = renderErrorPage(404, 'Not found');
check('error page dark bg',      ep404.includes('#0d1117'));
check('error page no script',    !ep404.includes('<script'));
check('error page gradient',     ep404.includes('gradient'));
check('error page return link',  ep404.includes('Return home'));

// ─── 6. ThemeEngine ───────────────────────────────────────────────────────────
console.log('\n=== THEME ENGINE ===');
for (const name of listThemes()) {
  const t = getTheme(name);
  check('[' + name + '] has renderOn: server', t.renderOn === 'server');
  check('[' + name + '] has label',            t.label.length > 0);
  check('[' + name + '] has description',      t.description.length > 0);
  check('[' + name + '] has doodle string',    typeof t.doodle === 'string');
  check('[' + name + '] CSS > 500 chars',      t.css.length > 500);
}
check('unknown theme → documentation', getTheme('xyz').label === 'Documentation');
check('listThemes() length 6', listThemes().length === 6);
const meta = getThemeMeta();
check('getThemeMeta returns renderOn', meta.every(m => m.renderOn));
check('documentation isDefault', meta.find(m => m.key === 'documentation').isDefault === true);

// ─── 7. LRU cache ─────────────────────────────────────────────────────────────
console.log('\n=== LRU CACHE ===');
cache.set('k1', 'alpha');
cache.set('k2', 'x'.repeat(4096));
check('set + get',                  cache.get('k1') === 'alpha');
check('has() true',                 cache.has('k1'));
check('has() false for miss',       !cache.has('nope'));
check('get() undefined on miss',    cache.get('nope') === undefined);
const st = cache.stats();
check('stats entries >= 2',         st.entries >= 2);
check('stats maxEntries 200',       st.maxEntries === 200);
check('stats maxBytes 50MB',        st.maxBytes === 50 * 1024 * 1024);

// ─── Summary ──────────────────────────────────────────────────────────────────
console.log('\n' + '═'.repeat(48));
console.log('TOTAL: ' + passed + '/' + total + ' tests passed');
if (fails.length) {
  console.log('\nFailed:');
  for (const f of fails) console.log('  ✗ ' + f);
}
console.log(passed === total ? '\n\u2705  ALL TESTS PASS' : '\n\u274C  SOME TESTS FAILED');
process.exit(passed === total ? 0 : 1);
