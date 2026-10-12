/*
 * 贪吃蛇核心逻辑 —— 纯函数模块，不依赖 DOM。
 * 浏览器中挂到 window.SnakeCore；Node 中通过 require 使用（单元测试）。
 * 所有函数都不修改传入的 state，而是返回新的 state。
 * 时间单位：毫秒“游戏时间”。每走一个 tick，游戏时间增加一个 tick 的时长，
 * 所以暂停时道具计时也会冻结。
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

  /** 经典模式三档速度：每个逻辑刻度（tick）的毫秒数。 */
  const SPEEDS = Object.freeze({ slow: 170, normal: 125, fast: 90 });
  const SPEED_NAMES = Object.freeze({ slow: '慢', normal: '中', fast: '快' });

  const FOOD_POINTS = 10;
  const MAX_QUEUE = 3;

  /** 道具：在棋盘上存在 lifetime 毫秒，吃到后效果持续 duration 毫秒。 */
  const POWERUPS = Object.freeze({
    fast: Object.freeze({ name: '加速', duration: 6000, factor: 0.6 }),
    slow: Object.freeze({ name: '减速', duration: 7000, factor: 1.6 }),
    double: Object.freeze({ name: '双倍分数', duration: 10000 }),
    ghost: Object.freeze({ name: '穿墙', duration: 6000 }),
  });
  const POWERUP_TYPES = Object.freeze(Object.keys(POWERUPS));
  const POWERUP_LIFETIME = 7000;
  const POWERUP_FIRST_DELAY = [5000, 9000];
  const POWERUP_GAP = [8000, 15000];

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
      range(lo, hi) {
        return lo + Math.floor(this.next() * (hi - lo + 1));
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
  function dirName(d) {
    for (const k of Object.keys(DIRS)) if (DIRS[k].x === d.x && DIRS[k].y === d.y) return k;
    return null;
  }
  function inBounds(state, x, y) {
    return x >= 0 && y >= 0 && x < state.cols && y < state.rows;
  }
  function isWall(state, x, y) {
    return !!(state.walls && state.walls[y * state.cols + x]);
  }
  function wrapCoord(v, size) {
    return ((v % size) + size) % size;
  }

  /** 列出所有空格子（不在蛇身、障碍、食物、道具上）。 */
  function freeCells(state) {
    const { cols, rows } = state;
    const taken = new Uint8Array(cols * rows);
    if (state.walls) for (let i = 0; i < taken.length; i++) if (state.walls[i]) taken[i] = 1;
    for (const p of state.snake) taken[p.y * cols + p.x] = 1;
    if (state.food) taken[state.food.y * cols + state.food.x] = 1;
    if (state.powerup) taken[state.powerup.y * cols + state.powerup.x] = 1;
    const out = [];
    for (let i = 0; i < taken.length; i++) if (!taken[i]) out.push({ x: i % cols, y: (i / cols) | 0 });
    return out;
  }

  function randomFreeCell(state, rng) {
    const cells = freeCells(state);
    return cells.length ? cells[rng.int(cells.length)] : null;
  }

  /** 默认出生点：左侧 1/3 处，水平朝右。 */
  function defaultStart(cols, rows, length) {
    const hx = Math.min(cols - 2, Math.floor(cols / 3) + length - 1);
    const hy = Math.floor(rows / 2);
    const snake = [];
    for (let i = 0; i < length; i++) snake.push({ x: hx - i, y: hy });
    return { snake, dir: DIRS.right };
  }

  function emptyEffects() {
    return { fast: 0, slow: 0, double: 0, ghost: 0 };
  }

  /**
   * 创建一局新游戏。
   * opts: { cols, rows, mode, wrap, speed, seed, walls, start, score,
   *         powerups, levelIndex, target, interval, lastLevel }
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
      baseInterval: o.interval || null,
      walls: o.walls || null,
      levelIndex: o.levelIndex === undefined ? null : o.levelIndex,
      target: o.target || null,
      lastLevel: !!o.lastLevel,
      powerupsEnabled: o.powerups !== false,
      snake: start.snake.map((p) => ({ x: p.x, y: p.y })),
      dir: start.dir,
      queue: [],
      food: null,
      powerup: null,
      effects: emptyEffects(),
      nextPowerupAt: 0,
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
    state.food = randomFreeCell(state, rng);
    state.nextPowerupAt = rng.range(POWERUP_FIRST_DELAY[0], POWERUP_FIRST_DELAY[1]);
    state.seed = rng.seed;
    return state;
  }

  /**
   * 方向输入进入队列。和“队列里最后一个方向”（或当前方向）相同或相反的输入会被丢弃，
   * 所以连续快速按“上、左”也不会在同一个 tick 内掉头撞到脖子。
   */
  function enqueueDir(state, dirName_) {
    const d = dirOf(dirName_);
    if (!d || state.status !== 'playing') return state;
    const last = state.queue.length ? state.queue[state.queue.length - 1] : state.dir;
    if (sameDir(last, d) || isOpposite(last, d)) return state;
    if (state.queue.length >= MAX_QUEUE) return state;
    return Object.assign({}, state, { queue: state.queue.concat([d]) });
  }

  function effectActive(state, type) {
    return state.effects[type] > state.time;
  }

  /** 当前每个 tick 的时长（毫秒），受加速/减速道具影响。 */
  function tickInterval(state) {
    let ms = state.baseInterval || SPEEDS[state.speed] || SPEEDS.normal;
    if (effectActive(state, 'fast')) ms *= POWERUPS.fast.factor;
    if (effectActive(state, 'slow')) ms *= POWERUPS.slow.factor;
    return Math.round(ms);
  }

  /** HUD 用：生效中的道具及剩余毫秒数。 */
  function activeEffects(state) {
    const out = [];
    for (const type of POWERUP_TYPES) {
      const left = state.effects[type] - state.time;
      if (left > 0) out.push({ type, name: POWERUPS[type].name, remaining: left, duration: POWERUPS[type].duration });
    }
    return out;
  }

  function canWrap(state) {
    return state.wrap || effectActive(state, 'ghost');
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

  /** 推进一个逻辑刻度。 */
  function step(state) {
    if (state.status !== 'playing') return state;
    const rng = makeRng(state.seed);
    const events = [];
    const s = Object.assign({}, state, { events, prevTail: null, wrapped: false });
    s.time = state.time + tickInterval(state);
    s.ticks = state.ticks + 1;

    // 1. 道具计时：效果到期、棋盘上的道具消失、刷新新道具
    s.effects = Object.assign({}, state.effects);
    for (const type of POWERUP_TYPES) {
      if (s.effects[type] && s.effects[type] <= s.time) {
        s.effects[type] = 0;
        events.push({ type: 'effectEnd', kind: type });
      }
    }
    if (s.powerup && s.powerup.expires <= s.time) {
      events.push({ type: 'powerupExpire', kind: s.powerup.type });
      s.powerup = null;
      s.nextPowerupAt = s.time + rng.range(POWERUP_GAP[0], POWERUP_GAP[1]);
    }
    if (s.powerupsEnabled && !s.powerup && s.time >= s.nextPowerupAt) {
      const cell = randomFreeCell(s, rng);
      if (cell) {
        s.powerup = { type: POWERUP_TYPES[rng.int(POWERUP_TYPES.length)], x: cell.x, y: cell.y, expires: s.time + POWERUP_LIFETIME };
        events.push({ type: 'powerupSpawn', kind: s.powerup.type, x: cell.x, y: cell.y });
      } else {
        s.nextPowerupAt = s.time + POWERUP_GAP[0];
      }
    }

    // 2. 取出一个排队的方向（防御性地再检查一次掉头）
    let queue = state.queue;
    let dir = state.dir;
    if (queue.length) {
      const d = queue[0];
      queue = queue.slice(1);
      if (!isOpposite(d, dir)) dir = d;
    }
    s.queue = queue;
    s.dir = dir;

    // 3. 新蛇头（穿墙效果按本 tick 的时间判断）
    const ghost = effectActive(s, 'ghost');
    const nh = nextHead(s, dir);
    if (nh.blocked) return die(s, nh.blocked, events, rng);
    if (!ghost && isWall(s, nh.x, nh.y)) return die(s, 'obstacle', events, rng);

    const eats = !!(s.food && s.food.x === nh.x && s.food.y === nh.y);
    let pending = state.grow + (eats ? 1 : 0);
    const keepTail = pending > 0;
    if (keepTail) pending--;

    // 4. 撞自己：尾巴这一刻会移走（除非正在变长），所以可以追着尾巴走
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

    // 5. 拾取道具
    if (s.powerup && s.powerup.x === head.x && s.powerup.y === head.y) {
      const type = s.powerup.type;
      s.effects[type] = s.time + POWERUPS[type].duration;
      if (type === 'fast') s.effects.slow = 0;
      if (type === 'slow') s.effects.fast = 0;
      s.powerup = null;
      s.nextPowerupAt = s.time + rng.range(POWERUP_GAP[0], POWERUP_GAP[1]);
      events.push({ type: 'powerup', kind: type, x: head.x, y: head.y });
    }

    // 6. 吃食物
    if (eats) {
      const points = FOOD_POINTS * (effectActive(s, 'double') ? 2 : 1);
      s.score = state.score + points;
      s.eaten = state.eaten + 1;
      events.push({ type: 'eat', x: head.x, y: head.y, points });
      s.food = null;
      s.food = randomFreeCell(s, rng);
    }

    // 7. 过关 / 胜利
    if (s.mode === 'level' && s.target && s.snake.length >= s.target) {
      s.status = s.lastLevel ? 'won' : 'levelComplete';
      events.push({ type: s.lastLevel ? 'allClear' : 'levelComplete', level: s.levelIndex });
    } else if (eats && !s.food) {
      s.status = 'won';
      events.push({ type: 'win' });
    }

    s.seed = rng.seed;
    return s;
  }

  // ---------- 渲染插值（纯函数，渲染层每帧调用） ----------
  /** 相邻两格之间的位移（-1/0/1），穿墙时取“绕过边界”的那个方向。 */
  function wrapDelta(a, b, cols, rows) {
    let dx = b.x - a.x;
    let dy = b.y - a.y;
    if (dx > 1) dx -= cols;
    else if (dx < -1) dx += cols;
    if (dy > 1) dy -= rows;
    else if (dy < -1) dy += rows;
    return { x: dx, y: dy };
  }

  /**
   * 蛇身在两个 tick 之间的插值折线，t ∈ [0,1] 为当前 tick 内已过去的比例。
   * 返回“展开”坐标（穿墙时不会横跨整个棋盘，可能落在棋盘外，渲染层再画对边副本）：
   * 头部从上一格滑向当前格，尾巴从上一刻的位置收回，中间沿真实格子路径，所以拐角平滑。
   * 还返回蛇头朝向 dir（插值中的移动方向）。
   */
  function interpolatePath(state, t) {
    const s = state.snake;
    const n = s.length;
    const u = [{ x: s[0].x, y: s[0].y }];
    for (let i = 1; i < n; i++) {
      const d = wrapDelta(s[i - 1], s[i], state.cols, state.rows);
      u.push({ x: u[i - 1].x + d.x, y: u[i - 1].y + d.y });
    }
    const moving = state.ticks > 0 && n > 1;
    const k = Math.max(0, Math.min(1, t));
    const pts = [moving ? { x: u[1].x + (u[0].x - u[1].x) * k, y: u[1].y + (u[0].y - u[1].y) * k } : u[0]];
    for (let i = 1; i < n; i++) pts.push(u[i]);
    if (moving && state.prevTail) {
      const d = wrapDelta(s[n - 1], state.prevTail, state.cols, state.rows);
      pts.push({ x: u[n - 1].x + d.x * (1 - k), y: u[n - 1].y + d.y * (1 - k) });
    }
    const dir = moving ? { x: u[0].x - u[1].x, y: u[0].y - u[1].y } : state.dir;
    return { pts, dir };
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
    SPEED_NAMES,
    FOOD_POINTS,
    MAX_QUEUE,
    POWERUPS,
    POWERUP_TYPES,
    POWERUP_LIFETIME,
    makeRng,
    sameDir,
    isOpposite,
    dirName,
    inBounds,
    isWall,
    wrapCoord,
    freeCells,
    defaultStart,
    createGame,
    enqueueDir,
    effectActive,
    tickInterval,
    activeEffects,
    canWrap,
    nextHead,
    step,
    wrapDelta,
    interpolatePath,
  };
});
