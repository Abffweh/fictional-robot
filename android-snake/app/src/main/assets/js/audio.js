/*
 * 音效：全部用 WebAudio 实时合成，不带任何音频文件。
 * AudioContext 在第一次用户操作时才创建（浏览器/WebView 的自动播放策略要求）。
 * 任何环节失败都静默降级为无声。
 */
(function (root) {
  'use strict';

  let ctx = null;
  let master = null;
  let enabled = true;
  const log = []; // 最近播放过的音效名，便于自动化测试检查

  function ensure() {
    if (ctx) return ctx;
    try {
      const AC = root.AudioContext || root.webkitAudioContext;
      if (!AC) return null;
      ctx = new AC();
      master = ctx.createGain();
      master.gain.value = 0.32;
      master.connect(ctx.destination);
    } catch (e) {
      ctx = null;
    }
    return ctx;
  }

  /** 在用户手势里调用：创建/恢复 AudioContext。 */
  function unlock() {
    const c = ensure();
    if (c && c.state === 'suspended' && typeof c.resume === 'function') {
      c.resume().catch(() => {});
    }
  }

  /** 一个带包络的振荡音：频率从 f0 滑到 f1。 */
  function tone(type, f0, f1, start, dur, vol) {
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(f0, start);
    if (f1 && f1 !== f0) o.frequency.exponentialRampToValueAtTime(f1, start + dur);
    g.gain.setValueAtTime(0.0001, start);
    g.gain.exponentialRampToValueAtTime(vol, start + 0.012);
    g.gain.exponentialRampToValueAtTime(0.0001, start + dur);
    o.connect(g).connect(master);
    o.start(start);
    o.stop(start + dur + 0.02);
  }

  /** 一段白噪声（撞墙时的“咚”）。 */
  function noise(start, dur, vol) {
    const len = Math.max(1, Math.floor(ctx.sampleRate * dur));
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const src = ctx.createBufferSource();
    const filter = ctx.createBiquadFilter();
    const g = ctx.createGain();
    src.buffer = buf;
    filter.type = 'lowpass';
    filter.frequency.value = 900;
    g.gain.value = vol;
    src.connect(filter).connect(g).connect(master);
    src.start(start);
  }

  const SOUNDS = {
    eat(t) {
      tone('triangle', 520, 880, t, 0.09, 0.5);
      tone('sine', 1040, 1320, t + 0.03, 0.07, 0.18);
    },
    powerup(t) {
      [523, 659, 784, 1047].forEach((f, i) => tone('square', f, f, t + i * 0.055, 0.09, 0.16));
    },
    die(t) {
      tone('sawtooth', 420, 70, t, 0.45, 0.35);
      noise(t, 0.25, 0.5);
    },
    level(t) {
      [523, 659, 784, 1047, 784, 1047].forEach((f, i) => tone('triangle', f, f, t + i * 0.09, 0.14, 0.32));
    },
    click(t) {
      tone('sine', 700, 600, t, 0.04, 0.12);
    },
  };

  function play(name) {
    if (!enabled || !SOUNDS[name]) return;
    const c = ensure();
    if (!c) return;
    try {
      if (c.state === 'suspended') c.resume().catch(() => {});
      SOUNDS[name](c.currentTime + 0.005);
      log.push(name);
      if (log.length > 30) log.shift();
    } catch (e) { /* 合成失败时静默 */ }
  }

  function setEnabled(on) {
    enabled = !!on;
  }

  root.SnakeAudio = { unlock, play, setEnabled, log };
})(typeof self !== 'undefined' ? self : this);
