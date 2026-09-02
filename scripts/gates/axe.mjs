// Gate G5 — axe-core over every route, in BOTH colour schemes: zero
// critical/serious violations.
//
// The scheme loop is not padding. This site is themed by a token swap, so every
// colour pair exists twice and a single-scheme run tests half of them. Measured
// when it was added: --ink-4 passed nothing in either theme (2.77:1 light,
// 3.75:1 dark) and only the light failure was visible to the original gate.
import puppeteer from 'puppeteer-core';
import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { createRequire } from 'node:module';
import { start } from '../serve.mjs';

const require = createRequire(import.meta.url);
const axeSource = await readFile(require.resolve('axe-core/axe.min.js'), 'utf8');

const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const PORT = 4323;
const DIST = new URL('../../dist', import.meta.url).pathname;

const routes = [];
async function walk(dir, prefix) {
  for (const e of await readdir(dir, { withFileTypes: true })) {
    if (e.isDirectory()) await walk(join(dir, e.name), `${prefix}${e.name}/`);
    else if (e.name === 'index.html') routes.push(prefix || '/');
    else if (e.name === '404.html') routes.push('404');
  }
}
await walk(DIST, '');

const server = await start(PORT);
const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new' });

let failed = false;
for (const route of routes.sort()) {
 for (const scheme of ['light', 'dark']) {
  const page = await browser.newPage();
  await page.emulateMediaFeatures([{ name: 'prefers-color-scheme', value: scheme }]);
  await page.goto(`http://localhost:${PORT}/${route === '/' ? '' : route}`, {
    waitUntil: 'networkidle0',
  });
  await page.evaluate(axeSource);
  const result = await page.evaluate(() =>
    // eslint-disable-next-line no-undef
    axe.run(document, { resultTypes: ['violations'] })
  );
  // No contrast exemptions. The v2 design system carried one for white on
  // #db5210; that colour is not in the v3 palette, so the exemption is dropped
  // rather than inherited — an inherited exemption excuses a failure nobody
  // reviewed.
  const bad = result.violations.filter((v) =>
    ['critical', 'serious'].includes(v.impact)
  );
  if (bad.length) {
    failed = true;
    console.error(`✗ ${route}  [${scheme}]`);
    for (const v of bad) {
      console.error(`   [${v.impact}] ${v.id}: ${v.help}`);
      for (const n of v.nodes.slice(0, 3)) console.error(`     ${n.target.join(' ')}`);
    }
  } else {
    console.log(`✓ ${route}  [${scheme}]`);
  }
  await page.close();
 }
}

await browser.close();
server.close();
if (failed) {
  console.error('G5 FAIL — critical/serious axe violations found.');
  process.exit(1);
}
console.log(
  `G5: OK — ${routes.length} route(s) × light/dark, zero critical/serious violations.`
);
