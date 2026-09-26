"""Beat analysis with numpy only.

  1. spectral-flux onset envelope (full band + low band)
  2. tempo from the autocorrelation of the envelope (log-normal prior at 120)
  3. dynamic-programming beat tracker (Ellis 2007)
  4. every beat is snapped to the local onset peak (parabolic interpolation)
  5. downbeat phase from bar-level harmonic novelty + kick energy
  6. the 7-bar loop start is the downbeat whose surroundings match the
     surroundings 28 beats later best (seamless wrap) with full energy

    python3 analyze.py track.wav  -> beats.json
"""
import json
import sys
import wave
import numpy as np

path = sys.argv[1] if len(sys.argv) > 1 else "track.wav"
LOOP_BEATS = 28

with wave.open(path) as w:
    sr = w.getframerate()
    ch = w.getnchannels()
    x = np.frombuffer(w.readframes(w.getnframes()), "<i2").astype(float) / 32768
x = x.reshape(-1, ch).mean(1)

N_FFT, HOP = 2048, 256
fps = sr / HOP
win = np.hanning(N_FFT)
pad = np.pad(x, (N_FFT // 2, N_FFT // 2))
n_frames = 1 + (len(pad) - N_FFT) // HOP
idx = np.arange(N_FFT)[None, :] + HOP * np.arange(n_frames)[:, None]
S = np.abs(np.fft.rfft(pad[idx] * win, axis=1))
freqs = np.fft.rfftfreq(N_FFT, 1 / sr)
logS = np.log1p(1000 * S)


def flux(band):
    d = np.diff(logS[:, band], axis=0, prepend=logS[:1, band])
    return np.maximum(d, 0).sum(1)


def clean(env):
    k = int(0.4 * fps) | 1
    local = np.convolve(env, np.ones(k) / k, "same")
    env = np.maximum(env - local, 0)
    return env / (env.max() + 1e-9)


oenv = clean(flux(freqs < 11000))
low = clean(flux(freqs < 160))

# ---- tempo --------------------------------------------------------------
ac = np.correlate(oenv, oenv, "full")[len(oenv) - 1:]
ac /= ac[0]
bpms = np.arange(70, 190, 0.01)
lags = 60 * fps / bpms
score = np.interp(lags, np.arange(len(ac)), ac) + 0.5 * np.interp(2 * lags, np.arange(len(ac)), ac)
prior = np.exp(-0.5 * (np.log2(bpms / 120) / 0.9) ** 2)
bpm = float(bpms[np.argmax(score * prior)])
period = 60 * fps / bpm

# ---- DP beat tracker ------------------------------------------------------
alpha = 100.0
cum = oenv.copy()
back = np.full(len(oenv), -1)
lo, hi = int(round(period / 2)), int(round(period * 2))
for i in range(len(oenv)):
    a, b = i - hi, i - lo
    if b <= 0:
        continue
    prev = np.arange(max(a, 0), b + 1)
    tx = -alpha * np.log((i - prev) / period) ** 2
    j = np.argmax(cum[prev] + tx)
    cum[i] = oenv[i] + cum[prev[j]] + tx[j]
    back[i] = prev[j]
# start from the best frame in the last period
tail = np.arange(len(cum) - int(period), len(cum))
i = int(tail[np.argmax(cum[tail])])
frames = []
while i >= 0:
    frames.append(i)
    i = back[i]
frames = np.array(frames[::-1])
# drop leading beats found in silence
frames = frames[oenv[frames] > 0.02] if (oenv[frames] > 0.02).any() else frames


def peak(f):
    """snap to the local maximum within +-35 ms, parabolic sub-frame."""
    r = int(0.035 * fps)
    a, b = max(f - r, 1), min(f + r, len(oenv) - 2)
    k = a + int(np.argmax(oenv[a:b + 1]))
    y0, y1, y2 = oenv[k - 1], oenv[k], oenv[k + 1]
    den = y0 - 2 * y1 + y2
    off = 0.5 * (y0 - y2) / den if abs(den) > 1e-9 else 0.0
    return (k + np.clip(off, -0.5, 0.5)) / fps


beats = np.array([peak(int(f)) for f in frames])

# The STFT peak is only good to ~one hop and is biased by the window, so
# each beat is refined in the time domain: the steepest rise of a 1.5 ms
# log-energy envelope within +-40 ms is the attack peak we place things on.
fine_hop = 32
k = int(0.0015 * sr)
sq = np.convolve(x ** 2, np.ones(k) / k, "same")[::fine_hop]
loge = np.log(sq + 1e-7)
rise = np.r_[0, np.diff(loge)]
rise = np.convolve(rise, np.ones(3) / 3, "same")
refined = []
for b in beats:
    c = int(b * sr / fine_hop)
    r = int(0.04 * sr / fine_hop)
    a0, a1 = max(c - r, 1), min(c + r, len(rise) - 2)
    j = a0 + int(np.argmax(rise[a0:a1]))
    refined.append(j * fine_hop / sr)
refined = np.array(refined)
bias = float(np.median(refined - beats))
beats = refined

# ---- downbeats ----------------------------------------------------------
chroma_bins = np.round(12 * np.log2(np.maximum(freqs, 1) / 440) + 69) % 12
valid = (freqs > 60) & (freqs < 2000)
C = np.stack([S[:, valid & (chroma_bins == c)].sum(1) for c in range(12)], 1)
bf = np.clip((beats * fps).astype(int), 0, len(C) - 1)
beat_chroma = np.stack([C[a:b].mean(0) if b > a else C[a] for a, b in zip(bf[:-1], bf[1:])])
beat_chroma /= np.linalg.norm(beat_chroma, axis=1, keepdims=True) + 1e-9
nov = np.r_[0, 1 - (beat_chroma[1:] * beat_chroma[:-1]).sum(1)]
low_at = np.interp(beats[:-1] * fps, np.arange(len(low)), low)
kick_onset = np.r_[0, np.maximum(np.diff(low_at), 0)]
phase_score = []
for p in range(4):
    sel = np.arange(p, len(nov), 4)
    phase_score.append(nov[sel].mean() + kick_onset[sel].mean())
phase = int(np.argmax(phase_score))
downbeats = np.arange(phase, len(beats), 4)

# ---- loop start ---------------------------------------------------------
# global key (Krumhansl profiles) -> prefer starting on the tonic chord
maj = np.array([6.35, 2.23, 3.48, 2.33, 4.38, 4.09, 2.52, 5.19, 2.39, 3.66, 2.29, 2.88])
mnr = np.array([6.33, 2.68, 3.52, 5.38, 2.60, 3.53, 2.54, 4.75, 3.98, 2.69, 3.34, 3.17])
g = beat_chroma.mean(0)
keys = [(np.corrcoef(g, np.roll(p, t))[0, 1], t, m) for t in range(12) for p, m in ((maj, "major"), (mnr, "minor"))]
_, tonic, mode = max(keys)
triad = np.zeros(12)
triad[[tonic, (tonic + (4 if mode == "major" else 3)) % 12, (tonic + 7) % 12]] = 1
triad /= np.linalg.norm(triad)
NAMES = "C C# D D# E F F# G G# A A# B".split()

rms = np.array([np.sqrt(np.mean(x[int(a * sr):int(b * sr)] ** 2)) for a, b in zip(beats[:-1], beats[1:])])
best, best_s = None, -1e9
for d in downbeats:
    e = d + LOOP_BEATS
    if d < 2 or e + 3 >= len(beat_chroma):
        continue
    ctx = np.arange(-2, 2)
    sim = np.mean([(beat_chroma[d + k] * beat_chroma[e + k]).sum() for k in ctx])
    energy = rms[d:e].mean() / rms.max()
    flat = 1 - rms[d:e].std() / (rms[d:e].mean() + 1e-9)
    bar = beat_chroma[d:d + 4].mean(0)
    tonal = (bar / (np.linalg.norm(bar) + 1e-9) * triad).sum()
    s = sim + energy + 0.5 * flat + tonal
    if s > best_s + 1e-6:
        best, best_s = d, s

start = beats[best]
loop = beats[best:best + LOOP_BEATS + 1] - start
out = {
    "source": path,
    "sr": sr,
    "bpm": round(bpm, 3),
    "loop_start": round(float(start), 5),
    "loop_length": round(float(loop[-1]), 5),
    "beats": [round(float(b), 5) for b in loop],
    "downbeat_phase": phase,
    "onset_bias": round(bias, 5),
}
json.dump(out, open("beats.json", "w"), indent=1)
print(f"key {NAMES[tonic]} {mode}")
print(f"tempo {bpm:.2f} BPM | {len(beats)} beats | downbeat phase {phase} "
      f"| loop starts at beat {best} = {start:.3f}s | length {loop[-1]:.3f}s")
print("beat intervals (ms):", np.round(np.diff(loop) * 1000).astype(int).tolist())

# write the beat grid into the page (between the /*BEATS*/ ... /*END*/ markers)
import os
import re
html = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "index.html")
if os.path.exists(html):
    src = open(html).read()
    grid = "[" + ",".join(f"{b:.5f}" for b in loop) + "]"
    src = re.sub(r"/\*BEATS\*/.*?/\*END\*/", "/*BEATS*/" + grid + "/*END*/", src, flags=re.S)
    open(html, "w").write(src)
    print("beat grid written to index.html")
