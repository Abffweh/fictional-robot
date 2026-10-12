'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const Core = require('../../app/src/main/assets/js/core.js');
const Levels = require('../../app/src/main/assets/js/levels.js');
const AI = require('../../app/src/main/assets/js/ai.js');

/** 让 AI 自己玩到死亡、胜利或达到 tick 上限。 */
function play(s0, maxTicks) {
  let s = s0;
  let eaten = 0;
  while (s.status === 'playing' && s.ticks < maxTicks) {
    s = Core.enqueueDir(s, AI.decide(s));
    s = Core.step(s);
    if (s.events.some((e) => e.type === 'eat')) eaten++;
  }
  return { s, eaten };
}

/** 随机自回避游走生成一条蛇（不穿墙），失败返回 null。 */
function randomSnake(rng, cols, rows, walls, len) {
  const blocked = new Uint8Array(cols * rows);
  if (walls) for (let i = 0; i < walls.length; i++) blocked[i] = walls[i];
  let x = rng.int(cols);
  let y = rng.int(rows);
  if (blocked[y * cols + x]) return null;
  const body = [{ x, y }];
  blocked[y * cols + x] = 1;
  const dirs = Object.values(Core.DIRS);
  while (body.length < len) {
    const options = dirs.filter((d) => {
      const nx = x + d.x;
      const ny = y + d.y;
      return nx >= 0 && ny >= 0 && nx < cols && ny < rows && !blocked[ny * cols + nx];
    });
    if (!options.length) return null;
    const d = options[rng.int(options.length)];
    x += d.x;
    y += d.y;
    body.push({ x, y });
    blocked[y * cols + x] = 1;
  }
  // 游走的最后一格当蛇头
  const snake = body.reverse();
  const dir = { x: snake[0].x - snake[1].x, y: snake[0].y - snake[1].y };
  return { snake, dir };
}

test('AI 决策：只在合法方向里选，绝不掉头', () => {
  let s = Core.createGame({ cols: 26, rows: 16, seed: 3 });
  for (let i = 0; i < 300 && s.status === 'playing'; i++) {
    const d = AI.decide(s);
    assert.ok(['up', 'down', 'left', 'right'].includes(d));
    assert.ok(!Core.isOpposite(Core.DIRS[d], s.dir), '不能掉头');
    s = Core.step(Core.enqueueDir(s, d));
  }
  assert.equal(s.status, 'playing');
});

test('AI 安全检查：吃完食物会被困死时不去吃，而是去追尾巴', () => {
  // 7x5 棋盘，第 0 行 x=1..4 是一条宽 1 格的死胡同（下方和尽头都是墙），食物在胡同尽头 (4,0)。
  // 钻进去吃到食物后蛇头无路可走（不能掉头），必死。
  //   y0: . F F F F # .      (F = 胡同，食物在最右的 F)
  //   y1: . # # # # # .
  //   y2: H . . . . . .      (H = 蛇头，朝上)
  const cols = 7;
  const walls = new Uint8Array(cols * 5);
  for (const [x, y] of [[1, 1], [2, 1], [3, 1], [4, 1], [5, 1], [5, 0]]) walls[y * cols + x] = 1;
  const s0 = Core.createGame({ cols, rows: 5, seed: 1, powerups: false, walls });
  const snake = [{ x: 0, y: 2 }, { x: 0, y: 3 }, { x: 0, y: 4 }, { x: 1, y: 4 }, { x: 2, y: 4 }];
  const s = Object.assign({}, s0, { snake, dir: Core.DIRS.up, food: { x: 4, y: 0 } });
  const v = AI.view(s);
  const path = AI.pathTo(v, s.food);
  assert.ok(path, '食物本身是可达的');
  assert.equal(AI.canReachTail(AI.simulate(v, path)), false, '吃完之后到不了尾巴（会困死）');
  const d = AI.decide(s);
  assert.notEqual(d, 'up', '往上就只能钻进死胡同');
  const nh = Core.nextHead(s, Core.DIRS[d]);
  const after = AI.simulate(v, [{ x: nh.x, y: nh.y }]);
  assert.ok(AI.canReachTail(after), `AI 选择的方向 ${d} 应保证还能到达尾巴`);
  // 接着让 AI 自己玩 300 tick：它不会钻进胡同送死
  let g = s;
  for (let i = 0; i < 300 && g.status === 'playing'; i++) g = Core.step(Core.enqueueDir(g, AI.decide(g)));
  assert.equal(g.status, 'playing');
});

test('AI 存活率：100 局随机对局（空地 + 各关布局，横竖屏），每局 2000 tick', (t) => {
  const N = 100;
  const MAX = 2000;
  let deaths = 0;
  let wins = 0;
  let totalLen = 0;
  const failed = [];
  for (let seed = 1; seed <= N; seed++) {
    const portrait = seed % 2 === 0;
    const cols = portrait ? 16 : 26;
    const rows = portrait ? 26 : 16;
    let s0;
    if (seed <= 50) {
      s0 = Core.createGame({ cols, rows, seed, mode: 'demo', speed: 'fast' });
    } else {
      s0 = Levels.createLevelGame(seed % Levels.LEVELS.length, { cols, rows, seed });
      s0 = Object.assign(s0, { target: null }); // 不过关，一直玩下去
    }
    const { s } = play(s0, MAX);
    totalLen += s.snake.length;
    if (s.status === 'dead') {
      deaths++;
      failed.push(`seed=${seed} ticks=${s.ticks} len=${s.snake.length} reason=${s.deathReason}`);
    }
    if (s.status === 'won') wins++;
  }
  const rate = ((N - deaths) / N) * 100;
  const msg = `AI 随机对局：${N} 局，存活 ${N - deaths}，死亡 ${deaths}，满屏胜利 ${wins}，存活率 ${rate.toFixed(1)}%，平均蛇长 ${(totalLen / N).toFixed(1)}`;
  t.diagnostic(msg);
  console.log(msg);
  assert.equal(deaths, 0, '死亡记录：\n' + failed.join('\n'));
});

test('AI 存活率：100 个随机中局局面（随机折叠的长蛇），每个局面 600 tick', (t) => {
  const rng = Core.makeRng(20261012);
  const N = 100;
  let deaths = 0;
  let generated = 0;
  let rejected = 0;
  let totalEaten = 0;
  const failed = [];
  while (generated < N) {
    const useLevel = generated % 3 === 2;
    const levelIndex = 1 + (generated % (Levels.LEVELS.length - 1));
    const walls = useLevel ? Levels.buildWalls(levelIndex, 26, 16) : null;
    const len = 8 + rng.int(73); // 8..80 节
    const body = randomSnake(rng, 26, 16, walls, len);
    if (!body) continue;
    let s = Core.createGame({ cols: 26, rows: 16, seed: rng.int(1e9), walls, start: body, mode: 'demo', wrap: useLevel && Levels.LEVELS[levelIndex].wrap });
    // 只保留“有解”的局面：蛇头此刻能到达尾巴（否则任何策略都可能必死）
    if (!AI.canReachTail(AI.view(s)) || !AI.legalMoves(AI.view(s), s.dir).length) {
      rejected++;
      continue;
    }
    generated++;
    const r = play(s, 600);
    totalEaten += r.eaten;
    if (r.s.status === 'dead') {
      deaths++;
      failed.push(`#${generated} len=${len} ticks=${r.s.ticks} reason=${r.s.deathReason}`);
    }
  }
  const rate = ((N - deaths) / N) * 100;
  const msg = `AI 随机局面：${N} 个（另有 ${rejected} 个开局即无解的被排除），存活 ${N - deaths}，死亡 ${deaths}，存活率 ${rate.toFixed(1)}%，共吃到 ${totalEaten} 个食物`;
  t.diagnostic(msg);
  console.log(msg);
  assert.equal(deaths, 0, '死亡记录：\n' + failed.join('\n'));
});
