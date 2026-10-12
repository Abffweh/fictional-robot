/*
 * 闯关模式的关卡定义 —— 纯函数，不依赖 DOM。
 * 每关的障碍物都按“长边 × 短边”的横向坐标系描述，竖屏时自动转置，
 * 所以同一关在横屏（26×16）和竖屏（16×26）下布局一致。
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./core.js'));
  else root.SnakeLevels = factory(root.SnakeCore);
})(typeof self !== 'undefined' ? self : this, function (Core) {
  'use strict';

  function rect(out, x0, y0, w, h) {
    for (let y = y0; y < y0 + h; y++) for (let x = x0; x < x0 + w; x++) out.push([x, y]);
  }
  function hline(out, x0, x1, y, gaps) {
    for (let x = x0; x <= x1; x++) if (!(gaps && gaps.some((g) => x >= g[0] && x <= g[1]))) out.push([x, y]);
  }
  function vline(out, x, y0, y1, gaps) {
    for (let y = y0; y <= y1; y++) if (!(gaps && gaps.some((g) => y >= g[0] && y <= g[1]))) out.push([x, y]);
  }

  /** W ≥ H，坐标 (x, y) 以横向棋盘为准。 */
  const LEVELS = [
    {
      name: '初出茅庐',
      desc: '空旷的草地，熟悉操作',
      target: 8,
      speed: 150,
      build() {
        return [];
      },
    },
    {
      name: '四方石柱',
      desc: '四根石柱，小心转弯',
      target: 10,
      speed: 140,
      build(W, H) {
        const out = [];
        const xs = [Math.floor(W / 4) - 1, Math.floor((3 * W) / 4) - 1];
        const ys = [Math.floor(H / 4) - 1, Math.floor((3 * H) / 4) - 1];
        for (const x of xs) for (const y of ys) rect(out, x, y, 2, 2);
        return out;
      },
    },
    {
      name: '城门',
      desc: '四面城墙，从城门穿到对面',
      target: 12,
      speed: 135,
      wrap: true,
      build(W, H) {
        const out = [];
        const gx = [Math.floor(W / 2) - 2, Math.floor(W / 2) + 1];
        const gy = [Math.floor(H / 2) - 2, Math.floor(H / 2) + 1];
        hline(out, 0, W - 1, 0, [gx]);
        hline(out, 0, W - 1, H - 1, [gx]);
        vline(out, 0, 1, H - 2, [gy]);
        vline(out, W - 1, 1, H - 2, [gy]);
        return out;
      },
    },
    {
      name: '十字路口',
      desc: '中央十字墙，四个口子相通',
      target: 14,
      speed: 130,
      build(W, H) {
        const out = [];
        const cx = Math.floor(W / 2);
        const cy = Math.floor(H / 2);
        hline(out, 3, W - 4, cy, [[cx - 2, cx + 1]]);
        vline(out, cx, 2, H - 3, [[cy - 2, cy + 1]]);
        return out;
      },
    },
    {
      name: '回廊',
      desc: '两道长墙，缺口一左一右',
      target: 16,
      speed: 125,
      build(W, H) {
        const out = [];
        const y1 = Math.floor(H / 3);
        const y2 = H - 1 - Math.floor(H / 3);
        hline(out, 0, W - 1, y1, [[2, 5]]);
        hline(out, 0, W - 1, y2, [[W - 6, W - 3]]);
        return out;
      },
    },
    {
      name: '迷宫',
      desc: '梳齿状的墙，要绕着走',
      target: 18,
      speed: 120,
      build(W, H) {
        const out = [];
        const step = Math.floor(W / 5);
        let fromTop = true;
        for (let x = step; x < W - 2; x += step) {
          if (fromTop) vline(out, x, 0, H - 5);
          else vline(out, x, 4, H - 1);
          fromTop = !fromTop;
        }
        return out;
      },
    },
  ];

  /** 生成某关在 cols×rows 棋盘上的障碍格（竖屏自动转置）。 */
  function buildWalls(index, cols, rows) {
    const level = LEVELS[index];
    const portrait = rows > cols;
    const W = portrait ? rows : cols;
    const H = portrait ? cols : rows;
    const walls = new Uint8Array(cols * rows);
    for (const [lx, ly] of level.build(W, H)) {
      const x = portrait ? ly : lx;
      const y = portrait ? lx : ly;
      if (x >= 0 && y >= 0 && x < cols && y < rows) walls[y * cols + x] = 1;
    }
    return walls;
  }

  /**
   * 找一个安全的出生点：长度 3 的蛇身和前方 5 格都不能有障碍、也不能越界。
   * 从棋盘左侧中部开始按距离由近到远搜索。
   */
  function findStart(cols, rows, walls, length) {
    const len = length || 3;
    const free = (x, y) => x >= 0 && y >= 0 && x < cols && y < rows && !walls[y * cols + x];
    const prefX = cols > rows ? cols * 0.3 : cols * 0.5;
    const prefY = cols > rows ? rows * 0.5 : rows * 0.7;
    const order = cols > rows ? ['right', 'up', 'down', 'left'] : ['up', 'right', 'left', 'down'];
    const cells = [];
    for (let y = 0; y < rows; y++) for (let x = 0; x < cols; x++) cells.push({ x, y, d: (x - prefX) ** 2 + (y - prefY) ** 2 });
    cells.sort((a, b) => a.d - b.d);
    for (const c of cells) {
      for (const name of order) {
        const dir = Core.DIRS[name];
        let ok = true;
        for (let k = -(len - 1); k <= 5 && ok; k++) ok = free(c.x + dir.x * k, c.y + dir.y * k);
        if (!ok) continue;
        const snake = [];
        for (let i = 0; i < len; i++) snake.push({ x: c.x - dir.x * i, y: c.y - dir.y * i });
        return { snake, dir };
      }
    }
    throw new Error('找不到出生点');
  }

  /** 创建某一关的新游戏。opts: { cols, rows, seed, score, powerups } */
  function createLevelGame(index, opts) {
    const o = opts || {};
    const level = LEVELS[index];
    const cols = o.cols;
    const rows = o.rows;
    const walls = buildWalls(index, cols, rows);
    return Core.createGame({
      cols,
      rows,
      mode: 'level',
      wrap: !!level.wrap,
      walls,
      start: findStart(cols, rows, walls, 3),
      seed: o.seed,
      score: o.score || 0,
      levelIndex: index,
      target: level.target,
      interval: level.speed,
      lastLevel: index === LEVELS.length - 1,
      powerups: o.powerups,
    });
  }

  /** 进入下一关：保留分数与随机种子。最后一关之后返回 null。 */
  function nextLevelGame(state) {
    const next = state.levelIndex + 1;
    if (next >= LEVELS.length) return null;
    return createLevelGame(next, { cols: state.cols, rows: state.rows, seed: state.seed, score: state.score });
  }

  /** 通关第 completedIndex 关后，已解锁关卡数（1 起算）。 */
  function unlockAfter(unlockedCount, completedIndex) {
    const current = Math.max(1, Math.min(LEVELS.length, unlockedCount | 0));
    return Math.min(LEVELS.length, Math.max(current, completedIndex + 2));
  }

  return { LEVELS, buildWalls, findStart, createLevelGame, nextLevelGame, unlockAfter };
});
