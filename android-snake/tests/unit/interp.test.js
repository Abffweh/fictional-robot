'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const Core = require('../../app/src/main/assets/js/core.js');

function polyLength(pts) {
  let len = 0;
  for (let i = 1; i < pts.length; i++) len += Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y);
  return len;
}

/** 一条走了一步、刚拐过弯的蛇：上一刻头在 (5,3) 朝右，这一刻往上走到 (5,2)。 */
function movedState() {
  let s = Core.createGame({ cols: 12, rows: 8, seed: 1, powerups: false });
  s = Object.assign(s, { snake: [{ x: 5, y: 3 }, { x: 4, y: 3 }, { x: 3, y: 3 }, { x: 2, y: 3 }], dir: Core.DIRS.right, food: { x: 0, y: 0 } });
  return Core.step(Core.enqueueDir(s, 'up'));
}

test('插值：t=0 时蛇头在上一格，t=1 时在当前格，中间平滑过渡', () => {
  const s = movedState();
  assert.deepEqual(s.snake[0], { x: 5, y: 2 });
  assert.deepEqual(Core.interpolatePath(s, 0).pts[0], { x: 5, y: 3 });
  assert.deepEqual(Core.interpolatePath(s, 1).pts[0], { x: 5, y: 2 });
  assert.deepEqual(Core.interpolatePath(s, 0.25).pts[0], { x: 5, y: 2.75 });
  assert.deepEqual(Core.interpolatePath(s, 0.5).dir, { x: 0, y: -1 }, '蛇头朝向为移动方向');
});

test('插值：折线经过真实的拐角格子，尾巴从上一刻的位置收回', () => {
  const s = movedState();
  const p0 = Core.interpolatePath(s, 0).pts;
  const p1 = Core.interpolatePath(s, 1).pts;
  assert.deepEqual(p0[1], { x: 5, y: 3 }, '拐角格子在折线上');
  assert.deepEqual(p0[p0.length - 1], s.prevTail, 't=0 时尾巴还在上一刻的位置');
  assert.deepEqual(p1[p1.length - 1], s.snake[s.snake.length - 1], 't=1 时尾巴收回到当前尾格');
});

test('插值：不变长时折线总长恒为 n-1（不会忽长忽短），变长那一刻尾巴不动', () => {
  const s = movedState();
  for (const t of [0, 0.1, 0.33, 0.5, 0.77, 1]) {
    assert.ok(Math.abs(polyLength(Core.interpolatePath(s, t).pts) - (s.snake.length - 1)) < 1e-9, `t=${t}`);
  }
  // 吃到食物的那一步：prevTail 为 null，尾巴不收回
  let g = Core.createGame({ cols: 12, rows: 8, seed: 1, powerups: false });
  g = Object.assign(g, { snake: [{ x: 5, y: 3 }, { x: 4, y: 3 }, { x: 3, y: 3 }], dir: Core.DIRS.right, food: { x: 6, y: 3 } });
  g = Core.step(g);
  assert.equal(g.prevTail, null);
  const pts = Core.interpolatePath(g, 0.5).pts;
  assert.equal(pts.length, g.snake.length);
  assert.deepEqual(pts[pts.length - 1], g.snake[g.snake.length - 1]);
});

test('插值：穿墙时不会横跨整个棋盘，而是从边界外滑进来', () => {
  let s = Core.createGame({ cols: 12, rows: 8, seed: 1, wrap: true, powerups: false });
  s = Object.assign(s, { snake: [{ x: 11, y: 4 }, { x: 10, y: 4 }, { x: 9, y: 4 }], dir: Core.DIRS.right, food: { x: 0, y: 0 } });
  s = Core.step(s);
  assert.deepEqual(s.snake[0], { x: 0, y: 4 });
  const { pts } = Core.interpolatePath(s, 0.5);
  // 展开坐标以真实蛇头 (0,4) 为锚点：上一格是 x=-1，所以 t=0.5 时蛇头正跨过左边界（x=-0.5），
  // 渲染层在 x+12 处再画一份副本，两半拼起来就是从右边出去、左边进来，而不是横跨整个棋盘
  assert.deepEqual(pts[1], { x: -1, y: 4 });
  assert.deepEqual(pts[0], { x: -0.5, y: 4 });
  for (let i = 1; i < pts.length; i++) {
    assert.ok(Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y) <= 1 + 1e-9, '相邻点距离不超过 1 格');
  }
  assert.deepEqual(Core.wrapDelta({ x: 11, y: 4 }, { x: 0, y: 4 }, 12, 8), { x: 1, y: 0 });
  assert.deepEqual(Core.wrapDelta({ x: 3, y: 0 }, { x: 3, y: 7 }, 12, 8), { x: 0, y: -1 });
});

test('插值：开局（还没走过一步）时蛇静止不动', () => {
  const s = Core.createGame({ cols: 12, rows: 8, seed: 1 });
  const a = Core.interpolatePath(s, 0.3);
  assert.deepEqual(a.pts[0], s.snake[0]);
  assert.equal(a.pts.length, s.snake.length);
});
