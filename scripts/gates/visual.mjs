// Gate — built pages match the frozen artboards (C6.6).
//
// Fidelity is proven, not eyeballed. The artboards define the design at their
// own two widths and nowhere else, so this gate diffs at 1440 and 390 only.
// A claim about any width between them is a claim about the build's
// interpolation, not about the design, and this gate deliberately makes none.
//
// Both themes, because the theme is a token swap over one DOM: if light passes
// and dark does not, the tokens are wrong, not the markup.
//
// Reduced motion is emulated on both sides. The artboards are finished frames,
// and every scroll-driven beat is written to animate FROM a visible state to
// its end state — so the reduced-motion frame IS the artboard's frame. Diffing
// against a mid-animation capture would compare the design to a moment.
import pixelmatch from 'pixelmatch';
import { PNG } from 'pngjs';
import puppeteer from 'puppeteer-core';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { start } from '../serve.mjs';
import { ARTBOARDS } from '../artboards/export.mjs';

const ROOT = new URL('../../', import.meta.url).pathname;
const REF = join(ROOT, 'design/reference');
const OUT = join(ROOT, 'design/diff');
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const PORT = 4325;

// Share of pixels allowed to differ before the gate fails. Anti-aliasing and
// font rasterisation move a fraction of a percent on their own; anything above
// this is a layout or colour difference worth a human looking at.
const TOLERANCE = Number(process.env.TT_VISUAL_TOLERANCE ?? 0.5);
// Per-channel threshold handed to pixelmatch — how different two pixels must be
// before they count at all.
const THRESHOLD = 0.12;

const ROUTE = process.env.TT_VISUAL_ROUTE ?? '/';

await mkdir(OUT, { recursive: true });
const server = await start(PORT);
const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new' });

const results = [];

for (const board of ARTBOARDS) {
  const refBuf = await readFile(join(REF, `${board.name}.png`)).catch(() => null);
  if (!refBuf) {
    results.push({ board: board.name, error: 'no reference PNG — run `pnpm artboards:export` first' });
    continue;
  }
  const reference = PNG.sync.read(refBuf);

  const page = await browser.newPage();
  await page.setViewport({ width: board.width, height: 1200, deviceScaleFactor: 1 });
  await page.emulateMediaFeatures([
    { name: 'prefers-color-scheme', value: board.scheme },
    { name: 'prefers-reduced-motion', value: 'reduce' },
  ]);
  await page.goto(`http://localhost:${PORT}${ROUTE}`, { waitUntil: 'networkidle0' });
  await page.evaluate(() => document.fonts.ready);
  await new Promise((r) => setTimeout(r, 400));
  const shot = PNG.sync.read(await page.screenshot({ fullPage: true }));
  await page.close();

  if (shot.width !== reference.width || shot.height !== reference.height) {
    results.push({
      board: board.name,
      error:
        `size differs — artboard is ${reference.width}×${reference.height}, ` +
        `built page is ${shot.width}×${shot.height}. A height difference this ` +
        `early usually means a section is missing rather than mis-styled.`,
    });
    continue;
  }

  const diff = new PNG({ width: shot.width, height: shot.height });
  const differing = pixelmatch(
    reference.data,
    shot.data,
    diff.data,
    shot.width,
    shot.height,
    { threshold: THRESHOLD, includeAA: false }
  );
  const pct = (differing / (shot.width * shot.height)) * 100;
  await writeFile(join(OUT, `${board.name}.png`), PNG.sync.write(diff));
  results.push({ board: board.name, pct, differing });
}

await browser.close();
server.close();

let failed = false;
for (const r of results) {
  if (r.error) {
    failed = true;
    console.error(`✗ ${r.board}: ${r.error}`);
  } else if (r.pct > TOLERANCE) {
    failed = true;
    console.error(`✗ ${r.board}: ${r.pct.toFixed(2)}% of pixels differ (tolerance ${TOLERANCE}%) → design/diff/${r.board}.png`);
  } else {
    console.log(`✓ ${r.board}: ${r.pct.toFixed(2)}% differ`);
  }
}

if (failed) {
  console.error('\ngate:visual FAIL — the build does not match the artboards.');
  process.exit(1);
}
console.log(`\ngate:visual: OK — ${results.length} artboard(s) within ${TOLERANCE}%.`);
