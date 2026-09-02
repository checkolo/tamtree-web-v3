// Gate G2 — crawl dist/ HTML: fail on broken internal links/anchors/assets;
// external links compiled into a report for checkpoint review.
import { readdir, readFile, stat, writeFile, mkdir } from 'node:fs/promises';
import { join, dirname } from 'node:path';

const DIST = new URL('../../dist', import.meta.url).pathname;
const REPORTS = new URL('../../reports', import.meta.url).pathname;

const htmlFiles = [];
async function walk(dir) {
  for (const e of await readdir(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) await walk(p);
    else if (e.name.endsWith('.html')) htmlFiles.push(p);
  }
}
await walk(DIST);

const attrRe = /(?:href|src)=(?:"([^"]*)"|'([^']*)')/g;
const idRe = /id=(?:"([^"]*)"|'([^']*)')/g;

const ids = new Map(); // html path → Set of ids
const pages = new Map(); // html path → [{url, raw}]
const external = new Set();

for (const f of htmlFiles) {
  const html = await readFile(f, 'utf8');
  const set = new Set();
  for (const m of html.matchAll(idRe)) set.add(m[1] ?? m[2]);
  ids.set(f, set);
  const refs = [];
  for (const m of html.matchAll(attrRe)) refs.push(m[1] ?? m[2]);
  pages.set(f, refs);
}

async function exists(p) {
  const s = await stat(p).catch(() => null);
  if (s?.isFile()) return true;
  if (s?.isDirectory()) return (await stat(join(p, 'index.html')).catch(() => null))?.isFile() ?? false;
  return false;
}

const failures = [];
for (const [f, refs] of pages) {
  for (const raw of refs) {
    if (!raw || raw.startsWith('data:') || raw.startsWith('mailto:')) continue;
    if (/^[a-z]+:\/\//i.test(raw)) {
      external.add(raw);
      continue;
    }
    const [pathPart, anchor] = raw.split('#');
    let target;
    if (pathPart === '') {
      target = f; // same-page anchor
    } else if (pathPart.startsWith('/')) {
      target = join(DIST, pathPart);
    } else {
      target = join(dirname(f), pathPart);
    }
    if (pathPart !== '' && !(await exists(target))) {
      failures.push(`${f.replace(DIST, '')} → ${raw} (missing file)`);
      continue;
    }
    if (anchor) {
      let anchorFile = pathPart === '' ? f : target;
      const s = await stat(anchorFile).catch(() => null);
      if (s?.isDirectory()) anchorFile = join(anchorFile, 'index.html');
      if (anchorFile.endsWith('.html')) {
        const idSet =
          ids.get(anchorFile) ??
          new Set(
            [...(await readFile(anchorFile, 'utf8').catch(() => '')).matchAll(idRe)].map(
              (m) => m[1] ?? m[2]
            )
          );
        if (!idSet.has(anchor)) {
          failures.push(`${f.replace(DIST, '')} → ${raw} (missing #${anchor})`);
        }
      }
    }
  }
}

await mkdir(REPORTS, { recursive: true });
await writeFile(
  join(REPORTS, 'external-links.txt'),
  [...external].sort().join('\n') + '\n'
);

if (failures.length) {
  console.error(`G2 FAIL — ${failures.length} broken internal reference(s):`);
  for (const x of failures) console.error('  ' + x);
  process.exit(1);
}
console.log(
  `G2: OK — ${htmlFiles.length} pages, no broken internal links; ${external.size} external link(s) → reports/external-links.txt`
);
