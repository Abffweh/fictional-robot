'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const Core = require('../../app/src/main/assets/js/core.js');

/** 构造一个指定蛇身/方向的局面，食物放在不碍事的地方。 */
function scenario(opts) {
  const s = Core.createGame({ cols: opts.cols || 10, rows: opts.rows || 8, wrap: !!opts.wrap, seed: 7 });
  s.snake = opts.snake.map((p) => ({ x: p[0], y: p[1] }));
  s.dir = Core.DIRS[opts.dir || 'right'];
  s.food = opts.food ? { x: opts.food[0], y: opts.food[1] } : { x: 0, y: s.rows - 1 };
  return s;
}

test('createGame：初始蛇长 3、状态为进行中、食物不在蛇身上', () => {
  const s = Core.createGame({ cols: 26, rows: 16, seed: 42 });
  assert.equal(s.snake.length, 3);
  assert.equal(s.status, 'playing');
  assert.ok(s.food);
  assert.ok(!s.snake.some((p) => p.x === s.food.x && p.y === s.food.y));
});

test('撞墙：不穿墙模式下越界即死亡', () => {
  let s = scenario({ snake: [[9, 3], [8, 3], [7, 3]], dir: 'right' });
  s = Core.step(s);
  assert.equal(s.status, 'dead');
  assert.equal(s.deathReason, 'wall');
  assert.deepEqual(s.events.map((e) => e.type), ['die']);
});

test('穿墙：从右边出去从左边进来，四个方向都成立', () => {
  const cases = [
    { snake: [[9, 3], [8, 3], [7, 3]], dir: 'right', expect: [0, 3] },
    { snake: [[0, 3], [1, 3], [2, 3]], dir: 'left', expect: [9, 3] },
    { snake: [[4, 0], [4, 1], [4, 2]], dir: 'up', expect: [4, 7] },
    { snake: [[4, 7], [4, 6], [4, 5]], dir: 'down', expect: [4, 0] },
  ];
  for (const c of cases) {
    const s = Core.step(scenario(Object.assign({ wrap: true }, c)));
    assert.equal(s.status, 'playing');
    assert.deepEqual(s.snake[0], { x: c.expect[0], y: c.expect[1] });
    assert.equal(s.wrapped, true);
  }
});

test('撞自己：头撞到身体即死亡', () => {
  // 蛇呈 U 形，向下一步会撞到自己的身体
  let s = scenario({ snake: [[3, 2], [4, 2], [4, 3], [3, 3], [2, 3], [2, 2]], dir: 'left' });
  s = Core.enqueueDir(s, 'down');
  s = Core.step(s);
  assert.equal(s.status, 'dead');
  assert.equal(s.deathReason, 'self');
});

test('追尾不算撞：尾巴在同一刻移开时可以走进原尾巴的格子', () => {
  // 2x2 环形：头 (1,1) 向上走到 (1,0)，那是尾巴，但尾巴会同时离开
  let s = scenario({ snake: [[1, 1], [2, 1], [2, 0], [1, 0]], dir: 'left' });
  s = Core.enqueueDir(s, 'up');
  s = Core.step(s);
  assert.equal(s.status, 'playing');
  assert.deepEqual(s.snake[0], { x: 1, y: 0 });
});

test('正在变长时尾巴不动，走进尾巴格子就会死', () => {
  let s = scenario({ snake: [[1, 1], [2, 1], [2, 0], [1, 0]], dir: 'left' });
  s.grow = 1;
  s = Core.enqueueDir(s, 'up');
  s = Core.step(s);
  assert.equal(s.status, 'dead');
  assert.equal(s.deathReason, 'self');
});

test('防掉头：直接反向输入被丢弃', () => {
  let s = scenario({ snake: [[5, 3], [4, 3], [3, 3]], dir: 'right' });
  s = Core.enqueueDir(s, 'left');
  assert.equal(s.queue.length, 0);
  s = Core.step(s);
  assert.equal(s.status, 'playing');
  assert.deepEqual(s.snake[0], { x: 6, y: 3 });
});

test('防掉头：同一 tick 内快速按“上、左”不会撞到脖子，而是分两步执行', () => {
  let s = scenario({ snake: [[5, 3], [4, 3], [3, 3]], dir: 'right' });
  s = Core.enqueueDir(s, 'up');
  s = Core.enqueueDir(s, 'left');
  assert.equal(s.queue.length, 2);
  s = Core.step(s);
  assert.deepEqual(s.snake[0], { x: 5, y: 2 });
  s = Core.step(s);
  assert.equal(s.status, 'playing');
  assert.deepEqual(s.snake[0], { x: 4, y: 2 });
});

test('输入队列：重复方向被合并，最多缓存 3 个', () => {
  let s = scenario({ snake: [[5, 3], [4, 3], [3, 3]], dir: 'right' });
  s = Core.enqueueDir(s, 'right');
  assert.equal(s.queue.length, 0);
  for (const d of ['up', 'up', 'left', 'down', 'right', 'up']) s = Core.enqueueDir(s, d);
  assert.equal(s.queue.length, Core.MAX_QUEUE);
});

test('吃食物：得分增加、蛇变长、新食物不在蛇身上', () => {
  let s = scenario({ snake: [[5, 3], [4, 3], [3, 3]], dir: 'right', food: [6, 3] });
  s = Core.step(s);
  assert.equal(s.score, Core.FOOD_POINTS);
  assert.equal(s.snake.length, 4);
  assert.equal(s.prevTail, null);
  assert.ok(s.events.some((e) => e.type === 'eat'));
  assert.ok(s.food);
  assert.ok(!s.snake.some((p) => p.x === s.food.x && p.y === s.food.y));
});

test('step 不修改传入的 state（纯函数）', () => {
  const s0 = scenario({ snake: [[5, 3], [4, 3], [3, 3]], dir: 'right', food: [6, 3] });
  const snapshot = JSON.stringify(s0);
  Core.step(s0);
  assert.equal(JSON.stringify(s0), snapshot);
});

test('相同种子得到相同结果（可复现）', () => {
  const run = () => {
    let s = Core.createGame({ cols: 12, rows: 10, seed: 123, wrap: true });
    for (let i = 0; i < 50; i++) s = Core.step(s);
    return JSON.stringify(s);
  };
  assert.equal(run(), run());
});
