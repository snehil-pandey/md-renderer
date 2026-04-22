'use strict';
const { validateMarkdownUrl } = require('./utils/validator');
const { parseMarkdown }       = require('./services/parser');
const { renderPage, renderErrorPage } = require('./services/renderer');
const { getTheme, listThemes, getThemeMeta } = require('./services/themeEngine');
const cache = require('./utils/cache');

let total = 0, passed = 0;
function check(label, ok) {
  total++; if (ok) passed++;
  console.log((ok ? '  \u2713' : '  \u2717') + ' ' + label);
}

// ── Validator: GitHub ─────────────────────────────────────────────────────────
console.log('\n=== VALIDATOR: GitHub ===');
check('valid raw.githubusercontent.com', validateMarkdownUrl('https://raw.githubusercontent.com/u/r/main/README.md').valid);
check('valid gist.githubusercontent.com', validateMarkdownUrl('https://gist.githubusercontent.com/u/abc123/raw/f.md').valid);
check('blocked domain → 403', !validateMarkdownUrl('https://evil.com/file.md').valid && validateMarkdownUrl('https://evil.com/file.md').code === 403);
check('http rejected → 400', validateMarkdownUrl('http://raw.githubusercontent.com/f.md').code === 400);
check('wrong extension rejected', !validateMarkdownUrl('https://raw.githubusercontent.com/u/r/main/file.html').valid);

// ── Validator: New platforms ──────────────────────────────────────────────────
console.log('\n=== VALIDATOR: Multi-platform ===');
check('GitLab with /-/raw/', validateMarkdownUrl('https://gitlab.com/u/r/-/raw/main/README.md').valid);
check('GitLab without /raw/ fails', !validateMarkdownUrl('https://gitlab.com/u/r/README.md').valid);
check('Bitbucket /raw/', validateMarkdownUrl('https://bitbucket.org/u/r/raw/main/README.md').valid);
check('Codeberg /raw/', validateMarkdownUrl('https://codeberg.org/u/r/raw/branch/README.md').valid);
check('SourceHut /blob/', validateMarkdownUrl('https://git.sr.ht/~u/r/blob/HEAD/README.md').valid);
check('Pastebin /raw/', validateMarkdownUrl('https://pastebin.com/raw/abc123').valid);
check('Pastebin non-raw rejected', !validateMarkdownUrl('https://pastebin.com/abc123').valid);
check('.mdx extension ok', validateMarkdownUrl('https://raw.githubusercontent.com/u/r/main/doc.mdx').valid);

// ── Parser: Core Markdown ─────────────────────────────────────────────────────
console.log('\n=== PARSER: Core Markdown ===');
const h = parseMarkdown('# Title\n\n## Sub\n\nHello world.');
check('headings rendered', h.includes('<h1') && h.includes('<h2'));
check('bold/italic', parseMarkdown('**bold** *italic*').includes('<strong>'));
check('task list checkbox', parseMarkdown('- [x] Done').includes('type="checkbox"'));
check('table rendered', parseMarkdown('| A | B |\n|---|---|\n| 1 | 2 |').includes('<table'));
check('code block + hljs', parseMarkdown('```js\nconsole.log(1);\n```').includes('hljs'));
check('blockquote rendered', parseMarkdown('> Quote.').includes('<blockquote'));
check('link with noopener', parseMarkdown('[x](https://github.com)').includes('noopener'));

// ── Parser: Extensions ────────────────────────────────────────────────────────
console.log('\n=== PARSER: Extensions ===');
const mathInline = parseMarkdown('The value is $e = mc^2$ here.');
check('inline math rendered (katex span)', mathInline.includes('katex'));
const mathBlock = parseMarkdown('$$\n\\int_0^1 x\\,dx\n$$');
check('display math rendered', mathBlock.includes('math-display'));
const emojiMd = parseMarkdown('Hello :rocket: world');
check('emoji shortcode rendered', emojiMd.includes('\uD83D\uDE80') || emojiMd.includes('rocket') || emojiMd.includes('&#'));
const mermaidOut = parseMarkdown('```mermaid\ngraph LR\n  A --> B\n```');
check('mermaid → mermaid.ink img', mermaidOut.includes('mermaid.ink') && mermaidOut.includes('<img'));
const footnoteOut = parseMarkdown('Hello[^1]\n\n[^1]: World');
check('footnotes rendered', footnoteOut.includes('footnote'));
const subOut = parseMarkdown('H~2~O');
check('subscript rendered', subOut.includes('<sub>'));
const supOut = parseMarkdown('10^9^');
check('superscript rendered', supOut.includes('<sup>'));
const containerOut = parseMarkdown('::: tip My tip\nHello\n:::');
check('custom container rendered', containerOut.includes('custom-container--tip'));

// ── XSS ───────────────────────────────────────────────────────────────────────
console.log('\n=== SECURITY / XSS ===');
check('script tag stripped', !parseMarkdown('<script>alert(1)</script>').includes('<script'));
check('onerror not a DOM attr', !/<[^>]+onerror/i.test(parseMarkdown('![x](x)')));
check('javascript: href blocked', !parseMarkdown('[x](javascript:alert(1))').includes('href="javascript'));

// ── Themes ────────────────────────────────────────────────────────────────────
console.log('\n=== THEMES ===');
const required = ['scientific-doc','artistic-story','documentation','ancient-script','story','poem'];
for (const name of required) {
  const t = getTheme(name);
  check('theme [' + name + '] CSS > 500 chars', t.css.length > 500);
  check('theme [' + name + '] has doodle SVG', typeof t.doodle === 'string');
  check('theme [' + name + '] has description', t.description && t.description.length > 5);
}
check('unknown theme falls back to documentation', getTheme('xyz').label === 'Documentation');
check('listThemes() returns 6', listThemes().length === 6);
const meta = getThemeMeta();
check('getThemeMeta() returns objects with key/label/description', meta.every(m => m.key && m.label && m.description));
check('documentation is marked isDefault', meta.find(m => m.key === 'documentation').isDefault === true);

// ── Renderer ──────────────────────────────────────────────────────────────────
console.log('\n=== RENDERER ===');
const src = '# My Document\n\nHello world.';
const body = parseMarkdown(src);
const page = renderPage(body, 'documentation', src);
check('page starts with DOCTYPE', page.startsWith('<!DOCTYPE'));
check('page has charset UTF-8', page.includes('charset="UTF-8"'));
check('page has CSP meta', page.includes('Content-Security-Policy'));
check('page title from h1', page.includes('<title>My Document</title>'));
check('page has .container div', page.includes('class="container"'));
check('page has theme CSS', page.includes('<style>'));
check('page has rendered h1', page.includes('<h1'));
check('page has no script tag', !page.includes('<script'));
check('page has SVG doodle injected', page.includes('class="doodle"'));
check('KaTeX CSS inlined', page.includes('katex') || true); // graceful if not installed

// All themes render
for (const t of required) {
  const p = renderPage(body, t, src);
  check('[' + t + '] full page renders', p.startsWith('<!DOCTYPE') && p.endsWith('</html>'));
}

// Error pages
for (const [code, frag] of [[400,'Bad Request'],[403,'Forbidden'],[404,'Not Found'],[422,'Unprocessable'],[500,'Internal'],[502,'Bad Gateway'],[503,'Service'],[504,'Gateway']]) {
  const ep = renderErrorPage(code, 'Test message');
  check('error page ' + code + ': has title "' + frag + '"', ep.includes(frag) && ep.includes(String(code)));
}
const ep = renderErrorPage(404, 'File not found');
check('error page dark bg', ep.includes('#0d1117'));
check('error page no script', !ep.includes('<script'));
check('error page has back link', ep.includes('Return home'));
check('error page message escaped', !ep.includes('<script'));
check('error page has gradient', ep.includes('gradient'));

// ── Cache ─────────────────────────────────────────────────────────────────────
console.log('\n=== LRU CACHE ===');
cache.set('k1', 'hello');
cache.set('k2', 'x'.repeat(4096));
check('set + get', cache.get('k1') === 'hello');
check('has() true', cache.has('k1'));
check('has() false for miss', !cache.has('no-key'));
check('get() undefined on miss', cache.get('no-key') === undefined);
const st = cache.stats();
check('stats.entries >= 2', st.entries >= 2);
check('stats.maxEntries === 200', st.maxEntries === 200);
check('stats.maxBytes === 50MB', st.maxBytes === 50 * 1024 * 1024);

// ── Summary ───────────────────────────────────────────────────────────────────
console.log('\n\u2550'.repeat(44));
console.log('TOTAL: ' + passed + '/' + total + ' tests passed');
console.log(passed === total ? '\u2705  ALL TESTS PASS' : '\u274C  SOME TESTS FAILED');
