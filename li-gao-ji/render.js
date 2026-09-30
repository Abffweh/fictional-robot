// Render an SVG/HTML file to PNG: node render.js in.svg out.png [scale]
const { chromium } = require('playwright');
const path = require('path');

(async () => {
  const [src, out, scale = '2'] = process.argv.slice(2);
  const browser = await chromium.launch();
  const page = await browser.newPage({ deviceScaleFactor: Number(scale) });
  await page.goto('file://' + path.resolve(src));
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(300);
  const el = await page.$('svg, #sheet');
  await el.screenshot({ path: out, omitBackground: false });
  await browser.close();
})();
