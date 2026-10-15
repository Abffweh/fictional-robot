#!/usr/bin/env python3
"""render3d.py — 逐帧渲染 3D 版（SwiftShader WebGL）。可多进程并行：
   python3 render3d.py index.html frames/ --fps 30 --procs 2 [--start 0 --end N]"""
import argparse, asyncio, os, sys, time, subprocess
async def worker(html, out, frames, fps, wid, query=""):
    from playwright.async_api import async_playwright
    async with async_playwright() as p:
        b = await p.chromium.launch(args=["--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist", "--force-color-profile=srgb"])
        pg = await b.new_page(viewport={"width": 1920, "height": 1080})
        pg.on("pageerror", lambda e: print(f"[{wid}] 页面错误 {e}", file=sys.stderr, flush=True))
        await pg.goto("file://" + os.path.abspath(html) + query)
        await pg.evaluate("new Promise(r => window.setup(r))")
        await pg.evaluate("window.__RENDER_MODE__ = true")
        t0 = time.time()
        for n, fi in enumerate(frames):
            path = os.path.join(out, f"f{fi:06d}.png")
            if os.path.exists(path): continue
            await pg.evaluate(f"window.render({fi/fps})")
            await pg.screenshot(path=path + ".tmp.png", timeout=180000); os.replace(path + ".tmp.png", path)
            if n % 100 == 0: print(f"[{wid}] {n}/{len(frames)}  {time.time()-t0:.0f}s", flush=True)
        await b.close()
def main():
    ap = argparse.ArgumentParser(); ap.add_argument("html"); ap.add_argument("out")
    ap.add_argument("--fps", type=int, default=30); ap.add_argument("--procs", type=int, default=1)
    ap.add_argument("--start", type=int, default=0); ap.add_argument("--end", type=int, default=-1)
    ap.add_argument("--worker", type=int, default=-1); ap.add_argument("--query", default="", help="如 ?base 只渲 3D 画面")
    a = ap.parse_args(); os.makedirs(a.out, exist_ok=True)
    if a.end < 0:
        import json
        from playwright.sync_api import sync_playwright
        with sync_playwright() as p:
            b = p.chromium.launch(args=["--use-angle=swiftshader", "--enable-unsafe-swiftshader"]); pg = b.new_page()
            pg.goto("file://" + os.path.abspath(a.html)); dur = pg.evaluate("window.DURATION"); b.close()
        a.end = int(round(dur * a.fps))
    if a.worker >= 0:   # 子进程：交错分配帧，保证各进程负载均匀
        frames = list(range(a.start + a.worker, a.end, a.procs))
        asyncio.run(worker(a.html, a.out, frames, a.fps, a.worker, a.query)); return
    procs = [subprocess.Popen([sys.executable, __file__, a.html, a.out, "--fps", str(a.fps), "--procs", str(a.procs),
             "--start", str(a.start), "--end", str(a.end), "--worker", str(w), "--query", a.query]) for w in range(a.procs)]
    rc = [p.wait() for p in procs]
    n = len([f for f in os.listdir(a.out) if f.endswith(".png") and not f.endswith(".tmp.png")])
    print(f"完成：{n} 帧（期望 {a.end - a.start}）", flush=True); sys.exit(max(rc))
if __name__ == "__main__": main()
