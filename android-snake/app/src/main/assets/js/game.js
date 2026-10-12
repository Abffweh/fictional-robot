/* 贪吃蛇界面层（M1 最简版）：渲染、输入、游戏循环、与安卓外壳的桥接。 */
(function () {
  'use strict';

  const Core = window.SnakeCore;
  const $ = (id) => document.getElementById(id);

  const GRID_LANDSCAPE = { cols: 26, rows: 16 };
  const GRID_PORTRAIT = { cols: 16, rows: 26 };
  const BEST_KEY = 'snake.v1.best';

  // ---------- 存储（全部 try/catch） ----------
  function readBest() {
    try {
      const v = JSON.parse(localStorage.getItem(BEST_KEY) || '{}');
      return v && typeof v === 'object' ? v : {};
    } catch (e) {
      return {};
    }
  }
  function writeBest(obj) {
    try {
      localStorage.setItem(BEST_KEY, JSON.stringify(obj));
    } catch (e) { /* 存储不可用时忽略 */ }
  }

  // ---------- 状态 ----------
  const canvas = $('board');
  const ctx = canvas.getContext('2d');
  const stage = $('stage');
  let state = null;
  let screen = 'menu';
  let acc = 0;
  let alpha = 1;
  let lastFrame = performance.now();
  let view = { cell: 20, ox: 0, oy: 0, w: 0, h: 0, dpr: 1 };
  let best = readBest();

  function isPortrait() {
    return stage.clientHeight > stage.clientWidth;
  }

  function showScreen(name) {
    screen = name;
    document.querySelectorAll('.overlay').forEach((el) => {
      el.classList.toggle('hidden', el.dataset.screen !== name);
    });
  }

  function newGame() {
    const grid = isPortrait() ? GRID_PORTRAIT : GRID_LANDSCAPE;
    state = Core.createGame({
      cols: grid.cols,
      rows: grid.rows,
      mode: 'classic',
      wrap: $('opt-wrap').checked,
      speed: 'normal',
      seed: (Math.random() * 2 ** 32) >>> 0,
    });
    acc = 0;
    alpha = 1;
    layout();
    updateHud();
    showScreen('playing');
  }

  function pause() {
    if (screen === 'playing') showScreen('pause');
  }
  function resume() {
    if (screen === 'pause') {
      lastFrame = performance.now();
      showScreen('playing');
    }
  }

  function gameOver() {
    const key = 'classic';
    if (state.score > (best[key] || 0)) {
      best[key] = state.score;
      writeBest(best);
    }
    $('over-score').textContent = state.score;
    $('over-best').textContent = best[key] || 0;
    updateHud();
    setTimeout(() => {
      if (state && state.status !== 'playing' && screen === 'playing') showScreen('over');
    }, 450);
  }

  function updateHud() {
    $('hud-score').textContent = state ? state.score : 0;
    $('hud-best').textContent = best.classic || 0;
  }

  // ---------- 输入 ----------
  function input(dir) {
    if (screen !== 'playing' || !state) return;
    state = Core.enqueueDir(state, dir);
  }

  const KEYMAP = {
    ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'left', ArrowRight: 'right',
    KeyW: 'up', KeyS: 'down', KeyA: 'left', KeyD: 'right',
    w: 'up', s: 'down', a: 'left', d: 'right', W: 'up', S: 'down', A: 'left', D: 'right',
  };
  document.addEventListener('keydown', (e) => {
    if (e.code === 'Space' || e.key === ' ') {
      e.preventDefault();
      if (screen === 'playing') pause();
      else if (screen === 'pause') resume();
      return;
    }
    const dir = KEYMAP[e.code] || KEYMAP[e.key];
    if (dir) {
      e.preventDefault();
      input(dir);
    }
  });

  // 滑动：移动超过阈值就立即转向，同一次滑动中可以连续转弯
  let swipe = null;
  stage.addEventListener('pointerdown', (e) => {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    swipe = { id: e.pointerId, x: e.clientX, y: e.clientY };
  });
  stage.addEventListener('pointermove', (e) => {
    if (!swipe || swipe.id !== e.pointerId) return;
    const dx = e.clientX - swipe.x;
    const dy = e.clientY - swipe.y;
    const threshold = Math.max(18, Math.min(stage.clientWidth, stage.clientHeight) * 0.03);
    if (Math.max(Math.abs(dx), Math.abs(dy)) < threshold) return;
    input(Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'right' : 'left') : (dy > 0 ? 'down' : 'up'));
    swipe.x = e.clientX;
    swipe.y = e.clientY;
  });
  const endSwipe = (e) => {
    if (swipe && swipe.id === e.pointerId) swipe = null;
  };
  stage.addEventListener('pointerup', endSwipe);
  stage.addEventListener('pointercancel', endSwipe);

  $('btn-start').addEventListener('click', newGame);
  $('btn-retry').addEventListener('click', newGame);
  $('btn-pause').addEventListener('click', () => (screen === 'pause' ? resume() : pause()));
  $('btn-resume').addEventListener('click', resume);
  $('btn-pause-menu').addEventListener('click', () => showScreen('menu'));
  $('btn-over-menu').addEventListener('click', () => showScreen('menu'));

  document.addEventListener('visibilitychange', () => {
    if (document.hidden) pause();
  });

  // ---------- 布局 ----------
  function layout() {
    const dpr = window.devicePixelRatio || 1;
    const cols = state ? state.cols : GRID_LANDSCAPE.cols;
    const rows = state ? state.rows : GRID_LANDSCAPE.rows;
    const pad = 12;
    const aw = Math.max(50, stage.clientWidth - pad * 2);
    const ah = Math.max(50, stage.clientHeight - pad * 2);
    const cell = Math.max(4, Math.floor(Math.min(aw / cols, ah / rows)));
    const w = cell * cols;
    const h = cell * rows;
    canvas.style.width = w + 'px';
    canvas.style.height = h + 'px';
    canvas.style.left = Math.round((stage.clientWidth - w) / 2) + 'px';
    canvas.style.top = Math.round((stage.clientHeight - h) / 2) + 'px';
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
    view = { cell, w, h, dpr };
  }
  window.addEventListener('resize', () => {
    layout();
    if (screen === 'playing') pause();
  });

  // ---------- 渲染 ----------
  function cssVar(name) {
    return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  }
  let colors = null;
  function readColors() {
    colors = {
      a: cssVar('--board-a'), b: cssVar('--board-b'), snake: cssVar('--snake'),
      light: cssVar('--snake-light'), food: cssVar('--food'), wall: cssVar('--wall'),
    };
  }

  /** 两格之间的位移，考虑穿墙（-1/0/1）。 */
  function delta(a, b, cols, rows) {
    let dx = b.x - a.x;
    let dy = b.y - a.y;
    if (dx > 1) dx -= cols; else if (dx < -1) dx += cols;
    if (dy > 1) dy -= rows; else if (dy < -1) dy += rows;
    return { x: dx, y: dy };
  }

  /** 生成插值后的蛇身折线（不折返的“展开”坐标），沿真实格子路径走，拐角平滑。 */
  function snakePoints(s, t) {
    const n = s.snake.length;
    const u = [{ x: s.snake[0].x, y: s.snake[0].y }];
    for (let i = 1; i < n; i++) {
      const d = delta(s.snake[i - 1], s.snake[i], s.cols, s.rows);
      u.push({ x: u[i - 1].x + d.x, y: u[i - 1].y + d.y });
    }
    const moving = s.ticks > 0 && n > 1;
    const pts = [];
    pts.push(moving ? { x: u[1].x + (u[0].x - u[1].x) * t, y: u[1].y + (u[0].y - u[1].y) * t } : u[0]);
    for (let i = 1; i < n; i++) pts.push(u[i]);
    if (moving && s.prevTail) {
      const d = delta(s.snake[n - 1], s.prevTail, s.cols, s.rows);
      pts.push({ x: u[n - 1].x + d.x * (1 - t), y: u[n - 1].y + d.y * (1 - t) });
    }
    return pts;
  }

  function render() {
    if (!colors) readColors();
    const { cell, dpr } = view;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    if (!state) return;
    ctx.setTransform(dpr * cell, 0, 0, dpr * cell, 0, 0);

    // 棋盘格背景
    for (let y = 0; y < state.rows; y++) {
      for (let x = 0; x < state.cols; x++) {
        ctx.fillStyle = (x + y) % 2 ? colors.a : colors.b;
        ctx.fillRect(x, y, 1, 1);
      }
    }

    // 食物
    if (state.food) {
      const pulse = 0.36 + 0.04 * Math.sin(performance.now() / 160);
      ctx.fillStyle = colors.food;
      ctx.beginPath();
      ctx.arc(state.food.x + 0.5, state.food.y + 0.5, pulse, 0, Math.PI * 2);
      ctx.fill();
    }

    // 蛇（考虑穿墙时在对边画出副本）
    const t = state.status === 'playing' ? alpha : 1;
    const pts = snakePoints(state, t);
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    for (const p of pts) {
      minX = Math.min(minX, p.x); maxX = Math.max(maxX, p.x);
      minY = Math.min(minY, p.y); maxY = Math.max(maxY, p.y);
    }
    ctx.save();
    ctx.beginPath();
    ctx.rect(0, 0, state.cols, state.rows);
    ctx.clip();
    for (let kx = Math.floor((-1 - maxX) / state.cols) + 1; minX + kx * state.cols < state.cols; kx++) {
      for (let ky = Math.floor((-1 - maxY) / state.rows) + 1; minY + ky * state.rows < state.rows; ky++) {
        drawSnake(pts, kx * state.cols, ky * state.rows);
      }
    }
    ctx.restore();
  }

  function drawSnake(pts, ox, oy) {
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    const path = () => {
      ctx.beginPath();
      ctx.moveTo(pts[0].x + 0.5 + ox, pts[0].y + 0.5 + oy);
      for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x + 0.5 + ox, pts[i].y + 0.5 + oy);
    };
    ctx.strokeStyle = colors.snake;
    ctx.lineWidth = 0.8;
    path();
    ctx.stroke();
    ctx.strokeStyle = colors.light;
    ctx.lineWidth = 0.34;
    path();
    ctx.stroke();
    // 头
    const h = pts[0];
    ctx.fillStyle = colors.snake;
    ctx.beginPath();
    ctx.arc(h.x + 0.5 + ox, h.y + 0.5 + oy, 0.46, 0, Math.PI * 2);
    ctx.fill();
    const d = state.dir;
    ctx.fillStyle = '#fff';
    for (const side of [-1, 1]) {
      const ex = h.x + 0.5 + ox + d.x * 0.15 + -d.y * side * 0.2;
      const ey = h.y + 0.5 + oy + d.y * 0.15 + d.x * side * 0.2;
      ctx.beginPath();
      ctx.arc(ex, ey, 0.11, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  // ---------- 主循环：逻辑 tick 与 60fps 渲染分离 ----------
  function frame(now) {
    const dt = Math.min(250, now - lastFrame);
    lastFrame = now;
    if (screen === 'playing' && state && state.status === 'playing') {
      acc += dt;
      let interval = Core.tickInterval(state);
      while (acc >= interval && state.status === 'playing') {
        acc -= interval;
        state = Core.step(state);
        for (const ev of state.events) {
          if (ev.type === 'eat') updateHud();
          if (ev.type === 'die' || ev.type === 'win') gameOver();
        }
        interval = Core.tickInterval(state);
      }
      alpha = Math.min(1, acc / interval);
    }
    render();
    requestAnimationFrame(frame);
  }

  // ---------- 与安卓外壳的桥接 ----------
  window.SnakeApp = {
    handleBack() {
      if (screen === 'playing') { pause(); return true; }
      if (screen === 'over') { showScreen('menu'); return true; }
      return false;
    },
    onAppPause() { pause(); },
    onAppResume() { lastFrame = performance.now(); },
    onSystemThemeChanged() {},
    debug: {
      getState: () => (state ? JSON.parse(JSON.stringify(Object.assign({}, state, { walls: null }))) : null),
      getScreen: () => screen,
    },
  };

  layout();
  updateHud();
  requestAnimationFrame(frame);
})();
