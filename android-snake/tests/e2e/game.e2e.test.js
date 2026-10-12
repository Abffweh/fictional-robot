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
  test(`经典模式：键盘/方向键/滑动、道具倒计时、结束层、最高分 @ ${vp.name}`, async () => {
    const { context, page, errors } = await H.openGame(browser, { width: vp.width, height: vp.height });
    try {
      assert.equal(await H.getScreen(page), 'menu');
      await H.screenshot(page, `${vp.name}-01-menu`);

      await page.click('[data-action="go-classic"]');
      assert.equal(await H.getScreen(page), 'classic');
      // 选“慢”速：测试机器较慢时也来得及操作
      await page.click('#opt-speed button[data-value="slow"]');
      assert.equal(await page.getAttribute('#opt-speed button[data-value="slow"]', 'aria-pressed'), 'true');
      await page.click('#btn-start');
      assert.equal(await H.getScreen(page), 'playing');
      const s0 = await H.getState(page);
      if (vp.height > vp.width) assert.ok(s0.rows > s0.cols, '竖屏应使用竖向棋盘');
      else assert.ok(s0.cols > s0.rows, '横屏应使用横向棋盘');
      assert.ok(await page.locator('#dpad').isVisible(), '默认显示屏幕方向键');
      await H.assertLayout(page, vp);

      // 0) 实时循环在跑：不操作时蛇会自己前进
      await page.waitForFunction(() => window.SnakeApp.debug.getState().ticks >= 3, null, { timeout: 5000 });
      // 之后改用手动时钟：输入仍是真实事件，但每个 tick 由测试推进，结果确定
      await H.setManualClock(page, true);

      // 1) 键盘方向键
      const cdp = await context.newCDPSession(page);
      const s1 = await H.steerUntilScore(page, 'keys', 0, cdp);
      assert.ok(s1.score > 0, '方向键操作后分数应增加');
      assert.equal(await page.textContent('#hud-score'), String(s1.score));

      // 2) 触摸滑动
      const s2 = await H.steerUntilScore(page, 'swipe', s1.score, cdp);
      assert.ok(s2.score > s1.score, '滑动操作后分数应继续增加');

      // 3) 屏幕方向键（触摸点按）
      const s3 = await H.steerUntilScore(page, 'dpad', s2.score, cdp);
      assert.ok(s3.score > s2.score, '屏幕方向键操作后分数应继续增加');

      // 4) 道具：在蛇头下一格放一个“双倍分数”，推进一个 tick 后 HUD 出现倒计时
      await H.ensureSafeHeading(page);
      assert.ok(await page.evaluate(() => window.SnakeApp.debug.placePowerupAhead('double')));
      await H.tick(page, 1);
      const chip = page.locator('#hud-effects .chip[data-effect="double"]');
      await chip.waitFor({ state: 'visible', timeout: 3000 });
      const picked = await H.getState(page);
      const t1 = parseFloat(await chip.locator('.secs').textContent());
      assert.equal(t1, 10, `刚拾取时剩余 10.0 秒，实际 ${t1}`);

      // 5) 空格暂停（此时恢复实时时钟）：逻辑、道具计时、HUD 倒计时都应冻结
      await page.keyboard.press('Space');
      assert.equal(await H.getScreen(page), 'pause');
      await H.setManualClock(page, false);
      await page.waitForTimeout(600);
      const stillPaused = await H.getState(page);
      assert.equal(stillPaused.ticks, picked.ticks, '暂停时逻辑不应推进');
      assert.equal(stillPaused.time, picked.time, '暂停时道具计时不应推进');
      assert.equal(parseFloat(await chip.locator('.secs').textContent()), t1, '暂停时 HUD 倒计时冻结');
      await H.screenshot(page, `${vp.name}-02-paused-powerup`);
      await H.setManualClock(page, true);
      await page.click('#btn-resume');
      assert.equal(await H.getScreen(page), 'playing');

      // 继续后用 WASD 吃一个食物：双倍得 20 分；倒计时按游戏时间递减
      const s4 = await H.steerUntilScore(page, 'wasd', picked.score, cdp);
      assert.equal(s4.score - picked.score, 20, '双倍期间吃一个食物得 20 分');
      const expectLeft = Math.max(0, 10000 - (s4.time - picked.time)) / 1000;
      if (expectLeft > 0) {
        await page.waitForTimeout(100); // 等下一帧刷新 HUD（手动时钟下游戏不会前进）
        const t2 = parseFloat(await chip.locator('.secs').textContent());
        assert.ok(Math.abs(t2 - expectLeft) < 0.051, `倒计时应为 ${expectLeft.toFixed(1)}s，实际 ${t2}s`);
        assert.ok(t2 < t1);
      }
      await H.screenshot(page, `${vp.name}-03-playing`, { instant: true });

      // 6) 撞墙 → 结束层
      const s5 = await H.getState(page);
      const cur = H.dirName(s5.dir);
      await page.keyboard.press(H.KEYS[cur === 'left' || cur === 'right' ? 'up' : 'left']);
      await H.tick(page, 200);
      const dead = await H.getState(page);
      assert.equal(dead.status, 'dead');
      await page.waitForSelector('[data-screen="over"]:not(.hidden)', { timeout: 5000 });
      assert.equal(await page.textContent('#over-score'), String(dead.score));
      assert.match(await page.textContent('#over-rank'), /第 1 名/);
      assert.ok(await page.locator('#over-new').isVisible(), '首次成绩应显示“新纪录”');
      await H.screenshot(page, `${vp.name}-04-gameover`);

      // 7) 最高分与排行榜写入 localStorage
      const saved = await page.evaluate(() => ({
        best: JSON.parse(localStorage.getItem('snake.v1.best') || '{}'),
        lb: JSON.parse(localStorage.getItem('snake.v1.leaderboard') || '[]'),
      }));
      assert.equal(saved.best.classic, dead.score, '最高分应写入 localStorage');
      assert.ok(saved.best.classic > 0);
      assert.equal(saved.lb.length, 1);
      assert.equal(saved.lb[0].score, dead.score);
      assert.match(saved.lb[0].date, /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/);

      // 8) 排行榜界面
      await page.click('#app [data-screen="over"] [data-action="menu"]');
      await page.click('[data-action="go-leaderboard"]');
      assert.equal(await page.textContent('#lb-best-classic'), String(dead.score));
      const row = page.locator('#lb-body tr').first();
      assert.match(await row.textContent(), new RegExp(`^1${dead.score}经典`));
      await H.screenshot(page, `${vp.name}-05-leaderboard`);

      assert.deepEqual(errors, [], '页面不应有 JS 错误');
    } finally {
      await context.close();
    }
  });

  test(`设置持久化与深色主题、关卡解锁 @ ${vp.name}`, async () => {
    const { context, page, errors } = await H.openGame(browser, { width: vp.width, height: vp.height });
    try {
      // 设置：关闭方向键、切到深色主题、关闭音效
      await page.click('[data-action="go-settings"]');
      await page.click('label:has(#set-dpad)');
      await page.click('label:has(#set-sound)');
      await page.click('#set-theme button[data-value="dark"]');
      assert.equal(await page.getAttribute('html', 'data-theme'), 'dark');
      await H.screenshot(page, `${vp.name}-06-settings-dark`);

      // 关卡：初始只解锁第 1 关
      await page.click('#app [data-screen="settings"] [data-action="back"]');
      await page.click('[data-action="go-levels"]');
      const cards = page.locator('.level-card');
      assert.ok((await cards.count()) >= 5, '至少 5 关');
      assert.equal(await cards.nth(0).isDisabled(), false);
      assert.equal(await cards.nth(1).isDisabled(), true);

      // 模拟已解锁 3 关后刷新：设置和解锁记录都应保留
      await page.evaluate(() => localStorage.setItem('snake.v1.unlocked', '3'));
      await page.reload();
      await page.waitForFunction(() => window.SnakeApp && window.SnakeApp.debug);
      const st = await page.evaluate(() => window.SnakeApp.debug.getSettings());
      assert.equal(st.dpad, false);
      assert.equal(st.sound, false);
      assert.equal(st.theme, 'dark');
      assert.equal(await page.getAttribute('html', 'data-theme'), 'dark');

      await page.click('[data-action="go-levels"]');
      assert.equal(await cards.nth(2).isDisabled(), false);
      assert.equal(await cards.nth(3).isDisabled(), true);
      await H.screenshot(page, `${vp.name}-07-levels`);
      await H.setManualClock(page, true); // 截图期间蛇不动
      await cards.nth(2).click();
      assert.equal(await H.getScreen(page), 'playing');
      const s = await H.getState(page);
      assert.equal(s.mode, 'level');
      assert.equal(s.levelIndex, 2);
      assert.ok(s.wallCount > 0, '第 3 关应有障碍物');
      assert.match(await page.textContent('#hud-mode'), /第3关/);
      assert.equal(await page.textContent('#hud-progress'), `3/${s.target}`);
      assert.equal(await page.locator('#dpad').isVisible(), false, '关闭后不显示方向键');
      await H.assertLayout(page, vp);
      await H.screenshot(page, `${vp.name}-08-level3-dark`);

      // 返回键语义：游戏中 → 暂停（true）；已暂停 → 交给外壳退出（false）
      assert.equal(await page.evaluate(() => window.SnakeApp.handleBack()), true);
      assert.equal(await H.getScreen(page), 'pause');
      assert.equal(await page.evaluate(() => window.SnakeApp.handleBack()), false);

      assert.deepEqual(errors, [], '页面不应有 JS 错误');
    } finally {
      await context.close();
    }
  });
}
