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
 * 用触摸点按屏幕方向键。直接走 CDP 发 touchStart/touchEnd：
 * page.touchscreen.tap 每次要等几百毫秒，跟不上 tick 节奏。
 */
const dpadCenters = new WeakMap();
async function tapDpad(page, cdp, dir) {
  let centers = dpadCenters.get(page);
  if (!centers) {
    centers = {};
    for (const d of Object.keys(VEC)) {
      const box = await page.locator(`.dpad-btn[data-dir="${d}"]`).boundingBox();
      centers[d] = { x: box.x + box.width / 2, y: box.y + box.height / 2 };
    }
    dpadCenters.set(page, centers);
  }
  const p = centers[dir];
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: p.x, y: p.y }] });
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
}

/** 两个矩形是否重叠。 */
function overlaps(a, b) {
  return a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;
}

/** 发送一次方向输入（真实键盘 / 触摸滑动 / 触摸点按方向键）。 */
async function sendInput(page, method, dir, cdp) {
  if (method === 'swipe') await swipe(page, cdp, dir);
  else if (method === 'dpad') await tapDpad(page, cdp, dir);
  else await page.keyboard.press(method === 'wasd' ? WASD[dir] : KEYS[dir]);
}

const tick = (page, n) => page.evaluate((k) => window.SnakeApp.debug.tick(k), n || 1);
const setManualClock = (page, on) => page.evaluate((v) => window.SnakeApp.debug.setManualClock(v), on);

/**
 * 在手动时钟下操作直到分数超过 minScore：每个 tick 先用真实输入事件转向，再推进一个 tick。
 * 这样结果不受测试机器卡顿影响。method: 'keys' | 'wasd' | 'swipe' | 'dpad'。
 */
async function steerUntilScore(page, method, minScore, cdp, maxTicks = 600) {
  const trace = [];
  for (let i = 0; i < maxTicks; i++) {
    const s = await getState(page);
    if (s.status !== 'playing') {
      throw new Error('蛇在测试操作中死亡：' + s.deathReason + '\n' + trace.slice(-6).join('\n'));
    }
    if (s.score > minScore) return s;
    const want = planTowards(s, s.food);
    const queuedLast = s.queue.length ? dirName(s.queue[s.queue.length - 1]) : dirName(s.dir);
    trace.push(`t=${s.ticks} head=${JSON.stringify(s.snake[0])} dir=${dirName(s.dir)} food=${JSON.stringify(s.food)} want=${want}`);
    if (want !== queuedLast) {
      await sendInput(page, method, want, cdp);
      const after = await getState(page);
      const last = after.queue.length ? dirName(after.queue[after.queue.length - 1]) : dirName(after.dir);
      if (last !== want) throw new Error(`输入没有生效（method=${method}, want=${want}）`);
    }
    await tick(page, 1);
  }
  throw new Error('在限定 tick 数内没有吃到食物（method=' + method + '）');
}

async function screenshot(page, name, opts) {
  fs.mkdirSync(SHOT_DIR, { recursive: true });
  // 等浮层淡入动画结束再截图；游戏进行中截图时不能等（蛇会一直往前走）
  if (!(opts && opts.instant)) await page.waitForTimeout(400);
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
  tapDpad,
  overlaps,
  sendInput,
  tick,
  setManualClock,
  steerUntilScore,
  screenshot,
};
