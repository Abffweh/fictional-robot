# 《为什么你说得很清楚，别人还是听不懂？》

系列「你的错觉，不是你的错」第 3 期 · 知识的诅咒 · 2D 纸黏土风 · @Leo · 横屏 1920×1080 / 24fps / 约 127 秒

## 文件

| 文件 | 作用 |
|---|---|
| `index.html` | 全片：Canvas 2D 画面 + DOM 文字层。`window.render(t)` 为纯时间函数 |
| `render.py` | Playwright 逐帧截图（可多进程） |
| `sfx.py` | 按 `window.SFX_CUES` 合成音效轨：新增 `knock`（指节敲桌）和 `mb<频率>`（八音盒音） |
| `compose.sh` | 帧 + 音效 → 原画质 / ≤30MB / 手机版 |
| `caption.md` | 抖音标题、正文、作者自评论 |

## 复现

```bash
python3 render.py index.html frames --fps 24 --procs 4
python3 sfx.py index.html sfx.wav
bash compose.sh frames sfx.wav out/知识的诅咒
```

## 事实与证据等级

| 片中说法 | 来源 | 等级 |
|---|---|---|
| 1990 年斯坦福心理学研究生的敲歌实验；120 首猜中 3 首（2.5%）；敲的人估计 50% | Newton 博士论文 *The Rocky Road from Actions to Intentions*（1990）；数字引自 Heath & Heath, HBR 2006-12 | 单个实验（博士论文，未正式发表），只写"做过这个实验"，不说"科学证明" |
| 2005 年一组实验：发消息的人普遍以为对方读得懂自己的语气 | Kruger, Epley, Parker & Ng, JPSP 89(6):925–936（5 个实验，摘要已核） | 同行评审；二手报道里的具体百分比互相不一致，片中不引数字 |
| "知识的诅咒"这个名字 | Camerer, Loewenstein & Weber, JPE 97(5), 1989 | 只用在片尾参考 |
| 怎么办：举具体例子、请对方复述 | Heath & Heath 的建议 + 常识 | 经验建议，非实验结论 |

本环境打不开论文原文 PDF，2.5% 等数字依据 HBR 原文的转述（多处来源一致）。

## 字幕规则自查

- 第一个场景的字幕直接说现象；例子之后点名"知识的诅咒"。
- 不提其他期；不用"我们"；不在一句里比较两个"……的……"。
- `scripts/script_lint.py`：0 ERROR；剩余 WARN 为开场读速，INFO 为百分数（同屏有"3 / 120 首"计数）。
