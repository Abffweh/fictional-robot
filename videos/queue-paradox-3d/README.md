# 《为什么旁边的队，总比你快？》· 「你的错觉，不是你的错」第 2 期 · @Leo

- 规格：1920×1080 / 24fps / 约 109 秒；3D 黏土微缩风、移轴景深；无背景音乐，只有合成音效（`sfx.py`）
- 复用 `../friendship-paradox-3d/` 的渲染流水线（three.js 引用其 `vendor/`）
- 片中数字全部由页面现场模拟：
  - 排队：3 条队、每人前面 4 位顾客、慢顾客概率 25%，模拟 1000 次 → 你这队最快约 1/3；4 条队约 1/4
  - 车道：两条道走走停停、相位相反、平均一样快；你被超车的时间约占 2/3（3 个整周期）
  - 博斯特罗姆：慢路段车更密，随机挑一个司机，多半在慢的一边（同一模型实算）
  - 两种排法：同一批顾客，各排各的 vs 一条长队，你等待时间由事件模拟算出
  - 与字幕不一致时页面直接抛错

## 生成

```bash
python3 render3d.py index.html base/ --fps 24 --procs 2 --query '?base'
python3 overlay_hook.py index.html ov/ --fps 24
python3 sfx.py index.html sfx.wav
./compose.sh base ov sfx.wav 输出名
```

## 出处
- D. A. Redelmeier & R. J. Tibshirani, "Why cars in the next lane seem to go faster," Nature 401, 35 (1999)
- N. Bostrom, "Cars in the next lane really do go faster," Plus Magazine (2001)
- 排队论：A. K. Erlang
- 不使用"70%/65% 的司机"等只有杂志转述的数字
