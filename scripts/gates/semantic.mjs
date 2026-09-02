// Gate — the semantic markup contract (C3).
//
// Semantic markup costs zero pixels: `<li class="row">` with list-style:none
// renders identically to `<div class="row">`, and `<main>` is invisible. So
// there is no fidelity trade-off to negotiate here — only a rule the port must
// follow, and a check that it did.
//
// Asserts, per page:
//   * exactly one <h1>
//   * no skipped heading levels (h1 → h2 → h3, never h1 → h3)
//   * exactly one <main>
//   * every <table> has at least one <th>
//   * every inline <svg> is either aria-hidden or carries a <title>
import { readdir, readFile } from 'node:fs/promises';
import { join, relative } from 'node:path';

const ROOT = new URL('../../', import.meta.url).pathname;
const DIST = join(ROOT, 'dist');

const pages = [];
async function walk(dir) {
  for (const e of await readdir(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) await walk(p);
    else if (e.name.endsWith('.html')) pages.push(p);
  }
}
await walk(DIST);

const failures = [];

for (const file of pages) {
  const html = await readFile(file, 'utf8');
  const where = relative(DIST, file);
  const problems = [];

  const h1s = html.match(/<h1[\s>]/g) ?? [];
  if (h1s.length !== 1) {
    problems.push(
      `${h1s.length} <h1> (want exactly 1). A secondary display line belongs in a <span> ` +
        `inside the one <h1>, not in an <h1> of its own.`
    );
  }

  const levels = [...html.matchAll(/<h([1-6])[\s>]/g)].map((m) => Number(m[1]));
  for (let i = 1; i < levels.length; i++) {
    if (levels[i] > levels[i - 1] + 1) {
      problems.push(
        `heading level jumps h${levels[i - 1]} → h${levels[i]}. Heading level follows the ` +
          `outline, never the type size — style the h${levels[i - 1] + 1} smaller instead.`
      );
      break;
    }
  }

  const mains = html.match(/<main[\s>]/g) ?? [];
  if (mains.length !== 1) problems.push(`${mains.length} <main> (want exactly 1)`);

  const tables = html.match(/<table[\s>]/g) ?? [];
  const ths = html.match(/<th[\s>]/g) ?? [];
  if (tables.length > 0 && ths.length === 0) {
    problems.push(`${tables.length} <table> but no <th> — tabular data needs header cells`);
  }

  for (const m of html.matchAll(/<svg\b([^>]*)>([\s\S]*?)<\/svg>/g)) {
    const attrs = m[1];
    const inner = m[2];
    const hidden = /aria-hidden\s*=\s*["']true["']/.test(attrs);
    const titled = /<title[\s>]/.test(inner) || /aria-label\s*=/.test(attrs);
    if (!hidden && !titled) {
      problems.push('an <svg> is neither aria-hidden="true" nor carries a <title>/aria-label');
      break;
    }
  }

  if (problems.length) failures.push({ where, problems });
}

if (failures.length) {
  const total = failures.reduce((n, f) => n + f.problems.length, 0);
  console.error(`gate:semantic FAIL — ${total} problem(s) across ${failures.length} page(s):`);
  for (const { where, problems } of failures) {
    console.error(`  ${where}`);
    for (const p of problems) console.error(`     ${p}`);
  }
  process.exit(1);
}
console.log(`gate:semantic: OK — ${pages.length} page(s), heading outline and landmarks sound.`);
