/*
 * 本地数据：设置、各模式最高分、排行榜前 10、已解锁关卡。
 * 后端（localStorage）通过参数注入，所以能在 Node 里用假的后端测试。
 * 所有读写都包在 try/catch 里：存储不可用（隐私模式、配额满、被禁用）时
 * 退回到内存，游戏照常运行，只是数据不会保留。
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.SnakeStorage = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const PREFIX = 'snake.v1.';
  const KEYS = Object.freeze({
    settings: PREFIX + 'settings',
    best: PREFIX + 'best',
    leaderboard: PREFIX + 'leaderboard',
    unlocked: PREFIX + 'unlocked',
  });
  const LEADERBOARD_SIZE = 10;

  const DEFAULT_SETTINGS = Object.freeze({
    sound: true,
    vibration: true,
    dpad: true,
    theme: 'system', // system | light | dark
    wrap: false,
    speed: 'normal', // slow | normal | fast
  });
  const THEMES = ['system', 'light', 'dark'];
  const SPEEDS = ['slow', 'normal', 'fast'];
  const BEST_MODES = ['classic', 'level', 'demo'];

  /** 把任意输入整理成合法的设置对象。 */
  function sanitizeSettings(raw) {
    const r = raw && typeof raw === 'object' ? raw : {};
    const out = Object.assign({}, DEFAULT_SETTINGS);
    for (const k of ['sound', 'vibration', 'dpad', 'wrap']) if (typeof r[k] === 'boolean') out[k] = r[k];
    if (THEMES.includes(r.theme)) out.theme = r.theme;
    if (SPEEDS.includes(r.speed)) out.speed = r.speed;
    return out;
  }

  function sanitizeBest(raw) {
    const out = {};
    for (const m of BEST_MODES) {
      const v = raw && typeof raw === 'object' ? raw[m] : 0;
      out[m] = Number.isFinite(v) && v > 0 ? Math.floor(v) : 0;
    }
    return out;
  }

  function sanitizeEntry(e) {
    if (!e || typeof e !== 'object') return null;
    if (!Number.isFinite(e.score) || e.score <= 0) return null;
    return {
      score: Math.floor(e.score),
      mode: e.mode === 'level' ? 'level' : 'classic',
      detail: typeof e.detail === 'string' ? e.detail.slice(0, 40) : '',
      date: typeof e.date === 'string' ? e.date.slice(0, 20) : '',
      ts: Number.isFinite(e.ts) ? e.ts : 0,
    };
  }

  function sanitizeLeaderboard(raw) {
    if (!Array.isArray(raw)) return [];
    return raw.map(sanitizeEntry).filter(Boolean).sort(compareEntries).slice(0, LEADERBOARD_SIZE);
  }

  /** 分数高的在前；同分时先达成的在前。 */
  function compareEntries(a, b) {
    return b.score - a.score || a.ts - b.ts;
  }

  /**
   * 插入一条成绩，返回 { list, rank }。rank 为 1 起算的名次，没进前 10 时为 0。
   */
  function insertLeaderboard(list, entry, size) {
    const max = size || LEADERBOARD_SIZE;
    const e = sanitizeEntry(entry);
    if (!e) return { list: list.slice(0, max), rank: 0 };
    const merged = list.concat([e]).sort(compareEntries);
    const trimmed = merged.slice(0, max);
    const rank = trimmed.indexOf(e) + 1;
    return { list: trimmed, rank };
  }

  /** 本地时间格式 YYYY-MM-DD HH:mm。 */
  function formatDate(d) {
    const p = (n) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
  }

  function createStore(backend) {
    const memory = new Map();
    let persistent = true;

    function read(key) {
      try {
        if (backend) {
          const v = backend.getItem(key);
          if (v !== null && v !== undefined) return JSON.parse(v);
          return memory.has(key) ? memory.get(key) : null;
        }
      } catch (e) {
        persistent = false;
      }
      return memory.has(key) ? memory.get(key) : null;
    }

    function write(key, value) {
      memory.set(key, value);
      try {
        if (!backend) throw new Error('no backend');
        backend.setItem(key, JSON.stringify(value));
        return true;
      } catch (e) {
        persistent = false;
        return false;
      }
    }

    return {
      get persistent() {
        return persistent;
      },
      loadSettings() {
        return sanitizeSettings(read(KEYS.settings));
      },
      saveSettings(settings) {
        const clean = sanitizeSettings(settings);
        write(KEYS.settings, clean);
        return clean;
      },
      loadBest() {
        return sanitizeBest(read(KEYS.best));
      },
      loadLeaderboard() {
        return sanitizeLeaderboard(read(KEYS.leaderboard));
      },
      loadUnlocked(levelCount) {
        const v = read(KEYS.unlocked);
        const n = Number.isFinite(v) ? Math.floor(v) : 1;
        return Math.max(1, Math.min(levelCount || 99, n));
      },
      saveUnlocked(n) {
        write(KEYS.unlocked, Math.max(1, Math.floor(n) || 1));
      },
      /**
       * 记录一局成绩：更新该模式最高分；经典/闯关模式进入排行榜。
       * 返回 { best, isBest, rank }。
       */
      recordScore(mode, score, detail, now) {
        const when = now || new Date();
        const best = sanitizeBest(read(KEYS.best));
        const isBest = score > 0 && score > (best[mode] || 0);
        if (isBest) {
          best[mode] = score;
          write(KEYS.best, best);
        }
        let rank = 0;
        if (mode === 'classic' || mode === 'level') {
          const res = insertLeaderboard(this.loadLeaderboard(), {
            score,
            mode,
            detail: detail || '',
            date: formatDate(when),
            ts: when.getTime(),
          });
          rank = res.rank;
          if (rank) write(KEYS.leaderboard, res.list);
        }
        return { best: best[mode] || 0, isBest, rank };
      },
      clearAll() {
        memory.clear();
        for (const k of Object.values(KEYS)) {
          try {
            if (backend) backend.removeItem(k);
          } catch (e) {
            persistent = false;
          }
        }
      },
    };
  }

  /** 浏览器里安全地拿到 localStorage（访问本身也可能抛异常）。 */
  function browserBackend() {
    try {
      const ls = typeof localStorage !== 'undefined' ? localStorage : null;
      if (!ls) return null;
      const probe = PREFIX + 'probe';
      ls.setItem(probe, '1');
      ls.removeItem(probe);
      return ls;
    } catch (e) {
      return null;
    }
  }

  return {
    KEYS,
    LEADERBOARD_SIZE,
    DEFAULT_SETTINGS,
    sanitizeSettings,
    sanitizeLeaderboard,
    insertLeaderboard,
    formatDate,
    createStore,
    browserBackend,
  };
});
