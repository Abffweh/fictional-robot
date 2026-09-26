"""Original 120 BPM house loop, synthesised from scratch with numpy.

Everything here is generated, so the track is royalty-free by construction
and can be used commercially. The harmonic cycle is 7 bars long so a 7-bar
excerpt loops without a harmonic jump.

    python3 compose.py            -> track.wav (44.1 kHz, stereo, 16-bit)
"""
import wave
import numpy as np

SR = 44100
BPM = 120.0
BEAT = 60.0 / BPM
BAR = 4 * BEAT
S16 = BEAT / 4
INTRO_BARS = 1
BODY_BARS = 14
TAIL_BARS = 2
N_BARS = INTRO_BARS + BODY_BARS + TAIL_BARS
LENGTH = N_BARS * BAR + 2.0
N = int(LENGTH * SR)
rng = np.random.default_rng(7)

L = np.zeros(N)
R = np.zeros(N)
DL = np.zeros(N)           # drums bus, not ducked
DR = np.zeros(N)
duck = np.ones(N)          # sidechain gain driven by the kick


def hz(m):
    return 440.0 * 2 ** ((m - 69) / 12)


def place(sig, t, gain=1.0, pan=0.0, drum=False):
    i = int(round(t * SR))
    if i >= N:
        return
    sig = sig[: N - i]
    gl = gain * np.cos((pan + 1) * np.pi / 4) * np.sqrt(2)
    gr = gain * np.sin((pan + 1) * np.pi / 4) * np.sqrt(2)
    (DL if drum else L)[i:i + len(sig)] += sig * gl
    (DR if drum else R)[i:i + len(sig)] += sig * gr


def fft_filter(x, lo=None, hi=None, peak=None, q=1.0):
    X = np.fft.rfft(x)
    f = np.fft.rfftfreq(len(x), 1 / SR)
    g = np.ones_like(f)
    if lo:
        g *= 1 / np.sqrt(1 + (lo / np.maximum(f, 1)) ** 4)
    if hi:
        g *= 1 / np.sqrt(1 + (f / hi) ** 4)
    if peak:
        g *= np.exp(-0.5 * (np.log2(np.maximum(f, 1) / peak) * q) ** 2)
    return np.fft.irfft(X * g, len(x))


def saw(freq, dur, cutoff=3000.0, detune=0.0, phase=0.0):
    t = np.arange(int(dur * SR)) / SR
    out = np.zeros_like(t)
    f = freq * (1 + detune)
    n = 1
    while n * f < min(cutoff * 3, SR / 2 - 500):
        a = 1 / n / np.sqrt(1 + (n * f / cutoff) ** 4)
        out += a * np.sin(2 * np.pi * n * f * t + phase * n)
        n += 1
    return out


def env_adsr(n, a=0.005, d=0.1, s=0.6, r=0.1, hold=None):
    t = np.arange(n) / SR
    hold = hold if hold is not None else n / SR - r
    e = np.where(t < a, t / a, s + (1 - s) * np.exp(-(t - a) / max(d, 1e-4)))
    rel = np.clip(1 - (t - hold) / r, 0, 1)
    return e * np.where(t > hold, rel, 1)


# ---------- drums ----------
def kick():
    n = int(0.42 * SR)
    t = np.arange(n) / SR
    f = 46 + 95 * np.exp(-t / 0.028)
    ph = 2 * np.pi * np.cumsum(f) / SR
    body = np.sin(ph) * np.exp(-t / 0.2)
    click = fft_filter(rng.standard_normal(n) * np.exp(-t / 0.003), lo=1500) * 0.35
    return np.tanh(1.6 * (body + click)) * 0.9


def clap():
    n = int(0.3 * SR)
    t = np.arange(n) / SR
    e = np.zeros(n)
    for k, dt in enumerate([0.0, 0.011, 0.022]):
        e += (t >= dt) * np.exp(-np.maximum(t - dt, 0) / (0.006 if k < 2 else 0.07))
    return fft_filter(rng.standard_normal(n), peak=1400, q=1.3) * e * 1.4


def hat(open_=False):
    n = int((0.16 if open_ else 0.045) * SR)
    t = np.arange(n) / SR
    x = fft_filter(rng.standard_normal(n), lo=7000)
    return x * np.exp(-t / (0.055 if open_ else 0.012))


KICK, CLAP, HAT_C, HAT_O = kick(), clap(), hat(), hat(True)

# ---------- harmony: a 7-bar cycle in F minor ----------
CHORDS = [
    [53, 56, 60, 63, 67],   # Fm9
    [49, 53, 56, 60, 63],   # Dbmaj9
    [56, 60, 63, 67],       # Abmaj7
    [51, 55, 58, 62, 65],   # Eb6/9 (add D colour)
    [53, 56, 60, 63, 67],   # Fm9
    [49, 53, 56, 60, 65],   # Db6
    [51, 56, 58, 63],       # Ebsus4
]
ROOTS = [41, 37, 44, 39, 41, 37, 39]
# melody degrees per bar (16th step -> midi)
MEL = [
    {0: 72, 3: 75, 6: 77, 10: 75, 14: 72},
    {0: 72, 3: 68, 6: 72, 10: 75, 13: 77},
    {0: 75, 3: 72, 6: 70, 10: 72, 14: 67},
    {0: 70, 3: 74, 6: 77, 10: 74, 13: 70},
    {0: 72, 3: 75, 6: 77, 10: 79, 14: 80},
    {0: 77, 3: 75, 6: 72, 10: 68, 13: 72},
    {0: 70, 3: 75, 6: 77, 8: 79, 11: 75, 14: 72},
]
STAB_STEPS = [2, 6, 7, 11, 14]


def swing(step):
    return step * S16 + (0.014 if step % 2 else 0.0)


def pluck(m, dur=0.32):
    n = int(dur * SR)
    t = np.arange(n) / SR
    f = hz(m)
    x = np.sin(2 * np.pi * f * t) + 0.35 * np.sin(4 * np.pi * f * t) * np.exp(-t / 0.05)
    x += 0.15 * saw(f, dur, cutoff=2500)[:n]
    return x * np.exp(-t / 0.11) * np.minimum(1, t / 0.002)


def stab(chord, dur):
    n = int(dur * SR)
    x = np.zeros(n)
    y = np.zeros(n)
    for m in chord:
        x += saw(hz(m), dur, cutoff=1800, detune=-0.004, phase=rng.random() * 6)[:n]
        y += saw(hz(m), dur, cutoff=1800, detune=+0.004, phase=rng.random() * 6)[:n]
    e = env_adsr(n, a=0.004, d=0.09, s=0.25, r=0.05)
    return x * e / len(chord), y * e / len(chord)


def pad(chord, dur):
    n = int(dur * SR)
    x = np.zeros(n)
    y = np.zeros(n)
    for m in chord:
        x += saw(hz(m), dur, cutoff=900, detune=-0.006, phase=rng.random() * 6)[:n]
        y += saw(hz(m), dur, cutoff=900, detune=+0.006, phase=rng.random() * 6)[:n]
    e = env_adsr(n, a=0.25, d=0.6, s=0.8, r=0.35)
    return x * e / len(chord), y * e / len(chord)


def bass(m, dur):
    n = int(dur * SR)
    t = np.arange(n) / SR
    f = hz(m)
    x = np.sin(2 * np.pi * f * t) + 0.45 * saw(f, dur, cutoff=420)[:n]
    return np.tanh(1.4 * x) * env_adsr(n, a=0.003, d=0.08, s=0.7, r=0.04)


for bar in range(N_BARS):
    t0 = bar * BAR
    ci = (bar - INTRO_BARS) % 7
    body = INTRO_BARS <= bar < INTRO_BARS + BODY_BARS + TAIL_BARS
    # pad on every bar (the intro only has pad + hats)
    pl, pr = pad(CHORDS[ci], BAR + 0.35)
    i = int(t0 * SR)
    seg = min(len(pl), N - i)
    L[i:i + seg] += pl[:seg] * 0.20
    R[i:i + seg] += pr[:seg] * 0.20
    for step in range(16):
        ts = t0 + swing(step)
        if step % 2 == 1:
            place(HAT_C, ts, 0.10 + 0.04 * (step % 4 == 3), pan=0.25, drum=True)
        if step % 4 == 2:
            place(HAT_O, ts, 0.11, pan=-0.2, drum=True)
    if not body:
        continue
    for b in range(4):
        tb = t0 + b * BEAT
        place(KICK, tb, 0.95, drum=True)
        k = int(tb * SR)
        dn = int(0.3 * SR)
        tt = np.arange(dn) / SR
        seg = min(dn, N - k)
        duck[k:k + seg] = np.minimum(duck[k:k + seg], 1 - 0.7 * np.exp(-tt[:seg] / 0.09))
        if b in (1, 3):
            place(CLAP, tb, 0.42, pan=0.05, drum=True)
    # offbeat bass
    for b in range(4):
        m = ROOTS[ci] + (12 if (b == 3 and ci in (1, 5)) else 0)
        x = bass(m, BEAT * 0.42)
        place(x, t0 + b * BEAT + BEAT / 2, 0.42)
    for step in STAB_STEPS:
        sl, sr_ = stab(CHORDS[ci], S16 * 1.6)
        ts = t0 + swing(step)
        place(sl, ts, 0.30, pan=-0.35)
        place(sr_, ts, 0.30, pan=0.35)
    for step, m in MEL[ci].items():
        place(pluck(m), t0 + swing(step), 0.17, pan=0.3 if step % 4 else -0.15)
        place(pluck(m + 12, 0.2), t0 + swing(step) + BEAT * 0.75, 0.04, pan=-0.5)  # echo

# sidechain the music bus against the kick, then add the drums on top
L = L * duck + DL
R = R * duck + DR

# fade the very end
fade = int(1.5 * SR)
L[-fade:] *= np.linspace(1, 0, fade)
R[-fade:] *= np.linspace(1, 0, fade)

mix = np.stack([L, R], 1)
mix = np.tanh(mix * 1.1) / np.tanh(1.1)
mix /= np.abs(mix).max() / 0.89

with wave.open("track.wav", "wb") as w:
    w.setnchannels(2)
    w.setsampwidth(2)
    w.setframerate(SR)
    w.writeframes((mix * 32767).astype("<i2").tobytes())
print(f"track.wav  {LENGTH:.1f}s  {N_BARS} bars @ {BPM:g} BPM")
