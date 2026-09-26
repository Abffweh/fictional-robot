# One Shape — a 7-bar UI loop

A single rounded shape moves through 11 UI states at 120 BPM, one change per beat. Only its size, radius and color change; its content swaps with a short blur. The final frame hands back to the first, so the loop is seamless.

`out/ui-loop.mp4` is 1440×1440, 60 fps, 14.0 s, with audio.

## Beat grid (7 bars × 4 beats)

| bar | beat 1 | beat 2 | beat 3 | beat 4 |
|---|---|---|---|---|
| 1 | cursor arrives, button hovers | press | release → loader 16 % | 50 % |
| 2 | 84 % | done: lime circle, check draws | widens to "Ready" | becomes the island |
| 3 | press the island | expands into the player | pause | play |
| 4 | grab the thumb | drag to 72 % | drag past the end (rubber band) | still held: becomes the volume slider |
| 5 | drag to 60 % | release | becomes the "Double time" switch | toggle (leading edge first) |
| 6 | knob becomes the status icon | icon unfolds into four | icons open into the chart | "Month" tab |
| 7 | hover bar → tooltip | tooltip follows to another bar | back to "Week" | collapses to the button → beat 1 |

## How it works

- **`index.html`**: the whole piece. `seek(t)` is the only function that writes styles. There are no CSS transitions, no timers, and no state carried between frames.
- **Springs**: every animated value is a `Track`, the sum of one closed-form damped step response per target change (ζ 0.74–0.92, never bouncy). Tracks are evaluated periodically: `v(t) = base + Σ Δᵢ [s(t−tᵢ) + s(t−tᵢ+T) − 1]`. Because of this, `t = T` matches `t = 0` in both position and velocity, cursor included.
- **Leading and trailing edges**: the tab indicator and the switch knob have separate springs for their left and right edges. The edge in the direction of travel is faster, so the shape stretches and then catches up.
- **Direct manipulation**: while the pointer is held (beats 12–17), the slider value is computed from the cursor position on the current, still-morphing track geometry. Past the end it rubber-bands the thumb, fill and shape. On release, the value holds and the pressed states spring back.
- **Camera**: zoom is fitted to each state's target bounds and animated on a log scale, so every state fills the frame.
- **Text**: every text block has its own entry and exit spring, with entry delayed about 0.08 s so old and new text don't double-expose.

## Music

The track is an original 120 BPM house loop synthesised in `music/compose.py`. Its 7-bar chord cycle (Fm9 · Dbmaj9 · Abmaj7 · Eb6/9 · Fm9 · Db6 · Ebsus4) is written so a 7-bar excerpt loops harmonically. Because it is generated, it is royalty-free and can be used commercially.

`music/analyze.py` uses numpy only:
- spectral-flux onsets
- tempo from autocorrelation
- a dynamic-programming beat tracker, with each beat snapped to its attack peak in the time domain
- downbeat phase from harmonic novelty and kick energy
- the loop start chosen from wrap similarity, energy, and the tonic chord

The result is written into `index.html`. `music/mix.py` places each UI sound on the detected peak of its beat and wraps any tails around the loop.

To use a different song (a Mixkit track, for example), run `python3 analyze.py your.wav` and re-run the steps after it in `build.sh`.

## Build

```sh
pip install numpy imageio-ffmpeg     # ffmpeg with tmix + libx264
./build.sh                           # needs Node Playwright + Chromium
```

`render.js` renders 4 sub-frames per 60 fps frame (a 270° shutter). Each worker pipes its frames into ffmpeg with `tmix=frames=4` and keeps every 4th averaged frame. `node render.js sheet 0.42` renders the one-frame-per-beat contact sheet used for layout review.

Open `index.html?play` in a browser for a live preview; click to start the audio.

Geist is © Vercel, used under the SIL Open Font License (`fonts/OFL.txt`).
