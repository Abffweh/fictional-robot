# 来源说明

- 上游仓库：https://github.com/xiazhuo123456789/vibe-knowledge-video （MIT）
- 引入版本：`2727b050abc25053ee4d425cf917a195082a957c`（2026-10-09）
- 未引入：`docs/original-analysis/`（原片逐秒 OCR 文本，版权归原作者，见 LICENSE），README 中对它的引用因此失效。
- 本环境已预装 Chromium（`/opt/pw-browsers`），只需 `pip install playwright==1.56.0 pillow numpy`，不要执行 `playwright install`。
  - 版本要锁 1.56.0：它对应预装的 chromium-1194；更新的版本（如 1.63）会找不到浏览器。
  - 实测：3 秒模板片段渲染约 28 秒（≈0.3 秒/帧），140 秒成片约需 20+ 分钟。
