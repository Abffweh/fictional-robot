'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const Core = require('../../app/src/main/assets/js/core.js');

/** 一条朝右走的蛇，食物放在远处角落，避免干扰。 */
function base(opts) {
  const s = Core.createGame(Object.assign({ cols: 20, rows: 12, seed: 5, speed: 'normal' }, opts));
  return Object.assign(s, {
    snake: [{ x: 5, y: 6 }, { x: 4, y: 6 }, { x: 3, y: 6 }],
    dir: Core.DIRS.right,
    food: { x: 0, y: 0 },
    nextPowerupAt: Infinity,
  });
}

/** 在蛇头正前方放一个道具。 */
function withPowerupAhead(s, type) {
  return Object.assign({}, s, { powerup: { type, x: s.snake[0].x + 1, y: s.snake[0].y, expires: s.time + Core.POWERUP_LIFETIME } });
}

test('道具会按时刷新到空格上，并在存在时间结束后消失', () => {
  let s = Core.createGame({ cols: 20, rows: 12, seed: 11 });
  s = Object.assign(s, { snake: [{ x: 2, y: 1 }, { x: 1, y: 1 }, { x: 0, y: 1 }], dir: Core.DIRS.right, food: { x: 0, y: 11 }, nextPowerupAt: 500 });
  let spawned = null;
  for (let i = 0; i < 10 && !spawned; i++) {
    s = Core.step(s);
    spawned = s.events.find((e) => e.type === 'powerupSpawn');
  }
  assert.ok(spawned, '应刷新出道具');
  assert.ok(Core.POWERUP_TYPES.includes(s.powerup.type));
  assert.equal(s.powerup.expires, s.time + Core.POWERUP_LIFETIME);
  assert.ok(!s.snake.some((p) => p.x === s.powerup.x && p.y === s.powerup.y), '道具不能刷在蛇身上');
  assert.ok(!(s.food.x === s.powerup.x && s.food.y === s.powerup.y), '道具不能和食物重叠');

  // 让蛇绕着第一行来回不碰道具：直接把道具挪到远处，然后推进时间
  s = Object.assign({}, s, { powerup: Object.assign({}, s.powerup, { x: 19, y: 11 }), wrap: true });
  const expires = s.powerup.expires;
  let expired = false;
  while (s.time < expires + 500) {
    s = Core.step(s);
    if (s.events.some((e) => e.type === 'powerupExpire')) {
      expired = true;
      break;
    }
  }
  assert.ok(expired, '道具应在存在时间结束后消失');
  assert.equal(s.powerup, null);
  assert.ok(s.time >= expires);
  assert.ok(s.nextPowerupAt > s.time, '消失后应安排下一次刷新');
});

test('powerups:false 时不刷新道具', () => {
  let s = Core.createGame({ cols: 20, rows: 12, seed: 11, powerups: false, wrap: true });
  for (let i = 0; i < 300; i++) s = Core.step(s);
  assert.equal(s.powerup, null);
});

test('道具计时：效果持续 duration 毫秒（按游戏时间），HUD 剩余时间逐 tick 递减，到期后移除', () => {
  let s = Core.step(withPowerupAhead(base({ wrap: true }), 'double'));
  assert.ok(s.events.some((e) => e.type === 'powerup' && e.kind === 'double'));
  const until = s.effects.double;
  assert.equal(until, s.time + Core.POWERUPS.double.duration);

  let prev = Core.activeEffects(s).find((e) => e.type === 'double').remaining;
  assert.equal(prev, Core.POWERUPS.double.duration);
  // 不推进 step（相当于暂停）时剩余时间不变
  assert.equal(Core.activeEffects(s).find((e) => e.type === 'double').remaining, prev);

  let ended = false;
  let guard = 0;
  while (!ended && guard++ < 1000) {
    const interval = Core.tickInterval(s);
    s = Core.step(s);
    const eff = Core.activeEffects(s).find((e) => e.type === 'double');
    if (eff) {
      assert.equal(eff.remaining, prev - interval, '每个 tick 剩余时间应减少一个 tick 的时长');
      prev = eff.remaining;
    }
    ended = s.events.some((e) => e.type === 'effectEnd' && e.kind === 'double');
  }
  assert.ok(ended);
  assert.ok(s.time >= until);
  assert.equal(s.effects.double, 0);
  assert.equal(Core.activeEffects(s).length, 0);
});

test('加速/减速改变 tick 时长，且互斥', () => {
  const s0 = base({ wrap: true });
  const normal = Core.tickInterval(s0);
  const fast = Core.step(withPowerupAhead(s0, 'fast'));
  assert.equal(Core.tickInterval(fast), Math.round(normal * Core.POWERUPS.fast.factor));
  assert.ok(Core.tickInterval(fast) < normal);

  const slow = Core.step(withPowerupAhead(fast, 'slow'));
  assert.equal(slow.effects.fast, 0, '吃到减速后加速失效');
  assert.equal(Core.tickInterval(slow), Math.round(normal * Core.POWERUPS.slow.factor));
  assert.ok(Core.tickInterval(slow) > normal);
});

test('双倍分数：生效期间吃食物得 2 倍分', () => {
  let s = Core.step(withPowerupAhead(base(), 'double'));
  s = Object.assign({}, s, { food: { x: s.snake[0].x + 1, y: s.snake[0].y } });
  const before = s.score;
  s = Core.step(s);
  assert.equal(s.score - before, Core.FOOD_POINTS * 2);
});

test('短暂穿墙：不穿墙模式下也能穿过边界和障碍，到期后撞墙照样会死', () => {
  const walls = new Uint8Array(20 * 12);
  walls[6 * 20 + 8] = 1; // 蛇前进路线上的障碍
  let s = Core.step(withPowerupAhead(base({ walls }), 'ghost'));
  assert.ok(Core.effectActive(s, 'ghost'));
  // 穿过障碍 (8,6)
  s = Core.step(s);
  s = Core.step(s);
  assert.equal(s.status, 'playing');
  assert.deepEqual(s.snake[0], { x: 8, y: 6 });
  // 一直向右走，穿过右边界回到左侧
  let wrapped = false;
  for (let i = 0; i < 15; i++) {
    s = Core.step(s);
    assert.equal(s.status, 'playing');
    if (s.wrapped) wrapped = true;
  }
  assert.ok(wrapped, '应从右边界穿到左边');
  // 让效果到期后再朝墙走：死亡
  s = Object.assign({}, s, { effects: Object.assign({}, s.effects, { ghost: s.time + 1 }), snake: [{ x: 19, y: 3 }, { x: 18, y: 3 }, { x: 17, y: 3 }], dir: Core.DIRS.right, queue: [] });
  s = Core.step(s);
  assert.equal(s.status, 'dead');
  assert.equal(s.deathReason, 'wall');
});
