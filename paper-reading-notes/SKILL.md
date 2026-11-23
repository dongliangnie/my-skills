---
name: paper-reading-notes
description: 把 arXiv 论文整理成中文精读笔记。基于论文 TeX 源码（而非仅 PDF/摘要）提取方法、公式、实验与表格，配图和实验结果表格一律用原文截图（原图复制或矢量 PDF 300 DPI 渲染，结果表从论文 PDF 对应页裁剪），不用自创 Markdown 表格代替结果表，只输出 Markdown。特别擅长把关键公式逐项拆开、讲透到读者能独立复述（符号含义、数学来源、设计动机、取值读法、适用边界）。当用户说"整理 XX 笔记""要求同上整理论文""爬 TeX 源码做阅读笔记""用原文截图配图""精读这篇 arXiv"，或给出 arXiv ID/标题想要结构化中文笔记时使用。触发后按本 skill 流程顺序执行。
agent_created: true
---

# Paper Reading Notes

## Overview

把一篇 arXiv 论文变成一份**能直接读、能发布**的中文精读笔记。核心特征四点：① **以 TeX 源码为权威来源**（摘要、公式、方法、实验、图表标题、表格都从 `.tex` 取，不靠 PDF 抽取或想当然）；② **配图全部来自原文**（原 PNG/JPG 直接复制，矢量 PDF 用 PyMuPDF 300 DPI 渲染），不编造图；③ **实验结果表格直接截原文表格，不自创 Markdown 表格**（表格在 PDF/TeX 里排版好后整块渲染成图，数字以保持原样为最高优先，详见 Step 3）；④ **关键公式逐项讲透**——这是本 skill 区别于普通摘要工具的灵魂，见「公式深讲协议」。

默认只产出 **Markdown（.md）**，不产出 HTML/PDF（除非用户当次明确要）。

## 用户偏好（来自长期实践，默认遵守）

- "要求同上" = 爬 TeX 源码 + 原文截图配图 + **只输出 Markdown**（删掉多余的 HTML 与构建脚本）。
- **图片下方不要写来源注记**：不要出现"截自论文原文 Table N""截自论文 TeX 源文件""（原文 Fig. N）"之类的说明文字。图片全是原文截图这件事是默认前提，无需逐张声明。用 `![简短图注](figures/xxx.png)` 的 alt 文本说明内容即可（如 `![原文 Table 2：主仿真结果](...)`），但图片正下方不要再加一行"截自……"。
- **实验结果表格一律直接截原文表格，不要自创 Markdown 表格**：无论结果表、消融表还是对比表，都从原文 PDF/TeX 渲染成图（如 `table1_main_results.png`）再插入笔记，保持排版与数字原样。这是用户明确要求，别图省事用 `| a | b |` 重排。
- 笔记里图片用相对路径 `figures/xxx.png`，**必须与生成脚本的输出文件名一一对应**（曾因 `fig13_baseline_comp` vs `_compare` 拼写不一致出错，产出后务必核对）。
- 关键公式讲解要"细致到能教会别人"：用户会反复要求把某个公式/概念讲得更细。见下方协议，务必一次做到位。
- 论文家族要分清版本（如 π₀ / π₀.₅ / π\*₀.₆ 是不同论文），不要混为一谈。

## Workflow（按顺序执行）

### Step 0 — 定位论文（找对 ID 是前提）

1. WebSearch 搜不到时，直接用 arXiv 搜索页：
   `https://arxiv.org/search/?query=<关键词>&searchtype=all`
2. 标题含 π 等符号导致搜不到时，用文字部分 + `searchtype=title`。
3. **有同名论文时**：用项目内已有笔记/源码里的 `bibitem`/引用判断归属，不要凭标题猜（例：OpenWAM 有两篇同名，靠 RelayWAM 笔记的 `bibitem{openwam}` 定位到正确 ID）。
4. 核对并记录：arXiv ID、准确标题、作者、发表会议/时间。

### Step 1 — 下载源码与 PDF

用工作区下的 `<slug>_notes/source/` 存放。源码 tar 与 PDF **分开下载**：

```bash
curl -L -C - --max-time 600 --retry 3 --retry-delay 2 -o source/<slug>_source.tar "https://arxiv.org/e-print/<ID>"
curl -L -C - --max-time 600 --retry 3 -o source/<slug>_paper.pdf "https://arxiv.org/pdf/<ID>"
```

- 大文件 e-print 常超时/截断，`-C -` 续传、`--max-time 600` 必加；tar 报 "Compressed file ended before end-of-stream" 就重跑续传。
- 验证 tar 用 Python `tarfile`（`file` 命令在环境里可能不存在）：
  ```python
  import tarfile
  t = tarfile.open(path); print(len(t.getnames()), "members")
  ```
- PDF 页数用 PyMuPDF 核对（`pymupdf.open(pdf).page_count`）。

### Step 2 — 解压并读源码

```bash
mkdir -p source/tex && tar -xf source/<slug>_source.tar -C source/tex
```

读源码要点（按此顺序建立理解）：
1. 找主文件（`main.tex` / `arxiv.tex`）与 section 文件，看 `\input{}` 结构。
2. 从 `main.tex` 顶部的 `\def`/`\newcommand` 拿到论文自定义符号（如 `\def\Pizf{$\pi_{0.5}$}`），笔记里沿用同款记号。
3. 逐节读 abstract / intro / method / experiments / conclusion，抄准：一句话贡献、方法步骤、公式原文、实验设置（步数/GPU/数据规模/基准）、表格数字。
4. 找 `\begin{figure}` 的 caption 和 `\includegraphics{}` 路径，建立图号↔源文件映射。
5. 表格文件（常在 `tables/`）单独读，理解每张表在讲什么、用于正文哪句话；**数字不要抄进笔记的 Markdown 表格里**——结果表按 Step 3 截成原文图片插入（读源码是为了选对表、写对表注和解读文字）。
6. **补充材料（`suppl`/`appendix`）务必读**——公式推导、探针设置、超参、边界条件常只在那里（本 skill 的公式深讲高度依赖它）。

### Step 3 — 提取原文配图

复用脚本 `scripts/render_figures.py`（复制到 `<slug>_notes/` 改开头的 `COPY`/`RENDER` 映射即可）。两种来源：
- **原始 PNG/JPG**（已成图、分辨率够）：直接 `shutil.copy2` 复制。
- **矢量 PDF**：PyMuPDF 300 DPI 渲染，`pymupdf.Matrix(300/72, 300/72)`，`get_pixmap(matrix=mat, alpha=False)`。

命名统一 `fig1_xxx.png`、`fig2_xxx.png`……输出目录 `<slug>_notes/figures/`。运行后核对每张图的实际输出名，确保与 Step 5 笔记里的引用一致；`MISSING` 的源要回头检查路径。

**实验结果表格也走截图（用户明确要求，不要用 Markdown 表格重排）**：表格三种来源，按优先级处理——
1. **独立表格 PDF**（作者把大表编译成单独 `.pdf` 放进源码，如 `tables/main.pdf`）：当作矢量图，PyMuPDF 300 DPI 渲染成 `table1_xxx.png`。
2. **正文页里的表格**（多数情况，表格直接排在 `main.tex`/section 的 `\begin{table}` 里）：从**论文 PDF** 定位表格所在页，用 PyMuPDF 裁剪表格区域渲染。做法：先用 `page.search_for("Table 1")` 找到表题位置，取该页面 `page.get_pixmap(matrix=mat, clip=表格矩形)`；裁剪框给不准时宁可整页截图（见 `scripts/render_figures.py` 的 `TABLES`/`TABLE_PAGES` 用法）。**务必在 PDF 上目视确认截到的是完整表格、没有被分页切断**。
3. 源码 `tables/*.tex` 只是用来理解表格内容与选表，不作为笔记呈现形式。

表格图片命名 `table1_xxx.png`、`table2_xxx.png`……与正文引用对应。图片下方**不要**加"截自论文原文 Table N"之类的注记（见用户偏好）。**绝不**用 `| a | b |` 语法把实验数据重排成 Markdown 表。

### Step 4 — 规划笔记结构

标准骨架（可按需增减章节）：
1. TL;DR / 一句话结论
2. 背景与动机（现有方法的 gap）
3. 核心问题（论文想回答什么）
4. 方法总览 + 关键公式（每个公式按 Step 6 深讲）
5. 实验设置与主要结果（结果表格截原文图插入，配文字解读，不重排表格）
6. 消融与分析
7. 局限 / 假设 / 可复现性
8. 相关演进（若是系列论文，加时间线与技术主线对比）
9. 开放问题

配图 6–15 张，每张承担一个论点，紧跟相关文字。图片下方**不要**写"截自论文 TeX 源文件"之类注记，图注信息放在 `![...]` 的 alt 文本里即可。

### Step 5 — 写 Markdown 笔记

产出 `<slug>_notes/<论文名>_阅读笔记.md`。写作风格：
- 面向"聪明但不熟悉这篇论文"的同行；先给反常识结论，再解释为什么。
- 公式用 LaTeX（`$...$` / `$$...$$`），记号与论文一致。
- 数字都带出处（Table N / Fig. N）。
- **实验结果表格直接插原文截图**（`![原文 Table N](figures/tableN_xxx.png)`），图片下方**不要**加"截自论文原文 Table N"注记；文字负责解读表格说明了什么，不复述整张表的数字。
- **不要自创 Markdown 表格呈现实验数据**；若是完全为讲解自制的关系/演进对照表（不是论文原表，如 π 系列演进表），可用 Markdown 表格但需注明"整理自……"（这类讲解表仍保留来源说明，与原文结果表区分开）。

### Step 6 — 公式深讲协议（本 skill 的灵魂）

**对每一个关键公式，不要只写"它是什么"，要写到读者能独立复述。** 在公式下方用一个引用块（`>`）逐项展开，覆盖以下维度（按需裁剪，但符号、来源、读法、边界四项必做）：

1. **这个式子想回答什么** —— 先讲动机/它解决的困惑，再讲形式。
2. **符号逐项含义** —— 每个变量、上下标、算子、范数分别是什么；向量还是标量，维度多少。
3. **数学来源/推导** —— 公式从哪来（泰勒展开、定义、最小二乘……）。把原文（含补充材料）里对应的推导式写出来并解释。
4. **为什么这样设计** —— 控制变量、取绝对值防抵消、减基准等设计选择的意图。
5. **取值读法** —— =0 / =1 / >0 / <0 分别意味着什么，典型数值怎么解释。
6. **适用边界** —— 它证明了什么、没证明什么（例：探针只证明信息"存在"≠策略"使用"）；原文没明确的细节要如实标注，不杜撰。

参考 `references/formula_explanation_patterns.md` 里四个真实范例（ΔR² 控制变量、空间池化、R² 决定系数、留出集、训练焦点归因）的写法与深度。

**核对纪律**：所有细节都回原文（正文 + 补充材料）核对；论文没说的（如 `Pool` 具体算子）明确写"论文只写 spatially pooled，未指定算子，按惯例理解为平均池化"——宁可标注不确定，不可编造。公式编号 suffix 注意补充材料用 A/B/C 前缀（如 R² 定义是 Eq. A2，归因泰勒展开是 Eq. B1）。

### Step 7 — 交付前校验

- [ ] 笔记里每个 `figures/xxx.png` 引用都能在 `figures/` 找到对应文件（拼写逐一核对）。
- [ ] **实验结果表格都是原文截图**（`tableN_xxx.png`），没有把结果/消融/对比表重排成 Markdown 表格；每张表图在 PDF 上目视确认截全、未断页。
- [ ] 关键公式都按 Step 6 深讲，不是一句话带过。
- [ ] 数字/公式/术语与 TeX 源一致，补充材料的细节已纳入。
- [ ] 只保留了 `.md` 与 `figures/`、必要的 `render_figures.py`、`source/`；删掉多余的 HTML/构建产物（用户明确只要 MD 时）。
- [ ] 用 present_files 呈现最终 `.md`。

## Resources

### scripts/
- `render_figures.py` — 通用配图脚本模板：顶部 `COPY`（原图复制）与 `RENDER`（矢量 PDF 300 DPI 渲染）两个映射，复制到笔记目录改映射即可用。依赖 PyMuPDF（`pymupdf`）。

### references/
- `formula_explanation_patterns.md` — 公式深讲的真实范例集与写作模板（ΔR² / 空间池化 / R² / 留出集 / 训练焦点归因），体现"细致到能教会别人"的标准。
- `workflow_pitfalls.md` — 定位/下载/源码/配图各步的踩坑记录与对策（同名论文、tar 截断、符号标题、路径拼写等）。
