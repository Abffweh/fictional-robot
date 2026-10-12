'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const Core = require('../../app/src/main/assets/js/core.js');
const Levels = require('../../app/src/main/assets/js/levels.js');

const GRIDS = [
  { name: '横屏', cols: 26, rows: 16 },
  { name: '竖屏', cols: 16, rows: 26 },
];

/** 从 (x,y) 出发能到达的空格数量（障碍不可走；关卡允许穿墙时边界相连）。 */
function reachable(cols, rows, walls, wrap, sx, sy) {
  const seen = new Uint8Array(cols * rows);
  const q = [[sx, sy]];
  seen[sy * cols + sx] = 1;
  let n = 0;
  while (q.length) {
    const [x, y] = q.pop();
    n++;
    for (const d of Object.values(Core.DIRS)) {
      let nx = x + d.x;
      let ny = y + d.y;
      if (nx < 0 || ny < 0 || nx >= cols || ny >= rows) {
        if (!wrap) continue;
        nx = Core.wrapCoord(nx, cols);
        ny = Core.wrapCoord(ny, rows);
      }
      const i = ny * cols + nx;
      if (walls[i] || seen[i]) continue;
      seen[i] = 1;
      q.push([nx, ny]);
    }
  }
  return n;
}

test('至少 5 关，且第 2 关起每关都有不同的障碍布局', () => {
  assert.ok(Levels.LEVELS.length >= 5, `关卡数 ${Levels.LEVELS.length}`);
  const layouts = Levels.LEVELS.map((_, i) => Array.from(Levels.buildWalls(i, 26, 16)).join(''));
  for (let i = 1; i < layouts.length; i++) {
    assert.ok(layouts[i].includes('1'), `第 ${i + 1} 关应有障碍物`);
    for (let j = 0; j < i; j++) assert.notEqual(layouts[i], layouts[j], `第 ${i + 1} 关与第 ${j + 1} 关布局相同`);
  }
  const targets = Levels.LEVELS.map((l) => l.target);
  for (let i = 1; i < targets.length; i++) assert.ok(targets[i] > targets[i - 1], '目标长度应逐关递增');
});

for (const g of GRIDS) {
  test(`每关在${g.name}下：出生点安全、所有空格连通、空间足够`, () => {
    Levels.LEVELS.forEach((level, i) => {
      const s = Levels.createLevelGame(i, { cols: g.cols, rows: g.rows, seed: 1 });
      const walls = Levels.buildWalls(i, g.cols, g.rows);
      // 出生点：蛇身不在障碍上，前方 5 格可走
      for (const p of s.snake) assert.equal(walls[p.y * g.cols + p.x], 0, `第 ${i + 1} 关蛇身压在障碍上`);
      let x = s.snake[0].x;
      let y = s.snake[0].y;
      for (let k = 0; k < 5; k++) {
        x += s.dir.x;
        y += s.dir.y;
        assert.ok(x >= 0 && y >= 0 && x < g.cols && y < g.rows && !walls[y * g.cols + x], `第 ${i + 1} 关出生方向前方不安全`);
      }
      // 连通性：从蛇头出发能到达所有空格
      const free = walls.reduce((n, w) => n + (w ? 0 : 1), 0);
      assert.equal(reachable(g.cols, g.rows, walls, !!level.wrap, s.snake[0].x, s.snake[0].y), free, `第 ${i + 1} 关存在封闭区域`);
      assert.ok(free > level.target * 4, `第 ${i + 1} 关可用空间太小`);
      // 食物不会刷在障碍上
      assert.equal(walls[s.food.y * g.cols + s.food.x], 0);
    });
  });
}

test('竖屏布局是横屏布局的转置', () => {
  for (let i = 0; i < Levels.LEVELS.length; i++) {
    const land = Levels.buildWalls(i, 26, 16);
    const port = Levels.buildWalls(i, 16, 26);
    for (let y = 0; y < 16; y++) for (let x = 0; x < 26; x++) assert.equal(port[x * 16 + y], land[y * 26 + x]);
  }
});

test('撞障碍物即死亡', () => {
  const s0 = Levels.createLevelGame(1, { cols: 26, rows: 16, seed: 3, powerups: false });
  // 把蛇放到第一根石柱 (5,3) 左边，朝右走
  const s = Object.assign({}, s0, { snake: [{ x: 4, y: 3 }, { x: 3, y: 3 }, { x: 2, y: 3 }], dir: Core.DIRS.right, food: { x: 20, y: 8 } });
  const next = Core.step(s);
  assert.equal(next.status, 'dead');
  assert.equal(next.deathReason, 'obstacle');
});

test('关卡切换：达到目标长度 → 过关事件；下一关保留分数、换布局、重置蛇长', () => {
  const s0 = Levels.createLevelGame(0, { cols: 26, rows: 16, seed: 9, powerups: false });
  const target = Levels.LEVELS[0].target;
  // 构造一条长度为 target-1 的蛇，食物就在前方
  const snake = [];
  for (let i = 0; i < target - 1; i++) snake.push({ x: 12 - i, y: 8 });
  const s = Object.assign({}, s0, { snake, dir: Core.DIRS.right, food: { x: 13, y: 8 }, score: 70 });
  const done = Core.step(s);
  assert.equal(done.snake.length, target);
  assert.equal(done.status, 'levelComplete');
  assert.ok(done.events.some((e) => e.type === 'levelComplete' && e.level === 0));

  // 过关后不再推进
  assert.equal(Core.step(done), done);

  const next = Levels.nextLevelGame(done);
  assert.equal(next.levelIndex, 1);
  assert.equal(next.status, 'playing');
  assert.equal(next.score, done.score);
  assert.equal(next.snake.length, 3);
  assert.equal(next.target, Levels.LEVELS[1].target);
  assert.ok(next.walls.some((w) => w === 1));
});

test('最后一关达到目标 → 全部通关（won），没有下一关', () => {
  const last = Levels.LEVELS.length - 1;
  const s0 = Levels.createLevelGame(last, { cols: 26, rows: 16, seed: 2, powerups: false });
  const target = Levels.LEVELS[last].target;
  // 在最右侧通道（x=21..25）里按蛇形路线摆一条长度 target-1 的蛇，食物放在路线的下一格
  const path = [];
  for (let y = 0; y < 16; y++) for (let k = 0; k < 5; k++) path.push({ x: y % 2 ? 25 - k : 21 + k, y });
  const body = path.slice(0, target - 1);
  for (const p of path.slice(0, target)) assert.ok(!s0.walls[p.y * 26 + p.x], '路线上不能有障碍');
  const head = body[body.length - 1];
  const food = path[target - 1];
  const dir = { x: food.x - head.x, y: food.y - head.y };
  const s = Object.assign({}, s0, { snake: body.slice().reverse(), dir, food });
  const done = Core.step(s);
  assert.equal(done.status, 'won');
  assert.ok(done.events.some((e) => e.type === 'allClear'));
  assert.equal(Levels.nextLevelGame(done), null);
});

test('解锁记录：过关后解锁下一关，不会倒退也不会超过总关数', () => {
  const n = Levels.LEVELS.length;
  assert.equal(Levels.unlockAfter(1, 0), 2);
  assert.equal(Levels.unlockAfter(4, 0), 4);
  assert.equal(Levels.unlockAfter(2, 2), 4);
  assert.equal(Levels.unlockAfter(n, n - 1), n);
  assert.equal(Levels.unlockAfter(0, -5), 1);
});
