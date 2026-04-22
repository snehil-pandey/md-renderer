/**
 * services/themeEngine.js
 *
 * Six self-contained visual themes, each with:
 *   • Complete inline CSS  (zero external dependencies)
 *   • Responsive container layout
 *   • Styled KaTeX math, Mermaid figures, code blocks, containers
 *   • SVG doodle — injected by renderer.js into the page as decorative markup
 *
 * HOW TO ADD A THEME
 * ──────────────────
 * 1. Add a new key to the THEMES object below.
 * 2. Populate: { label, description, css, doodle }
 *    • label        — display name shown in /health and docs
 *    • description  — one-liner used in the README theme table
 *    • css          — complete self-contained CSS string (inline only)
 *    • doodle       — raw SVG string injected as .doodle element in <body>
 *                     Tip: position it with CSS class "doodle" (absolute/fixed).
 *                     Set pointer-events:none so it never blocks text selection.
 * 3. The fallback theme is always "documentation" — do not remove it.
 * 4. Run `node test.js` to verify your theme is detected and renders.
 *
 * THEME CSS CONVENTIONS
 * ─────────────────────
 * • Target .container for the main content wrapper (max-width, margin:0 auto)
 * • Target .hljs-pre pre / code for syntax-highlighted code blocks
 * • Target .math-display for block KaTeX math
 * • Target .mermaid-diagram for Mermaid figure wrappers
 * • Target .custom-container--tip/warning/danger/info/note for callout boxes
 * • Target .footnotes for the footnote section
 * • Use CSS variables if you need to share values across selectors
 * • No @import, no external font URLs, no url() pointing to external resources
 *   (use system font stacks or base64-encoded data URIs for decorative elements)
 *
 * DOODLE SVG CONVENTIONS
 * ──────────────────────
 * • Keep the SVG under ~3 KB (inline in every page response)
 * • Always set pointer-events="none" on the root <svg>
 * • Use CSS class "doodle" which the theme's own CSS positions absolutely
 * • Prefer opacity ≤ 0.15 so it never fights with content readability
 * • Use currentColor or fixed palette — match your theme's ink colour
 */

'use strict';

// ─── Shared highlight.js colour palettes ─────────────────────────────────────
const HLJS_LIGHT = `
  .hljs-comment,.hljs-quote{color:#6e7781;font-style:italic}
  .hljs-keyword,.hljs-selector-tag,.hljs-deletion{color:#cf222e}
  .hljs-number,.hljs-tag .hljs-attr,.hljs-literal{color:#0550ae}
  .hljs-string,.hljs-regexp,.hljs-addition,.hljs-attribute{color:#0a3069}
  .hljs-built_in,.hljs-class .hljs-title,.hljs-type{color:#953800}
  .hljs-variable,.hljs-template-variable{color:#0550ae}
  .hljs-title,.hljs-section,.hljs-name{color:#0550ae;font-weight:700}
  .hljs-bullet,.hljs-meta{color:#116329}
  .hljs-emphasis{font-style:italic}
  .hljs-strong{font-weight:700}
  .hljs-link{text-decoration:underline}
`;
const HLJS_DARK = `
  .hljs-comment,.hljs-quote{color:#8b949e;font-style:italic}
  .hljs-keyword,.hljs-selector-tag,.hljs-deletion{color:#ff7b72}
  .hljs-number,.hljs-literal,.hljs-tag .hljs-attr{color:#79c0ff}
  .hljs-string,.hljs-regexp,.hljs-addition,.hljs-attribute{color:#a5d6ff}
  .hljs-built_in,.hljs-class .hljs-title,.hljs-type{color:#ffa657}
  .hljs-variable,.hljs-template-variable{color:#79c0ff}
  .hljs-title,.hljs-section,.hljs-name{color:#d2a8ff;font-weight:700}
  .hljs-bullet,.hljs-meta{color:#7ee787}
  .hljs-emphasis{font-style:italic}
  .hljs-strong{font-weight:700}
  .hljs-link{text-decoration:underline}
`;

// Shared callout-container styles (each theme overrides colours only)
const CONTAINER_BASE = `
  .custom-container{padding:14px 18px;border-radius:6px;margin:1.4em 0;border-left:4px solid}
  .custom-container__title{font-weight:700;margin:0 0 6px;font-size:.92em;text-transform:uppercase;letter-spacing:.04em}
  .custom-container--tip{background:#e6f6e6;border-color:#2da44e;color:#1a4a25}
  .custom-container--tip .custom-container__title{color:#2da44e}
  .custom-container--warning{background:#fff8e1;border-color:#d4a017;color:#5a3e00}
  .custom-container--warning .custom-container__title{color:#b08000}
  .custom-container--danger{background:#ffebe9;border-color:#cf222e;color:#5a0a10}
  .custom-container--danger .custom-container__title{color:#cf222e}
  .custom-container--info{background:#ddf4ff;border-color:#0969da;color:#0a2d6c}
  .custom-container--info .custom-container__title{color:#0969da}
  .custom-container--note{background:#f6f2ff;border-color:#8250df;color:#2d1a6e}
  .custom-container--note .custom-container__title{color:#8250df}
  .custom-container--details{background:#f6f8fa;border-color:#d0d7de;color:#24292f}
`;

const MATH_BASE = `
  .math-display{overflow-x:auto;text-align:center;margin:1.4em 0;padding:.5em 0}
  .katex-display{overflow-x:auto}
  .math-error{color:#cf222e;font-family:monospace;font-size:.9em}
`;

const MERMAID_BASE = `
  .mermaid-diagram{text-align:center;margin:1.6em 0}
  .mermaid-diagram img{max-width:100%;border-radius:8px}
`;

const FOOTNOTE_BASE = `
  .footnotes{margin-top:3em;padding-top:1em;font-size:.88em;color:#666}
  .footnotes-sep{border:none;border-top:1px solid #ddd;margin-bottom:1em}
  .footnotes ol{padding-left:1.5em}
  .footnotes li{margin:.3em 0}
`;

// ─────────────────────────────────────────────────────────────────────────────
// THEMES
// ─────────────────────────────────────────────────────────────────────────────
const THEMES = {

  // ╔══════════════════════════════════════════════════════════╗
  // ║  1. scientific-doc                                       ║
  // ╚══════════════════════════════════════════════════════════╝
  'scientific-doc': {
    label: 'Scientific Document',
    description: 'Serif fonts, justified text, academic two-column feel',
    doodle: `
<svg class="doodle" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 340 340" width="340" height="340" pointer-events="none" aria-hidden="true">
  <!-- Atomic orbit decoration -->
  <g opacity="0.07" fill="none" stroke="#1a1a3e" stroke-width="1.2">
    <ellipse cx="170" cy="170" rx="130" ry="50" transform="rotate(0 170 170)"/>
    <ellipse cx="170" cy="170" rx="130" ry="50" transform="rotate(60 170 170)"/>
    <ellipse cx="170" cy="170" rx="130" ry="50" transform="rotate(120 170 170)"/>
    <circle cx="170" cy="170" r="10" fill="#1a1a3e"/>
    <circle cx="300" cy="170" r="5" fill="#1a1a3e"/>
    <circle cx="105" cy="85"  r="5" fill="#1a1a3e"/>
    <circle cx="105" cy="255" r="5" fill="#1a1a3e"/>
  </g>
  <!-- Corner rule lines -->
  <g opacity="0.1" stroke="#1a1a3e" stroke-width="1">
    <line x1="10" y1="10" x2="60" y2="10"/>
    <line x1="10" y1="10" x2="10" y2="60"/>
    <line x1="330" y1="10" x2="280" y2="10"/>
    <line x1="330" y1="10" x2="330" y2="60"/>
    <line x1="10"  y1="330" x2="60"  y2="330"/>
    <line x1="10"  y1="330" x2="10"  y2="280"/>
    <line x1="330" y1="330" x2="280" y2="330"/>
    <line x1="330" y1="330" x2="330" y2="280"/>
  </g>
</svg>`,
    css: `
      *,*::before,*::after{box-sizing:border-box;margin:0;padding:0}
      html{font-size:13pt;scroll-behavior:smooth}
      body{
        font-family:'Times New Roman',Times,Georgia,serif;
        line-height:1.7;color:#111;
        background:#dedad4;
        background-image:
          repeating-linear-gradient(90deg,transparent,transparent 119px,rgba(0,0,0,.03) 120px),
          repeating-linear-gradient(0deg,transparent,transparent 27px,rgba(0,0,0,.03) 28px);
        padding:48px 20px 80px;
        position:relative;overflow-x:hidden;
      }
      .doodle{position:fixed;bottom:0;right:0;pointer-events:none;opacity:.12;z-index:0}
      .container{
        max-width:840px;margin:0 auto;position:relative;z-index:1;
        background:#fffff8;padding:72px 88px;
        border:1px solid #bbb;
        box-shadow:2px 4px 20px rgba(0,0,0,.12),0 0 0 4px rgba(200,195,180,.35);
      }
      h1{font-size:1.95em;text-align:center;letter-spacing:.01em;
         border-bottom:2px double #333;padding-bottom:.4em;margin:0 0 .6em}
      h2{font-size:1.48em;border-bottom:1px solid #aaa;padding-bottom:.22em;margin:2.2em 0 .75em}
      h3{font-size:1.22em;margin:1.8em 0 .5em}
      h4,h5,h6{margin:1.3em 0 .4em}
      p{margin:.85em 0;text-align:justify;hyphens:auto}
      a{color:#0d006a;text-decoration:underline}
      a.header-anchor{opacity:0;margin-left:.35em;font-size:.75em;color:inherit}
      h1:hover .header-anchor,h2:hover .header-anchor,h3:hover .header-anchor{opacity:.4}
      code{font-family:'Courier New',Courier,monospace;font-size:.87em;
           background:#f2f0e8;padding:.1em .38em;border-radius:2px;border:1px solid #ddd}
      pre.hljs-pre{background:#f7f5ee;border:1px solid #ccc;border-left:4px solid #555;
                   padding:18px 20px;overflow-x:auto;margin:1.3em 0;border-radius:2px}
      pre.hljs-pre code{background:none;border:none;padding:0;font-size:.86em}
      blockquote{border-left:3px solid #888;margin:1.3em 0;
                 padding:.6em 1.2em;color:#555;font-style:italic;background:#faf8f0}
      table{width:100%;border-collapse:collapse;margin:1.3em 0;font-size:.94em}
      th{background:#eeece0;border:1px solid #bbb;padding:8px 13px;font-weight:700;text-align:left}
      td{border:1px solid #ccc;padding:7px 13px}
      tr:nth-child(even) td{background:#faf8f0}
      ul,ol{margin:.85em 0 .85em 2.3em}li{margin:.3em 0}
      img{max-width:100%;display:block;margin:1.4em auto;border:1px solid #ccc}
      hr{border:none;border-top:2px double #aaa;margin:2.4em 0}
      .task-list-item{list-style:none;margin-left:-1.3em}
      input[type=checkbox]{margin-right:6px;vertical-align:middle}
      ${CONTAINER_BASE}
      ${MATH_BASE}
      ${MERMAID_BASE}
      ${FOOTNOTE_BASE}
      ${HLJS_LIGHT}
    `,
  },

  // ╔══════════════════════════════════════════════════════════╗
  // ║  2. artistic-story                                       ║
  // ╚══════════════════════════════════════════════════════════╝
  'artistic-story': {
    label: 'Artistic Story',
    description: 'Warm parchment tones, generous line-height, elegant serif reading',
    doodle: `
<svg class="doodle" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 600" width="260" height="390" pointer-events="none" aria-hidden="true">
  <!-- Flowing vine -->
  <g opacity="0.13" fill="none" stroke="#7a3a00" stroke-linecap="round">
    <path d="M200 0 Q180 80 200 160 Q220 240 200 320 Q180 400 200 480 Q220 560 200 600" stroke-width="2"/>
    <path d="M200 60  Q160 40 140 70  Q120 100 150 110" stroke-width="1.5"/>
    <path d="M200 130 Q240 110 260 140 Q280 170 250 180" stroke-width="1.5"/>
    <path d="M200 220 Q160 200 130 230 Q110 260 145 270" stroke-width="1.5"/>
    <path d="M200 310 Q240 290 265 320 Q285 355 255 360" stroke-width="1.5"/>
    <path d="M200 400 Q158 380 135 415 Q115 450 148 455" stroke-width="1.5"/>
    <!-- Leaves -->
    <ellipse cx="138" cy="90"  rx="14" ry="7" transform="rotate(-30 138 90)"  fill="#7a3a00" opacity="0.4"/>
    <ellipse cx="255" cy="160" rx="14" ry="7" transform="rotate(30 255 160)"  fill="#7a3a00" opacity="0.4"/>
    <ellipse cx="136" cy="252" rx="14" ry="7" transform="rotate(-25 136 252)" fill="#7a3a00" opacity="0.4"/>
    <ellipse cx="258" cy="342" rx="14" ry="7" transform="rotate(28 258 342)"  fill="#7a3a00" opacity="0.4"/>
    <ellipse cx="140" cy="438" rx="14" ry="7" transform="rotate(-22 140 438)" fill="#7a3a00" opacity="0.4"/>
  </g>
</svg>`,
    css: `
      *,*::before,*::after{box-sizing:border-box;margin:0;padding:0}
      html{font-size:17.5px;scroll-behavior:smooth}
      body{
        font-family:'Palatino Linotype',Palatino,'Book Antiqua',Georgia,serif;
        line-height:2;color:#2d1a0a;
        background:#f0e6d2;
        background-image:radial-gradient(ellipse at 10% 20%,rgba(180,110,50,.10) 0%,transparent 55%),
                         radial-gradient(ellipse at 90% 80%,rgba(150,80,30,.08) 0%,transparent 55%);
        padding:64px 20px 100px;
        position:relative;overflow-x:hidden;
      }
      .doodle{position:fixed;top:0;right:30px;pointer-events:none;opacity:1;z-index:0}
      .container{
        max-width:740px;margin:0 auto;position:relative;z-index:1;
        background:rgba(255,252,244,.96);padding:68px 80px;
        border-radius:3px;
        box-shadow:0 8px 40px rgba(100,50,10,.18),inset 0 0 80px rgba(200,150,80,.06);
        border-top:3px solid #c8864a;
      }
      h1{font-size:2.4em;color:#5a1e00;text-align:center;
         font-weight:normal;letter-spacing:.04em;margin:0 0 .5em;
         text-shadow:1px 1px 0 rgba(255,220,150,.6)}
      h2{font-size:1.68em;color:#6b2600;font-weight:normal;margin:2.6em 0 .75em;
         border-bottom:1px solid rgba(180,100,40,.3);padding-bottom:.25em}
      h3{font-size:1.3em;color:#7a3200;margin:1.8em 0 .55em}
      h4,h5,h6{color:#8b4000;margin:1.3em 0 .4em}
      p{margin:1.1em 0}
      a{color:#a02020;text-decoration:none;border-bottom:1px solid rgba(160,32,32,.3)}
      a:hover{border-bottom-color:#a02020}
      a.header-anchor{opacity:0;margin-left:.4em;font-size:.75em;color:inherit;border:none}
      h1:hover .header-anchor,h2:hover .header-anchor,h3:hover .header-anchor{opacity:.3}
      code{font-family:'Courier New',monospace;font-size:.86em;
           background:#f5e0cc;padding:.13em .4em;border-radius:3px;color:#5a1e00}
      pre.hljs-pre{background:#1c0e04;border-radius:8px;padding:22px;
                   overflow-x:auto;margin:1.8em 0;
                   box-shadow:0 4px 20px rgba(0,0,0,.35)}
      pre.hljs-pre code{color:#f0d4a8;background:none;padding:0;font-size:.87em}
      blockquote{border-left:3px solid #c8864a;margin:1.8em 0;
                 padding:.8em 1.4em;font-style:italic;color:#6b3a1a;
                 background:rgba(200,134,74,.06);border-radius:0 6px 6px 0}
      table{width:100%;border-collapse:collapse;margin:1.8em 0}
      th{background:rgba(200,134,74,.15);border:1px solid rgba(200,134,74,.4);
         padding:10px 14px;color:#5a1e00;font-weight:700}
      td{border:1px solid rgba(200,134,74,.25);padding:8px 14px}
      tr:nth-child(even) td{background:rgba(200,134,74,.05)}
      ul,ol{margin:1.1em 0 1.1em 2.3em}li{margin:.45em 0}
      img{max-width:100%;border-radius:8px;display:block;
          margin:2em auto;box-shadow:0 4px 20px rgba(0,0,0,.22)}
      hr{border:none;text-align:center;margin:3em 0}
      hr::after{content:"— ✕ —";color:#c8864a;letter-spacing:.6em;font-size:.9em}
      .task-list-item{list-style:none;margin-left:-1.3em}
      input[type=checkbox]{margin-right:6px;vertical-align:middle;accent-color:#8b4000}
      ${CONTAINER_BASE.replace(/tip\{[^}]+/,'tip{background:#fff5e6;border-color:#d4850a')}
      ${MATH_BASE}
      ${MERMAID_BASE}
      ${FOOTNOTE_BASE}
      ${HLJS_DARK}
    `,
  },

  // ╔══════════════════════════════════════════════════════════╗
  // ║  3. documentation  (DEFAULT)                             ║
  // ╚══════════════════════════════════════════════════════════╝
  'documentation': {
    label: 'Documentation',
    description: 'GitHub-style developer docs — clean headings, monospace code, responsive',
    doodle: `
<svg class="doodle" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200" width="200" height="200" pointer-events="none" aria-hidden="true">
  <!-- Code-bracket decoration -->
  <g opacity="0.06" fill="none" stroke="#24292f" stroke-width="8" stroke-linecap="round" stroke-linejoin="round">
    <polyline points="60,40 20,100 60,160"/>
    <polyline points="140,40 180,100 140,160"/>
  </g>
  <g opacity="0.04" fill="#24292f" font-family="monospace" font-size="11">
    <text x="10" y="20">import</text>
    <text x="10" y="38">export</text>
    <text x="10" y="56">const</text>
    <text x="10" y="74">async</text>
    <text x="10" y="92">await</text>
    <text x="10" y="110">return</text>
    <text x="10" y="128">class</text>
    <text x="10" y="146">function</text>
    <text x="10" y="164">module</text>
    <text x="10" y="182">require</text>
    <text x="10" y="198">exports</text>
  </g>
</svg>`,
    css: `
      *,*::before,*::after{box-sizing:border-box;margin:0;padding:0}
      html{font-size:16px;scroll-behavior:smooth}
      body{
        font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;
        line-height:1.65;color:#24292f;background:#fff;
        padding:32px 16px 80px;
        position:relative;overflow-x:hidden;
      }
      .doodle{position:fixed;bottom:20px;right:20px;pointer-events:none;z-index:0}
      .container{max-width:960px;margin:0 auto;position:relative;z-index:1}
      /* Headings */
      h1{font-size:2em;padding-bottom:.3em;border-bottom:1px solid #d0d7de;margin:1.5rem 0 1rem}
      h2{font-size:1.5em;padding-bottom:.3em;border-bottom:1px solid #d0d7de;margin:1.8rem 0 1rem}
      h3{font-size:1.25em;margin:1.5rem 0 .6rem}
      h4{font-size:1em;margin:1.3rem 0 .5rem}
      h5,h6{font-size:.875em;color:#57606a;margin:1rem 0 .4rem}
      /* Anchor links */
      a.header-anchor{color:inherit;opacity:0;margin-left:.4em;font-size:.8em}
      h1:hover a.header-anchor,h2:hover a.header-anchor,
      h3:hover a.header-anchor,h4:hover a.header-anchor{opacity:.5}
      p{margin:0 0 1rem}
      a{color:#0969da;text-decoration:none}
      a:hover{text-decoration:underline}
      /* Code */
      code{font-family:'SFMono-Regular',Consolas,'Liberation Mono',Menlo,monospace;
           font-size:85%;background:rgba(175,184,193,.2);
           padding:.2em .4em;border-radius:6px}
      pre.hljs-pre{background:#f6f8fa;border:1px solid #d0d7de;border-radius:6px;
                   padding:18px;overflow-x:auto;margin:0 0 1rem}
      pre.hljs-pre code{background:none;padding:0;border-radius:0;font-size:87%}
      /* Blockquote */
      blockquote{border-left:4px solid #d0d7de;color:#57606a;
                 margin:0 0 1rem;padding:.5em 1em}
      /* Tables */
      table{border-collapse:collapse;width:100%;margin-bottom:1rem;
            display:block;overflow-x:auto}
      th{background:#f6f8fa;font-weight:600}
      th,td{border:1px solid #d0d7de;padding:6px 13px;text-align:left}
      tr:nth-child(even) td{background:#f6f8fa}
      /* Lists */
      ul,ol{padding-left:2em;margin-bottom:1rem}
      li{margin:.25em 0}
      .task-list-item{list-style:none;margin-left:-1.5em}
      input[type=checkbox]{margin-right:5px;vertical-align:middle}
      img{max-width:100%;border-radius:6px}
      hr{border:none;border-top:1px solid #d0d7de;margin:24px 0}
      /* Language tag on code blocks */
      pre.hljs-pre{position:relative}
      /* Details / summary */
      details{border:1px solid #d0d7de;border-radius:6px;padding:8px 16px;margin-bottom:1rem}
      summary{cursor:pointer;font-weight:600}
      ${CONTAINER_BASE}
      ${MATH_BASE}
      ${MERMAID_BASE}
      ${FOOTNOTE_BASE}
      ${HLJS_LIGHT}
    `,
  },

  // ╔══════════════════════════════════════════════════════════╗
  // ║  4. ancient-script                                       ║
  // ╚══════════════════════════════════════════════════════════╝
  'ancient-script': {
    label: 'Ancient Script',
    description: 'Parchment background, brown ink, decorative borders — medieval scroll feel',
    doodle: `
<svg class="doodle" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 300 300" width="300" height="300" pointer-events="none" aria-hidden="true">
  <!-- Celtic-ish knotwork corner -->
  <g opacity="0.15" fill="none" stroke="#5a2800" stroke-width="2" stroke-linecap="round">
    <!-- Outer frame -->
    <rect x="10" y="10" width="280" height="280" rx="4"/>
    <rect x="20" y="20" width="260" height="260" rx="2"/>
    <!-- Corner rosettes -->
    <circle cx="40"  cy="40"  r="12"/><circle cx="40"  cy="40"  r="6"/>
    <circle cx="260" cy="40"  r="12"/><circle cx="260" cy="40"  r="6"/>
    <circle cx="40"  cy="260" r="12"/><circle cx="40"  cy="260" r="6"/>
    <circle cx="260" cy="260" r="12"/><circle cx="260" cy="260" r="6"/>
    <!-- Mid-side ornaments -->
    <path d="M150 18 l6 10 l-12 0 Z"/>
    <path d="M150 282 l6 -10 l-12 0 Z"/>
    <path d="M18 150 l10 6 l0 -12 Z"/>
    <path d="M282 150 l-10 6 l0 -12 Z"/>
    <!-- Central motif -->
    <circle cx="150" cy="150" r="28"/>
    <circle cx="150" cy="150" r="18"/>
    <circle cx="150" cy="150" r="8" fill="#5a2800" opacity="0.3"/>
    <line x1="150" y1="122" x2="150" y2="80"/>
    <line x1="150" y1="178" x2="150" y2="220"/>
    <line x1="122" y1="150" x2="80"  y2="150"/>
    <line x1="178" y1="150" x2="220" y2="150"/>
  </g>
</svg>`,
    css: `
      *,*::before,*::after{box-sizing:border-box;margin:0;padding:0}
      html{font-size:15px;scroll-behavior:smooth}
      body{
        font-family:'Palatino Linotype',Palatino,Georgia,'Times New Roman',serif;
        line-height:1.85;color:#2c1200;
        background:#8b6320;
        background-image:
          repeating-linear-gradient(0deg,transparent,transparent 27px,rgba(80,40,0,.07) 28px),
          repeating-linear-gradient(90deg,transparent,transparent 120px,rgba(80,40,0,.04) 121px);
        padding:48px 20px 80px;
        position:relative;overflow-x:hidden;
      }
      .doodle{position:fixed;top:50%;left:50%;
              transform:translate(-50%,-50%);
              pointer-events:none;z-index:0;opacity:.15}
      .container{
        max-width:800px;margin:0 auto;position:relative;z-index:1;
        background:#f2dea0;
        background-image:radial-gradient(ellipse at 15% 15%,rgba(140,90,20,.14) 0%,transparent 55%),
                         radial-gradient(ellipse at 85% 85%,rgba(100,55,10,.12) 0%,transparent 55%);
        padding:68px 80px;
        border:2px solid #6b3c08;
        box-shadow:6px 6px 28px rgba(40,18,0,.55),inset 0 0 100px rgba(160,110,30,.10);
      }
      /* Inner decorative border */
      .container::before{
        content:'';position:absolute;inset:12px;
        border:1px solid rgba(100,60,10,.28);pointer-events:none;
      }
      .container::after{
        content:'';position:absolute;inset:18px;
        border:1px dashed rgba(100,60,10,.15);pointer-events:none;
      }
      h1{font-size:2.1em;text-align:center;color:#3c1200;
         margin:0 0 .6em;letter-spacing:.05em;
         text-shadow:1px 1px 0 rgba(255,210,100,.45)}
      h2{font-size:1.55em;color:#4a1a00;
         border-bottom:1px solid rgba(100,55,10,.35);padding-bottom:.25em;
         margin:2.4em 0 .7em}
      h3{font-size:1.24em;color:#5a2200;margin:1.8em 0 .5em}
      h4,h5,h6{color:#6b3000;margin:1.3em 0 .4em}
      p{margin:.95em 0;text-align:justify;hyphens:auto}
      a{color:#6b0000;text-decoration:underline}
      a.header-anchor{opacity:0;margin-left:.4em;font-size:.75em;color:inherit}
      h1:hover a.header-anchor,h2:hover a.header-anchor,h3:hover a.header-anchor{opacity:.35}
      code{font-family:'Courier New',Courier,monospace;font-size:.86em;
           background:rgba(100,60,10,.12);padding:.1em .38em;
           border:1px solid rgba(100,60,10,.25);border-radius:2px;color:#4a1a00}
      pre.hljs-pre{background:rgba(20,8,0,.88);border:2px solid #7a4a10;
                   padding:18px;overflow-x:auto;margin:1.4em 0;border-radius:3px}
      pre.hljs-pre code{color:#e8d070;background:none;border:none;padding:0;font-size:.87em}
      blockquote{border-left:3px solid #8b5e18;margin:1.4em 0;
                 padding:.65em 1.2em;font-style:italic;color:#4a2200;
                 background:rgba(100,60,10,.08)}
      table{width:100%;border-collapse:collapse;margin:1.4em 0}
      th{background:rgba(100,60,10,.18);border:1px solid #8b5e18;
         padding:8px 13px;color:#2c1000;font-weight:700}
      td{border:1px solid rgba(100,60,10,.4);padding:7px 13px}
      tr:nth-child(even) td{background:rgba(100,60,10,.07)}
      ul,ol{margin:.95em 0 .95em 2.2em}li{margin:.35em 0}
      img{max-width:100%;display:block;margin:1.8em auto;
          border:3px solid #8b5e18;box-shadow:3px 3px 12px rgba(0,0,0,.35)}
      hr{border:none;border-top:2px solid #8b5e18;margin:2.5em 0}
      .task-list-item{list-style:none;margin-left:-1.3em}
      input[type=checkbox]{margin-right:6px;vertical-align:middle}
      ${CONTAINER_BASE}
      ${MATH_BASE}
      ${MERMAID_BASE}
      ${FOOTNOTE_BASE}
      /* Dark code block hljs colours */
      pre.hljs-pre .hljs-comment{color:#a09060;font-style:italic}
      pre.hljs-pre .hljs-keyword{color:#ffaa60}
      pre.hljs-pre .hljs-string{color:#ffe075}
      pre.hljs-pre .hljs-number{color:#aaddff}
      pre.hljs-pre .hljs-built_in{color:#ffcc88}
      pre.hljs-pre .hljs-title{color:#ffdd44;font-weight:700}
      ${HLJS_LIGHT}
    `,
  },

  // ╔══════════════════════════════════════════════════════════╗
  // ║  5. story                                                ║
  // ╚══════════════════════════════════════════════════════════╝
  'story': {
    label: 'Story',
    description: 'Minimal centered column, generous whitespace — fiction and long-form prose',
    doodle: `
<svg class="doodle" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 200" width="80" height="133" pointer-events="none" aria-hidden="true">
  <!-- Quill pen -->
  <g opacity="0.08" fill="#1a1a1a">
    <!-- Feather body -->
    <path d="M60 10 Q90 40 75 80 Q65 110 55 140 Q50 160 58 190 Q50 175 40 170 Q45 145 48 120 Q35 90 35 60 Q40 30 60 10 Z"/>
    <!-- Quill tip -->
    <path d="M58 190 Q54 185 52 178 Q55 182 60 180 Q62 188 58 190 Z" fill="#1a1a1a"/>
    <!-- Vane lines -->
    <path d="M60 10 Q75 50 68 90" stroke="#1a1a1a" stroke-width="0.8" fill="none" opacity="0.5"/>
    <path d="M55 30 Q45 50 42 75" stroke="#1a1a1a" stroke-width="0.7" fill="none" opacity="0.4"/>
    <path d="M63 50 Q70 65 69 85" stroke="#1a1a1a" stroke-width="0.7" fill="none" opacity="0.4"/>
  </g>
</svg>`,
    css: `
      *,*::before,*::after{box-sizing:border-box;margin:0;padding:0}
      html{font-size:19px;scroll-behavior:smooth}
      body{
        font-family:Georgia,'Cambria','Hoefler Text',Baskerville,serif;
        line-height:1.9;color:#1a1a1a;background:#fdfdfc;
        padding:80px 20px 120px;
        position:relative;overflow-x:hidden;
      }
      .doodle{position:fixed;top:40px;right:40px;pointer-events:none;z-index:0}
      .container{max-width:660px;margin:0 auto;position:relative;z-index:1}
      h1{font-size:2.1em;font-weight:normal;letter-spacing:-.01em;
         margin:0 0 .9rem;color:#111}
      h2{font-size:1.55em;font-weight:normal;margin:2.8rem 0 .9rem;color:#222}
      h3{font-size:1.22em;margin:2rem 0 .6rem}
      h4,h5,h6{margin:1.5rem 0 .5rem}
      p{margin:0 0 1.4rem}
      a{color:#1a1a1a;text-decoration:underline;text-underline-offset:3px;text-decoration-thickness:1px}
      a:hover{color:#000}
      a.header-anchor{opacity:0;margin-left:.4em;font-size:.75em;color:inherit}
      h1:hover a.header-anchor,h2:hover a.header-anchor,h3:hover a.header-anchor{opacity:.3}
      code{font-family:'SFMono-Regular',Menlo,Consolas,monospace;font-size:.83em;
           background:#f0f0f0;padding:.15em .4em;border-radius:3px}
      pre.hljs-pre{background:#f5f5f5;border:1px solid #e4e4e4;border-radius:5px;
                   padding:20px;overflow-x:auto;margin:1.8rem 0;font-size:14px}
      pre.hljs-pre code{background:none;padding:0;border-radius:0;font-size:inherit}
      blockquote{border-left:2px solid #ccc;margin:1.8rem 0;
                 padding:.5rem 1.4rem;color:#666;font-style:italic}
      table{width:100%;border-collapse:collapse;margin:1.8rem 0;font-size:.94em}
      th{border-bottom:2px solid #222;padding:8px 12px;
         text-align:left;font-weight:normal;color:#555}
      td{border-bottom:1px solid #e8e8e8;padding:8px 12px}
      ul,ol{margin:0 0 1.4rem 2.2em}li{margin:.32em 0}
      .task-list-item{list-style:none;margin-left:-1.4em}
      input[type=checkbox]{margin-right:5px;vertical-align:middle}
      img{max-width:100%;display:block;margin:2rem 0;border-radius:4px}
      hr{border:none;text-align:center;margin:4rem 0;color:#ccc}
      hr::after{content:"· · ·";font-size:1.5em;letter-spacing:.5em}
      details{border-left:3px solid #ddd;padding:.5rem 1rem;margin-bottom:1.4rem}
      summary{cursor:pointer;color:#555}
      ${CONTAINER_BASE}
      ${MATH_BASE}
      ${MERMAID_BASE}
      ${FOOTNOTE_BASE}
      ${HLJS_LIGHT}
    `,
  },

  // ╔══════════════════════════════════════════════════════════╗
  // ║  6. poem                                                 ║
  // ╚══════════════════════════════════════════════════════════╝
  'poem': {
    label: 'Poem',
    description: 'Center-aligned, preserved line breaks, decorative star dividers',
    doodle: `
<svg class="doodle" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 300 300" width="240" height="240" pointer-events="none" aria-hidden="true">
  <!-- Star / petal mandala -->
  <g opacity="0.10" fill="none" stroke="#2a2a2a" stroke-width="1">
    <!-- Outer petals -->
    <ellipse cx="150" cy="150" rx="100" ry="30" transform="rotate(0   150 150)"/>
    <ellipse cx="150" cy="150" rx="100" ry="30" transform="rotate(30  150 150)"/>
    <ellipse cx="150" cy="150" rx="100" ry="30" transform="rotate(60  150 150)"/>
    <ellipse cx="150" cy="150" rx="100" ry="30" transform="rotate(90  150 150)"/>
    <ellipse cx="150" cy="150" rx="100" ry="30" transform="rotate(120 150 150)"/>
    <ellipse cx="150" cy="150" rx="100" ry="30" transform="rotate(150 150 150)"/>
    <!-- Inner ring -->
    <circle cx="150" cy="150" r="45"/>
    <circle cx="150" cy="150" r="22"/>
    <circle cx="150" cy="150" r="7" fill="#2a2a2a" opacity="0.3"/>
    <!-- Dot ring -->
    <circle cx="150" cy="105" r="3" fill="#2a2a2a" opacity="0.4"/>
    <circle cx="150" cy="195" r="3" fill="#2a2a2a" opacity="0.4"/>
    <circle cx="105" cy="150" r="3" fill="#2a2a2a" opacity="0.4"/>
    <circle cx="195" cy="150" r="3" fill="#2a2a2a" opacity="0.4"/>
    <circle cx="118" cy="118" r="3" fill="#2a2a2a" opacity="0.4"/>
    <circle cx="182" cy="118" r="3" fill="#2a2a2a" opacity="0.4"/>
    <circle cx="118" cy="182" r="3" fill="#2a2a2a" opacity="0.4"/>
    <circle cx="182" cy="182" r="3" fill="#2a2a2a" opacity="0.4"/>
  </g>
</svg>`,
    css: `
      *,*::before,*::after{box-sizing:border-box;margin:0;padding:0}
      html{font-size:19px;scroll-behavior:smooth}
      body{
        font-family:Garamond,'EB Garamond','Palatino Linotype',Georgia,serif;
        line-height:2.15;color:#1e1e1e;
        background:#f9f9f6;
        padding:100px 20px 130px;
        text-align:center;
        position:relative;overflow-x:hidden;
      }
      .doodle{position:fixed;top:50%;left:50%;
              transform:translate(-50%,-50%);
              pointer-events:none;z-index:0;opacity:1}
      .container{max-width:580px;margin:0 auto;position:relative;z-index:1}
      h1{font-size:2.5em;font-weight:normal;letter-spacing:.05em;color:#111;margin:0 0 .5em}
      h2{font-size:1.7em;font-weight:normal;margin:2.8em 0 .8em;color:#333}
      h3{font-size:1.3em;font-weight:normal;margin:2em 0 .65em;color:#444}
      h4,h5,h6{font-weight:normal;margin:1.5em 0 .45em;color:#555}
      p{margin:0 0 1.2em;white-space:pre-wrap}
      a{color:#444;text-decoration:none;border-bottom:1px dotted #bbb}
      a:hover{border-bottom-color:#444}
      a.header-anchor{opacity:0;border:none;margin-left:.4em;font-size:.75em}
      h1:hover a.header-anchor,h2:hover a.header-anchor{opacity:.3}
      code{font-family:monospace;font-size:.83em;background:#f0f0ee;
           padding:.14em .38em;border-radius:2px}
      pre.hljs-pre{text-align:left;background:#f4f4f2;border:1px solid #e6e6e2;
                   padding:18px;border-radius:5px;overflow-x:auto;
                   margin:2em auto;max-width:100%;font-size:14px}
      pre.hljs-pre code{background:none;padding:0;font-size:inherit}
      blockquote{margin:2em auto;padding:.6em 3em;font-style:italic;
                 color:#555;position:relative;max-width:90%;
                 border-left:none}
      blockquote::before{content:open-quote;font-size:4em;color:#ddd;
                         position:absolute;top:-.1em;left:.2em;line-height:1;font-style:normal}
      blockquote::after{content:close-quote;font-size:4em;color:#ddd;
                        position:absolute;bottom:-.5em;right:.2em;line-height:1;font-style:normal}
      table{margin:2em auto;border-collapse:collapse;text-align:left}
      th,td{padding:8px 20px;border-bottom:1px solid #e0e0e0}
      th{font-weight:normal;color:#555;border-bottom:2px solid #ccc}
      ul,ol{display:inline-block;text-align:left;margin:1em 0;padding-left:1.8em}
      li{margin:.42em 0}
      .task-list-item{list-style:none;margin-left:-1.1em}
      input[type=checkbox]{margin-right:5px;vertical-align:middle}
      img{max-width:100%;display:block;margin:2.2em auto;border-radius:4px}
      hr{border:none;margin:3.5em 0}
      hr::after{content:"✶   ✶   ✶";
                color:#bbb;letter-spacing:.7em;font-size:.95em}
      .math-display{text-align:center}
      .footnotes{text-align:left}
      ${CONTAINER_BASE}
      ${MATH_BASE}
      ${MERMAID_BASE}
      ${FOOTNOTE_BASE}
      ${HLJS_LIGHT}
    `,
  },
};

// ─────────────────────────────────────────────────────────────────────────────
const DEFAULT_THEME = 'documentation';

function getTheme(name) {
  const key = (name || '').toLowerCase().trim();
  return THEMES[key] || THEMES[DEFAULT_THEME];
}

function listThemes() { return Object.keys(THEMES); }

function getThemeMeta() {
  return Object.entries(THEMES).map(([key, t]) => ({
    key, label: t.label, description: t.description, isDefault: key === DEFAULT_THEME,
  }));
}

module.exports = { getTheme, listThemes, getThemeMeta, DEFAULT_THEME };
