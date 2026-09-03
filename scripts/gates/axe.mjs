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
let excusedTotal = 0;
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
  // One contrast exemption, and it is narrow on purpose.
  //
  // The primary button ships a white label over the artboards' bright ember —
  // 2.80:1 on the dark theme's flat #f97316, against AA's 4.5:1. That is a
  // decision, not a defect: the alternative was put with its numbers (deepen
  // the ground to #cc430b→#a83808 for 4.8-6.5:1) and declined in favour of the
  // artboards' ember, then re-confirmed on 2026-09-03 after the owner viewed
  // the rendered result. The reasoning lives on the declaration in base.css.
  //
  // Why the gate needs to know at all: the comment there says axe can never
  // raise this, which was true only while the button was a gradient — axe
  // reports those as *incomplete* rather than failing. --btn-primary-bg is a
  // gradient on light but a flat colour on dark, and axe resolves a flat
  // colour perfectly well. So without this the gate is permanently red, and a
  // permanently-red gate is one nobody reads.
  //
  // Scoped to the one rule on the one selector. Every other contrast pair on
  // the button — and every contrast pair anywhere else — still fails the gate.
  // The v2 system's white-on-#db5210 exemption is NOT inherited: that colour
  // is not in the v3 palette, and an inherited exemption excuses a failure
  // nobody reviewed.
  const EXEMPT = { rule: 'color-contrast', selector: '.btn--primary' };
  const exempt = await page.evaluate(
    (sel, targets) =>
      targets.map((t) =>
        // A node is excused only if the element it names really carries the
        // class, resolved in the page rather than by matching the selector
        // string — axe's target is a path, and string-matching it would excuse
        // anything that merely mentioned the class.
        [document.querySelector(t)].every((el) => el && el.matches(sel))
      ),
    EXEMPT.selector,
    result.violations.flatMap((v) =>
      v.id === EXEMPT.rule ? v.nodes.map((n) => n.target.join(' ')) : []
    )
  );

  let cursor = 0;
  let excused = 0;
  const bad = result.violations
    .map((v) => {
      if (v.id !== EXEMPT.rule) return v;
      const nodes = v.nodes.filter(() => {
        const ok = exempt[cursor++];
        if (ok) excused++;
        return !ok;
      });
      return { ...v, nodes };
    })
    .filter((v) => v.nodes.length > 0)
    .filter((v) => ['critical', 'serious'].includes(v.impact));

  if (excused) excusedTotal += excused;
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
  `G5: OK — ${routes.length} route(s) × light/dark, zero critical/serious violations.` +
    (excusedTotal
      ? `\n  ⚠ ${excusedTotal} excused: white-on-ember on .btn--primary, the owner's` +
        ` decision of 2026-09-03. Not a pass — a documented failure.`
      : '')
);
