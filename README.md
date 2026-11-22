# skills

我的 [Claude Code](https://claude.com/claude-code) Skills 集合。每个子目录是一个独立 skill，包含 `SKILL.md`（触发条件与工作流）及若干脚本、参考文档。

| Skill | 一句话说明 |
| --- | --- |
| [`arxiv-translator`](arxiv-translator/) | 把 arXiv 论文自动翻译成中文 PDF，保留英文/中文两套 LaTeX 源码与 Makefile，支持公式、图表、译后自检、Zotero 同步。 |
| [`zhihu-blog-publisher`](zhihu-blog-publisher/) | 把本地 Markdown（含公式、表格、配图）发布到知乎专栏：图片预缩放 + 占位符逐张上传，公式走知乎原生解析。 |
| [`paper-reading-notes`](paper-reading-notes/) | 基于 arXiv TeX 源码做中文精读笔记：方法、实验数字原样取用，配图从原文 PDF 以 300 DPI 渲染，关键公式逐项讲透到能复述。 |

## 安装

克隆仓库后，把需要的 skill 子目录链接（或复制）到 Claude Code 的 skills 目录：

```bash
git clone git@github.com:dongliangnie/my-skills.git ~/work/my-skills

ln -s ~/work/my-skills/arxiv-translator      ~/.claude/skills/arxiv-translator
ln -s ~/work/my-skills/zhihu-blog-publisher  ~/.claude/skills/zhihu-blog-publisher
ln -s ~/work/my-skills/paper-reading-notes   ~/.claude/skills/paper-reading-notes
```

Claude Code 启动时会自动发现 `~/.claude/skills/*/SKILL.md`。

各 skill 的依赖与使用方式见其子目录下的 `README.md` / `SKILL.md`。

## 运行时数据（不入库）

- `**/node_modules/`、`zhihu_profile/`（知乎登录态，约 120MB）、发布产物 bundle 等均由各 skill 在本地生成，已在 `.gitignore` 中排除。
- 首次使用 `zhihu-blog-publisher` 时，在 `scripts/` 下执行 `npm install` 并在弹出的浏览器中扫码登录一次。

## License

各 skill 未单独声明许可证；使用时请同时遵守相关平台（arXiv、知乎）的服务条款与内容版权。
