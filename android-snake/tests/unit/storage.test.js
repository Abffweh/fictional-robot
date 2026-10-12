'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const Store = require('../../app/src/main/assets/js/storage.js');

function memoryBackend() {
  const m = new Map();
  return {
    map: m,
    getItem: (k) => (m.has(k) ? m.get(k) : null),
    setItem: (k, v) => m.set(k, String(v)),
    removeItem: (k) => m.delete(k),
  };
}
const throwingBackend = {
  getItem() { throw new Error('SecurityError'); },
  setItem() { throw new Error('QuotaExceededError'); },
  removeItem() { throw new Error('SecurityError'); },
};

test('设置：缺省值补齐，非法值被忽略', () => {
  assert.deepEqual(Store.sanitizeSettings(null), Store.DEFAULT_SETTINGS);
  const s = Store.sanitizeSettings({ sound: false, dpad: 'yes', theme: 'neon', speed: 'fast', wrap: true, extra: 1 });
  assert.equal(s.sound, false);
  assert.equal(s.dpad, Store.DEFAULT_SETTINGS.dpad);
  assert.equal(s.theme, 'system');
  assert.equal(s.speed, 'fast');
  assert.equal(s.wrap, true);
  assert.ok(!('extra' in s));
});

test('设置持久化：保存后重新创建 store 仍能读回', () => {
  const be = memoryBackend();
  Store.createStore(be).saveSettings({ sound: false, vibration: false, dpad: false, theme: 'dark', wrap: true, speed: 'slow' });
  const s = Store.createStore(be).loadSettings();
  assert.deepEqual(s, { sound: false, vibration: false, dpad: false, theme: 'dark', wrap: true, speed: 'slow' });
});

test('排行榜：只保留前 10，按分数降序，同分先到者在前，返回名次', () => {
  let list = [];
  for (let i = 1; i <= 12; i++) list = Store.insertLeaderboard(list, { score: i * 10, mode: 'classic', date: 'd', ts: i }).list;
  assert.equal(list.length, 10);
  assert.deepEqual(list.map((e) => e.score), [120, 110, 100, 90, 80, 70, 60, 50, 40, 30]);

  const tie = Store.insertLeaderboard(list, { score: 90, mode: 'level', date: 'd', ts: 99 });
  assert.equal(tie.rank, 5, '同分时排在已有成绩之后');
  assert.equal(tie.list.length, 10);

  const low = Store.insertLeaderboard(list, { score: 5, mode: 'classic', date: 'd', ts: 100 });
  assert.equal(low.rank, 0, '没进前 10 的名次为 0');
  assert.deepEqual(low.list.map((e) => e.score), list.map((e) => e.score));

  assert.equal(Store.insertLeaderboard(list, { score: 0, mode: 'classic' }).rank, 0, '0 分不入榜');
});

test('recordScore：更新最高分、写入带日期的排行榜；演示模式不进排行榜', () => {
  const be = memoryBackend();
  const store = Store.createStore(be);
  const when = new Date(2026, 9, 12, 8, 5);
  const r1 = store.recordScore('classic', 50, '不穿墙·中', when);
  assert.deepEqual(r1, { best: 50, isBest: true, rank: 1 });
  const r2 = store.recordScore('classic', 30, '穿墙·快', when);
  assert.deepEqual(r2, { best: 50, isBest: false, rank: 2 });
  const r3 = store.recordScore('demo', 400, 'AI', when);
  assert.equal(r3.isBest, true);
  assert.equal(r3.rank, 0);

  const fresh = Store.createStore(be);
  assert.deepEqual(fresh.loadBest(), { classic: 50, level: 0, demo: 400 });
  const lb = fresh.loadLeaderboard();
  assert.equal(lb.length, 2);
  assert.equal(lb[0].date, '2026-10-12 08:05');
  assert.equal(lb[0].detail, '不穿墙·中');
  assert.ok(lb.every((e) => e.mode === 'classic'));
});

test('已解锁关卡：默认 1，持久化，越界值被夹紧', () => {
  const be = memoryBackend();
  const store = Store.createStore(be);
  assert.equal(store.loadUnlocked(6), 1);
  store.saveUnlocked(4);
  assert.equal(Store.createStore(be).loadUnlocked(6), 4);
  store.saveUnlocked(99);
  assert.equal(store.loadUnlocked(6), 6);
});

test('存储损坏：非法 JSON / 类型错误时退回默认值，不抛异常', () => {
  const be = memoryBackend();
  be.setItem(Store.KEYS.settings, '{oops');
  be.setItem(Store.KEYS.best, '"string"');
  be.setItem(Store.KEYS.leaderboard, '[{"score":"NaN"},{"score":40,"mode":"x","date":5},null]');
  be.setItem(Store.KEYS.unlocked, '"abc"');
  const store = Store.createStore(be);
  assert.deepEqual(store.loadSettings(), Store.DEFAULT_SETTINGS);
  assert.deepEqual(store.loadBest(), { classic: 0, level: 0, demo: 0 });
  const lb = store.loadLeaderboard();
  assert.equal(lb.length, 1);
  assert.equal(lb[0].score, 40);
  assert.equal(lb[0].mode, 'classic');
  assert.equal(store.loadUnlocked(6), 1);
});

test('存储不可用（读写都抛异常）：退回内存，功能照常', () => {
  const store = Store.createStore(throwingBackend);
  assert.deepEqual(store.loadSettings(), Store.DEFAULT_SETTINGS);
  store.saveSettings({ sound: false });
  assert.equal(store.loadSettings().sound, false, '本次运行内仍能读回');
  const r = store.recordScore('classic', 20, '', new Date());
  assert.equal(r.isBest, true);
  assert.equal(store.loadBest().classic, 20);
  assert.equal(store.persistent, false);
  store.clearAll();
  assert.equal(store.loadBest().classic, 0);

  const none = Store.createStore(null);
  none.saveUnlocked(3);
  assert.equal(none.loadUnlocked(6), 3);
});

test('clearAll 清除所有键', () => {
  const be = memoryBackend();
  const store = Store.createStore(be);
  store.saveSettings({ theme: 'dark' });
  store.recordScore('level', 10, '第1关', new Date());
  store.saveUnlocked(3);
  store.clearAll();
  assert.equal(be.map.size, 0);
  assert.deepEqual(store.loadSettings(), Store.DEFAULT_SETTINGS);
});
