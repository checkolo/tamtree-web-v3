// Gate G4 — Lighthouse ≥95 on Performance / Accessibility / Best Practices / SEO.
// Usage: node scripts/gates/lighthouse.mjs [route ...]  (default: /)
import { execSync } from 'node:child_process';
import { readFile, mkdir } from 'node:fs/promises';
import { start } from '../serve.mjs';

const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const PORT = 4324;
const routesArg = process.argv.slice(2);
const routes = routesArg.length ? routesArg : ['/'];

const server = await start(PORT);
await mkdir('reports', { recursive: true });

let failed = false;
for (const route of routes) {
  const slug = route === '/' ? 'home' : route.replaceAll('/', '-').replace(/^-|-$/g, '');
  const out = `reports/lighthouse-${slug}.json`;
  execSync(
    `CHROME_PATH="${CHROME}" npx --yes lighthouse "http://localhost:${PORT}${route}" ` +
      `--output=json --output-path=${out} --quiet ` +
      `--chrome-flags="--headless=new --no-first-run"`,
    { stdio: ['ignore', 'ignore', 'inherit'] }
  );
  const r = JSON.parse(await readFile(out, 'utf8'));
  const scores = Object.fromEntries(
    ['performance', 'accessibility', 'best-practices', 'seo'].map((k) => [
      k,
      Math.round((r.categories[k]?.score ?? 0) * 100),
    ])
  );
  const ok = Object.values(scores).every((s) => s >= 95);
  if (!ok) failed = true;
  console.log(
    `${ok ? '✓' : '✗'} ${route}  perf=${scores.performance} a11y=${scores.accessibility} bp=${scores['best-practices']} seo=${scores.seo}`
  );
}

server.close();
if (failed) {
  console.error('G4 FAIL — a category is below 95.');
  process.exit(1);
}
console.log('G4: OK — all categories ≥ 95.');
