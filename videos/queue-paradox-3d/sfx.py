#!/usr/bin/env python3
"""sfx.py — 按页面里的 window.SFX_CUES 合成音效轨（无背景音乐）。
用法: python3 sfx.py index.html sfx.wav
全部音色由 numpy 合成，无外部采样，无版权问题。"""
import sys, os, wave
import numpy as np

SR = 44100
rng = np.random.default_rng(7)

def env(n, a=.005, d=.2, curve=4.0):
    t = np.arange(n) / SR
    e = np.minimum(1, t / max(a, 1e-4)) * np.exp(-np.maximum(0, t - a) * curve / max(d, 1e-4))
    return e

def noise(n): return rng.uniform(-1, 1, n)

def lowpass(x, k):   # 简易滑动平均低通，k 越大越闷
    k = max(1, int(k)); return np.convolve(x, np.ones(k) / k, 'same')

def bandnoise(n, k1, k2): return lowpass(noise(n), k1) - lowpass(noise(n), k2)

def tone(f, dur, a=.005, d=.3, curve=5, harm=(1,), fm=0):
    n = int(dur * SR); t = np.arange(n) / SR
    f_t = f * (1 + fm * np.exp(-t * 30))
    ph = 2 * np.pi * np.cumsum(f_t) / SR
    w = sum(np.sin(ph * (i + 1)) * h for i, h in enumerate(harm))
    return w * env(n, a, d, curve)

def mix(*xs):
    n = max(len(x) for x in xs); out = np.zeros(n)
    for x in xs: out[:len(x)] += x
    return out

def S(kind):
    if kind == 'pop':      return tone(520, .14, .002, .06, 6, (1, .3), fm=.9) * .8
    if kind == 'tick':     n = int(.05*SR); return (bandnoise(n, 2, 12) * env(n, .0005, .012, 6)) * 1.6 + tone(2400, .05, .0005, .01, 6) * .3
    if kind == 'send':     return np.concatenate([tone(880, .07, .002, .05, 5, (1, .2)), tone(1320, .12, .002, .08, 5, (1, .2))]) * .7
    if kind == 'ding':     return mix(tone(1318, .9, .002, .5, 3.5, (1, .4, .15, .08)) * .55, tone(1975, .7, .002, .3, 4) * .15)
    if kind == 'buzzer':   n = int(.35*SR); t = np.arange(n)/SR; return np.sign(np.sin(2*np.pi*140*t)) * env(n, .005, .25, 3) * .3
    if kind == 'whoosh':
        n = int(.55*SR); t = np.arange(n)/SR; x = noise(n)
        out = np.zeros(n); k = np.linspace(40, 3, n)   # 滤波逐渐打开 = 由远到近
        for i in range(0, n, 512): out[i:i+512] = lowpass(x[max(0,i-64):i+576], k[i])[64 if i else 0:][:min(512, n-i)]
        return out * np.sin(np.pi * t / t[-1]) ** 2 * 1.4
    if kind == 'riser':
        n = int(2.4*SR); t = np.arange(n)/SR
        return (np.sin(2*np.pi*np.cumsum(180 + 500*(t/t[-1])**2)/SR) * .25 + bandnoise(n, 3, 30) * .5) * (t/t[-1])**2 * .6
    if kind == 'boom':     n = int(1.6*SR); t = np.arange(n)/SR; return (np.sin(2*np.pi*np.cumsum(70*np.exp(-t*2)+38)/SR) * env(n, .003, .9, 3) + lowpass(noise(n), 30) * env(n, .001, .15, 6) * .6) * .9
    if kind == 'stamp':    n = int(.5*SR); t = np.arange(n)/SR; return (np.sin(2*np.pi*np.cumsum(140*np.exp(-t*18)+60)/SR) * env(n, .001, .18, 5) + lowpass(noise(n), 4) * env(n, .0005, .03, 6) * .8) * 1.1
    if kind == 'thud':     n = int(.4*SR); t = np.arange(n)/SR; return np.sin(2*np.pi*np.cumsum(110*np.exp(-t*14)+50)/SR) * env(n, .002, .15, 5) * .9
    if kind == 'slide':    n = int(.7*SR); return bandnoise(n, 6, 60) * env(n, .2, .4, 3) * 1.2
    if kind == 'paper':    n = int(.45*SR); x = bandnoise(n, 2, 20); am = (rng.uniform(0, 1, n//400 + 1) > .55).repeat(400)[:n]; return x * am * env(n, .02, .35, 3) * 1.2
    if kind == 'chalk':
        n = int(.9*SR); x = bandnoise(n, 1, 8); am = np.abs(np.sin(np.arange(n)/SR * 2*np.pi * 7)) ** 3
        return x * am * env(n, .02, .8, 2) * .9
    if kind == 'yarn':     n = int(.8*SR); t = np.arange(n)/SR; return bandnoise(n, 3, 25) * (.5 + .5*np.sin(2*np.pi*11*t)) * env(n, .05, .6, 3) * .7
    if kind == 'fill':     n = int(1.2*SR); t = np.arange(n)/SR; return np.sin(2*np.pi*np.cumsum(300 + 500*t/t[-1])/SR) * env(n, .05, 1.0, 1.5) * .22
    if kind == 'shimmer':  return sum(tone(f, 2.2, .3, 1.5, 2, (1,)) for f in (1568, 2093, 2637, 3136)) * .12
    if kind == 'buzz':     n = int(.9*SR); t = np.arange(n)/SR; g = (np.sin(2*np.pi*3*t) > 0).astype(float); return lowpass(np.sign(np.sin(2*np.pi*165*t)), 6) * g * .28
    if kind == 'shutter':  n = int(.16*SR); a = bandnoise(n, 1, 10) * env(n, .0005, .02, 6); b = np.roll(a, int(.07*SR)) * .7; return (a + b) * 1.2
    if kind == 'crickets':
        n = int(1.6*SR); t = np.arange(n)/SR; chirp = np.sin(2*np.pi*4300*t) * (np.sin(2*np.pi*28*t) > .3) * (np.sin(2*np.pi*1.6*t) > 0)
        return chirp * .12 * np.minimum(1, t*4) * np.minimum(1, (t[-1]-t)*4)
    if kind in ('party', 'crowd'):   # 人声嘈杂：带通噪声 + 随机音节包络 + 偶尔笑声
        dur = 3.2 if kind == 'party' else 2.6; n = int(dur*SR); t = np.arange(n)/SR
        x = np.zeros(n)
        for v in range(10):
            f0 = rng.uniform(140, 260); syl = (rng.uniform(0, 1, int(dur*6)+1) > .35).repeat(int(SR/6)+1)[:n]
            x += np.sin(2*np.pi*f0*t + 3*np.sin(2*np.pi*rng.uniform(3,6)*t)) * lowpass(syl.astype(float), 2000) * .08
        x += bandnoise(n, 4, 40) * .25
        return x * np.minimum(1, t*3) * np.minimum(1, (t[-1]-t)*2)
    if kind == 'sneeze':
        a = tone(420, .25, .2, .1, 2, (1, .3)) * .15
        n = int(.3*SR); b = bandnoise(n, 1, 6) * env(n, .003, .15, 5) * .9
        return np.concatenate([a, b])
    if kind == 'coins':      # 几枚硬币相碰
        out = np.zeros(int(.6*SR))
        for k in range(5):
            x = tone(rng.uniform(3200, 5200), .18, .0005, .08, 6, (1, .5, .2)) * rng.uniform(.2, .35); i0 = int(rng.uniform(0, .4)*SR)
            out[i0:i0+len(x)] += x[:len(out)-i0]
        return out
    if kind == 'beep':       # 收银扫码
        n = int(.12*SR); t = np.arange(n)/SR; return lowpass(np.sign(np.sin(2*np.pi*1850*t)), 3) * env(n, .002, .1, 2) * .22
    if kind == 'horn':
        n = int(.55*SR); t = np.arange(n)/SR; x = np.sign(np.sin(2*np.pi*392*t)) + np.sign(np.sin(2*np.pi*494*t))
        return lowpass(x, 8) * np.minimum(1, t*40) * np.minimum(1, (t[-1]-t)*20) * .18
    if kind == 'engine':     # 低沉的发动机 / 车流声
        n = int(1.5*SR); t = np.arange(n)/SR; f = 48 + 6*np.sin(2*np.pi*.7*t)
        x = np.sin(2*np.pi*np.cumsum(f)/SR) + .5*np.sin(2*np.pi*np.cumsum(2*f)/SR) + lowpass(noise(n), 25)*1.2
        return x * np.minimum(1, t*3) * np.minimum(1, (t[-1]-t)*3) * .3
    if kind == 'clank':      # 餐盘
        n = int(.35*SR); return tone(980, .35, .001, .2, 4, (1, .6, .3, .2)) * .35 + bandnoise(n, 1, 8) * env(n, .0005, .03, 6) * .5
    raise ValueError(kind)

def main():
    html, out = sys.argv[1], sys.argv[2]
    from playwright.sync_api import sync_playwright
    with sync_playwright() as p:
        b = p.chromium.launch(args=["--use-angle=swiftshader", "--enable-unsafe-swiftshader"]); pg = b.new_page()
        pg.goto("file://" + os.path.abspath(html)); cues = pg.evaluate("window.SFX_CUES"); dur = pg.evaluate("window.DURATION"); b.close()
    L = np.zeros(int(dur*SR) + SR); R = np.zeros_like(L)
    for i, (t, kind, vol) in enumerate(cues):
        x = S(kind) * vol; i0 = int(t*SR); x = x[:len(L)-i0]
        pan = np.sin(i * 2.399) * .35          # 每个音效轻微左右错开，增加空间感
        L[i0:i0+len(x)] += x * (1 - pan) ; R[i0:i0+len(x)] += x * (1 + pan)
    # 极轻的房间底噪（空气声，非音乐），避免音效之间完全死寂
    n = len(L); bed = lowpass(noise(n), 60) * .02 * (1 + .3*np.sin(np.arange(n)/SR*2*np.pi/7))
    L += bed; R += np.roll(bed, 997)
    room = lambda y: y + .18*np.roll(y, int(.031*SR)) + .1*np.roll(y, int(.067*SR))   # 简易房间反射
    L, R = room(L)[:int(dur*SR)], room(R)[:int(dur*SR)]
    peak = max(np.abs(L).max(), np.abs(R).max()) + 1e-9
    L, R = L / peak * .89, R / peak * .89
    pcm = (np.stack([L, R], 1) * 32767).astype('<i2')
    with wave.open(out, 'wb') as w: w.setnchannels(2); w.setsampwidth(2); w.setframerate(SR); w.writeframes(pcm.tobytes())
    print(f"音效轨完成：{len(cues)} 个音效，{dur}s → {out}")

if __name__ == "__main__": main()
