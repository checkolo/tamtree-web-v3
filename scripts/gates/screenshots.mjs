// Gate G3 — headless-Chrome screenshots of every route, dark + light,
// desktop (1440×900) + mobile (390×844), into gitignored shots/.
import puppeteer from 'puppeteer-core';
import { mkdir, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { start } from '../serve.mjs';

const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const PORT = 4322;
const OUT = new URL('../../shots', import.meta.url).pathname;
const DIST = new URL('../../dist', import.meta.url).pathname;

async function routes() {
  // every index.html + 404.html in dist → a route
  const found = [];
  async function walk(dir, prefix) {
    for (const e of await readdir(dir, { withFileTypes: true })) {
      if (e.isDirectory()) await walk(join(dir, e.name), `${prefix}${e.name}/`);
      else if (e.name === 'index.html') found.push(prefix || '/');
      else if (e.name === '404.html') found.push('404');
    }
  }
  await walk(DIST, '');
  return found.sort();
}

const server = await start(PORT);
await mkdir(OUT, { recursive: true });
const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new' });

const viewports = [
  { tag: 'desktop', width: 1440, height: 900 },
  { tag: 'mobile', width: 390, height: 844 },
];

const list = await routes();
for (const route of list) {
  const url = `http://localhost:${PORT}/${route === '/' ? '' : route}`;
  const slug = route === '/' ? 'home' : route.replace(/\/$/, '').replaceAll('/', '-');
  for (const scheme of ['light', 'dark']) {
    for (const vp of viewports) {
      const page = await browser.newPage();
      await page.setViewport({ width: vp.width, height: vp.height, deviceScaleFactor: 2 });
      await page.emulateMediaFeatures([
        { name: 'prefers-color-scheme', value: scheme },
      ]);
      await page.goto(url, { waitUntil: 'networkidle0' });
      await page.evaluate(() => document.fonts.ready);
      await new Promise((r) => setTimeout(r, 350));
      await page.screenshot({
        path: join(OUT, `${slug}-${scheme}-${vp.tag}.png`),
        fullPage: true,
      });
      await page.close();
    }
  }
  console.log(`✓ ${route}`);
}

await browser.close();
server.close();
console.log(`G3: captured ${list.length} routes × light/dark × 2 viewports → shots/`);
