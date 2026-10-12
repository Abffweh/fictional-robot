'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { chromium } = require('playwright');
const H = require('./helpers.js');

const VIEWPORTS = [
  { name: 'landscape-1280x800', width: 1280, height: 800 },
  { name: 'portrait-800x1280', width: 800, height: 1280 },
];

let browser;
test.before(async () => {
  browser = await chromium.launch(H.chromiumLaunchOptions());
});
test.after(async () => {
  if (browser) await browser.close();
});

for (const vp of VIEWPORTS) {
  test(`经典模式完整流程 @ ${vp.name}`, async () => {
    const { context, page, errors } = await H.openGame(browser, { width: vp.width, height: vp.height });
    try {
      assert.equal(await H.getScreen(page), 'menu');
      await H.screenshot(page, `${vp.name}-01-menu`);

      await page.click('#btn-start');
      assert.equal(await H.getScreen(page), 'playing');
      const s0 = await H.getState(page);
      // 竖屏用竖向棋盘，横屏用横向棋盘
      if (vp.height > vp.width) assert.ok(s0.rows > s0.cols, '竖屏应使用竖向棋盘');
      else assert.ok(s0.cols > s0.rows, '横屏应使用横向棋盘');

      // 1) 键盘方向键吃到食物
      const s1 = await H.steerUntilScore(page, 'keys', 0);
      assert.ok(s1.score > 0, '方向键操作后分数应增加');
      assert.equal(await page.textContent('#hud-score'), String(s1.score));

      // 2) 触摸滑动吃到食物
      const cdp = await context.newCDPSession(page);
      const s2 = await H.steerUntilScore(page, 'swipe', s1.score, cdp);
      assert.ok(s2.score > s1.score, '滑动操作后分数应继续增加');
      await H.screenshot(page, `${vp.name}-02-playing`);

      // 3) 空格暂停 / 继续
      await page.keyboard.press('Space');
      assert.equal(await H.getScreen(page), 'pause');
      const pausedTicks = (await H.getState(page)).ticks;
      await page.waitForTimeout(400);
      assert.equal((await H.getState(page)).ticks, pausedTicks, '暂停时逻辑不应推进');
      await page.keyboard.press('Space');
      assert.equal(await H.getScreen(page), 'playing');

      // 4) 撞墙 → 游戏结束层
      const s3 = await H.getState(page);
      const cur = H.dirName(s3.dir);
      const toWall = cur === 'left' || cur === 'right' ? 'up' : 'left';
      await page.keyboard.press(H.KEYS[toWall]);
      await page.waitForSelector('#screen-over:not(.hidden)', { timeout: 15000 });
      const dead = await H.getState(page);
      assert.equal(dead.status, 'dead');
      assert.equal(await page.textContent('#over-score'), String(dead.score));
      await H.screenshot(page, `${vp.name}-03-gameover`);

      // 5) 最高分写入 localStorage
      const best = await page.evaluate(() => JSON.parse(localStorage.getItem('snake.v1.best') || '{}'));
      assert.equal(best.classic, dead.score, '最高分应写入 localStorage');
      assert.ok(best.classic > 0);

      assert.deepEqual(errors, [], '页面不应有 JS 错误');
    } finally {
      await context.close();
    }
  });
}
