# 《你的朋友，比你受欢迎》v3 · 3D 黏土微缩风 · @Leo

- 规格：1920×1080 / 24fps / 约 111 秒（v4：全片文字改成大白话，说话变长处用时间扭曲 WARP 放慢画面）；**无背景音乐，只有音效**（`sfx.py` 合成，含极轻房间底噪）
- 风格参照：暖色木桌上的黏土小人微缩场景、移轴景深、衬线大字幕（仅中文）、左上角"今日扎心 ×N" / "检查单 k/4"、右上角斜体年代地点
- 技术：three.js r160（`vendor/three.min.js`，MIT）实时渲染，`window.render(t)` 为纯时间函数；SwiftShader 软件渲染约 2 秒/帧
- 片中统计数字（6/8、2.5、3.2、87.9%）由页面代码现场计算；8 人网络数字与字幕不一致会直接报错

## 结构

| 时间 | 场景 | 字幕 |
|---|---|---|
| 0–13 | 生活共鸣三连：朋友圈聚会 / 群里没人接话 / 生日冷清 → 拉远成全景 | 刷朋友圈，别人总在聚会；/ 在群里说话，没人接茬；/ 过个生日，人家的祝福刷了屏。/ 你是不是也觉得：大家都比你受欢迎？ |
| 13–16.5 | 标题卡 | 《你的朋友，比你受欢迎》为什么你总觉得，自己朋友最少？ |
| 16.5–27 | 书桌：Feld 1991 论文 + 红印章，Coleman 1961 书 | 1991年，社会学家费尔德发表了一篇论文：…… |
| 27–50 | 毛毡台：8 人 + 红毛线 + 号码旗 → 逐人比较 6/8 → 达人 → 好友名单 → 2.5 vs 3.2 温度计 | 做个实验：8个人，10段友谊；…… |
| 50–57 | 公式黑板：μ + σ²/μ | 只要每个人的朋友数不一样多，…… |
| 57–70 | 千人人群（实例化）87.9% → 拉高成 9 块人群（Facebook 7.21 亿） | 放大到一千人的网络：…… |
| 70–82.5 | 哈佛草坪：319 随机 + 425 朋友 → 两根流感温度计 → 熟人免疫 | 2009年哈佛：随机找了319个学生，…… |
| 82.5–96 | 回到开场三场景，人人头顶冒"?" → 片尾出品 + 参考文献 | 别难过：大多数人，都这么觉得。/ 你觉得，你是图里的哪个点？ |

## 生成（分层：3D 画面层 + 文字层，改字只需重渲文字层约 10 分钟）

```bash
python3 render3d.py index.html base/ --fps 24 --procs 2 --query '?base'   # 3D 画面，约 75 分钟
python3 overlay_hook.py index.html ov/ --fps 24                          # 文字层，约 10 分钟
python3 sfx.py index.html sfx.wav
./compose.sh base ov sfx.wav 输出名                                        # 原画质 / ≤30MB / 手机版
```

旧的一体化渲染：

```bash
pip install playwright==1.56.0 pillow numpy      # 1.56.0 对应本环境预装的 chromium-1194
python3 render3d.py index.html frames/ --fps 24 --procs 2
python3 sfx.py index.html sfx.wav
ffmpeg -framerate 24 -i frames/f%06d.png -i sfx.wav -c:v libx264 -crf 18 -pix_fmt yuv420p -c:a aac -b:a 192k -shortest final.mp4
```

事实核实见 `../friendship-paradox/NOTES.md`。
