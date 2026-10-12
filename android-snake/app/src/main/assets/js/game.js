/* 贪吃蛇界面层：界面切换、输入、游戏循环、HUD、设置/排行榜，以及与安卓外壳的桥接。 */
(function () {
  'use strict';

  const Core = window.SnakeCore;
  const Levels = window.SnakeLevels;
  const Store = window.SnakeStorage;
  const Render = window.SnakeRender;
  const AI = window.SnakeAI || null;
  const Sound = window.SnakeAudio || { unlock() {}, play() {}, setEnabled() {}, log: [] };

  const $ = (id) => document.getElementById(id);
  const appEl = $('app');
  const stage = $('stage');
  const effectsEl = $('hud-effects');

  const GRID_LANDSCAPE = { cols: 26, rows: 16 };
  const GRID_PORTRAIT = { cols: 16, rows: 26 };
  const GAME_SCREENS = new Set(['playing', 'pause', 'over', 'levelDone']);

  // ---------- 数据与设置 ----------
  const store = Store.createStore(Store.browserBackend());
  let settings = store.loadSettings();
  let best = store.loadBest();
  let unlocked = store.loadUnlocked(Levels.LEVELS.length);
  let androidDark = null;

  const renderer = Render.create($('board'));

  let screen = 'menu';
  let mode = 'classic';
  let state = null;
  let acc = 0;
  let alpha = 1;
  let lastFrame = performance.now();
  let pending = null; // { screen, timer }：结束动画播放完后要显示的浮层
  let wasPortrait = isPortraitWindow();

  function newSeed() {
    return (Math.random() * 4294967296) >>> 0;
  }
  function isPortraitWindow() {
    return window.innerHeight > window.innerWidth;
  }
  function gridForWindow() {
    return isPortraitWindow() ? GRID_PORTRAIT : GRID_LANDSCAPE;
  }

  // ---------- 反馈：震动（安卓外壳）与音效 ----------
  /**
   * 震动通过外壳注入的 window.Android.vibrate(ms)。普通浏览器里没有这个对象，
   * 这里就什么也不做（按需求降级为空操作，不调用 navigator.vibrate）。
   */
  function vibrate(ms) {
    if (!settings.vibration || mode === 'demo') return;
    try {
      if (window.Android && typeof window.Android.vibrate === 'function') window.Android.vibrate(ms);
    } catch (e) { /* 外壳不可用时忽略 */ }
  }
  function sound(name) {
    Sound.play(name);
  }
  // 自动播放策略：第一次触摸/按键时才创建 AudioContext
  const unlockAudio = () => Sound.unlock();
  document.addEventListener('pointerdown', unlockAudio, true);
  document.addEventListener('keydown', unlockAudio, true);

  // ---------- 主题 ----------
  function resolveTheme() {
    if (settings.theme === 'light' || settings.theme === 'dark') return settings.theme;
    if (androidDark !== null) return androidDark ? 'dark' : 'light';
    try {
      return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
    } catch (e) {
      return 'light';
    }
  }
  function applyTheme() {
    document.documentElement.dataset.theme = resolveTheme();
    renderer.readColors();
  }
  try {
    if (window.Android && typeof window.Android.isSystemDark === 'function') androidDark = !!window.Android.isSystemDark();
  } catch (e) {
    androidDark = null;
  }
  try {
    window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', applyTheme);
  } catch (e) { /* 旧内核不支持时忽略 */ }

  // ---------- 界面切换 ----------
  function showScreen(name) {
    screen = name;
    appEl.dataset.screen = name;
    document.querySelectorAll('.overlay').forEach((el) => {
      el.classList.toggle('hidden', el.dataset.screen !== name);
    });
    appEl.classList.toggle('demo', mode === 'demo');
    const dpadOn = settings.dpad && GAME_SCREENS.has(name) && mode !== 'demo';
    if (appEl.classList.contains('dpad-on') !== dpadOn) {
      appEl.classList.toggle('dpad-on', dpadOn);
      layout();
    }
    $('btn-pause').setAttribute('aria-label', name === 'pause' ? '继续' : '暂停');
  }

  function blurActive() {
    if (document.activeElement && document.activeElement !== document.body) document.activeElement.blur();
  }

  // ---------- 开局 / 结束 ----------
  function setState(s) {
    const resized = !state || state.cols !== s.cols || state.rows !== s.rows;
    state = s;
    if (resized) layout();
  }

  let lastEatTick = 0;
  function enterPlaying() {
    acc = 0;
    alpha = 0;
    lastEatTick = 0;
    renderer.clearEffects();
    cancelPending();
    showScreen('playing');
    blurActive();
    updateHud();
  }

  function startClassic() {
    const g = gridForWindow();
    mode = 'classic';
    setState(Core.createGame({ cols: g.cols, rows: g.rows, mode: 'classic', wrap: settings.wrap, speed: settings.speed, seed: newSeed() }));
    enterPlaying();
  }

  function startLevel(index) {
    const g = gridForWindow();
    mode = 'level';
    setState(Levels.createLevelGame(index, { cols: g.cols, rows: g.rows, seed: newSeed() }));
    enterPlaying();
  }

  function nextLevel() {
    if (!state || state.levelIndex === null || state.levelIndex + 1 >= Levels.LEVELS.length) return;
    const g = gridForWindow();
    setState(Levels.createLevelGame(state.levelIndex + 1, { cols: g.cols, rows: g.rows, seed: state.seed, score: state.score }));
    enterPlaying();
  }

  function startDemo() {
    if (!AI) return;
    const g = gridForWindow();
    mode = 'demo';
    setState(Core.createGame({ cols: g.cols, rows: g.rows, mode: 'demo', wrap: false, speed: 'fast', seed: newSeed() }));
    enterPlaying();
  }

  function restart() {
    if (mode === 'level' && state) startLevel(state.levelIndex);
    else if (mode === 'demo') startDemo();
    else startClassic();
  }

  function pause() {
    if (screen === 'playing' && state && state.status === 'playing') showScreen('pause');
  }
  function resume() {
    if (screen === 'pause') {
      lastFrame = performance.now();
      showScreen('playing');
      blurActive();
    }
  }

  function schedule(name, delay) {
    cancelPending();
    pending = { screen: name, timer: setTimeout(flushPending, delay) };
  }
  function flushPending() {
    if (!pending) return;
    const name = pending.screen;
    clearTimeout(pending.timer);
    pending = null;
    if (screen === 'playing') showScreen(name);
  }
  function cancelPending() {
    if (pending) clearTimeout(pending.timer);
    pending = null;
  }

  function scoreDetail(s) {
    if (s.mode === 'level') return `第${s.levelIndex + 1}关`;
    if (s.mode === 'demo') return 'AI';
    return `${s.wrap ? '穿墙' : '不穿墙'}·${Core.SPEED_NAMES[s.speed]}`;
  }

  function onGameEnd(kind) {
    const res = store.recordScore(mode, state.score, scoreDetail(state));
    best = store.loadBest();
    const titles = { dead: '游戏结束', won: '满屏了，你赢了！', allClear: '全部通关！' };
    $('over-title').textContent = mode === 'demo' && kind === 'dead' ? 'AI 撞上了' : titles[kind];
    $('over-score').textContent = state.score;
    $('over-best').textContent = res.best;
    $('over-new').classList.toggle('hidden', !res.isBest);
    $('over-rank').textContent = res.rank ? `进入本地排行榜第 ${res.rank} 名` : '';
    updateHud();
    schedule('over', kind === 'dead' ? 700 : 350);
  }

  function onLevelComplete() {
    const i = state.levelIndex;
    unlocked = Levels.unlockAfter(unlocked, i);
    store.saveUnlocked(unlocked);
    const next = Levels.LEVELS[i + 1];
    $('ld-title').textContent = `第 ${i + 1} 关「${Levels.LEVELS[i].name}」完成！`;
    $('ld-score').textContent = state.score;
    $('ld-next').textContent = next ? `下一关：第 ${i + 2} 关「${next.name}」· 目标长度 ${next.target}` : '';
    schedule('levelDone', 350);
  }

  function handleEvents(events) {
    for (const ev of events) {
      const c = renderer.colors;
      switch (ev.type) {
        case 'eat':
          lastEatTick = state.ticks;
          renderer.burst(ev.x, ev.y, c.food, 18, 3.4);
          renderer.burst(ev.x, ev.y, c.light, 8, 2.2);
          renderer.floatText(ev.x, ev.y, '+' + ev.points, ev.points > Core.FOOD_POINTS ? c.pu.double : c.text);
          sound('eat');
          vibrate(15);
          updateHud();
          break;
        case 'powerup':
          renderer.burst(ev.x, ev.y, c.pu[ev.kind], 26, 4.2);
          renderer.floatText(ev.x, ev.y, Core.POWERUPS[ev.kind].name, c.pu[ev.kind]);
          sound('powerup');
          vibrate(35);
          updateHud();
          break;
        case 'die': {
          const h = state.snake[0];
          renderer.burst(h.x, h.y, c.snake, 22, 3);
          renderer.shake(480, Math.max(8, renderer.view.cell * 0.4));
          sound('die');
          vibrate(240);
          onGameEnd('dead');
          break;
        }
        case 'win':
          sound('level');
          vibrate(80);
          onGameEnd('won');
          break;
        case 'allClear':
          unlocked = Levels.LEVELS.length;
          store.saveUnlocked(unlocked);
          sound('level');
          vibrate(80);
          onGameEnd('allClear');
          break;
        case 'levelComplete':
          sound('level');
          vibrate(60);
          onLevelComplete();
          break;
        default:
          break;
      }
    }
  }

  /**
   * 回主菜单。如果是在“过关”浮层上不再继续（不点下一关），这一轮闯关到此结束，
   * 记一次闯关成绩；死亡/通关时的成绩已在 onGameEnd 里记过。
   */
  function goMenu() {
    cancelPending();
    if (screen === 'levelDone' && state && state.status === 'levelComplete' && state.score > 0) {
      store.recordScore('level', state.score, scoreDetail(state));
      best = store.loadBest();
    }
    showScreen('menu');
  }

  // ---------- HUD ----------
  function modeLabel(s) {
    if (s.mode === 'level') return `第${s.levelIndex + 1}关 ${Levels.LEVELS[s.levelIndex].name}`;
    if (s.mode === 'demo') return 'AI 演示';
    return `经典·${s.wrap ? '穿墙' : '不穿墙'}·${Core.SPEED_NAMES[s.speed]}`;
  }

  function updateHud() {
    if (!state) return;
    $('hud-score').textContent = state.score;
    $('hud-best').textContent = Math.max(best[mode] || 0, state.score);
    $('hud-mode').textContent = modeLabel(state);
    $('hud-progress').textContent = state.mode === 'level' ? `${state.snake.length}/${state.target}` : `长度 ${state.snake.length}`;
  }

  const chipEls = {};
  function renderEffects() {
    const list = state && state.status === 'playing' ? Core.activeEffects(state) : [];
    const active = new Set(list.map((e) => e.type));
    for (const type of Object.keys(chipEls)) {
      if (!active.has(type)) {
        chipEls[type].remove();
        delete chipEls[type];
      }
    }
    for (const e of list) {
      let el = chipEls[e.type];
      if (!el) {
        el = document.createElement('span');
        el.className = 'chip';
        el.dataset.effect = e.type;
        el.style.setProperty('--c', `var(--pu-${e.type})`);
        el.innerHTML = '<i class="dot"></i><span class="name"></span><span class="secs"></span><i class="bar"></i>';
        el.querySelector('.name').textContent = e.name;
        effectsEl.appendChild(el);
        chipEls[e.type] = el;
      }
      // 剩余时间按游戏时间计算，再减去当前 tick 内已流逝的部分，倒计时更平滑。
      // 暂停时 acc 不再累加，所以显示值会原样冻结。
      const left = Math.max(0, e.remaining - acc);
      el.querySelector('.secs').textContent = (left / 1000).toFixed(1) + 's';
      el.querySelector('.bar').style.width = ((left / e.duration) * 100).toFixed(1) + '%';
      el.classList.toggle('ending', left < 1500);
    }
  }

  let toastTimer = null;
  function toast(text) {
    const el = $('toast');
    el.textContent = text;
    el.classList.remove('hidden');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.classList.add('hidden'), 2600);
  }

  // ---------- 菜单内容 ----------
  function renderLevelGrid() {
    const grid = $('level-grid');
    grid.textContent = '';
    Levels.LEVELS.forEach((lv, i) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'level-card';
      b.dataset.level = String(i);
      b.disabled = i >= unlocked;
      b.innerHTML = '<span class="lv-no"></span><span class="lv-name"></span><span class="lv-desc"></span><span class="lv-target"></span>';
      b.querySelector('.lv-no').textContent = `第 ${i + 1} 关${i >= unlocked ? ' · 🔒 未解锁' : ''}`;
      b.querySelector('.lv-name').textContent = lv.name;
      b.querySelector('.lv-desc').textContent = lv.desc;
      b.querySelector('.lv-target').textContent = `目标长度 ${lv.target}`;
      grid.appendChild(b);
    });
  }

  const MODE_NAMES = { classic: '经典', level: '闯关' };
  function renderLeaderboard() {
    best = store.loadBest();
    $('lb-best-classic').textContent = best.classic;
    $('lb-best-level').textContent = best.level;
    $('lb-best-demo').textContent = best.demo;
    const list = store.loadLeaderboard();
    const body = $('lb-body');
    body.textContent = '';
    list.forEach((e, i) => {
      const tr = document.createElement('tr');
      const cells = [String(i + 1), String(e.score), `${MODE_NAMES[e.mode]}${e.detail ? '·' + e.detail : ''}`, e.date];
      cells.forEach((text, j) => {
        const td = document.createElement('td');
        if (j === 0) td.className = 'rank';
        td.textContent = text;
        tr.appendChild(td);
      });
      body.appendChild(tr);
    });
    $('lb-empty').classList.toggle('hidden', list.length > 0);
  }

  function setSegmented(id, value) {
    $(id).querySelectorAll('button').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.value === value)));
  }

  function syncControls() {
    $('opt-wrap').checked = settings.wrap;
    setSegmented('opt-speed', settings.speed);
    $('set-sound').checked = settings.sound;
    $('set-vibration').checked = settings.vibration;
    $('set-dpad').checked = settings.dpad;
    setSegmented('set-theme', settings.theme);
    $('storage-note').classList.toggle('hidden', store.persistent);
  }

  function saveSettings() {
    settings = store.saveSettings(settings);
    Sound.setEnabled(settings.sound);
    syncControls();
  }

  // ---------- 按钮 ----------
  const actions = {
    'go-classic': () => { syncControls(); showScreen('classic'); },
    'go-levels': () => { renderLevelGrid(); showScreen('levels'); },
    'go-settings': () => { syncControls(); showScreen('settings'); },
    'go-leaderboard': () => { renderLeaderboard(); showScreen('leaderboard'); },
    back: () => showScreen('menu'),
    'start-classic': startClassic,
    'start-demo': startDemo,
    resume,
    restart,
    menu: goMenu,
    'next-level': nextLevel,
  };
  document.addEventListener('click', (e) => {
    const lv = e.target.closest('[data-level]');
    if (lv && !lv.disabled) {
      startLevel(Number(lv.dataset.level));
      return;
    }
    const btn = e.target.closest('[data-action]');
    if (btn && actions[btn.dataset.action]) {
      sound('click');
      actions[btn.dataset.action]();
    }
  });
  $('btn-pause').addEventListener('click', () => (screen === 'pause' ? resume() : pause()));

  $('opt-wrap').addEventListener('change', (e) => { settings.wrap = e.target.checked; saveSettings(); });
  $('set-sound').addEventListener('change', (e) => { settings.sound = e.target.checked; saveSettings(); Sound.setEnabled(settings.sound); });
  $('set-vibration').addEventListener('change', (e) => { settings.vibration = e.target.checked; saveSettings(); });
  $('set-dpad').addEventListener('change', (e) => { settings.dpad = e.target.checked; saveSettings(); });
  $('opt-speed').addEventListener('click', (e) => {
    const b = e.target.closest('button[data-value]');
    if (b) { settings.speed = b.dataset.value; saveSettings(); }
  });
  $('set-theme').addEventListener('click', (e) => {
    const b = e.target.closest('button[data-value]');
    if (b) { settings.theme = b.dataset.value; saveSettings(); applyTheme(); }
  });

  let clearArmed = null;
  $('btn-clear').addEventListener('click', () => {
    const btn = $('btn-clear');
    if (!clearArmed) {
      btn.classList.add('confirm');
      btn.textContent = '再点一次确认清除';
      clearArmed = setTimeout(() => {
        clearArmed = null;
        btn.classList.remove('confirm');
        btn.textContent = '清除所有记录';
      }, 3000);
      return;
    }
    clearTimeout(clearArmed);
    clearArmed = null;
    store.clearAll();
    settings = store.loadSettings();
    best = store.loadBest();
    unlocked = store.loadUnlocked(Levels.LEVELS.length);
    btn.classList.remove('confirm');
    btn.textContent = '已清除';
    setTimeout(() => { btn.textContent = '清除所有记录'; }, 1500);
    syncControls();
    applyTheme();
  });

  // ---------- 输入 ----------
  function input(dir) {
    if (screen !== 'playing' || !state || mode === 'demo') return;
    state = Core.enqueueDir(state, dir);
  }

  const KEYMAP = {
    ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'left', ArrowRight: 'right',
    KeyW: 'up', KeyS: 'down', KeyA: 'left', KeyD: 'right',
  };
  const KEYMAP_CHAR = { w: 'up', s: 'down', a: 'left', d: 'right' };
  document.addEventListener('keydown', (e) => {
    if (e.code === 'Space' || e.key === ' ' || e.code === 'KeyP') {
      e.preventDefault();
      if (screen === 'playing') pause();
      else if (screen === 'pause') resume();
      return;
    }
    if (e.key === 'Escape') {
      e.preventDefault();
      if (screen === 'playing') pause();
      else if (screen !== 'pause') window.SnakeApp.handleBack();
      return;
    }
    if (e.key === 'Enter' && (screen === 'over' || screen === 'levelDone')) {
      e.preventDefault();
      if (screen === 'over') restart();
      else nextLevel();
      return;
    }
    const dir = KEYMAP[e.code] || KEYMAP_CHAR[(e.key || '').toLowerCase()];
    if (dir && screen === 'playing') {
      e.preventDefault();
      input(dir);
    }
  });

  // 滑动：移动超过阈值就立即转向，同一次滑动中可以连续转弯
  let swipe = null;
  // 演示模式下点画面暂停。用 click 而不是 pointerdown：否则暂停层在手指按下时就弹出，
  // 随后合成的 click 会落到暂停层的按钮上（点击穿透），演示立刻又被“重新开始”。
  stage.addEventListener('click', () => {
    if (mode === 'demo' && screen === 'playing') pause();
  });
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

  // 屏幕方向键：按下即生效（不等 click），支持多指
  document.querySelectorAll('.dpad-btn').forEach((btn) => {
    btn.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      btn.classList.add('pressed');
      input(btn.dataset.dir);
    });
    const release = () => btn.classList.remove('pressed');
    btn.addEventListener('pointerup', release);
    btn.addEventListener('pointercancel', release);
    btn.addEventListener('pointerleave', release);
    btn.addEventListener('contextmenu', (e) => e.preventDefault());
  });

  document.addEventListener('visibilitychange', () => {
    if (document.hidden) pause();
  });

  // ---------- 布局 ----------
  function layout() {
    const g = state || gridForWindow();
    renderer.layout(stage.clientWidth, stage.clientHeight, g.cols, g.rows);
  }
  if (typeof ResizeObserver === 'function') new ResizeObserver(() => layout()).observe(stage);
  window.addEventListener('resize', () => {
    layout();
    const portrait = isPortraitWindow();
    if (portrait !== wasPortrait) {
      wasPortrait = portrait;
      pause(); // 旋转后棋盘尺寸会变，先暂停让玩家看清楚
    }
  });

  // ---------- 主循环：逻辑 tick 与 60fps 渲染分离 ----------
  let manualClock = false; // 仅供自动化测试：冻结实时时钟，改为手动推进 tick

  function canAdvance() {
    return screen === 'playing' && state && state.status === 'playing';
  }

  /** 推进一个逻辑 tick（AI 决策 → 核心 step → 处理事件）。 */
  function advanceTick() {
    if (mode === 'demo' && AI) state = Core.enqueueDir(state, AI.decide(state));
    state = Core.step(state);
    handleEvents(state.events);
    // 演示模式：AI 到了后期可能一直安全地追尾巴、不敢吃食物。太久没吃到就记分并重开一局
    if (mode === 'demo' && state.status === 'playing' && state.ticks - lastEatTick > state.cols * state.rows * 2) {
      store.recordScore('demo', state.score, 'AI');
      best = store.loadBest();
      toast(`AI 绕圈太久，重新开局（本局 ${state.score} 分）`);
      startDemo();
    }
  }

  const frameTimes = []; // 最近 1 秒内每帧的时间戳，用于统计实际帧率
  function frame(now) {
    const dt = Math.min(250, Math.max(0, now - lastFrame));
    lastFrame = now;
    frameTimes.push(now);
    while (frameTimes.length && frameTimes[0] < now - 1000) frameTimes.shift();
    if (canAdvance() && !manualClock) {
      acc += dt;
      let interval = Core.tickInterval(state);
      let guard = 0;
      while (acc >= interval && state.status === 'playing' && guard++ < 8) {
        acc -= interval;
        advanceTick();
        interval = Core.tickInterval(state);
      }
      alpha = state.status === 'playing' ? Math.min(1, acc / interval) : 1;
    }
    if (GAME_SCREENS.has(screen)) renderEffects();
    renderer.draw(state, alpha, now);
    requestAnimationFrame(frame);
  }

  // ---------- 与安卓外壳的桥接（window.SnakeApp） ----------
  window.SnakeApp = {
    /** 返回 true 表示网页已处理；false 表示外壳应退出应用。 */
    handleBack() {
      if (screen === 'playing') {
        if (state && state.status !== 'playing') flushPending();
        else pause();
        return true;
      }
      if (screen === 'pause' || screen === 'menu') return false;
      goMenu();
      return true;
    },
    onAppPause() {
      pause();
    },
    onAppResume() {
      lastFrame = performance.now();
    },
    onSystemThemeChanged(dark) {
      androidDark = !!dark;
      applyTheme();
    },
    /**
     * 测试/调试接口。除了只读查询，还有两个钩子：
     * setManualClock/tick —— 冻结实时时钟、手动推进 tick，让端到端测试不受机器卡顿影响
     *   （输入仍然走真实的键盘/触摸事件）；placePowerupAhead —— 验证道具与 HUD 计时。
     */
    debug: {
      setManualClock(on) {
        manualClock = !!on;
        acc = 0;
        alpha = 1;
        lastFrame = performance.now();
      },
      tick(n) {
        let done = 0;
        while (done < (n || 1) && canAdvance()) {
          advanceTick();
          done++;
        }
        return done;
      },
      getState: () => (state ? JSON.parse(JSON.stringify(Object.assign({}, state, { walls: null, wallCount: state.walls ? state.walls.reduce((a, b) => a + b, 0) : 0 }))) : null),
      getScreen: () => screen,
      getMode: () => mode,
      getSettings: () => Object.assign({}, settings),
      getUnlocked: () => unlocked,
      getFps: () => frameTimes.length,
      getSoundLog: () => Sound.log.slice(),
      getEffects: () => ({ particles: renderer.effectCount, shaking: renderer.shaking }),
      getView: () => {
        const r = $('board').getBoundingClientRect();
        return { left: r.left, top: r.top, width: r.width, height: r.height, cell: renderer.view.cell };
      },
      placePowerupAhead(type) {
        if (!state || state.status !== 'playing') return false;
        // 放在蛇头下一个 tick 要进入的格子
        const h = state.snake[0];
        const d = state.queue.length ? state.queue[0] : state.dir;
        const x = Core.wrapCoord(h.x + d.x, state.cols);
        const y = Core.wrapCoord(h.y + d.y, state.rows);
        state = Object.assign({}, state, { powerup: { type, x, y, expires: state.time + Core.POWERUP_LIFETIME } });
        return true;
      },
    },
  };

  // ---------- 启动 ----------
  if (!AI) document.querySelectorAll('[data-action="start-demo"]').forEach((b) => b.classList.add('hidden'));
  Sound.setEnabled(settings.sound);
  applyTheme();
  syncControls();
  showScreen('menu');
  layout();
  requestAnimationFrame(frame);
})();
