#!/usr/bin/env node
/**
 * convert.js - Blog Markdown -> Zhihu-ready HTML with correctly rendered math.
 *
 * Math strategy (the critical part):
 *   Extract LaTeX from the RAW markdown (before the markdown parser, so `\\` and
 *   `&` in aligned environments are preserved), render with MathJax (full TeX
 *   coverage: aligned, \tag, \boxed, \overset, \mathbb, \mathcal ...), rasterize
 *   to a transparent PNG with sharp, and embed as <img>. This makes formulas
 *   render identically on Zhihu regardless of Zhihu's own TeX engine.
 *
 * Blockquote handling: math blocks inside `> ...` blockquotes have their leading
 * `>` stripped from the LaTeX, while the blockquote marker before the opening
 * `$$` is preserved so the blockquote structure stays intact.
 *
 * Usage:
 *   node convert.js <input.md> [--out <dir>] [--title "..."] [--ex-display 10] [--ex-inline 8]
 *
 * Output (default ./zhihu_build):
 *   body.html      article body HTML; math = <img src="{{ZMATH:i}}">, imgs = {{ZIMG:i}}
 *   index.html     standalone preview page (relative image paths)
 *   manifest.json  { title, math:[...], images:[...] }
 *   math/*.png     rendered formulas
 *   images/*       copied local content images
 */

const fs = require('fs');
const path = require('path');
const sharp = require('sharp');
const { marked } = require('marked');

// ---- MathJax setup ---------------------------------------------------------
const { mathjax } = require('mathjax-full/js/mathjax.js');
const { TeX } = require('mathjax-full/js/input/tex.js');
const { SVG } = require('mathjax-full/js/output/svg.js');
const { liteAdaptor } = require('mathjax-full/js/adaptors/liteAdaptor.js');
const { RegisterHTMLHandler } = require('mathjax-full/js/handlers/html.js');
const { AllPackages } = require('mathjax-full/js/input/tex/AllPackages.js');

const adaptor = liteAdaptor();
RegisterHTMLHandler(adaptor);
const texInput = new TeX({
  packages: AllPackages,
  macros: {
    RR: '\\mathbb{R}',
    dd: '\\mathrm{d}',
    // \triangleq is not in every MathJax build; provide a safe equivalent.
    triangleq: '\\overset{\\triangle}{=}',
  },
});
const svgOutput = new SVG({ fontCache: 'none' });
const mjDoc = mathjax.document('', { InputJax: texInput, OutputJax: svgOutput });

function texToSvg(latex, display) {
  const node = mjDoc.convert(latex, {
    display: !!display,
    em: 16,
    ex: 8,
    containerWidth: 100 * 16,
  });
  return adaptor.innerHTML(node);
}

// Convert ex-unit width/height in the SVG root to absolute px so sharp can rasterize.
function svgToPng(svgStr, exPx, scale, outFile) {
  let s = svgStr;
  s = s.replace(/width="([\d.]+)ex"/, (m, n) => `width="${(parseFloat(n) * exPx * scale).toFixed(2)}px"`);
  s = s.replace(/height="([\d.]+)ex"/, (m, n) => `height="${(parseFloat(n) * exPx * scale).toFixed(2)}px"`);
  s = s.replace(/width:\s*([\d.]+)ex/g, (m, n) => `width:${(parseFloat(n) * exPx * scale).toFixed(2)}px`);
  s = s.replace(/height:\s*([\d.]+)ex/g, (m, n) => `height:${(parseFloat(n) * exPx * scale).toFixed(2)}px`);
  return sharp(Buffer.from(s), { density: 72 }).png().toFile(outFile);
}

// ---- Code protection -------------------------------------------------------
// Replace code so `$` inside code is never treated as math and so `\\`/`&` in
// code are not touched by the markdown parser.
function protectCode(md) {
  const store = [];
  const tok = (i) => `ZZQCODE${i}ZZ`;
  md = md.replace(/```([\w+-]*)\n([\s\S]*?)```/g, (m, lang, code) => {
    store.push({ type: 'block', lang: lang || '', code });
    return `\n\n${tok(store.length - 1)}\n\n`;
  });
  md = md.replace(/~~~([\w+-]*)\n([\s\S]*?)~~~/g, (m, lang, code) => {
    store.push({ type: 'block', lang: lang || '', code });
    return `\n\n${tok(store.length - 1)}\n\n`;
  });
  md = md.replace(/`([^`\n]+)`/g, (m, code) => {
    store.push({ type: 'inline', code });
    return tok(store.length - 1);
  });
  return { md, store };
}

// ---- Math extraction -------------------------------------------------------
function extractMath(md) {
  const items = [];
  const add = (tex, display) => {
    items.push({ id: items.length, latex: tex, display });
    return `ZZQMATH${items.length - 1}ZZ`;
  };
  // strip leading blockquote markers from each line of a captured math block
  const dequote = (s) => s.split('\n').map((l) => l.replace(/^\s*>\s?/, '')).join('\n').trim();

  // display: $$...$$ (blockquote-safe: leading '>' of opening line stays outside)
  md = md.replace(/\$\$([\s\S]+?)\$\$/g, (m, inner) => add(dequote(inner), true));
  // display: \[...\]
  md = md.replace(/\\\[([\s\S]+?)\\\]/g, (m, inner) => add(dequote(inner), true));
  // inline: $...$ (no newline, non-empty)
  md = md.replace(/(?<!\\)\$([^\n$]+?)\$/g, (m, inner) => add(inner.trim(), false));
  // inline: \(...\)
  md = md.replace(/\\\(([\s\S]+?)\\\)/g, (m, inner) => add(inner.trim(), false));

  return { md, items };
}

// ---- Main ------------------------------------------------------------------
async function main() {
  const argv = process.argv.slice(2);
  if (!argv.length) {
    console.error('Usage: node convert.js <input.md> [--out <dir>] [--title "..."]');
    process.exit(1);
  }
  const input = argv[0];
  const getOpt = (name, def) => {
    const i = argv.indexOf(name);
    return i >= 0 && argv[i + 1] ? argv[i + 1] : def;
  };
  const outDir = path.resolve(getOpt('--out', 'zhihu_build'));
  const explicitTitle = getOpt('--title', null);
  const exDisplay = parseFloat(getOpt('--ex-display', '10'));
  const exInline = parseFloat(getOpt('--ex-inline', '8'));
  const SCALE = 2;

  let raw = fs.readFileSync(input, 'utf8').replace(/^\uFEFF/, '');

  // Title: explicit, else first H1, else first non-empty line.
  let title = explicitTitle;
  if (!title) {
    const h1 = raw.match(/^\s*#\s+(.+)$/m);
    if (h1) title = h1[1].trim();
    else {
      const line = raw.split('\n').map((l) => l.trim()).find((l) => l.length) || 'Untitled';
      title = line.replace(/^#+\s*/, '').replace(/^>\s*/, '');
    }
  }
  // Drop a leading H1 if it duplicates the title (Zhihu has a separate title field).
  let body = raw;
  const firstH1 = raw.match(/^\s*#\s+(.+)$/m);
  if (firstH1 && firstH1[1].trim() === title) body = raw.replace(/^\s*#\s+.+\n?/, '');

  fs.mkdirSync(path.join(outDir, 'math'), { recursive: true });
  fs.mkdirSync(path.join(outDir, 'images'), { recursive: true });

  const code = protectCode(body);
  const { md: md2, items } = extractMath(code.md);

  // render math
  const mathMeta = [];
  let failures = 0;
  for (const item of items) {
    const exPx = item.display ? exDisplay : exInline;
    const file = `math/math${item.id}.png`;
    try {
      const svgStr = texToSvg(item.latex, item.display);
      const wm = svgStr.match(/width="([\d.]+)ex"/);
      const hm = svgStr.match(/height="([\d.]+)ex"/);
      const w1 = wm ? parseFloat(wm[1]) * exPx : null;
      const h1 = hm ? parseFloat(hm[1]) * exPx : null;
      await svgToPng(svgStr, exPx, SCALE, path.join(outDir, file));
      mathMeta.push({ id: item.id, file, latex: item.latex, display: item.display, w: w1, h: h1 });
    } catch (e) {
      failures++;
      console.error(`[math ${item.id}] FAILED: ${e.message}\n  latex: ${item.latex.slice(0, 100)}`);
      mathMeta.push({ id: item.id, file: null, latex: item.latex, display: item.display, error: e.message });
    }
  }

  // markdown -> html
  marked.setOptions({ gfm: true, breaks: false, headerIds: false, mangle: false });
  let html = marked.parse(md2);

  // replace math tokens with images
  for (const m of mathMeta) {
    const token = `ZZQMATH${m.id}ZZ`;
    if (!m.file) {
      html = html.split(token).join(`<code>${escapeHtml(m.latex)}</code>`);
      continue;
    }
    const src = `{{ZMATH:${m.id}}}`;
    const wAttr = m.w ? ` width="${Math.round(m.w)}"` : '';
    const hAttr = m.h ? ` height="${Math.round(m.h)}"` : '';
    const img = m.display
      ? `<img class="zmath-block" src="${src}" alt="${escapeAttr(m.latex)}"${wAttr}${hAttr} style="display:block;margin:0.6em auto;max-width:100%">`
      : `<img class="zmath-inline" src="${src}" alt="${escapeAttr(m.latex)}"${wAttr}${hAttr} style="vertical-align:middle">`;
    html = html.split(token).join(img);
  }

  // restore code
  for (let i = 0; i < code.store.length; i++) {
    const c = code.store[i];
    const token = `ZZQCODE${i}ZZ`;
    if (c.type === 'block') {
      const cls = c.lang ? ` class="language-${escapeAttr(c.lang)}"` : '';
      const block = `<pre><code${cls}>${escapeHtml(c.code)}</code></pre>`;
      html = html.replace(new RegExp(`<p>\\s*${token}\\s*</p>`, 'g'), block);
      html = html.split(token).join(block);
    } else {
      html = html.split(token).join(`<code>${escapeHtml(c.code)}</code>`);
    }
  }

  // content images: local -> copy + token; remote -> token (optional re-upload)
  const imagesMeta = [];
  html = html.replace(/<img\b([^>]*?)src="([^"]+)"([^>]*?)>/g, (full, pre, src, post) => {
    if (src.startsWith('{{ZMATH')) return full;
    if (/^https?:\/\//i.test(src)) {
      const id = imagesMeta.length;
      imagesMeta.push({ id, src, local: null, remote: true });
      return `<img${pre}src="{{ZIMG:${id}}}"${post}>`;
    }
    const abs = path.resolve(path.dirname(input), src);
    if (fs.existsSync(abs)) {
      const id = imagesMeta.length;
      const ext = path.extname(abs) || '.png';
      const rel = `images/img${id}${ext}`;
      fs.copyFileSync(abs, path.join(outDir, rel));
      imagesMeta.push({ id, src, local: rel, remote: false });
      return `<img${pre}src="{{ZIMG:${id}}}"${post}>`;
    }
    return full;
  });

  fs.writeFileSync(path.join(outDir, 'manifest.json'),
    JSON.stringify({ title, source: path.resolve(input), math: mathMeta, images: imagesMeta }, null, 2), 'utf8');
  fs.writeFileSync(path.join(outDir, 'body.html'), html, 'utf8');

  // preview
  let preview = html;
  for (const m of mathMeta) if (m.file) preview = preview.split(`{{ZMATH:${m.id}}}`).join(m.file);
  for (const im of imagesMeta) preview = preview.split(`{{ZIMG:${im.id}}}`).join(im.local || im.src);
  const css = `body{max-width:760px;margin:40px auto;padding:0 20px;font-family:-apple-system,"Segoe UI","Microsoft YaHei",sans-serif;line-height:1.75;color:#1a1a1a}
h1{font-size:1.9em}h2{font-size:1.5em;border-bottom:1px solid #eee;padding-bottom:.3em}h3{font-size:1.25em}
blockquote{border-left:4px solid #ddd;margin:1em 0;padding:.3em 1em;color:#555;background:#fafafa}
img{max-width:100%}code{background:#f4f4f4;padding:.15em .35em;border-radius:3px}
pre{background:#f6f8fa;padding:14px;overflow:auto;border-radius:6px}pre code{background:none;padding:0}
table{border-collapse:collapse}td,th{border:1px solid #ddd;padding:6px 10px}`;
  fs.writeFileSync(path.join(outDir, 'index.html'),
    `<!DOCTYPE html><html lang="zh"><head><meta charset="utf-8"><title>${escapeHtml(title)}</title><style>${css}</style></head><body><article>${preview}</article></body></html>`, 'utf8');

  console.log(`title  : ${title}`);
  console.log(`math   : ${mathMeta.length} (${failures} failed)`);
  console.log(`images : ${imagesMeta.length}`);
  console.log(`output : ${outDir}`);
  if (failures) process.exitCode = 2;
}

function escapeHtml(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
function escapeAttr(s) {
  return String(s).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
}

main().catch((e) => { console.error(e); process.exit(1); });
