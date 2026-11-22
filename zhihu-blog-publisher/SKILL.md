---
name: zhihu-blog-publisher
description: 把本地 Markdown 文章（含公式、表格、配图）发布到知乎专栏。当用户要求"把笔记/文章发到知乎""publish to Zhihu""发布到知乎专栏"，或需要把带 LaTeX 公式和图片的 md 转成知乎草稿并发布时使用。基于 Playwright + Edge 持久化登录态，公式走知乎原生解析，图片先按 md 里的 zoom/width 缩放再逐张上传，避免小图被放大或外链上传失败。
---

# Zhihu Blog Publisher

## Overview

把一篇本地 Markdown（可能含 `$...$` 公式、表格、远程/本地图片、`style="zoom:NN%"` 缩放）变成一篇排版正确的知乎专栏文章，并可自动发布。核心难点是知乎编辑器的三个坑：外链图片常"上传失败"、会忽略 md 的图片显示尺寸、Markdown 公式需要点"确认并解析"。本 skill 用「预缩放 + 占位符 + 本地上传 + 原生公式解析」的组合全部绕开。

## Workflow（按顺序执行）

### Step 0 — 环境准备
- Playwright 与 sharp 装在 `scripts/node_modules`，**脚本从 scripts/ 目录运行时无需设置 NODE_PATH**。
- Node 18+（验证于 Node 22）。Windows 上若用 WorkBuddy，走其受管 Node 即可；用 `node -v` 确认版本。
- 持久化登录 profile 默认在 `<skill>/zhihu_profile`（约 120MB，**不要塞进 skill 包**）。首次运行若未登录，脚本会停在知乎扫码页，让用户扫码；之后复用同一目录即免登录。
- 若用户想用现成 profile（例如别处已登录的目录），用 `--profile <dir>` 指定。

#### Windows / WSL 差异（脚本自动按 `process.platform` 选择，一般无需手动设置）
| 项 | Windows | Linux / WSL |
|---|---|---|
| 浏览器 channel | `msedge`（本机 Edge） | `chromium`（Playwright 自带，需先装） |
| 登录 profile 默认 | `<skill>/zhihu_profile` | `<skill>/zhihu_profile`（各自独立，首次需扫码） |

- 跨平台覆盖：**环境变量** `ZHIHU_CHANNEL`（`msedge`/`chromium`/`chrome`）、`ZHIHU_PROFILE`（profile 目录）。`publish.js` 另有 `--profile <dir>` 命令行参数（优先级最高）。
- Linux / WSL 首次使用装 Chromium 一次（把技能目录换成你的实际安装路径，例如 Claude Code 的 `~/.claude/skills/zhihu-blog-publisher`）：
  ```bash
  cd <skill 安装目录>/scripts
  npm install                      # 若 package.json 的 prepare 已改名 prep，这里应正常结束
  npx playwright install chromium   # 下载 Linux 版 Chromium
  # 若缺系统库：npx playwright install-deps chromium（需 sudo）
  ```
- WSLg / 桌面 Linux 提供 `DISPLAY`，`headless:false` 可直接弹出浏览器扫码。**不要把 Windows 的 node_modules 复制进 WSL**（sharp/playwright 原生二进制是平台相关的），在 WSL 内重新 `npm install`。
- profile 目录可跨系统共用（同一知乎登录态），但因体积大且锁定文件，建议 Windows / WSL 各用各的：Windows 侧可用 `--profile "<某处>/zhihu_profile"`，Linux / WSL 侧用默认的 `<skill 安装目录>/zhihu_profile`。

### Step 1 — 预处理：保留图片缩放 + 下载图片
```bash
cd <skill 安装目录>/scripts
node prepare.js "<input.md>" --out "<bundle_dir>" [--title "文章标题"] [--max-width 1600]
```
脚本会：
1. 按出现顺序解析所有图片：`![alt](url)` 与 `<img src="..." style="zoom:33%">` 都支持；
2. 下载远程图 / 复制本地图到 `<bundle>/images/`；
3. **按 `zoom:NN%` 或 `width:NNpx` 把图片物理缩放到目标显示宽度**（zoom=33% 且原图 1547px → 缩到 511px），把缩放"烘焙"进像素——这是小图不被放大的关键；带显式 zoom/width 的图以该值为准（即使超过 max-width 也不覆盖，保住"故意缩小"的意图）；
4. **`--max-width`（默认 1600）是全局上限，作用于每一张图**：没有 zoom/width 标注的超大图（如 8633px 宽的全景图）会被压到上限，避免原尺寸上传；`--profile` 模式会跳过所有缩放。
5. 生成 `body_noimg.md`：每张图替换为 `[[IMG_n]]` 占位符，公式 `$...$` 原样保留；
6. 生成 `manifest.json`：slot → 本地缩放图路径、zoom、原始/显示尺寸的映射。

运行后核对控制台 `PREPARE_SUMMARY`：`failed` 应为 0；逐行确认带 zoom 的图 display 值符合预期（如 zoom:25% 的 1921px 图 → 480px），超大无标注图 → 1600px。

**图片居中无需额外处理**：知乎发布后会把每张图包进 `<figure>` 并自动水平居中（含小于栏宽的图），已实测，不要为了居中往正文注入 HTML/CSS（Draft.js 不会持久保留，还可能破坏编辑器）。

### Step 2 — 发布：填标题 + 粘正文 + 传图
```bash
node publish.js --bundle "<bundle_dir>" [--profile <dir>] [--draft <url>] [--auto-publish]
```
- **默认只生成草稿并停下**（`--auto-publish` 缺省），让用户/你在 Edge 窗口里目视确认后再手动点发布；加了 `--auto-publish` 则脚本自动点"发布"并回报最终链接。
- 已有草稿可用 `--draft <edit_url>` 直接重开编辑页。
- 流程全在一个 Playwright 进程内完成，避免登录态丢失：打开编辑器 → 填标题 → 粘贴占位符正文 → JS 点击"确认并解析" → 逐个 `window.find` 定位 `[[IMG_n]]` → Backspace 删除 → 隐藏 file input 上传对应缩放图。
- 控制台 `BEFORE_PUBLISH` 里确认：`imgs` = 图片数、`failed` = 0、`remainingTokens` = 0、`math` > 0（公式已解析）、`wordCount` 合理。
- **注意**：`failed` 偶尔显示 1 是上传中的瞬时状态（某张图还在传时被采样到），**不代表最终失败**——务必以 Step 3 的公网验证为准，不要据此提前判定失败。

### Step 3 — 验证
- 截图 `<bundle>/draft_verify.png`（发布前）与 `after_publish.png`（发布后）。
- 用 WebFetch 打开最终 URL，确认公网可访问、标题/正文/公式正常。
- **图片必须逐张验证**（WebFetch 数不了 img）：用 `verify_public.js` 滚动整篇公网文章，检查每张 img 的 `naturalWidth>0`：
  ```bash
  node verify_public.js "<最终文章URL>"    # 输出 totalImgs / loaded / broken / uploadFailText
  ```
  健康：`broken: []`、`uploadFailText: 0`、`loaded == totalImgs`。若编辑页需排查，用 `node diagnose.js "<edit_url>"` 看哪个 figure 含"上传失败"。
- 报告最终文章 URL 给用户。

## 图片缩放保持（本 skill 的关键约定）

用户的 md 常对图片做缩放，写法与处理结果：

| md 中的写法 | prepare.js 处理 | 结果 |
|---|---|---|
| `<img src="..." style="zoom:33%" >` | 目标宽 = 原宽 × 0.33，sharp 预缩放 | 知乎按 511px 显示，不再铺满 |
| `<img src="..." style="width:600px" >` | 目标宽 = 600px | 按 600px 显示 |
| `![alt](url)` 无缩放 | 保留原尺寸 | 知乎自适应栏宽 |
| 远程 CDN 图 | 先下载到本地再上传 | 规避"上传失败" |

**为什么不用 base64 / 直接粘 URL**：知乎对大 base64 会撑爆编辑器（wordCount 归零、原样显示文本）；外链 URL 有约 3/7 概率"上传失败"。占位符 + 本地文件上传是唯一稳定跑通的方式。

**prepare.js 的可选 `--profile`**：加了会忽略 zoom、全用原图像素；一般不要加。注意这与 **publish.js 的 `--profile` 含义不同**——后者是指定已登录的 Edge profile 目录（见 Step 2）。

## 公式策略

- **默认走知乎原生解析**：正文保留 `$...$` / `$$...$$`，粘贴后点"确认并解析"，知乎生成可复制的数学公式（实测 33 个公式全部解析成功，编辑器检测到 66 个 math 节点）。这是首选，公式清晰且可编辑。
- **回退方案**：若某些公式解析错乱，用本 skill 的 `convert.js` 把公式渲染成 PNG 再嵌图（会失去可复制性）。
  ```bash
  node convert.js "<input.md>" --out "<math_bundle>" --title "标题"
  ```
  convert.js 产出 `body.html`（公式/图片为 `{{ZMATH:i}}`/`{{ZIMG:i}}` 占位）、`manifest.json`、`math/*.png`。它适合"公式必须像素级还原"的场景，但注意知乎对图片化公式同样有上传失败风险。

## 关键选择器（知乎编辑器，可能随改版变化）

| 用途 | 选择器 |
|---|---|
| 标题输入框 | `textarea[placeholder*="请输入标题"]` |
| 正文编辑区 | `div.public-DraftEditor-content[contenteditable="true"]` |
| 图片上传 input | `input[accept*="image/"][type="file"]`（隐藏，用 `setInputFiles`） |
| Markdown 解析按钮 | `button` 且 `innerText === '确认并解析'` |
| 发布按钮 | `button` 且 `innerText === '发布'` 且 `!disabled` |

## 已知坑与处理

- **编辑器首次打开空白**：`zhuanlan.zhihu.com/write` 首次可能只显示加载条，`reload` 或等待 9-10s 后再取选择器。
- **"确认并解析"按钮在视口外**：普通 click / force click 都会报 `outside of viewport`；用 `page.evaluate` 里的 `button.click()`。
- **window.find 定位占位符**：`window.find(token)` 会选中文本，随后 `Backspace` 删除、光标停在该处，此时 `setInputFiles` 会把图片插到这里。逐个替换，勿批量。
- **不要重粘贴已填充正文**：Draft.js 下 Ctrl+A + 粘贴会内容重复；要重来就开新草稿（新 URL）或复用 `--draft` 重开干净的编辑页。
- **CDP 连接 502**：不要用 detached 子进程 + `connectOverCDP`；在单个脚本里 `launchPersistentContext`，别关掉最后一个标签页，否则浏览器退出。
- **关闭所有标签会杀掉浏览器**：保持至少一个页面存活；脚本结尾 `await new Promise(()=>{})` 挂住进程，Ctrl+C 退出。

## Resources

### scripts/
- `prepare.js` — 预处理：解析图片、下载、按 zoom 预缩放、产出占位符正文与 manifest。**每次发布都先跑它。**
- `publish.js` — 用 Playwright 把 bundle 发布到知乎（默认存草稿，可 `--auto-publish`）。
- `verify_public.js` — 发布后验证：滚动公网文章，逐张检查 img `naturalWidth>0`、有无"上传失败"。`node verify_public.js <url>`。
- `diagnose.js` — 排查编辑页里哪个 figure 含"上传失败"。`node diagnose.js <edit_url>`。
- `convert.js` — （回退）把 md 的公式渲染成 PNG，产出知乎就绪 HTML；公式原生解析失败时才用。
- `package.json` / `node_modules` — sharp、playwright、marked、mathjax-full 依赖。

### 运行时数据（不在 skill 包内，各自独立）
- `zhihu_profile/` — 持久化 Edge 登录态（约 120MB），首次扫码后复用。
- 每次发布产出的 bundle 目录（body_noimg.md + manifest.json + images/ + 截图）放在用户工作区，不进 skill。
