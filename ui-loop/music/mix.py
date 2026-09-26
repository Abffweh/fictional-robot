"""Cut the 7-bar loop out of the track and lay the UI sounds on it.

Every cue in out/sfx.json is expressed on the beat grid that analyze.py
detected (beat time = snapped onset peak), so each UI sound lands exactly on
the peak of its beat. The loop is crossfaded with the audio that follows it,
and sounds that ring past the end wrap to the start, so the wav loops cleanly.

    python3 mix.py  -> ../out/loop.wav
"""
import json
import os
import wave
import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, "..", "out")
beats = json.load(open(os.path.join(HERE, "beats.json")))
cues = json.load(open(os.path.join(OUT, "sfx.json")))

with wave.open(os.path.join(HERE, beats["source"])) as w:
    sr = w.getframerate()
    x = np.frombuffer(w.readframes(w.getnframes()), "<i2").astype(float).reshape(-1, 2) / 32768

T = cues["T"]                      # loop period used by the page (whole 60 fps frames)
n = int(round(T * sr))
s0 = int(round(beats["loop_start"] * sr))
F = int(0.03 * sr)                 # 30 ms loop crossfade
loop = x[s0:s0 + n].copy()
ramp = np.linspace(0, 1, F)[:, None]
loop[:F] = x[s0 + n:s0 + n + F] * (1 - ramp) + loop[:F] * ramp
music_gain = 0.72
out = loop * music_gain

rng = np.random.default_rng(3)


def tone(f0, f1, dur, decay, partial=0.0):
    t = np.arange(int(dur * sr)) / sr
    f = f0 * (f1 / f0) ** np.minimum(t / max(dur * 0.35, 1e-3), 1)
    ph = 2 * np.pi * np.cumsum(f) / sr
    y = np.sin(ph) + partial * np.sin(2.76 * ph)
    return y * np.exp(-t / decay) * np.minimum(1, t / 0.0015)


def noise(dur, decay, lo, hi):
    m = int(dur * sr)
    X = np.fft.rfft(rng.standard_normal(m))
    f = np.fft.rfftfreq(m, 1 / sr)
    X *= (f > lo) & (f < hi)
    t = np.arange(m) / sr
    return np.fft.irfft(X, m) * np.exp(-t / decay) * 0.25


def pad(*sigs):
    L = max(len(s) for s in sigs)
    return sum(np.pad(s, (0, L - len(s))) for s in sigs)


def delay(sig, sec):
    return np.r_[np.zeros(int(sec * sr)), sig]


F5, AB5, C6, EB6, F6 = 698.46, 830.61, 1046.5, 1244.5, 1396.9
SOUNDS = {
    "hover":    (tone(C6 * 2, C6 * 2, 0.03, 0.008), 0.05),
    "press":    (pad(noise(0.02, 0.003, 2500, 9000), tone(1400, 900, 0.04, 0.01)), 0.30),
    "tap":      (pad(noise(0.02, 0.003, 2500, 9000), tone(1500, 1000, 0.04, 0.009)), 0.26),
    "grab":     (pad(noise(0.02, 0.004, 1500, 7000), tone(700, 520, 0.05, 0.016)), 0.30),
    "release":  (pad(noise(0.015, 0.002, 3000, 10000), tone(1900, 1900, 0.03, 0.006)), 0.16),
    "tick":     (tone(3200, 3200, 0.015, 0.003), 0.08),
    "pop":      (tone(F5 * 0.5, F5, 0.09, 0.03), 0.20),
    "expand":   (pad(tone(260, 560, 0.14, 0.05), 0.4 * tone(F5, F5, 0.12, 0.04)), 0.22),
    "collapse": (tone(760, 330, 0.12, 0.04), 0.20),
    "stretch":  (tone(210, 150, 0.1, 0.035), 0.24),
    "toggle":   (pad(noise(0.02, 0.003, 2000, 9000), tone(1300, 1300, 0.03, 0.006),
                     delay(tone(1800, 1800, 0.03, 0.006), 0.028)), 0.26),
    "success":  (pad(tone(C6, C6, 0.3, 0.09, 0.15), delay(tone(F6, F6, 0.45, 0.14, 0.15), 0.075)), 0.17),
}

for c in cues["cues"]:
    sig, g = SOUNDS[c["type"]]
    sig = sig * g * c.get("gain", 1.0)
    i = int(round(c["t"] * sr))
    idx = (i + np.arange(len(sig))) % n          # wrap past the end of the loop
    out[idx, 0] += sig * 0.95
    out[idx, 1] += sig * 0.95

peak = np.abs(out).max()
if peak > 0.98:
    out *= 0.98 / peak
with wave.open(os.path.join(OUT, "loop.wav"), "wb") as w:
    w.setnchannels(2)
    w.setsampwidth(2)
    w.setframerate(sr)
    w.writeframes((out * 32767).astype("<i2").tobytes())
print(f"loop.wav {n / sr:.4f}s, {len(cues['cues'])} UI sounds, peak {peak:.2f}")
