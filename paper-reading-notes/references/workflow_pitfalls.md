# Workflow pitfalls & fixes

按步骤记录的真实踩坑与对策，执行前扫一遍可少走弯路。

## Step 0 定位论文

- **WebSearch 搜不到**：直接用 `https://arxiv.org/search/?query=<关键词>&searchtype=all`（RelayWAM 普通 web 搜索无结果，arXiv 搜索页才有）。
- **标题含 π 等符号**：arXiv 渲染掉符号导致搜不到 → 用文字部分 + `searchtype=title`（"a VLA that Learns from Experience" 找到 π\*₀.₆/RECAP）。
- **同名论文**：必须在多篇同名里选对。靠项目内已有笔记/源码的 `bibitem`/引用判断归属（OpenWAM 两篇：arXiv 2610.07922 Stanford vs 2609.07398 清华，靠 RelayWAM 笔记的 `\bibitem{openwam}` 选了后者）。
- **系列论文分版本**：π₀(2410.24164) / π₀.₅(2504.16054, CoRL25) / π₀.₆ / π\*₀.₆(2511.14759, RECAP) 是不同论文，主角和标题可能不一致（2511.14759 标题是 π\*₀.₆，方法叫 RECAP）。

## Step 1 下载

- **tar 截断**：`Compressed file ended before the end-of-stream marker` → `curl -L -C - --max-time 600 --retry 3 --retry-delay 2` 续传；tar 与 PDF **分开下**更稳。
- **`file` 命令不存在**：环境里可能没有，用 Python `tarfile` 验证成员数。
- **PDF 页数核对**：`pymupdf.open(pdf).page_count`（含附录页数会明显变多，正常）。

## Step 2 读源码

- 主文件可能叫 `main.tex` 或 `arxiv.tex`；先看 `\input{}` 摸清 section 结构再读。
- 自定义符号在 `main.tex` 顶部 `\def`/`\newcommand`，笔记沿用同款记号。
- **补充材料必读**：探针协议、超参、推导、边界常只在 supplement（RelayWAM 的 ΔR²/R²/归因推导全在 `X_suppl.tex`）。
- 表格常在 `tables/` 子目录，数字以源码为准。

## Step 3 配图

- 原始 PNG/JPG 若已是高分辨率成图 → 直接复制，不要重渲染（π₀.₅ 14 张 PNG 直接 copy）。
- 矢量 PDF → PyMuPDF 300 DPI，`alpha=False`；`figures/` 输出名统一 `fig1_xxx.png` 顺序编号。
- **文件名一致性**（高频错误）：笔记里的 `figures/xxx.png` 必须与脚本输出逐字一致。曾 `fig13_baseline_comp` vs 实际 `fig13_baseline_compare` 不匹配 → 产出后逐一核对（grep 笔记里的图片引用，对照 `ls figures/`）。
- 脚本里对 `MISSING` 的源要回头查路径（子目录大小写、扩展名）。

## Step 4-5 写作

- "要求同上" = 只 MD；删掉 HTML 和 build 脚本，别留半成品。
- 配图 6–15 张，每张承担一个论点，别全贴。
- 表格用 Markdown 重排并注明"据 Table N 重排"，不直接贴图（除非表格本身就是图）。

## Step 6 公式深讲

- 用户会逐条追问"讲解不够细致"——见 `formula_explanation_patterns.md`，一次讲到位。
- **诚实标注**：原文没明确的（如 `Pool` 具体算子）写"论文未指定，按惯例理解为 X"，不杜撰。
- 补充材料公式用 A/B/C 前缀，引用编号别错（R²=Eq.A2，归因泰勒=Eq.B1）。

## 环境备忘

- 受管 Python：`C:/Users/HP/.workbuddy-ai/binaries/python/versions/3.13.12/python.exe`；PyMuPDF 需装在其环境。
- 工作区：`C:/Users/HP/WorkBuddy AI/2026-11-20-22-48-24/`，笔记目录 `<slug>_notes/`。
- 本机 SSH key 未授权 GitHub、无 gh 登录——涉及远程操作先确认认证。
