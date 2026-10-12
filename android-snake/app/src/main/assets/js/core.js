/*
 * 贪吃蛇核心逻辑 —— 纯函数模块，不依赖 DOM。
 * 浏览器中挂到 window.SnakeCore；Node 中通过 require 使用（单元测试）。
 * 所有函数都不修改传入的 state，而是返回新的 state。
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.SnakeCore = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const DIRS = Object.freeze({
    up: Object.freeze({ x: 0, y: -1 }),
    down: Object.freeze({ x: 0, y: 1 }),
    left: Object.freeze({ x: -1, y: 0 }),
    right: Object.freeze({ x: 1, y: 0 }),
  });

  /** 三档速度：每个逻辑刻度（tick）的毫秒数。 */
  const SPEEDS = Object.freeze({ slow: 170, normal: 125, fast: 90 });

  const FOOD_POINTS = 10;
  const MAX_QUEUE = 3;

  // ---------- 随机数（可复现，种子存在 state 里） ----------
  function makeRng(seed) {
    let s = seed >>> 0;
    return {
      next() {
        s = (s + 0x6d2b79f5) >>> 0;
        let t = s;
        t = Math.imul(t ^ (t >>> 15), t | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
      },
      int(n) {
        return Math.floor(this.next() * n);
      },
      get seed() {
        return s;
      },
    };
  }

  // ---------- 小工具 ----------
  function sameDir(a, b) {
    return a.x === b.x && a.y === b.y;
  }
  function isOpposite(a, b) {
    return a.x === -b.x && a.y === -b.y;
  }
  function dirOf(name) {
    return typeof name === 'string' ? DIRS[name] || null : name;
  }
  function inBounds(state, x, y) {
    return x >= 0 && y >= 0 && x < state.cols && y < state.rows;
  }
  function cellIndex(state, x, y) {
    return y * state.cols + x;
  }
  function isWall(state, x, y) {
    return !!(state.walls && state.walls[cellIndex(state, x, y)]);
  }
  function wrapCoord(v, size) {
    return ((v % size) + size) % size;
  }

  /** 列出所有空格子（不在蛇身、障碍、食物、道具上）。 */
  function freeCells(state, extraBlocked) {
    const { cols, rows } = state;
    const taken = new Uint8Array(cols * rows);
    if (state.walls) for (let i = 0; i < taken.length; i++) if (state.walls[i]) taken[i] = 1;
    for (const p of state.snake) taken[p.y * cols + p.x] = 1;
    if (state.food) taken[state.food.y * cols + state.food.x] = 1;
    if (extraBlocked) for (const p of extraBlocked) if (p) taken[p.y * cols + p.x] = 1;
    const out = [];
    for (let i = 0; i < taken.length; i++) if (!taken[i]) out.push({ x: i % cols, y: (i / cols) | 0 });
    return out;
  }

  function placeFood(state, rng) {
    const cells = freeCells(Object.assign({}, state, { food: null }));
    if (cells.length === 0) return null;
    return cells[rng.int(cells.length)];
  }

  /** 默认出生点：左侧 1/3 处，水平朝右。 */
  function defaultStart(cols, rows, length) {
    const hx = Math.min(cols - 2, Math.floor(cols / 3) + length - 1);
    const hy = Math.floor(rows / 2);
    const snake = [];
    for (let i = 0; i < length; i++) snake.push({ x: hx - i, y: hy });
    return { snake, dir: DIRS.right };
  }

  /**
   * 创建一局新游戏。
   * opts: { cols, rows, mode, wrap, speed, seed, walls, start, score }
   */
  function createGame(opts) {
    const o = opts || {};
    const cols = o.cols || 26;
    const rows = o.rows || 16;
    const start = o.start || defaultStart(cols, rows, 3);
    const state = {
      cols,
      rows,
      mode: o.mode || 'classic',
      wrap: !!o.wrap,
      speed: SPEEDS[o.speed] ? o.speed : 'normal',
      walls: o.walls || null,
      snake: start.snake.map((p) => ({ x: p.x, y: p.y })),
      dir: start.dir,
      queue: [],
      food: null,
      grow: 0,
      score: o.score || 0,
      eaten: 0,
      time: 0,
      ticks: 0,
      status: 'playing',
      deathReason: null,
      prevTail: null,
      wrapped: false,
      events: [],
      seed: (o.seed === undefined ? 1 : o.seed) >>> 0,
    };
    const rng = makeRng(state.seed);
    state.food = placeFood(state, rng);
    state.seed = rng.seed;
    return state;
  }

  /**
   * 方向输入进入队列。和“队列里最后一个方向”（或当前方向）相同或相反的输入会被丢弃，
   * 所以连续快速按“上、左”也不会在同一个 tick 内掉头撞到脖子。
   */
  function enqueueDir(state, dirName) {
    const d = dirOf(dirName);
    if (!d || state.status !== 'playing') return state;
    const last = state.queue.length ? state.queue[state.queue.length - 1] : state.dir;
    if (sameDir(last, d) || isOpposite(last, d)) return state;
    if (state.queue.length >= MAX_QUEUE) return state;
    return Object.assign({}, state, { queue: state.queue.concat([d]) });
  }

  /** 当前每个 tick 的时长（毫秒）。 */
  function tickInterval(state) {
    return SPEEDS[state.speed] || SPEEDS.normal;
  }

  /** 计算下一步蛇头位置；返回 { x, y, wrapped, blocked: 'wall'|null }。 */
  function nextHead(state, dir) {
    const head = state.snake[0];
    let x = head.x + dir.x;
    let y = head.y + dir.y;
    let wrapped = false;
    if (!inBounds(state, x, y)) {
      if (!canWrap(state)) return { x, y, wrapped: false, blocked: 'wall' };
      x = wrapCoord(x, state.cols);
      y = wrapCoord(y, state.rows);
      wrapped = true;
    }
    return { x, y, wrapped, blocked: null };
  }

  function canWrap(state) {
    return !!state.wrap;
  }

  /** 推进一个逻辑刻度。 */
  function step(state) {
    if (state.status !== 'playing') return state;
    const rng = makeRng(state.seed);
    const events = [];
    const s = Object.assign({}, state, { events, prevTail: null, wrapped: false });
    s.time = state.time + tickInterval(state);
    s.ticks = state.ticks + 1;

    // 1. 取出一个排队的方向（防御性地再检查一次掉头）
    let queue = state.queue;
    let dir = state.dir;
    if (queue.length) {
      const d = queue[0];
      queue = queue.slice(1);
      if (!isOpposite(d, dir)) dir = d;
    }
    s.queue = queue;
    s.dir = dir;

    // 2. 新蛇头
    const nh = nextHead(state, dir);
    if (nh.blocked) return die(s, nh.blocked, events, rng);
    if (isWall(state, nh.x, nh.y)) return die(s, 'obstacle', events, rng);

    const eats = !!(state.food && state.food.x === nh.x && state.food.y === nh.y);
    let pending = state.grow + (eats ? 1 : 0);
    const keepTail = pending > 0;
    if (keepTail) pending--;

    // 3. 撞自己：尾巴这一刻会移走（除非正在变长），所以可以追着尾巴走
    const bodyLen = keepTail ? state.snake.length : state.snake.length - 1;
    for (let i = 0; i < bodyLen; i++) {
      const p = state.snake[i];
      if (p.x === nh.x && p.y === nh.y) return die(s, 'self', events, rng);
    }

    const head = { x: nh.x, y: nh.y };
    const body = keepTail ? state.snake : state.snake.slice(0, -1);
    s.snake = [head].concat(body);
    s.prevTail = keepTail ? null : state.snake[state.snake.length - 1];
    s.wrapped = nh.wrapped;
    s.grow = pending;

    // 4. 吃食物
    if (eats) {
      const points = FOOD_POINTS;
      s.score = state.score + points;
      s.eaten = state.eaten + 1;
      events.push({ type: 'eat', x: head.x, y: head.y, points });
      s.food = placeFood(s, rng);
      if (!s.food) {
        s.status = 'won';
        events.push({ type: 'win' });
      }
    }

    s.seed = rng.seed;
    return s;
  }

  function die(s, reason, events, rng) {
    s.status = 'dead';
    s.deathReason = reason;
    s.seed = rng.seed;
    events.push({ type: 'die', reason });
    return s;
  }

  return {
    DIRS,
    SPEEDS,
    FOOD_POINTS,
    MAX_QUEUE,
    makeRng,
    sameDir,
    isOpposite,
    inBounds,
    isWall,
    wrapCoord,
    freeCells,
    defaultStart,
    createGame,
    enqueueDir,
    tickInterval,
    nextHead,
    step,
  };
});
