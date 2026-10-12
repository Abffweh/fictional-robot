/*
 * 演示模式 AI —— 纯函数，不依赖 DOM。
 * 每个 tick 调用一次 decide(state)，返回方向名。策略：
 *   1. BFS 找到去食物的最短路；沿这条路“虚拟地”走过去吃掉食物，
 *      再检查新的蛇头还能不能走到自己的尾巴。能 → 走这条路的第一步。
 *   2. 不安全或找不到路 → 选一个走完之后仍能到达尾巴的方向，
 *      优先离尾巴最远的（绕远路追尾巴，给食物腾出安全路线的时间）。
 *   3. 哪个方向都到不了尾巴 → 选可活动空间最大的方向，尽量拖延。
 * 时间感知：蛇身第 i 节（0 为头）在 len-i+grow 步之后才会让出格子，
 * BFS 走到某格的步数不小于这个值时就当作可通行。
 * AI 规划时不利用“穿墙道具”（它会过期），只按关卡本身是否可穿墙来规划。
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./core.js'));
  else root.SnakeAI = factory(root.SnakeCore);
})(typeof self !== 'undefined' ? self : this, function (Core) {
  'use strict';

  const DIR_NAMES = ['up', 'right', 'down', 'left'];

  /** 只包含 AI 需要的字段的轻量局面。 */
  function view(state) {
    return {
      cols: state.cols,
      rows: state.rows,
      wrap: !!state.wrap,
      walls: state.walls,
      snake: state.snake,
      grow: state.grow || 0,
      food: state.food,
    };
  }

  function neighbor(v, x, y, d) {
    let nx = x + d.x;
    let ny = y + d.y;
    if (nx < 0 || ny < 0 || nx >= v.cols || ny >= v.rows) {
      if (!v.wrap) return -1;
      nx = Core.wrapCoord(nx, v.cols);
      ny = Core.wrapCoord(ny, v.rows);
    }
    const i = ny * v.cols + nx;
    return v.walls && v.walls[i] ? -1 : i;
  }

  /** 每个格子最早可以进入的步数（蛇身占用会随时间让出）。 */
  function freeAt(v) {
    const n = v.cols * v.rows;
    const t = new Int32Array(n);
    const len = v.snake.length;
    for (let i = 0; i < len; i++) {
      const p = v.snake[i];
      const k = p.y * v.cols + p.x;
      t[k] = Math.max(t[k], len - i + v.grow);
    }
    return t;
  }

  /**
   * 时间感知 BFS。返回 { dist, prev }，dist[-1 表示不可达]。
   * stopAt：找到这个格子就提前结束。
   */
  function bfs(v, startIdx, stopAt) {
    const n = v.cols * v.rows;
    const dist = new Int32Array(n).fill(-1);
    const prev = new Int32Array(n).fill(-1);
    const avail = freeAt(v);
    const queue = new Int32Array(n);
    let qh = 0;
    let qt = 0;
    dist[startIdx] = 0;
    queue[qt++] = startIdx;
    while (qh < qt) {
      const cur = queue[qh++];
      if (cur === stopAt) break;
      const cx = cur % v.cols;
      const cy = (cur / v.cols) | 0;
      const nd = dist[cur] + 1;
      for (const name of DIR_NAMES) {
        const ni = neighbor(v, cx, cy, Core.DIRS[name]);
        if (ni < 0 || dist[ni] !== -1 || avail[ni] > nd) continue;
        dist[ni] = nd;
        prev[ni] = cur;
        queue[qt++] = ni;
      }
    }
    return { dist, prev };
  }

  function idx(v, p) {
    return p.y * v.cols + p.x;
  }
  function pointOf(v, i) {
    return { x: i % v.cols, y: (i / v.cols) | 0 };
  }

  /** 从 a 走到相邻格 b 的方向名（考虑穿墙）。 */
  function dirBetween(v, a, b) {
    for (const name of DIR_NAMES) {
      if (neighbor(v, a.x, a.y, Core.DIRS[name]) === idx(v, b)) return name;
    }
    return null;
  }

  /**
   * 按核心规则虚拟地走一串格子（不检查碰撞，路径由 BFS 保证合法）。
   * 先只算长度变化，最后一次性拼出新蛇身：新蛇 = 倒序的路径 + 原蛇身的前若干节。
   */
  function simulate(v, cells) {
    let len = v.snake.length;
    let grow = v.grow;
    let food = v.food;
    for (const c of cells) {
      const eats = !!(food && food.x === c.x && food.y === c.y);
      let pending = grow + (eats ? 1 : 0);
      if (pending > 0) {
        pending--;
        len++;
      }
      grow = pending;
      if (eats) food = null;
    }
    const snake = [];
    for (let i = cells.length - 1; i >= 0 && snake.length < len; i--) snake.push(cells[i]);
    for (let i = 0; snake.length < len; i++) snake.push(v.snake[i]);
    return Object.assign({}, v, { snake, grow, food });
  }

  /** 蛇头能否走到自己的尾巴（尾巴会随时间让出，所以按时间感知 BFS 判断）。 */
  function canReachTail(v) {
    if (v.snake.length < 2) return true;
    const tail = idx(v, v.snake[v.snake.length - 1]);
    const r = bfs(v, idx(v, v.snake[0]), tail);
    return r.dist[tail] > 0;
  }

  /** 从蛇头出发可活动的格子数（时间感知）。 */
  function freeArea(v) {
    const r = bfs(v, idx(v, v.snake[0]), -1);
    let n = 0;
    for (let i = 0; i < r.dist.length; i++) if (r.dist[i] > 0) n++;
    return n;
  }

  /** 棋盘上不是障碍的格子总数。 */
  function openCells(v) {
    let n = v.cols * v.rows;
    if (v.walls) for (let i = 0; i < v.walls.length; i++) if (v.walls[i]) n--;
    return n;
  }

  /** 当前可走的方向（排除掉头，以及下一步就会撞上的）。 */
  function legalMoves(v, dir) {
    const head = v.snake[0];
    const avail = freeAt(v);
    const out = [];
    for (const name of DIR_NAMES) {
      const d = Core.DIRS[name];
      if (dir && Core.isOpposite(d, dir) && v.snake.length > 1) continue;
      const ni = neighbor(v, head.x, head.y, d);
      if (ni < 0 || avail[ni] > 1) continue;
      out.push({ name, cell: pointOf(v, ni) });
    }
    return out;
  }

  function pathTo(v, target) {
    const start = idx(v, v.snake[0]);
    const goal = idx(v, target);
    const r = bfs(v, start, goal);
    if (r.dist[goal] <= 0) return null;
    const cells = [];
    for (let c = goal; c !== start; c = r.prev[c]) cells.push(pointOf(v, c));
    return cells.reverse();
  }

  /** 主决策：返回 'up' | 'down' | 'left' | 'right'。 */
  function decide(state) {
    const v = view(state);
    const dir = state.queue && state.queue.length ? state.queue[state.queue.length - 1] : state.dir;
    const fallback = Core.dirName(dir);

    // 1. 去吃食物，前提是吃完之后还能找到尾巴（吃完正好填满棋盘时直接获胜，也算安全）
    if (v.food) {
      const path = pathTo(v, v.food);
      if (path) {
        const after = simulate(v, path);
        if (canReachTail(after) || after.snake.length >= openCells(v)) {
          const name = dirBetween(v, v.snake[0], path[0]);
          if (name) return name;
        }
      }
    }

    const moves = legalMoves(v, dir);
    if (!moves.length) return fallback;

    // 2. 追尾巴：选走完一步后仍能到达尾巴、且离尾巴最远的方向（同等时选空间大的）。
    //    一次 BFS 同时得到“到尾巴的距离”和“可活动空间”。
    let best = null;
    for (const m of moves) {
      const after = simulate(v, [m.cell]);
      const r = bfs(after, idx(after, after.snake[0]), -1);
      const d = r.dist[idx(after, after.snake[after.snake.length - 1])];
      if (!(d > 0)) continue;
      let area = 0;
      for (let i = 0; i < r.dist.length; i++) if (r.dist[i] > 0) area++;
      const score = d * 1000 + area;
      if (!best || score > best.score) best = { name: m.name, score };
    }
    if (best) return best.name;

    // 3. 实在不行：选空间最大的方向
    let roomiest = moves[0];
    let room = -1;
    for (const m of moves) {
      const a = freeArea(simulate(v, [m.cell]));
      if (a > room) {
        room = a;
        roomiest = m;
      }
    }
    return roomiest.name;
  }

  return { decide, canReachTail, freeArea, pathTo, simulate, legalMoves, view };
});
