# Zhihu Editor Reference

Real-world notes from publishing a LaTeX + image-heavy Markdown article to a Zhihu column via Playwright (Edge, persisted login). These selectors/behaviours were verified working; Zhihu may change them, so re-inspect the DOM if a step breaks.

## Editor URL & login
- New article: `https://zhuanlan.zhihu.com/write`
- Not logged in → redirected to `https://www.zhihu.com/signin`; scan QR in the visible Edge window. Use a **persistent** profile dir so the cookie survives across runs.
- First load of `/write` can be blank (loading bar only). Reload / wait ~9s before querying selectors.
- After the first autosave the URL becomes `https://zhuanlan.zhihu.com/p/<id>/edit`. Save this as a draft URL to reopen later with `publish.js --draft <url>`.

## Selectors
| Element | Selector / locator |
|---|---|
| Title input | `textarea[placeholder*="请输入标题"]` |
| Body editor (Draft.js) | `div.public-DraftEditor-content[contenteditable="true"]` |
| Hidden image file input | `input[accept*="image/"][type="file"]` — use `setInputFiles(localPath)` |
| "确认并解析" (Markdown parse) | `button` whose `innerText.trim() === '确认并解析'` |
| "发布" (publish) | `button` whose `innerText.trim() === '发布'` and `!disabled` |

## Content pipeline that actually works
1. Fill title via `.fill()`.
2. Put body Markdown on the clipboard (`navigator.clipboard.writeText`), click the body editor, press `Control+V`.
3. A "确认并解析" prompt appears. It may be **outside the viewport** — normal and force clicks fail with `outside of viewport`. Click it via JS: `Array.from(document.querySelectorAll('button')).find(b=>b.innerText.trim()==='确认并解析').click()`.
4. Formulas: keep raw `$...$` / `$$...$$` in the Markdown; Zhihu parses them into real math on confirm. Verified: 33 formulas → ~66 math DOM nodes. No image rasterization needed.
5. Images: external CDN URLs frequently fail to re-host ("上传失败"). Reliable method:
   - Replace each image in the Markdown with a unique token `[[IMG_n]]` BEFORE pasting.
   - After parse, for each token: `ed.focus(); window.find(token)` (selects the token text), `keyboard.press('Backspace')`, then `uploader.setInputFiles(localFile)`.
   - Local files should be **pre-scaled to the intended display width** (see prepare.js) so small diagrams don't get blown up.
   - Do NOT inline base64 data URIs: a few MB payload breaks the editor (word count → 0, raw base64 shown as text).

## Verification after fill
Evaluate inside the editor:
```js
const ed = document.querySelector('div.public-DraftEditor-content[contenteditable="true"]');
const figs = Array.from(ed.querySelectorAll('figure[data-block=true]'));
({
  imgs: ed.querySelectorAll('img').length,
  failed: figs.filter(f=>/上传失败/.test(f.innerText||'')).length,
  math: ed.querySelectorAll('[data-math], .ztext-math, script[type*=math]').length,
  remainingTokens: (ed.innerText.match(/\[\[IMG_\d+\]\]/g)||[]).length,
  wordCount: (document.body.innerText.match(/字数：(\d+)/)||[])[1],
});
```
Healthy state: `failed === 0`, `remainingTokens === 0`, `imgs` == number of images, `math > 0` if formulas present.

## Publishing
- Click "发布" via JS as above. A success modal appears: "发布成功 / 感谢你的第 N 篇创作". URL becomes `https://zhuanlan.zhihu.com/p/<id>`.
- Verify the public URL with a plain fetch/WebFetch: title, body, images, formulas all present.

## Playwright process notes
- Use `chromium.launchPersistentContext(profileDir, { channel:'msedge', headless:false, args:['--disable-blink-features=AutomationControlled'] })`.
- Do **not** spawn a detached Edge + `connectOverCDP` (fragile: process dies / 502 errors). Do everything in one script.
- Never close the last page — that kills the browser. Keep the process alive (`await new Promise(()=>{})`) and let the human Ctrl+C.
- Loading Playwright from the skill script's own directory needs no NODE_PATH; running a script located elsewhere does — set `NODE_PATH` to `<skill>/scripts/node_modules` in that case.
