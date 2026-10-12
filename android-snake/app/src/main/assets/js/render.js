/* Canvas 渲染：棋盘、障碍、食物、道具、蛇（带插值）。只负责“画”，不改游戏状态。 */
(function (root) {
  'use strict';

  const Core = root.SnakeCore;
  const TAU = Math.PI * 2;
  const PU_GLYPH = { fast: '快', slow: '慢', double: '×2', ghost: '穿' };

  function create(canvas) {
    const ctx = canvas.getContext('2d');
    let view = { cols: 26, rows: 16, cell: 20, dpr: 1, w: 520, h: 320 };
    let colors = null;
    let staticLayer = null;
    let staticFor = null; // { walls, cols, rows, cell, dpr, colors }
    let food = { key: '', born: 0 };
    let particles = [];
    let floaters = [];
    let shaking = null;
    let lastNow = 0;

    function readColors() {
      const cs = getComputedStyle(document.documentElement);
      const v = (n) => cs.getPropertyValue(n).trim();
      colors = {
        a: v('--board-a'), b: v('--board-b'), edge: v('--board-edge'),
        snake: v('--snake'), light: v('--snake-light'), head: v('--snake-head'),
        food: v('--food'), leaf: v('--leaf'), wall: v('--wall'), wallTop: v('--wall-top'),
        accent: v('--accent'), text: v('--text'),
        pu: { fast: v('--pu-fast'), slow: v('--pu-slow'), double: v('--pu-double'), ghost: v('--pu-ghost') },
      };
      staticFor = null;
    }

    /** 让棋盘在可用区域内居中、按格子取整，返回格子像素大小。 */
    function layout(areaW, areaH, cols, rows) {
      const dpr = Math.min(root.devicePixelRatio || 1, 3);
      const pad = 10;
      const cell = Math.max(4, Math.floor(Math.min((areaW - pad * 2) / cols, (areaH - pad * 2) / rows)));
      const w = cell * cols;
      const h = cell * rows;
      canvas.style.width = w + 'px';
      canvas.style.height = h + 'px';
      canvas.style.left = Math.round((areaW - w) / 2) + 'px';
      canvas.style.top = Math.round((areaH - h) / 2) + 'px';
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
      view = { cols, rows, cell, dpr, w, h };
      staticFor = null;
      return view;
    }

    function roundRect(c, x, y, w, h, r) {
      c.beginPath();
      c.moveTo(x + r, y);
      c.arcTo(x + w, y, x + w, y + h, r);
      c.arcTo(x + w, y + h, x, y + h, r);
      c.arcTo(x, y + h, x, y, r);
      c.arcTo(x, y, x + w, y, r);
      c.closePath();
    }

    /** 棋盘格和障碍物不常变化，缓存到离屏画布。 */
    function ensureStatic(state) {
      const k = staticFor;
      if (k && k.walls === state.walls && k.cols === state.cols && k.rows === state.rows && k.cell === view.cell && k.dpr === view.dpr) {
        return;
      }
      if (!staticLayer) staticLayer = document.createElement('canvas');
      staticLayer.width = canvas.width;
      staticLayer.height = canvas.height;
      const c = staticLayer.getContext('2d');
      c.setTransform(view.dpr * view.cell, 0, 0, view.dpr * view.cell, 0, 0);
      for (let y = 0; y < state.rows; y++) {
        for (let x = 0; x < state.cols; x++) {
          c.fillStyle = (x + y) % 2 ? colors.a : colors.b;
          c.fillRect(x, y, 1, 1);
        }
      }
      if (state.walls) {
        for (let i = 0; i < state.walls.length; i++) {
          if (!state.walls[i]) continue;
          const x = i % state.cols;
          const y = (i / state.cols) | 0;
          c.fillStyle = colors.wall;
          roundRect(c, x + 0.04, y + 0.04, 0.92, 0.92, 0.18);
          c.fill();
          c.fillStyle = colors.wallTop;
          roundRect(c, x + 0.12, y + 0.1, 0.76, 0.42, 0.12);
          c.fill();
        }
      }
      staticFor = { walls: state.walls, cols: state.cols, rows: state.rows, cell: view.cell, dpr: view.dpr };
    }

    /** 两格之间的位移，考虑穿墙（-1/0/1）。 */
    function delta(a, b, cols, rows) {
      let dx = b.x - a.x;
      let dy = b.y - a.y;
      if (dx > 1) dx -= cols;
      else if (dx < -1) dx += cols;
      if (dy > 1) dy -= rows;
      else if (dy < -1) dy += rows;
      return { x: dx, y: dy };
    }

    /**
     * 插值后的蛇身折线（“展开”坐标，穿墙时不会横跨整个棋盘）：
     * 头部从上一格滑向当前格，尾巴从上一刻的尾巴位置收回，中间沿真实格子路径，拐角平滑。
     */
    function snakePoints(s, t) {
      const n = s.snake.length;
      const u = [{ x: s.snake[0].x, y: s.snake[0].y }];
      for (let i = 1; i < n; i++) {
        const d = delta(s.snake[i - 1], s.snake[i], s.cols, s.rows);
        u.push({ x: u[i - 1].x + d.x, y: u[i - 1].y + d.y });
      }
      const moving = s.ticks > 0 && n > 1;
      const pts = [moving ? { x: u[1].x + (u[0].x - u[1].x) * t, y: u[1].y + (u[0].y - u[1].y) * t } : u[0]];
      for (let i = 1; i < n; i++) pts.push(u[i]);
      if (moving && s.prevTail) {
        const d = delta(s.snake[n - 1], s.prevTail, s.cols, s.rows);
        pts.push({ x: u[n - 1].x + d.x * (1 - t), y: u[n - 1].y + d.y * (1 - t) });
      }
      const dir = moving ? { x: u[0].x - u[1].x, y: u[0].y - u[1].y } : s.dir;
      return { pts, dir };
    }

    function drawFood(state, now) {
      const f = state.food;
      if (!f) return;
      const key = f.x + ',' + f.y;
      if (food.key !== key) food = { key, born: now };
      const grow = Math.min(1, (now - food.born) / 220);
      const pop = grow < 1 ? 1 - Math.pow(1 - grow, 3) : 1;
      const r = (0.34 + 0.035 * Math.sin(now / 170)) * pop;
      const cx = f.x + 0.5;
      const cy = f.y + 0.53;
      ctx.fillStyle = colors.food;
      ctx.beginPath();
      ctx.arc(cx, cy, r, 0, TAU);
      ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,.38)';
      ctx.beginPath();
      ctx.ellipse(cx - r * 0.35, cy - r * 0.35, r * 0.28, r * 0.18, -0.6, 0, TAU);
      ctx.fill();
      ctx.fillStyle = colors.leaf;
      ctx.beginPath();
      ctx.ellipse(cx + r * 0.3, cy - r * 1.05, r * 0.36, r * 0.17, -0.5, 0, TAU);
      ctx.fill();
    }

    function drawPowerup(state, now) {
      const p = state.powerup;
      if (!p) return;
      const left = p.expires - state.time;
      if (left < 2000 && Math.floor(now / 140) % 2) return; // 快消失时闪烁
      const cx = p.x + 0.5;
      const cy = p.y + 0.5;
      const bob = Math.sin(now / 200) * 0.03;
      const c = colors.pu[p.type];
      ctx.fillStyle = c;
      ctx.beginPath();
      ctx.arc(cx, cy + bob, 0.4, 0, TAU);
      ctx.fill();
      // 剩余存在时间：外圈弧线
      ctx.strokeStyle = c;
      ctx.lineWidth = 0.07;
      ctx.beginPath();
      ctx.arc(cx, cy + bob, 0.48, -Math.PI / 2, -Math.PI / 2 + TAU * Math.max(0, left / Core.POWERUP_LIFETIME));
      ctx.stroke();
      // 字形在像素坐标下绘制，避免极小字号的渲染问题
      ctx.save();
      ctx.setTransform(view.dpr, 0, 0, view.dpr, 0, 0);
      ctx.fillStyle = '#fff';
      ctx.font = `800 ${Math.round(view.cell * (p.type === 'double' ? 0.42 : 0.48))}px system-ui, sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(PU_GLYPH[p.type], cx * view.cell, (cy + bob + 0.03) * view.cell);
      ctx.restore();
    }

    function drawSnakeAt(path, ox, oy, style) {
      const pts = path.pts;
      const trace = () => {
        ctx.beginPath();
        ctx.moveTo(pts[0].x + 0.5 + ox, pts[0].y + 0.5 + oy);
        for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x + 0.5 + ox, pts[i].y + 0.5 + oy);
      };
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      if (style.glow) {
        ctx.save();
        ctx.shadowColor = style.glow;
        ctx.shadowBlur = view.cell * 0.6 * view.dpr;
      }
      ctx.strokeStyle = style.body;
      ctx.lineWidth = 0.8;
      trace();
      ctx.stroke();
      if (style.glow) ctx.restore();
      ctx.strokeStyle = style.stripe;
      ctx.lineWidth = 0.32;
      trace();
      ctx.stroke();

      const h = pts[0];
      const hx = h.x + 0.5 + ox;
      const hy = h.y + 0.5 + oy;
      ctx.fillStyle = style.head;
      ctx.beginPath();
      ctx.arc(hx, hy, 0.47, 0, TAU);
      ctx.fill();
      const d = path.dir;
      const len = Math.hypot(d.x, d.y) || 1;
      const dx = d.x / len;
      const dy = d.y / len;
      for (const side of [-1, 1]) {
        const ex = hx + dx * 0.16 - dy * side * 0.2;
        const ey = hy + dy * 0.16 + dx * side * 0.2;
        if (style.dead) {
          ctx.strokeStyle = '#fff';
          ctx.lineWidth = 0.06;
          ctx.beginPath();
          ctx.moveTo(ex - 0.08, ey - 0.08);
          ctx.lineTo(ex + 0.08, ey + 0.08);
          ctx.moveTo(ex + 0.08, ey - 0.08);
          ctx.lineTo(ex - 0.08, ey + 0.08);
          ctx.stroke();
        } else {
          ctx.fillStyle = '#fff';
          ctx.beginPath();
          ctx.arc(ex, ey, 0.12, 0, TAU);
          ctx.fill();
          ctx.fillStyle = '#10301c';
          ctx.beginPath();
          ctx.arc(ex + dx * 0.04, ey + dy * 0.04, 0.06, 0, TAU);
          ctx.fill();
        }
      }
    }

    function drawSnake(state, t, now) {
      const path = snakePoints(state, t);
      const ghost = Core.effectActive(state, 'ghost');
      const ghostLeft = state.effects.ghost - state.time;
      const style = {
        body: colors.snake,
        stripe: colors.light,
        head: colors.head,
        glow: Core.effectActive(state, 'double') ? colors.pu.double : null,
        dead: state.status === 'dead',
      };
      if (ghost) {
        style.body = colors.pu.ghost;
        style.head = colors.pu.ghost;
      }
      ctx.save();
      if (ghost) ctx.globalAlpha = ghostLeft < 1500 && Math.floor(now / 120) % 2 ? 0.85 : 0.55;
      // 穿墙时在对边也画出副本，再裁剪到棋盘内
      let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
      for (const p of path.pts) {
        if (p.x < minX) minX = p.x;
        if (p.x > maxX) maxX = p.x;
        if (p.y < minY) minY = p.y;
        if (p.y > maxY) maxY = p.y;
      }
      ctx.beginPath();
      ctx.rect(0, 0, state.cols, state.rows);
      ctx.clip();
      for (let kx = Math.floor((-1 - maxX) / state.cols) + 1; minX + kx * state.cols < state.cols; kx++) {
        for (let ky = Math.floor((-1 - maxY) / state.rows) + 1; minY + ky * state.rows < state.rows; ky++) {
          drawSnakeAt(path, kx * state.cols, ky * state.rows, style);
        }
      }
      ctx.restore();
    }

    // ---------- 特效：粒子、飘字、屏幕震动 ----------
    /** 在格子 (x, y) 处炸开一圈粒子。 */
    function burst(x, y, color, count, speed) {
      const n = count || 16;
      const sp = speed || 3.2;
      for (let i = 0; i < n; i++) {
        const a = (i / n) * TAU + Math.random() * 0.5;
        const v = sp * (0.45 + Math.random() * 0.75);
        particles.push({
          x: x + 0.5, y: y + 0.5,
          vx: Math.cos(a) * v, vy: Math.sin(a) * v,
          life: 0, max: 380 + Math.random() * 320,
          r: 0.07 + Math.random() * 0.09,
          color,
        });
      }
      if (particles.length > 400) particles.splice(0, particles.length - 400);
    }

    function floatText(x, y, text, color) {
      floaters.push({ x: x + 0.5, y: y + 0.2, text, color, life: 0, max: 850 });
      if (floaters.length > 12) floaters.shift();
    }

    function shake(ms, px) {
      shaking = { start: performance.now(), dur: ms || 420, amp: px || 12 };
    }

    function clearEffects() {
      particles = [];
      floaters = [];
      shaking = null;
      canvas.style.transform = '';
    }

    function drawEffects(dt) {
      const sec = dt / 1000;
      particles = particles.filter((p) => (p.life += dt) < p.max);
      for (const p of particles) {
        p.x += p.vx * sec;
        p.y += p.vy * sec;
        p.vx *= 0.96;
        p.vy = p.vy * 0.96 + 3 * sec; // 轻微下落
        ctx.globalAlpha = Math.max(0, 1 - p.life / p.max);
        ctx.fillStyle = p.color;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.r * (1 - 0.5 * (p.life / p.max)), 0, TAU);
        ctx.fill();
      }
      ctx.globalAlpha = 1;
      floaters = floaters.filter((f) => (f.life += dt) < f.max);
      if (floaters.length) {
        ctx.save();
        ctx.setTransform(view.dpr, 0, 0, view.dpr, 0, 0);
        ctx.font = `800 ${Math.round(view.cell * 0.55)}px system-ui, sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        for (const f of floaters) {
          const k = f.life / f.max;
          ctx.globalAlpha = 1 - k * k;
          ctx.fillStyle = f.color;
          ctx.fillText(f.text, f.x * view.cell, (f.y - k * 1.1) * view.cell);
        }
        ctx.restore();
      }
    }

    function applyShake(now) {
      if (!shaking) return;
      const k = (now - shaking.start) / shaking.dur;
      if (k >= 1) {
        shaking = null;
        canvas.style.transform = '';
        return;
      }
      const a = shaking.amp * (1 - k) * (1 - k);
      canvas.style.transform = `translate(${((Math.random() * 2 - 1) * a).toFixed(1)}px, ${((Math.random() * 2 - 1) * a).toFixed(1)}px)`;
    }

    function draw(state, alpha, now) {
      if (!colors) readColors();
      const dt = lastNow ? Math.min(50, Math.max(0, now - lastNow)) : 16;
      lastNow = now;
      applyShake(now);
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      if (!state) return;
      ensureStatic(state);
      ctx.drawImage(staticLayer, 0, 0);
      ctx.setTransform(view.dpr * view.cell, 0, 0, view.dpr * view.cell, 0, 0);

      if (Core.canWrap(state)) {
        // 可穿墙时用虚线边框提示
        ctx.strokeStyle = colors.accent;
        ctx.globalAlpha = 0.6;
        ctx.lineWidth = 0.08;
        ctx.setLineDash([0.4, 0.3]);
        ctx.strokeRect(0.04, 0.04, state.cols - 0.08, state.rows - 0.08);
        ctx.setLineDash([]);
        ctx.globalAlpha = 1;
      }

      drawPowerup(state, now);
      drawFood(state, now);
      drawSnake(state, state.status === 'playing' ? alpha : 1, now);
      drawEffects(dt);
    }

    return {
      layout, draw, readColors, burst, floatText, shake, clearEffects,
      get colors() { return colors; },
      get view() { return view; },
      get effectCount() { return particles.length + floaters.length; },
      get shaking() { return !!shaking; },
      snakePoints,
    };
  }

  root.SnakeRender = { create };
})(typeof self !== 'undefined' ? self : this);
