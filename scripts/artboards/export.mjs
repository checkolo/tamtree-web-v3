// Render the four frozen artboards to PNG, as gate:visual's reference.
//
// The artboards are canvas documents rather than pages. Three things have to be
// normalised before a browser renders them the way the canvas editor did, and
// each is worth stating because getting one wrong produces a reference image
// that is subtly wrong rather than obviously broken:
//
//   1. `<x-dc>` and `<helmet>` are unknown elements, so they default to
//      `display:inline`. An inline wrapper around the whole page collapses
//      every block layout inside it. They must be forced to `display:block`,
//      and `<helmet>` — which holds head content parked in the body — hidden.
//   2. `support.js` is the editor runtime and is not in the repo. Its absence
//      is a 404, harmless, but the `<script data-dc-script>` block at the end
//      extends a `DCLogic` class that runtime defines, and that DOES throw.
//      Both are stripped.
//   3. The hero's ember wash follows the pointer via `--mx` / `--my`. With no
//      pointer those keep their declared defaults, which is the at-rest frame
//      the artboard was drawn in — so nothing needs doing, but a future change
//      that moves them on load would silently change the reference.
import puppeteer from 'puppeteer-core';
import { mkdir, readFile, writeFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';

const ROOT = new URL('../../', import.meta.url).pathname;
const SRC = join(ROOT, 'design/artboards');
const OUT = join(ROOT, 'design/reference');
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';

export const ARTBOARDS = [
  { name: 'desktop-light', file: 'desktop-light.dc.html', width: 1440, scheme: 'light' },
  { name: 'desktop-dark', file: 'desktop-dark.dc.html', width: 1440, scheme: 'dark' },
  { name: 'mobile-light', file: 'mobile-light.dc.html', width: 390, scheme: 'light' },
  { name: 'mobile-dark', file: 'mobile-dark.dc.html', width: 390, scheme: 'dark' },
];

const NORMALIZE = `
  x-dc { display: block; }
  helmet { display: none; }
`;

export async function normalized(file) {
  let html = await readFile(join(SRC, file), 'utf8');
  html = html.replace(/<script[^>]*src=["']\.\/support\.js["'][^>]*>\s*<\/script>/g, '');
  html = html.replace(/<script[^>]*data-dc-script[\s\S]*?<\/script>/g, '');
  html = html.replace('</head>', `<style>${NORMALIZE}</style></head>`);
  return html;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  await mkdir(OUT, { recursive: true });
  const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new' });

  for (const board of ARTBOARDS) {
    const page = await browser.newPage();
    await page.setViewport({ width: board.width, height: 1200, deviceScaleFactor: 1 });
    await page.emulateMediaFeatures([
      { name: 'prefers-color-scheme', value: board.scheme },
      // The artboards are drawn as finished frames. Reduced motion is what
      // holds every scroll-driven beat at its end state, which is the frame
      // they represent — animating them would race the screenshot.
      { name: 'prefers-reduced-motion', value: 'reduce' },
    ]);
    await page.setContent(await normalized(board.file), { waitUntil: 'networkidle0' });
    await page.evaluate(() => document.fonts.ready);
    await new Promise((r) => setTimeout(r, 400));

    const height = await page.evaluate(() => document.documentElement.scrollHeight);
    await page.screenshot({ path: join(OUT, `${board.name}.png`), fullPage: true });
    console.log(`✓ ${board.name}  ${board.width}×${height}`);
    await page.close();
  }

  await browser.close();
  const files = await readdir(OUT);
  await writeFile(
    join(OUT, 'manifest.json'),
    JSON.stringify({ frozen: new Date().toISOString().slice(0, 10), boards: ARTBOARDS }, null, 2) + '\n'
  );
  console.log(`\nWrote ${files.length} file(s) to design/reference/`);
}
