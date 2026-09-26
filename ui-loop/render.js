// Renders index.html through seek(t) with Playwright.
//
//   node render.js sheet [offset]   one frame per beat (at beat + offset s) -> out/sheet.png
//   node render.js frames t1 t2 ... single frames -> out/frame-<t>.png
//   node render.js video            4 sub-frames per frame, ffmpeg tmix -> out/video.mp4 (silent)
//   node render.js sfx              dump the UI sound cue list -> out/sfx.json
//
// No state is carried between frames: every screenshot is seek(t) alone.
const path = require('path');
const fs = require('fs');
const { spawn, execFileSync } = require('child_process');
let pw;
try { pw = require('playwright'); } catch { pw = require('/opt/node22/lib/node_modules/playwright'); }

const ROOT = __dirname;
const OUT = path.join(ROOT, 'out');
const FFMPEG = process.env.FFMPEG || 'ffmpeg';
const FPS = 60, SUB = 4, SHUTTER = 0.75;       // 4 sub-frames spread over 270 degrees
const WORKERS = +process.env.WORKERS || 3;
fs.mkdirSync(OUT, { recursive: true });

async function open(browser) {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1440 }, deviceScaleFactor: 1 });
  await page.goto('file://' + path.join(ROOT, 'index.html'));
  await page.waitForFunction(() => window.READY === true);
  const cdp = await page.context().newCDPSession(page);
  const shot = async t => {
    await page.evaluate(t => window.seekT(t), t);
    const { data } = await cdp.send('Page.captureScreenshot', { format: 'png', optimizeForSpeed: true, captureBeyondViewport: false });
    return Buffer.from(data, 'base64');
  };
  return { page, shot };
}

async function main() {
  const [mode, ...args] = process.argv.slice(2);
  const browser = await pw.chromium.launch({ args: ['--font-render-hinting=none', '--disable-lcd-text', '--force-color-profile=srgb'] });
  const { page, shot } = await open(browser);
  const T = await page.evaluate(() => window.T);
  const beats = await page.evaluate(() => window.BEATS);

  if (mode === 'sfx') {
    const cues = await page.evaluate(() => window.SFX);
    fs.writeFileSync(path.join(OUT, 'sfx.json'), JSON.stringify({ T, beats, cues }, null, 1));
    console.log(`${cues.length} cues, T=${T}`);
  } else if (mode === 'frames') {
    for (const a of args) fs.writeFileSync(path.join(OUT, `frame-${a}.png`), await shot(+a));
  } else if (mode === 'sheet') {
    const off = +(args[0] ?? 0.42);
    const dir = path.join(OUT, 'sheet');
    fs.mkdirSync(dir, { recursive: true });
    for (let i = 0; i < 28; i++) fs.writeFileSync(path.join(dir, `b${String(i).padStart(2, '0')}.png`), await shot(beats[i] + off));
    const name = args[1] || `sheet-${off}.png`;
    execFileSync(FFMPEG, ['-y', '-v', 'error', '-framerate', '1', '-i', path.join(dir, 'b%02d.png'),
      '-vf', "scale=360:360:flags=lanczos,tile=7x4:padding=4:color=white",
      '-frames:v', '1', path.join(OUT, name)]);
    console.log('wrote', name);
  } else if (mode === 'video') {
    const N = Math.round(T * FPS);
    const chunk = Math.ceil(N / WORKERS);
    const t0 = Date.now();
    const pages = [{ page, shot }];
    for (let w = 1; w < WORKERS; w++) pages.push(await open(browser));
    let done = 0;
    await Promise.all(pages.map(async ({ shot }, w) => {
      const a = w * chunk, b = Math.min(N, a + chunk);
      const seg = path.join(OUT, `seg${w}.mkv`);
      const ff = spawn(FFMPEG, ['-y', '-v', 'error', '-f', 'image2pipe', '-framerate', String(FPS * SUB), '-i', '-',
        '-vf', `tmix=frames=${SUB},select='eq(mod(n\\,${SUB})\\,${SUB - 1})',setpts=N/(${FPS}*TB)`,
        '-r', String(FPS), '-c:v', 'ffv1', '-pix_fmt', 'bgr0', seg], { stdio: ['pipe', 'inherit', 'inherit'] });
      for (let k = a; k < b; k++) {
        for (let j = 0; j < SUB; j++) {
          const t = k / FPS + ((j - (SUB - 1) / 2) / SUB) * SHUTTER / FPS;
          const buf = await shot(t);
          if (!ff.stdin.write(buf)) await new Promise(r => ff.stdin.once('drain', r));
        }
        if (++done % 60 === 0) console.log(`${done}/${N} frames  ${((Date.now() - t0) / 1000).toFixed(0)}s`);
      }
      ff.stdin.end();
      await new Promise(r => ff.on('close', r));
    }));
    const list = path.join(OUT, 'segs.txt');
    fs.writeFileSync(list, pages.map((_, w) => `file 'seg${w}.mkv'`).join('\n'));
    execFileSync(FFMPEG, ['-y', '-v', 'error', '-f', 'concat', '-safe', '0', '-i', list, '-c', 'copy', path.join(OUT, 'frames.mkv')]);
    pages.forEach((_, w) => fs.unlinkSync(path.join(OUT, `seg${w}.mkv`)));
    fs.unlinkSync(list);
    console.log(`video frames done: ${N} frames in ${((Date.now() - t0) / 1000).toFixed(0)}s`);
  }
  await browser.close();
}
main().catch(e => { console.error(e); process.exit(1); });
