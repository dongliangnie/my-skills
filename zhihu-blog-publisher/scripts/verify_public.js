// Verify all images in the PUBLIC article loaded (naturalWidth>0) and no 上传失败 text.
const { chromium } = require('playwright');
const path = require('path');
const URL = process.argv[2] || 'https://zhuanlan.zhihu.com/p/2107497147599941939';
const HEADLESS = process.argv[3] !== '--headful';
const PROFILE = process.env.ZHIHU_PROFILE || path.join(__dirname, '..', 'zhihu_profile');
const CHANNEL = process.env.ZHIHU_CHANNEL || (process.platform === 'win32' ? 'msedge' : 'chromium');

(async () => {
  const context = await chromium.launchPersistentContext(
    PROFILE,
    { channel: CHANNEL, headless: HEADLESS, viewport: { width: 1280, height: 900 },
      args: ['--disable-blink-features=AutomationControlled'] });
  const page = context.pages()[0] || (await context.newPage());
  await page.goto(URL, { waitUntil: 'networkidle', timeout: 90000 }).catch(()=>{});
  // scroll through the whole article to trigger lazy-loaded images
  await page.evaluate(async () => {
    for (let y = 0; y < document.body.scrollHeight; y += 600) {
      window.scrollTo(0, y); await new Promise(r => setTimeout(r, 120));
    }
    window.scrollTo(0, 0);
  });
  await page.waitForTimeout(4000);
  const info = await page.evaluate(() => {
    const content = document.querySelector('.Post-RichText, .RichText, article') || document;
    const imgs = Array.from(content.querySelectorAll('img'));
    const detail = imgs.map(im => ({ alt: (im.alt||'').slice(0,30), w: im.naturalWidth, src: (im.currentSrc||im.src||'').slice(0,60) }));
    return {
      title: document.title,
      totalImgs: imgs.length,
      loaded: detail.filter(d => d.w > 0).length,
      broken: detail.filter(d => d.w === 0),
      uploadFailText: (document.body.innerText.match(/上传失败/g) || []).length,
    };
  });
  console.log(JSON.stringify(info, null, 2));
  await context.close();
})().catch(e => { console.error('ERROR:', e.message); process.exit(1); });
