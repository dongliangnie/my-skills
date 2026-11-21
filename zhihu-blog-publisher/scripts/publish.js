#!/usr/bin/env node
/**
 * publish.js — Publish a prepared Zhihu bundle (from prepare.js) via the browser.
 *
 * Flow (all in ONE Playwright process, to avoid losing the login session):
 *   1. launch Edge with a PERSISTENT profile that holds the Zhihu login
 *   2. open the Zhihu article editor
 *   3. fill the title, paste the placeholder Markdown, click "确认并解析"
 *   4. replace each [[IMG_n]] token with a local (pre-resized) image upload
 *   5. verify counts, screenshot
 *   6. (opt-in) click 发布 and report the final public URL
 *
 * Usage
 * -----
 *   node publish.js --bundle <dir> [--profile <dir>] [--auto-publish]
 *                   [--draft <url>] [--out <dir>]
 *
 *   --bundle       directory produced by prepare.js (needs manifest.json +
 *                  body_noimg.md + images/)
 *   --profile      persistent Edge profile dir holding the Zhihu login.
 *                  DEFAULT: <skill>/zhihu_profile . Log in once (script opens
 *                  signin page and waits), then reuse the same dir forever.
 *   --auto-publish  if set, click 发布 automatically; otherwise leave a draft
 *                  and STOP for human review (safer default).
 *   --draft        optional existing draft edit URL to reopen instead of /write
 *   --out          where to save screenshots (default: <bundle>)
 *
 * Environment: Playwright is loaded from this script's own node_modules.
 */
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

// Cross-platform browser/profile defaults.
//   Windows: reuse the installed Edge channel (has the persistent login).
//   Linux/WSL: use Playwright's bundled Chromium (install once: npx playwright install chromium).
// Override with env vars ZHIHU_CHANNEL / ZHIHU_PROFILE if needed.
const CHANNEL = process.env.ZHIHU_CHANNEL || (process.platform === 'win32' ? 'msedge' : 'chromium');

function parseArgs(argv) {
  const a = { _: [], bundle: null, profile: null, autoPublish: false, draft: null, out: null };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--bundle') a.bundle = argv[++i];
    else if (argv[i] === '--profile') a.profile = argv[++i];
    else if (argv[i] === '--auto-publish') a.autoPublish = true;
    else if (argv[i] === '--draft') a.draft = argv[++i];
    else if (argv[i] === '--out') a.out = argv[++i];
    else a._.push(argv[i]);
  }
  return a;
}

const sleep = ms => new Promise(r => setTimeout(r, ms));

(async () => {
  const args = parseArgs(process.argv.slice(2));
  if (!args.bundle) {
    console.error('Usage: node publish.js --bundle <dir> [--profile <dir>] [--auto-publish] [--draft <url>]');
    process.exit(1);
  }
  const bundle = path.resolve(args.bundle);
  const manifest = JSON.parse(fs.readFileSync(path.join(bundle, 'manifest.json'), 'utf8'));
  const body = fs.readFileSync(path.join(bundle, manifest.body || 'body_noimg.md'), 'utf8');
  const outDir = path.resolve(args.out || bundle);
  fs.mkdirSync(outDir, { recursive: true });
  const profile = args.profile
    ? path.resolve(args.profile)
    : path.join(__dirname, '..', 'zhihu_profile');
  fs.mkdirSync(profile, { recursive: true });

  console.log('TITLE:', manifest.title);
  console.log('IMAGES:', manifest.images.length, 'PROFILE:', profile);

  const context = await chromium.launchPersistentContext(profile, {
    channel: CHANNEL,
    headless: false,
    viewport: { width: 1360, height: 920 },
    args: ['--disable-blink-features=AutomationControlled'],
  });
  const page = context.pages()[0] || (await context.newPage());

  const start = args.draft || 'https://zhuanlan.zhihu.com/write';
  await page.goto(start, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForTimeout(9000);

  // If not logged in, wait for the human to scan the QR code.
  const onSignin = /signin|login/i.test(page.url());
  if (onSignin) {
    console.log('NOT_LOGGED_IN — please scan the QR code in the Edge window to sign in to Zhihu.');
    for (let i = 0; i < 90; i++) {
      await sleep(2000);
      if (!/signin|login/i.test(page.url())) { console.log('LOGIN_DETECTED'); break; }
    }
    if (/signin|login/i.test(page.url())) {
      console.error('LOGIN_TIMEOUT'); await context.close(); process.exit(2);
    }
  }

  const bodySel = 'div.public-DraftEditor-content[contenteditable="true"]';
  if (!await page.locator(bodySel).count()) {
    console.error('EDITOR_NOT_READY at', page.url());
    await context.close(); process.exit(3);
  }
  console.log('STEP1 editor ready:', page.url());

  // title
  await page.locator('textarea[placeholder*="请输入标题"]').fill(manifest.title || '');
  // paste placeholder body via clipboard
  await page.locator(bodySel).click();
  await page.evaluate(async t => { await navigator.clipboard.writeText(t); }, body);
  await page.keyboard.press('Control+V');
  await page.waitForTimeout(2500);
  console.log('STEP2 body pasted');

  // confirm markdown auto-parse (button can be off-viewport, so JS click)
  const parseBtn = await page.evaluate(() => {
    const b = Array.from(document.querySelectorAll('button'))
      .find(x => x.innerText.trim() === '确认并解析');
    if (b) { b.click(); return true; }
    return false;
  });
  if (parseBtn) { await page.waitForTimeout(6000); console.log('STEP3 markdown parsed'); }
  else console.log('STEP3 no parse button (maybe not shown)');

  // replace each placeholder with its local image
  for (const im of manifest.images) {
    const token = `[[IMG_${im.slot}]]`;
    if (!im.localFile) { console.log(`IMG ${im.slot} skipped (no local file)`); continue; }
    const file = path.join(bundle, im.localFile);
    if (!fs.existsSync(file)) { console.log(`IMG ${im.slot} missing ${file}`); continue; }

    const found = await page.evaluate(tok => {
      const ed = document.querySelector('div.public-DraftEditor-content[contenteditable="true"]');
      if (!ed) return false;
      ed.focus();
      return window.find(tok, false, false, false, false, false, false);
    }, token);
    if (!found) console.log(`IMG ${im.slot} token NOT found`);
    await sleep(200);
    await page.keyboard.press('Backspace'); // delete the selected placeholder

    const uploader = page.locator('input[accept*="image/"][type="file"]').first();
    await uploader.setInputFiles(file);
    await sleep(3500);
    console.log(`IMG ${im.slot} uploaded (${im.displayW ? im.displayW + 'px' : 'orig'})`);
  }

  await sleep(3000);
  const info = await page.evaluate(() => {
    const ed = document.querySelector('div.public-DraftEditor-content[contenteditable="true"]');
    const figs = Array.from(ed ? ed.querySelectorAll('figure[data-block=true]') : []);
    return {
      title: document.querySelector('textarea[placeholder*="请输入标题"]')?.value,
      imgs: ed ? ed.querySelectorAll('img').length : 0,
      failed: figs.filter(f => /上传失败/.test(f.innerText || '')).length,
      math: ed ? ed.querySelectorAll('[data-math], .ztext-math, script[type*=math]').length : 0,
      remainingTokens: (ed ? ed.innerText.match(/\[\[IMG_\d+\]\]/g) || [] : []).length,
      wordCount: (document.body.innerText.match(/字数：(\d+)/) || [])[1],
      url: location.href,
    };
  });
  console.log('BEFORE_PUBLISH', JSON.stringify(info));
  await page.screenshot({ path: path.join(outDir, 'draft_verify.png') });

  if (args.autoPublish) {
    const clicked = await page.evaluate(() => {
      const b = Array.from(document.querySelectorAll('button'))
        .find(x => x.innerText.trim() === '发布' && !x.disabled);
      if (b) { b.click(); return true; }
      return false;
    });
    console.log('publish clicked:', clicked);
    await sleep(8000);
    const after = await page.evaluate(() => ({
      url: location.href,
      dialogText: Array.from(document.querySelectorAll('[class*=Modal], [role=dialog], [class*=Dialog]'))
        .map(e => (e.innerText || '').slice(0, 400)).filter(Boolean).slice(0, 3),
      bodyHasTitle: document.body.innerText.includes('发布成功'),
    }));
    console.log('AFTER_PUBLISH', JSON.stringify(after));
    await page.screenshot({ path: path.join(outDir, 'after_publish.png') });
  } else {
    console.log('DRAFT_READY — review in the Edge window, then click 发布 manually.');
    console.log('To auto-publish next time, add --auto-publish');
  }

  // keep the browser open so the human can inspect; Ctrl+C to exit
  console.log('LEAVING_BROWSER_OPEN');
  await new Promise(() => {});
})().catch(e => { console.error('ERROR:', e.stack || e.message); process.exit(1); });
