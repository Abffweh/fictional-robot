'use strict';
/* 端到端测试辅助：打开离线页面、读取游戏状态、键盘/触摸操作、截图。 */
const path = require('node:path');
const fs = require('node:fs');
const { pathToFileURL } = require('node:url');

const PAGE_URL = pathToFileURL(
  path.join(__dirname, '..', '..', 'app', 'src', 'main', 'assets', 'index.html'),
).href;

const SHOT_DIR = process.env.SCREENSHOT_DIR || path.join(__dirname, '..', '..', 'test-results', 'screenshots');

const VEC = { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] };
const KEYS = { up: 'ArrowUp', down: 'ArrowDown', left: 'ArrowLeft', right: 'ArrowRight' };
const WASD = { up: 'w', down: 's', left: 'a', right: 'd' };

function chromiumLaunchOptions() {
  const opts = { headless: true };
  // 本地容器里浏览器已预装在 /opt/pw-browsers；CI 中由 playwright install 安装，走默认路径即可。
  if (process.env.CHROMIUM_PATH) opts.executablePath = process.env.CHROMIUM_PATH;
  return opts;
}

async function openGame(browser, viewport, extraInit) {
  const context = await browser.newContext({
    viewport,
    deviceScaleFactor: 1.5,
    hasTouch: true,
    isMobile: false,
  });
  if (extraInit) await context.addInitScript(extraInit);
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text());
  });
  await page.goto(PAGE_URL);
  await page.waitForFunction(() => window.SnakeApp && window.SnakeApp.debug);
  return { context, page, errors };
}

const getState = (page) => page.evaluate(() => window.SnakeApp.debug.getState());
const getScreen = (page) => page.evaluate(() => window.SnakeApp.debug.getScreen());

function dirName(d) {
  return Object.keys(VEC).find((k) => VEC[k][0] === d.x && VEC[k][1] === d.y);
}

function isOpposite(a, b) {
  return VEC[a][0] === -VEC[b][0] && VEC[a][1] === -VEC[b][1];
}

/** 朝食物走的下一步方向（简单贪心，开局蛇很短，足够安全）。 */
function planTowards(s, target) {
  const head = s.snake[0];
  const cur = dirName(s.dir);
  const wants = [];
  if (target.x > head.x) wants.push('right');
  if (target.x < head.x) wants.push('left');
  if (target.y > head.y) wants.push('down');
  if (target.y < head.y) wants.push('up');
  for (const w of wants) if (!isOpposite(w, cur)) return w;
  // 目标正好在身后：先横向/纵向绕一步
  const side = cur === 'left' || cur === 'right' ? ['down', 'up'] : ['right', 'left'];
  return head.y < s.rows / 2 || head.x < s.cols / 2 ? side[0] : side[1];
}

/** 用 CDP 发送真实触摸事件，模拟一次滑动。 */
async function swipe(page, cdp, dir) {
  const box = await page.locator('#stage').boundingBox();
  const cx = box.x + box.width / 2;
  const cy = box.y + box.height / 2;
  const [dx, dy] = VEC[dir];
  const dist = 90;
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: cx, y: cy }] });
  for (let i = 1; i <= 6; i++) {
    await cdp.send('Input.dispatchTouchEvent', {
      type: 'touchMove',
      touchPoints: [{ x: cx + (dx * dist * i) / 6, y: cy + (dy * dist * i) / 6 }],
    });
  }
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
}

/**
 * 反复操作直到分数超过 minScore。method: 'keys' | 'wasd' | 'swipe'。
 * 返回最终状态；超时抛错。
 */
async function steerUntilScore(page, method, minScore, cdp, timeoutMs = 30000) {
  const deadline = Date.now() + timeoutMs;
  let lastSent = null;
  let lastTick = -1;
  while (Date.now() < deadline) {
    const s = await getState(page);
    if (s.status !== 'playing') throw new Error('蛇在测试操作中死亡：' + s.deathReason);
    if (s.score > minScore) return s;
    if (s.ticks !== lastTick) {
      lastTick = s.ticks;
      const want = planTowards(s, s.food);
      const queuedLast = s.queue.length ? dirName(s.queue[s.queue.length - 1]) : dirName(s.dir);
      if (want !== queuedLast && !(lastSent === want && s.queue.length)) {
        if (method === 'swipe') await swipe(page, cdp, want);
        else await page.keyboard.press(method === 'wasd' ? WASD[want] : KEYS[want]);
        lastSent = want;
      }
    }
    await page.waitForTimeout(15);
  }
  throw new Error('在限定时间内没有吃到食物（method=' + method + '）');
}

async function screenshot(page, name) {
  fs.mkdirSync(SHOT_DIR, { recursive: true });
  const file = path.join(SHOT_DIR, name + '.png');
  await page.screenshot({ path: file });
  return file;
}

module.exports = {
  PAGE_URL,
  SHOT_DIR,
  KEYS,
  chromiumLaunchOptions,
  openGame,
  getState,
  getScreen,
  dirName,
  planTowards,
  swipe,
  steerUntilScore,
  screenshot,
};
