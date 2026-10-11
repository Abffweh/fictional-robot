#!/usr/bin/env python3
"""overlay_hook.py — 渲染全部文字层（字幕、标签、检查单、标题等，透明 PNG 序列），叠加到 ?base 渲出的 3D 画面上。
用法: python3 overlay_hook.py index.html out_dir/ --fps 24 [--times 0,5,20]"""
import argparse, asyncio, os
async def main():
    ap = argparse.ArgumentParser(); ap.add_argument("html"); ap.add_argument("out")
    ap.add_argument("--fps", type=int, default=24); ap.add_argument("--times", default="")
    a = ap.parse_args(); os.makedirs(a.out, exist_ok=True)
    from playwright.async_api import async_playwright
    async with async_playwright() as p:
        b = await p.chromium.launch(args=["--use-angle=swiftshader", "--enable-unsafe-swiftshader"])
        pg = await b.new_page(viewport={"width": 1920, "height": 1080})
        await pg.goto("file://" + os.path.abspath(a.html) + "?overlay")
        await pg.evaluate("new Promise(r => window.setup(r))"); await pg.evaluate("window.__RENDER_MODE__ = true")
        dur = await pg.evaluate("window.DURATION")
        frames = [round(float(x)*a.fps) for x in a.times.split(",")] if a.times else range(int(round(dur*a.fps)))
        for fi in frames:
            await pg.evaluate(f"window.render({fi/a.fps})")
            await pg.screenshot(path=os.path.join(a.out, f"h{fi:06d}.png"), omit_background=True)
        await b.close()
asyncio.run(main())
