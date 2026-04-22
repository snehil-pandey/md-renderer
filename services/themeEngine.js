/**
 * services/themeEngine.js
 *
 * Defines all supported visual themes as self-contained inline CSS strings.
 * No external stylesheets, no web-font imports that require network — every
 * theme works fully offline on low-end devices.
 *
 * Themes:
 *   scientific-doc   — Serif academic layout
 *   artistic-story   — Warm, elegant prose reading
 *   documentation    — GitHub-style developer docs (DEFAULT)
 *   ancient-script   — Parchment / medieval scroll aesthetic
 *   story            — Minimal centered column for fiction
 *   poem             — Centered, spacious, decorative
 *
 * Invalid theme name → falls back to "documentation".
 */

'use strict';

// ─────────────────────────────────────────────────────────────────────────────
// Shared highlight.js token colours (light theme, GitHub-style)
// Embedded once here so each theme doesn't need to repeat it.
// ─────────────────────────────────────────────────────────────────────────────
const HLJS_LIGHT = `
  .hljs-comment,.hljs-quote{color:#6e7781;font-style:italic}
  .hljs-keyword,.hljs-selector-tag,.hljs-deletion{color:#cf222e}
  .hljs-number,.hljs-tag .hljs-attr,.hljs-literal{color:#0550ae}
  .hljs-string,.hljs-regexp,.hljs-addition,.hljs-attribute{color:#0a3069}
  .hljs-built_in,.hljs-class .hljs-title,.hljs-type{color:#953800}
  .hljs-variable,.hljs-template-variable{color:#0550ae}
  .hljs-title,.hljs-section,.hljs-name{color:#0550ae;font-weight:700}
  .hljs-bullet,.hljs-meta,.hljs-selector-id,.hljs-selector-class{color:#116329}
  .hljs-emphasis{font-style:italic}
  .hljs-strong{font-weight:700}
  .hljs-link{text-decoration:underline}
`;

// Dark variant for themes with a dark code block background
const HLJS_DARK = `
  .hljs-comment,.hljs-quote{color:#8b949e;font-style:italic}
  .hljs-keyword,.hljs-selector-tag,.hljs-deletion{color:#ff7b72}
  .hljs-number,.hljs-literal,.hljs-tag .hljs-attr{color:#79c0ff}
  .hljs-string,.hljs-regexp,.hljs-addition,.hljs-attribute{color:#a5d6ff}
  .hljs-built_in,.hljs-class .hljs-title,.hljs-type{color:#ffa657}
  .hljs-variable,.hljs-template-variable{color:#79c0ff}
  .hljs-title,.hljs-section,.hljs-name{color:#d2a8ff;font-weight:700}
  .hljs-bullet,.hljs-meta,.hljs-selector-id,.hljs-selector-class{color:#7ee787}
  .hljs-emphasis{font-style:italic}
  .hljs-strong{font-weight:700}
  .hljs-link{text-decoration:underline}
`;

// ─────────────────────────────────────────────────────────────────────────────
// Theme definitions
// ─────────────────────────────────────────────────────────────────────────────
const THEMES = {

  // ── 1. scientific-doc ────────────────────────────────────────────────────
  'scientific-doc': {
    label: 'Scientific Document',
    css: `
      *,*::before,*::after{box-sizing:border-box;margin:0;padding:0}
      html{font-size:13pt}
      body{
        font-family:'Times New Roman',Times,Georgia,serif;
        line-height:1.65;
        color:#111;
        background:#e8e8e4;
        padding:48px 20px;
      }
      .container{
        max-width:820px;
        margin:0 auto;
        background:#fff;
        padding:72px 80px;
        border:1px solid #c8c8c0;
        box-shadow:0 2px 12px rgba(0,0,0,.10);
      }
      /* Headings */
      h1{font-size:1.9em;text-align:center;border-bottom:2px solid #222;
         padding-bottom:.35em;margin:0 0 .6em}
      h2{font-size:1.45em;border-bottom:1px solid #bbb;padding-bottom:.2em;
         margin:2em 0 .7em}
      h3{font-size:1.2em;margin:1.6em 0 .45em}
      h4,h5,h6{font-size:1em;margin:1.2em 0 .35em}
      /* Paragraphs */
      p{margin:.8em 0;text-align:justify;hyphens:auto}
      /* Links */
      a{color:#1a0dab;text-decoration:underline}
      a:hover{color:#0000cc}
      /* Inline code */
      code{font-family:'Courier New',Courier,monospace;font-size:.88em;
           background:#f0f0ec;padding:.1em .35em;border-radius:2px;border:1px solid #ddd}
      /* Block code */
      pre.hljs-pre{background:#f7f7f5;border:1px solid #ccc;border-radius:3px;
                   padding:18px;overflow-x:auto;margin:1.2em 0}
      pre.hljs-pre code{background:none;border:none;padding:0;font-size:.87em}
      /* Blockquote */
      blockquote{border-left:3px solid #999;margin:1.2em 0;
                 padding:.5em 1.1em;color:#555;font-style:italic}
      /* Tables */
      table{width:100%;border-collapse:collapse;margin:1.2em 0;font-size:.95em}
      th{background:#eeeee8;border:1px solid #bbb;padding:7px 12px;
         font-weight:700;text-align:left}
      td{border:1px solid #ccc;padding:7px 12px}
      tr:nth-child(even) td{background:#f8f8f5}
      /* Lists */
      ul,ol{margin:.8em 0 .8em 2.2em}
      li{margin:.28em 0}
      /* Images */
      img{max-width:100%;display:block;margin:1.2em auto;
          border:1px solid #ccc}
      /* HR */
      hr{border:none;border-top:1px solid #ccc;margin:2.2em 0}
      /* Task lists */
      .task-list-item{list-style:none;margin-left:-1.3em;padding-left:0}
      input[type=checkbox]{margin-right:6px;vertical-align:middle}
      ${HLJS_LIGHT}
    `,
  },

  // ── 2. artistic-story ────────────────────────────────────────────────────
  'artistic-story': {
    label: 'Artistic Story',
    css: `
      *,*::before,*::after{box-sizing:border-box;margin:0;padding:0}
      html{font-size:17px}
      body{
        font-family:'Palatino Linotype',Palatino,'Book Antiqua',Georgia,serif;
        line-height:1.95;
        color:#3b2a2a;
        background:#f5ede3;
        background-image:
          radial-gradient(ellipse at 15% 25%,rgba(200,130,80,.10) 0%,transparent 55%),
          radial-gradient(ellipse at 85% 75%,rgba(160,90,50,.08) 0%,transparent 55%);
        padding:60px 20px;
        min-height:100vh;
      }
      .container{
        max-width:740px;
        margin:0 auto;
        background:rgba(255,250,244,.95);
        padding:64px 72px;
        border-radius:4px;
        box-shadow:0 6px 36px rgba(120,60,20,.14);
      }
      h1{font-size:2.3em;color:#6b3200;text-align:center;
         margin:0 0 .55em;letter-spacing:.03em}
      h2{font-size:1.65em;color:#7a3a00;margin:2.2em 0 .7em}
      h3{font-size:1.28em;color:#8b4200;margin:1.6em 0 .5em}
      h4,h5,h6{color:#996030;margin:1.2em 0 .4em}
      p{margin:1em 0}
      a{color:#b22222;text-decoration:none;
        border-bottom:1px solid rgba(178,34,34,.3)}
      a:hover{border-bottom-color:#b22222}
      code{font-family:monospace;font-size:.87em;background:#f5e2d0;
           padding:.15em .4em;border-radius:3px;color:#6b3200}
      pre.hljs-pre{background:#1e0e06;border-radius:6px;
                   padding:22px;overflow-x:auto;margin:1.6em 0}
      pre.hljs-pre code{color:#f2d9b8;background:none;padding:0;font-size:.87em}
      blockquote{border-left:4px solid #c8845a;margin:1.6em 0;
                 padding:.8em 1.3em;color:#6b3a2a;font-style:italic;
                 background:#fff7f0;border-radius:0 4px 4px 0}
      table{width:100%;border-collapse:collapse;margin:1.6em 0}
      th{background:#f5dcca;border:1px solid #c8845a;
         padding:10px 14px;color:#6b3200;font-weight:700}
      td{border:1px solid #e8c0a0;padding:8px 14px}
      tr:nth-child(even) td{background:#fff9f5}
      ul,ol{margin:1em 0 1em 2.2em}
      li{margin:.42em 0}
      img{max-width:100%;border-radius:6px;display:block;
          margin:1.8em auto;box-shadow:0 3px 16px rgba(0,0,0,.18)}
      hr{border:none;border-top:2px solid #e8c0a0;margin:2.8em 0}
      .task-list-item{list-style:none;margin-left:-1.3em;padding-left:0}
      input[type=checkbox]{margin-right:6px;vertical-align:middle;
                           accent-color:#8b4200}
      ${HLJS_DARK}
    `,
  },

  // ── 3. documentation (DEFAULT) ───────────────────────────────────────────
  'documentation': {
    label: 'Documentation',
    css: `
      *,*::before,*::after{box-sizing:border-box;margin:0;padding:0}
      html{font-size:16px}
      body{
        font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;
        line-height:1.6;
        color:#24292f;
        background:#fff;
        padding:32px 16px;
      }
      .container{max-width:920px;margin:0 auto}
      h1{font-size:2em;padding-bottom:.3em;border-bottom:1px solid #d0d7de;
         margin:1.5rem 0 1rem}
      h2{font-size:1.5em;padding-bottom:.3em;border-bottom:1px solid #d0d7de;
         margin:1.8rem 0 1rem}
      h3{font-size:1.25em;margin:1.5rem 0 .6rem}
      h4{font-size:1em;margin:1.2rem 0 .4rem}
      h5,h6{font-size:.875em;color:#57606a;margin:1rem 0 .3rem}
      p{margin:0 0 1rem}
      a{color:#0969da;text-decoration:none}
      a:hover{text-decoration:underline}
      /* Heading anchor links */
      a.header-anchor{color:inherit;opacity:0;margin-left:.4em;font-size:.8em}
      h1:hover a.header-anchor,h2:hover a.header-anchor,
      h3:hover a.header-anchor,h4:hover a.header-anchor{opacity:.5}
      /* Inline code */
      code{font-family:'SFMono-Regular',Consolas,'Liberation Mono',Menlo,monospace;
           font-size:85%;background:rgba(175,184,193,.2);
           padding:.2em .4em;border-radius:6px}
      /* Block code */
      pre.hljs-pre{background:#f6f8fa;border:1px solid #d0d7de;border-radius:6px;
                   padding:18px;overflow-x:auto;margin:0 0 1rem}
      pre.hljs-pre code{background:none;padding:0;font-size:87%;border-radius:0}
      /* Blockquote */
      blockquote{border-left:4px solid #d0d7de;color:#57606a;
                 margin:0 0 1rem;padding:0 1em}
      /* Tables */
      table{border-collapse:collapse;width:100%;margin-bottom:1rem;
            display:block;overflow-x:auto}
      th{background:#f6f8fa;font-weight:600}
      th,td{border:1px solid #d0d7de;padding:6px 13px;text-align:left}
      tr:nth-child(even) td{background:#f6f8fa}
      /* Lists */
      ul,ol{padding-left:2em;margin-bottom:1rem}
      li{margin:.25em 0}
      li+li{margin-top:.25em}
      /* Task lists */
      .task-list-item{list-style:none;margin-left:-1.5em;padding-left:0}
      input[type=checkbox]{margin-right:5px;vertical-align:middle}
      /* Images */
      img{max-width:100%;border-radius:6px}
      /* HR */
      hr{border:none;border-top:1px solid #d0d7de;margin:24px 0}
      ${HLJS_LIGHT}
    `,
  },

  // ── 4. ancient-script ────────────────────────────────────────────────────
  'ancient-script': {
    label: 'Ancient Script',
    css: `
      *,*::before,*::after{box-sizing:border-box;margin:0;padding:0}
      html{font-size:15px}
      body{
        font-family:'Palatino Linotype',Palatino,Georgia,'Times New Roman',serif;
        line-height:1.8;
        color:#3d1f00;
        background:#b8964e;
        background-image:
          repeating-linear-gradient(0deg,transparent,transparent 27px,
            rgba(100,55,10,.07) 28px),
          repeating-linear-gradient(90deg,transparent,transparent 120px,
            rgba(100,55,10,.03) 121px);
        padding:48px 20px;
        min-height:100vh;
      }
      .container{
        max-width:780px;
        margin:0 auto;
        background:#f0dda0;
        background-image:
          radial-gradient(ellipse at 20% 20%,rgba(160,100,20,.12) 0%,transparent 60%),
          radial-gradient(ellipse at 80% 80%,rgba(120,70,10,.10) 0%,transparent 60%);
        padding:64px 72px;
        border:2px solid #7a4e10;
        box-shadow:5px 5px 24px rgba(60,30,0,.45),
                   inset 0 0 90px rgba(180,130,50,.12);
        border-radius:2px;
        position:relative;
      }
      /* Inner decorative border */
      .container::before{
        content:'';
        position:absolute;
        inset:10px;
        border:1px solid rgba(122,78,16,.35);
        border-radius:1px;
        pointer-events:none;
      }
      h1{font-size:2.1em;text-align:center;color:#4e1e00;
         margin:0 0 .65em;letter-spacing:.06em;
         text-shadow:1px 1px 0 rgba(255,215,100,.5)}
      h2{font-size:1.55em;color:#5c2a00;
         border-bottom:1px solid rgba(122,78,16,.4);padding-bottom:.25em;
         margin:2.2em 0 .65em}
      h3{font-size:1.22em;color:#6b3300;margin:1.6em 0 .45em}
      h4,h5,h6{color:#7a3d00;margin:1.2em 0 .35em}
      p{margin:.9em 0;text-align:justify;hyphens:auto}
      a{color:#7a0000;text-decoration:underline}
      code{font-family:'Courier New',Courier,monospace;font-size:.86em;
           background:rgba(122,78,16,.13);padding:.1em .38em;
           border:1px solid rgba(122,78,16,.28);border-radius:2px;color:#5c2a00}
      pre.hljs-pre{background:rgba(30,12,0,.88);border:2px solid #7a4e10;
                   padding:18px;overflow-x:auto;margin:1.2em 0;border-radius:3px}
      pre.hljs-pre code{color:#e8d080;background:none;border:none;
                        padding:0;font-size:.87em}
      blockquote{border-left:3px solid #8b5e1a;margin:1.3em 0;
                 padding:.6em 1.1em;font-style:italic;color:#5c2a00;
                 background:rgba(122,78,16,.08)}
      table{width:100%;border-collapse:collapse;margin:1.2em 0}
      th{background:rgba(122,78,16,.20);border:1px solid #8b5e1a;
         padding:8px 12px;color:#3d1500;font-weight:700}
      td{border:1px solid rgba(122,78,16,.45);padding:7px 12px}
      tr:nth-child(even) td{background:rgba(122,78,16,.07)}
      ul,ol{margin:.9em 0 .9em 2.1em}
      li{margin:.33em 0}
      img{max-width:100%;display:block;margin:1.6em auto;
          border:3px solid #8b5e1a;box-shadow:3px 3px 10px rgba(0,0,0,.30)}
      hr{border:none;border-top:2px solid #8b5e1a;margin:2.3em 0}
      .task-list-item{list-style:none;margin-left:-1.3em;padding-left:0}
      input[type=checkbox]{margin-right:6px;vertical-align:middle}
      /* Dark code block — use dark hljs colours */
      pre.hljs-pre .hljs-comment{color:#a09060;font-style:italic}
      pre.hljs-pre .hljs-keyword{color:#ff9966}
      pre.hljs-pre .hljs-string{color:#ffe080}
      pre.hljs-pre .hljs-number{color:#aaddff}
      pre.hljs-pre .hljs-built_in{color:#ffcc88}
      pre.hljs-pre .hljs-title{color:#ffcc44;font-weight:700}
      pre.hljs-pre .hljs-emphasis{font-style:italic}
      pre.hljs-pre .hljs-strong{font-weight:700}
      /* Light hljs for inline code in light background */
      ${HLJS_LIGHT}
    `,
  },

  // ── 5. story ─────────────────────────────────────────────────────────────
  'story': {
    label: 'Story',
    css: `
      *,*::before,*::after{box-sizing:border-box;margin:0;padding:0}
      html{font-size:18px}
      body{
        font-family:Georgia,'Cambria','Hoefler Text',Baskerville,serif;
        line-height:1.82;
        color:#1a1a1a;
        background:#fdfdfd;
        padding:72px 20px;
      }
      .container{max-width:650px;margin:0 auto}
      h1{font-size:2.1em;font-weight:normal;letter-spacing:-.01em;margin:0 0 1rem}
      h2{font-size:1.55em;font-weight:normal;margin:2.4rem 0 .9rem}
      h3{font-size:1.22em;margin:1.8rem 0 .55rem}
      h4,h5,h6{margin:1.4rem 0 .45rem}
      p{margin:0 0 1.3rem}
      a{color:#1a1a1a;text-decoration:underline;text-underline-offset:2px}
      a:hover{color:#000}
      code{font-family:'SFMono-Regular',Menlo,Consolas,monospace;font-size:.84em;
           background:#f0f0f0;padding:.15em .4em;border-radius:3px}
      pre.hljs-pre{background:#f5f5f5;border:1px solid #e0e0e0;border-radius:5px;
                   padding:20px;overflow-x:auto;margin:1.6rem 0;font-size:14px}
      pre.hljs-pre code{background:none;padding:0;border-radius:0;font-size:inherit}
      blockquote{border-left:2px solid #ccc;margin:1.6rem 0;
                 padding:.5rem 1.3rem;color:#666;font-style:italic}
      table{width:100%;border-collapse:collapse;margin:1.6rem 0;font-size:.95em}
      th{border-bottom:2px solid #222;padding:8px 12px;
         text-align:left;font-weight:normal;color:#555}
      td{border-bottom:1px solid #e8e8e8;padding:8px 12px}
      ul,ol{margin:0 0 1.3rem 2.1em}
      li{margin:.3em 0}
      .task-list-item{list-style:none;margin-left:-1.3em;padding-left:0}
      input[type=checkbox]{margin-right:5px;vertical-align:middle}
      img{max-width:100%;display:block;margin:1.8rem 0}
      hr{border:none;border-top:1px solid #e0e0e0;margin:3.5rem 0}
      ${HLJS_LIGHT}
    `,
  },

  // ── 6. poem ───────────────────────────────────────────────────────────────
  'poem': {
    label: 'Poem',
    css: `
      *,*::before,*::after{box-sizing:border-box;margin:0;padding:0}
      html{font-size:18px}
      body{
        font-family:Garamond,'EB Garamond','Palatino Linotype',Georgia,serif;
        line-height:2.1;
        color:#2a2a2a;
        background:#fafaf7;
        padding:90px 20px;
        text-align:center;
      }
      .container{max-width:580px;margin:0 auto}
      h1{font-size:2.4em;font-weight:normal;letter-spacing:.04em;
         color:#111;margin:0 0 .55em}
      h2{font-size:1.65em;font-weight:normal;margin:2.5em 0 .8em;color:#333}
      h3{font-size:1.28em;font-weight:normal;margin:1.8em 0 .6em;color:#444}
      h4,h5,h6{font-weight:normal;margin:1.4em 0 .4em;color:#555}
      p{margin:0 0 1.1em;white-space:pre-wrap}
      a{color:#555;text-decoration:none;border-bottom:1px dotted #aaa}
      a:hover{border-bottom-color:#555}
      code{font-family:monospace;font-size:.84em;background:#f0f0ee;
           padding:.15em .38em;border-radius:2px}
      pre.hljs-pre{text-align:left;background:#f5f5f3;border:1px solid #e8e8e4;
                   padding:18px;border-radius:4px;overflow-x:auto;
                   margin:1.8em auto;max-width:100%}
      pre.hljs-pre code{background:none;padding:0;font-size:.85em}
      blockquote{margin:1.8em auto;padding:.5em 2.5em;font-style:italic;
                 color:#666;position:relative;max-width:90%}
      blockquote::before{content:'"';font-size:3.5em;color:#ddd;
                         position:absolute;top:-.15em;left:.1em;line-height:1;
                         font-style:normal}
      blockquote::after{content:'"';font-size:3.5em;color:#ddd;
                        position:absolute;bottom:-.5em;right:.1em;line-height:1;
                        font-style:normal}
      table{margin:1.8em auto;border-collapse:collapse;text-align:left}
      th,td{padding:8px 18px;border-bottom:1px solid #ddd}
      th{font-weight:normal;color:#555;border-bottom:2px solid #ccc}
      ul,ol{display:inline-block;text-align:left;
            margin:1em 0;padding-left:1.6em}
      li{margin:.4em 0}
      .task-list-item{list-style:none;margin-left:-1em;padding-left:0}
      input[type=checkbox]{margin-right:5px;vertical-align:middle}
      img{max-width:100%;display:block;margin:2em auto}
      hr{border:none;margin:3em 0}
      hr::after{content:'✦ \\a0\\a0 ✦ \\a0\\a0 ✦';color:#bbb;
                letter-spacing:.5em;font-size:.9em}
      ${HLJS_LIGHT}
    `,
  },
};

// ─────────────────────────────────────────────────────────────────────────────
// Public API
// ─────────────────────────────────────────────────────────────────────────────
const DEFAULT_THEME = 'documentation';

/**
 * Retrieve a theme definition by name.
 * Falls back to DEFAULT_THEME for unknown/invalid names.
 *
 * @param {string|undefined} name
 * @returns {{ label: string, css: string }}
 */
function getTheme(name) {
  const key = (name || '').toLowerCase().trim();
  return THEMES[key] || THEMES[DEFAULT_THEME];
}

/**
 * Returns an array of valid theme keys for documentation / error messages.
 * @returns {string[]}
 */
function listThemes() {
  return Object.keys(THEMES);
}

module.exports = { getTheme, listThemes, DEFAULT_THEME };
