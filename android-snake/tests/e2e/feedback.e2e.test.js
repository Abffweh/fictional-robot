'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { chromium } = require('playwright');
const H = require('./helpers.js');

const VIEWPORTS = [
  { name: 'landscape-1280x800', width: 1280, height: 800 },
  { name: 'portrait-800x1280', width: 800, height: 1280 },
];

/** 模拟安卓外壳注入的 JS 桥：记录震动调用，系统处于深色模式。 */
function fakeAndroidBridge() {
  window.__vibs = [];
  window.Android = {
    vibrate(ms) {
      window.__vibs.push(ms);
    },
    isSystemDark() {
      return true;
    },
  };
}

let browser;
test.before(async () => {
  browser = await chromium.launch(H.chromiumLaunchOptions());
});
test.after(async () => {
  if (browser) await browser.close();
});

for (const vp of VIEWPORTS) {
  test(`AI 演示、震动桥、音效、粒子与震屏、跟随系统深色 @ ${vp.name}`, async () => {
    const { context, page, errors } = await H.openGame(browser, { width: vp.width, height: vp.height }, fakeAndroidBridge);
    const vibs = () => page.evaluate(() => window.__vibs.slice());
    try {
      // 跟随系统：外壳报告深色 → 页面深色；系统切换时跟着变
      assert.equal(await page.getAttribute('html', 'data-theme'), 'dark');
      await page.evaluate(() => window.SnakeApp.onSystemThemeChanged(false));
      assert.equal(await page.getAttribute('html', 'data-theme'), 'light');
      await page.evaluate(() => window.SnakeApp.onSystemThemeChanged(true));
      assert.equal(await page.getAttribute('html', 'data-theme'), 'dark');

      // ---- 演示模式：不需要任何输入，AI 自己吃到食物 ----
      await H.setManualClock(page, true);
      await page.click('[data-action="start-demo"]');
      assert.equal(await page.evaluate(() => window.SnakeApp.debug.getMode()), 'demo');
      assert.equal(await page.locator('#dpad').isVisible(), false, '演示模式不显示方向键');
      assert.ok(await page.locator('#demo-badge').isVisible());
      let s = await H.getState(page);
      for (let i = 0; i < 800 && s.score === 0 && s.status === 'playing'; i += 20) {
        await H.tick(page, 20);
        s = await H.getState(page);
      }
      assert.equal(s.status, 'playing');
      assert.ok(s.score > 0, 'AI 应自己吃到食物');
      // 继续推进 300 tick，AI 不会死
      await H.tick(page, 300);
      s = await H.getState(page);
      assert.equal(s.status, 'playing', 'AI 在 300 tick 内不应死亡');
      assert.ok((await page.evaluate(() => window.SnakeApp.debug.getSoundLog())).includes('eat'), '吃到食物应播放音效');
      assert.deepEqual(await vibs(), [], '演示模式不震动');
      await H.screenshot(page, `${vp.name}-09-demo-dark`, { instant: true });

      // 点一下画面 → 暂停演示，回菜单
      const box = await page.locator('#stage').boundingBox();
      await page.touchscreen.tap(box.x + box.width / 2, box.y + box.height / 2);
      assert.equal(await H.getScreen(page), 'pause');
      await page.click('#app [data-screen="pause"] [data-action="menu"]');

      // ---- 经典模式：吃食物 → 粒子 + 音效 + 短震；撞墙 → 震屏 + 长震 ----
      await page.click('[data-action="go-classic"]');
      await page.click('#btn-start');
      const cdp = await context.newCDPSession(page);
      const s1 = await H.steerUntilScore(page, 'keys', 0, cdp);
      assert.ok(s1.score > 0);
      const fx = await page.evaluate(() => window.SnakeApp.debug.getEffects());
      assert.ok(fx.particles > 0, '吃到食物应有粒子特效');
      const v1 = await vibs();
      assert.ok(v1.includes(15) && !v1.includes(240), `吃到食物短震 15ms，实际 ${v1}`);
      await H.screenshot(page, `${vp.name}-10-eat-particles`, { instant: true });

      const cur = H.dirName(s1.dir);
      await page.keyboard.press(H.KEYS[cur === 'left' || cur === 'right' ? 'up' : 'left']);
      await H.tick(page, 200);
      assert.equal((await H.getState(page)).status, 'dead');
      assert.equal((await page.evaluate(() => window.SnakeApp.debug.getEffects())).shaking, true, '死亡时屏幕震动');
      assert.ok((await vibs()).includes(240), '死亡长震 240ms');
      const log = await page.evaluate(() => window.SnakeApp.debug.getSoundLog());
      assert.ok(log.includes('die') && log.includes('click'), `音效记录：${log.join(',')}`);
      await page.waitForSelector('[data-screen="over"]:not(.hidden)', { timeout: 5000 });

      // ---- 关闭震动和音效后不再触发 ----
      await page.click('#app [data-screen="over"] [data-action="menu"]');
      await page.click('[data-action="go-settings"]');
      await page.click('label:has(#set-vibration)');
      await page.click('label:has(#set-sound)');
      await page.click('#app [data-screen="settings"] [data-action="back"]');
      const vibCount = (await vibs()).length;
      const soundCount = (await page.evaluate(() => window.SnakeApp.debug.getSoundLog())).length;
      await page.click('[data-action="go-classic"]');
      await page.click('#btn-start');
      await H.steerUntilScore(page, 'keys', 0, cdp);
      assert.equal((await vibs()).length, vibCount, '关闭震动后不再震动');
      assert.equal((await page.evaluate(() => window.SnakeApp.debug.getSoundLog())).length, soundCount, '关闭音效后不再播放');

      assert.deepEqual(errors, [], '页面不应有 JS 错误');
    } finally {
      await context.close();
    }
  });
}

test('普通浏览器（没有 Android 桥）里震动是空操作、不报错', async () => {
  const { context, page, errors } = await H.openGame(browser, { width: 1280, height: 800 });
  try {
    assert.equal(await page.evaluate(() => typeof window.Android), 'undefined');
    await H.setManualClock(page, true);
    await page.click('[data-action="go-classic"]');
    await page.click('#btn-start');
    const s = await H.getState(page);
    const cur = H.dirName(s.dir);
    await page.keyboard.press(H.KEYS[cur === 'left' || cur === 'right' ? 'up' : 'left']);
    await H.tick(page, 200);
    assert.equal((await H.getState(page)).status, 'dead');
    await page.waitForSelector('[data-screen="over"]:not(.hidden)', { timeout: 5000 });
    assert.deepEqual(errors, []);
  } finally {
    await context.close();
  }
});
