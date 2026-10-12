'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { chromium } = require('playwright');
const H = require('./helpers.js');

const LAND = { width: 1280, height: 800 };
const PORT = { width: 800, height: 1280 };

let browser;
test.before(async () => {
  browser = await chromium.launch(H.chromiumLaunchOptions());
});
test.after(async () => {
  if (browser) await browser.close();
});

test('旋转屏幕：游戏中自动暂停、棋盘重新适配、不丢进度；新开局按新方向选棋盘', async () => {
  const { page, context, errors } = await H.openGame(browser, LAND);
  try {
    await H.setManualClock(page, true);
    await page.click('[data-action="go-classic"]');
    await page.click('#btn-start');
    await H.tick(page, 3);
    const before = await H.getState(page);
    assert.deepEqual([before.cols, before.rows], [26, 16]);

    await page.setViewportSize(PORT);
    await page.waitForFunction(() => window.SnakeApp.debug.getScreen() === 'pause');
    const after = await H.getState(page);
    assert.equal(after.ticks, before.ticks, '旋转不会推进或重置游戏');
    assert.equal(after.score, before.score);
    assert.deepEqual([after.cols, after.rows], [26, 16], '进行中的这局保持原棋盘');
    await page.waitForTimeout(100);
    await H.assertLayout(page, PORT);
    await H.screenshot(page, 'rotate-01-landscape-game-in-portrait');

    await page.click('#btn-resume');
    assert.equal(await H.tick(page, 1), 1, '继续后可以正常推进');
    await H.assertLayout(page, PORT);

    // 回菜单重新开一局：按竖屏选 16×26 棋盘
    await page.keyboard.press('Space');
    await page.click('#app [data-screen="pause"] [data-action="menu"]');
    await page.click('[data-action="go-classic"]');
    await page.click('#btn-start');
    const fresh = await H.getState(page);
    assert.deepEqual([fresh.cols, fresh.rows], [16, 26]);
    await H.assertLayout(page, PORT);

    // 再转回横屏
    await page.setViewportSize(LAND);
    await page.waitForFunction(() => window.SnakeApp.debug.getScreen() === 'pause');
    await page.waitForTimeout(100);
    await H.assertLayout(page, LAND);
    assert.deepEqual(errors, []);
  } finally {
    await context.close();
  }
});

for (const vp of [LAND, PORT]) {
  test(`渲染帧率与逻辑 tick 分离（AI 演示实时运行 2 秒）@ ${vp.width}x${vp.height}`, async (t) => {
    const { page, context, errors } = await H.openGame(browser, vp);
    try {
      await page.click('[data-action="start-demo"]');
      const s0 = await H.getState(page);
      await page.waitForTimeout(2000);
      const fps = await page.evaluate(() => window.SnakeApp.debug.getFps());
      const s1 = await H.getState(page);
      const ticksPerSec = (s1.ticks - s0.ticks) / 2;
      const msg = `帧率 ${fps} fps，逻辑 ${ticksPerSec.toFixed(1)} tick/s（${vp.width}x${vp.height}）`;
      t.diagnostic(msg);
      console.log(msg);
      assert.equal(s1.status, 'playing');
      assert.ok(fps >= 45, `渲染帧率过低：${fps}`);
      assert.ok(ticksPerSec > 5 && ticksPerSec < 15, `演示模式快速档约 11 tick/s，实际 ${ticksPerSec}`);
      assert.ok(fps > ticksPerSec * 3, '渲染帧率应远高于逻辑 tick 频率（插值才有意义）');
      assert.deepEqual(errors, []);
    } finally {
      await context.close();
    }
  });
}

test('返回键 / Esc 语义：子菜单回主菜单，主菜单与暂停时交给外壳退出', async () => {
  const { page, context, errors } = await H.openGame(browser, LAND);
  const back = () => page.evaluate(() => window.SnakeApp.handleBack());
  try {
    assert.equal(await back(), false, '主菜单：退出');
    for (const action of ['go-settings', 'go-leaderboard', 'go-levels', 'go-classic']) {
      await page.click(`[data-action="${action}"]`);
      assert.notEqual(await H.getScreen(page), 'menu');
      assert.equal(await back(), true, `${action}：回主菜单`);
      assert.equal(await H.getScreen(page), 'menu');
    }
    // Esc 在子菜单里同样返回
    await page.click('[data-action="go-settings"]');
    await page.keyboard.press('Escape');
    assert.equal(await H.getScreen(page), 'menu');

    await H.setManualClock(page, true);
    await page.click('[data-action="go-classic"]');
    await page.click('#btn-start');
    assert.equal(await back(), true, '游戏中：先暂停');
    assert.equal(await H.getScreen(page), 'pause');
    assert.equal(await back(), false, '已暂停：退出');
    // 外壳的 onPause/onResume 回调：切到后台自动暂停，回来保持暂停
    await page.click('#btn-resume');
    await page.evaluate(() => window.SnakeApp.onAppPause());
    assert.equal(await H.getScreen(page), 'pause');
    await page.evaluate(() => window.SnakeApp.onAppResume());
    assert.equal(await H.getScreen(page), 'pause', '回到前台不自动继续');
    assert.deepEqual(errors, []);
  } finally {
    await context.close();
  }
});

test('闯关流程：吃到目标长度 → 过关层 → 解锁写入 → 下一关保留分数；过关层返回菜单时记分', async () => {
  const { page, context, errors } = await H.openGame(browser, LAND);
  try {
    const cdp = await context.newCDPSession(page);
    await H.setManualClock(page, true);
    await page.click('[data-action="go-levels"]');
    await page.locator('.level-card').nth(0).click();
    let s = await H.getState(page);
    assert.equal(s.levelIndex, 0);
    // 一直吃到目标长度（第 1 关目标 8 节 = 吃 5 个）
    while (s.status === 'playing') {
      s = await H.steerUntilScore(page, 'keys', s.score, cdp);
    }
    assert.equal(s.status, 'levelComplete');
    assert.equal(s.snake.length, s.target);
    await page.waitForSelector('[data-screen="levelDone"]:not(.hidden)', { timeout: 5000 });
    assert.match(await page.textContent('#ld-title'), /第 1 关「初出茅庐」完成/);
    assert.equal(await page.evaluate(() => localStorage.getItem('snake.v1.unlocked')), '2', '过关后解锁第 2 关');
    await H.screenshot(page, 'level-01-done');

    // 下一关：分数保留、换成有障碍的布局
    await page.click('#btn-next');
    const n = await H.getState(page);
    assert.equal(n.levelIndex, 1);
    assert.equal(n.score, s.score);
    assert.equal(n.snake.length, 3);
    assert.ok(n.wallCount > 0);
    assert.match(await page.textContent('#hud-mode'), /第2关/);

    // 中途放弃（暂停 → 返回菜单）不记分
    await page.keyboard.press('Space');
    await page.click('#app [data-screen="pause"] [data-action="menu"]');
    assert.equal(await page.evaluate(() => JSON.parse(localStorage.getItem('snake.v1.best') || '{}').level || 0), 0);

    // 再打一遍第 1 关，在过关层直接返回菜单：这一轮成绩记入最高分和排行榜
    await page.click('[data-action="go-levels"]');
    await page.locator('.level-card').nth(0).click();
    s = await H.getState(page);
    while (s.status === 'playing') {
      s = await H.steerUntilScore(page, 'keys', s.score, cdp);
    }
    await page.waitForSelector('[data-screen="levelDone"]:not(.hidden)', { timeout: 5000 });
    await page.click('#app [data-screen="levelDone"] [data-action="menu"]');
    const saved = await page.evaluate(() => ({
      best: JSON.parse(localStorage.getItem('snake.v1.best') || '{}'),
      lb: JSON.parse(localStorage.getItem('snake.v1.leaderboard') || '[]'),
    }));
    assert.equal(saved.best.level, s.score);
    assert.ok(saved.lb.some((e) => e.mode === 'level' && e.score === s.score && e.detail === '第1关'));
    assert.deepEqual(errors, []);
  } finally {
    await context.close();
  }
});
