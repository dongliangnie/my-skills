#!/usr/bin/env node
/**
 * prepare.js — Turn a Markdown article into a Zhihu-ready publish bundle.
 *
 * Why this exists
 * ---------------
 * Zhihu's Markdown editor re-hosts remote images itself and IGNORES their
 * display size. If your Markdown scaled an image down (e.g.
 * `<img src=".." style="zoom:33%">`), pasting the raw URL makes Zhihu show the
 * FULL-RESOLUTION image — small diagrams end up huge. Also, Zhihu often fails
 * to re-host external CDN images ("上传失败").
 *
 * This script solves BOTH by:
 *   1. parsing every image in the source Markdown, in order;
 *   2. downloading remote images (or copying local ones) to local files;
 *   3. physically resizing each image to its INTENDED display width, derived
 *      from `style="zoom:NN%"`, `style="width:NNpx"`, or `width=NN` — so the
 *      scale is baked into the pixels and survives Zhihu's editor;
 *   4. emitting a body with `[[IMG_n]]` placeholders plus a manifest that maps
 *      each placeholder to the resized local file, for publish.js to upload.
 *   Math ($...$ / $$...$$) is left untouched: Zhihu natively parses LaTeX.
 *
 * Usage
 * -----
 *   node prepare.js <input.md> --out <bundle_dir> [--title "Article title"]
 *     [--profile]  keep original pixels (ignore zoom) — not recommended
 *     [--max-width 1600]  safety cap for final pixel width (default 1600)
 *
 * Outputs (inside <bundle_dir>):
 *   body_noimg.md   Markdown with images replaced by [[IMG_n]] tokens
 *   manifest.json   { title, body, images:[{slot,src,localFile,zoom,displayW,...}] }
 *   images/imgN.png resized images ready for upload
 */
const fs = require('fs');
const path = require('path');

// sharp lives next to this script in the skill's own node_modules
const sharp = require('sharp');

function parseArgs(argv) {
  const args = { _: [], out: null, title: null, profile: false, maxWidth: 1600 };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--out') args.out = argv[++i];
    else if (a === '--title') args.title = argv[++i];
    else if (a === '--profile') args.profile = true;
    else if (a === '--max-width') args.maxWidth = parseInt(argv[++i], 10);
    else args._.push(a);
  }
  return args;
}

// Extract a zoom ratio from an HTML tag's attributes. Returns a number (0<z<=1
// for shrink, >1 for enlarge) or null if none specified.
function extractZoom(tag) {
  // style="zoom: 33%" / zoom:33% / zoom:33
  let m = tag.match(/zoom\s*:\s*([\d.]+)\s*(%?)/i);
  if (m) {
    const n = parseFloat(m[1]);
    return m[2] === '%' ? n / 100 : n;
  }
  return null;
}

// Extract an explicit target pixel width from style/attributes.
function extractWidth(tag) {
  let m = tag.match(/width\s*[:=]\s*["']?\s*([\d.]+)\s*(px)?/i);
  if (m) return Math.round(parseFloat(m[1]));
  return null;
}

// Split source Markdown into ordered image descriptors + text fragments.
// Supports: <img ...> HTML tags and ![alt](url) Markdown images.
function parseImages(md) {
  const images = [];
  // one regex over the whole doc, capturing HTML <img> and Markdown ![]()
  const re = /<img\b([^>]*)>|!\[([^\]]*)\]\(([^)]+)\)/g;
  let m;
  while ((m = re.exec(md)) !== null) {
    const start = m.index;
    const end = start + m[0].length;
    if (m[1] !== undefined) {
      // HTML <img ...>
      const attrs = m[1];
      const srcM = attrs.match(/src\s*=\s*["']([^"']+)["']/i);
      if (!srcM) continue;
      const altM = attrs.match(/alt\s*=\s*["']([^"']*)["']/i);
      images.push({
        start, end, raw: m[0],
        src: srcM[1],
        alt: altM ? altM[1] : '',
        zoom: extractZoom(attrs),
        width: extractWidth(attrs),
      });
    } else {
      // Markdown ![alt](url)
      images.push({
        start, end, raw: m[0],
        src: m[3].trim(),
        alt: m[2] || '',
        zoom: null,
        width: null,
      });
    }
  }
  return images;
}

async function resolveLocal(src, mdDir, imagesDir, idx) {
  // already local file
  if (!/^https?:\/\//i.test(src)) {
    const abs = path.isAbsolute(src) ? src : path.resolve(mdDir, src);
    const ext = path.extname(abs) || '.png';
    const dest = path.join(imagesDir, `orig${idx}${ext}`);
    fs.copyFileSync(abs, dest);
    return dest;
  }
  // remote: download with the skill's node fetch
  const extMatch = src.match(/\.(png|jpe?g|webp|gif)(\?|$)/i);
  const ext = extMatch ? '.' + extMatch[1].toLowerCase().replace('jpeg', 'jpg') : '.png';
  const dest = path.join(imagesDir, `orig${idx}${ext}`);
  const res = await fetch(src, {
    headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' },
    redirect: 'follow',
  });
  if (!res.ok) throw new Error(`download failed (${res.status}) for ${src}`);
  const buf = Buffer.from(await res.arrayBuffer());
  fs.writeFileSync(dest, buf);
  return dest;
}

(async () => {
  const args = parseArgs(process.argv.slice(2));
  if (!args._[0]) {
    console.error('Usage: node prepare.js <input.md> --out <dir> [--title "..."]');
    process.exit(1);
  }
  const input = path.resolve(args._[0]);
  const mdDir = path.dirname(input);
  const outDir = path.resolve(args.out || path.join(mdDir, 'zhihu_bundle'));
  const imagesDir = path.join(outDir, 'images');
  fs.mkdirSync(imagesDir, { recursive: true });

  let md = fs.readFileSync(input, 'utf8');
  // derive title from leading H1 if not given
  let title = args.title;
  const h1 = md.match(/^#\s+(.+)$/m);
  if (!title && h1) title = h1[1].trim();
  if (!title) title = path.basename(input, '.md');

  const descriptors = parseImages(md);
  console.log(`Found ${descriptors.length} image(s).`);

  const manifestImages = [];
  // Replace images from the END so indices/positions stay valid.
  for (let i = descriptors.length - 1; i >= 0; i--) {
    const d = descriptors[i];
    const slot = i + 1;
    let localOrig;
    try {
      localOrig = await resolveLocal(d.src, mdDir, imagesDir, slot);
    } catch (e) {
      console.error(`  IMG ${slot} download error: ${e.message}`);
      localOrig = null;
    }
    let zoom = d.zoom;
    let displayW = null;
    if (localOrig) {
      const meta = await sharp(localOrig).metadata();
      const naturalW = meta.width || 0;
      // If an explicit width is present, prefer it; else apply zoom ratio.
      let targetW = null;
      if (d.width && d.width > 0) targetW = d.width;
      else if (zoom && zoom > 0) targetW = Math.round(naturalW * zoom);
      // safety cap; never upscale beyond natural when we are shrinking intent
      if (targetW && targetW > naturalW && !args.profile) targetW = naturalW;
      if (targetW && targetW > args.maxWidth) targetW = args.maxWidth;
      displayW = targetW;
      const uploadFile = path.join(imagesDir, `img${slot}.png`);
      if (targetW && targetW < naturalW && !args.profile) {
        await sharp(localOrig).resize({ width: targetW }).png().toFile(uploadFile);
      } else {
        // normalize to png so upload is consistent
        await sharp(localOrig).png().toFile(uploadFile);
      }
      manifestImages.unshift({
        slot, src: d.src, alt: d.alt,
        zoom: zoom || (displayW && naturalW ? +(displayW / naturalW).toFixed(3) : null),
        naturalW, naturalH: meta.height || 0, displayW,
        localFile: `images/img${slot}.png`,
        origFile: path.relative(outDir, localOrig).replace(/\\/g, '/'),
      });
    } else {
      manifestImages.unshift({
        slot, src: d.src, alt: d.alt, zoom, displayW: null,
        localFile: null, error: 'download failed',
      });
    }
    // replace this image with a placeholder token
    md = md.slice(0, d.start) + `[[IMG_${slot}]]` + md.slice(d.end);
  }

  const bodyPath = path.join(outDir, 'body_noimg.md');
  fs.writeFileSync(bodyPath, md, 'utf8');
  const manifest = {
    title,
    body: 'body_noimg.md',
    source: input,
    createdAt: new Date().toISOString(),
    options: { profile: args.profile, maxWidth: args.maxWidth },
    images: manifestImages,
  };
  fs.writeFileSync(path.join(outDir, 'manifest.json'), JSON.stringify(manifest, null, 2), 'utf8');

  console.log('\nPREPARE_SUMMARY');
  console.log(JSON.stringify({
    title,
    images: manifestImages.length,
    failed: manifestImages.filter(x => !x.localFile).length,
    resized: manifestImages.filter(x => x.displayW && x.naturalW && x.displayW < x.naturalW).length,
    body: 'body_noimg.md',
    outDir,
  }, null, 2));
  manifestImages.forEach(x => {
    console.log(`  IMG_${x.slot}: zoom=${x.zoom} natural=${x.naturalW}x${x.naturalH} -> display=${x.displayW}px  ${x.localFile || x.error}`);
  });
})().catch(e => { console.error('ERROR:', e.stack || e.message); process.exit(1); });
