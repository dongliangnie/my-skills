// Diagnose which figure in a published/draft Zhihu article shows 上传失败.
const { chromium } = require('playwright');
const path = require('path');

const PROFILE = process.env.ZHIHU_PROFILE || path.join(__dirname, '..', 'zhihu_profile');
const CHANNEL = process.env.ZHIHU_CHANNEL || (process.platform === 'win32' ? 'msedge' : 'chromium');
const URL = process.argv[2] || 'https://zhuanlan.zhihu.com/p/2107497147599941939/edit';

(async () => {
  const context = await chromium.launchPersistentContext(PROFILE, {
    channel: CHANNEL, headless: false, viewport: { width: 1360, height: 920 },
    args: ['--disable-blink-features=AutomationControlled'],
  });
  const page = context.pages()[0] || (await context.newPage());
  await page.goto(URL, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForTimeout(10000);

  const info = await page.evaluate(() => {
    const ed = document.querySelector('div.public-DraftEditor-content[contenteditable="true"]');
    if (!ed) return { error: 'no editor', url: location.href };
    const figs = Array.from(ed.querySelectorAll('figure[data-block=true]'));
    const failed = figs.map((f, i) => ({ i, text: (f.innerText || '').trim().slice(0, 120), html: f.innerHTML.slice(0, 300) }))
                       .filter(x => /上传失败/.test(x.text));
    const allImgs = Array.from(ed.querySelectorAll('img')).map((im, i) => ({ i, src: (im.src || '').slice(0, 90), alt: im.alt }));
    return {
      url: location.href,
      figureCount: figs.length,
      imgCount: allImgs.length,
      failed,
      wordCount: (document.body.innerText.match(/字数：(\d+)/) || [])[1],
    };
  });
  console.log(JSON.stringify(info, null, 2));
  await new Promise(() => {});
})().catch(e => { console.error('ERROR:', e.stack || e.message); process.exit(1); });
