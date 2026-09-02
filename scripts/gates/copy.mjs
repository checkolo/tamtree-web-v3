// Gate — the positioning constraint, enforced rather than remembered.
//
// Licensing and pricing are undecided (positioning change 2026-08-31), so no
// page may claim the product is open source, free, or self-hostable. This is a
// build failure, not a style note: the words are easy to type by reflex and
// expensive to un-say once a crawler has cached them.
//
// Checked against rendered TEXT, not markup — the phrase matters wherever a
// reader can see it, including inside an attribute a card renders from.
import { readdir, readFile } from 'node:fs/promises';
import { join, relative } from 'node:path';

const ROOT = new URL('../../', import.meta.url).pathname;
const DIST = join(ROOT, 'dist');

const FORBIDDEN = [
  { re: /\bopen[-\s]?source(d|s)?\b/gi, why: 'licensing is undecided' },
  { re: /\bself[-\s]?host(ed|ing|able)?\b/gi, why: 'deployment model is undecided' },
  { re: /\bfree\s+(forever|plan|tier|to\s+use|and\s+open)\b/gi, why: 'pricing is undecided' },
  { re: /\b(FOSS|OSS)\b/g, why: 'licensing is undecided' },
  { re: /\bMIT[-\s]licen[cs]ed\b/gi, why: 'licensing is undecided' },
];

const files = [];
async function walk(dir) {
  for (const e of await readdir(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) await walk(p);
    else if (e.name.endsWith('.html') || e.name.endsWith('.md') || e.name.endsWith('.txt')) files.push(p);
  }
}
await walk(DIST);

function toText(source, isHtml) {
  if (!isHtml) return source;
  return source
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ');
}

const failures = [];
for (const f of files) {
  const raw = await readFile(f, 'utf8');
  const text = toText(raw, f.endsWith('.html'));
  for (const { re, why } of FORBIDDEN) {
    for (const m of text.matchAll(re)) {
      const around = text.slice(Math.max(0, m.index - 50), m.index + m[0].length + 50).replace(/\s+/g, ' ').trim();
      failures.push(`${relative(DIST, f)}: "${m[0]}" (${why})\n      …${around}…`);
    }
  }
}

if (failures.length) {
  console.error(`gate:copy FAIL — ${failures.length} forbidden phrase(s):`);
  for (const x of failures) console.error('  ' + x);
  process.exit(1);
}
console.log(`gate:copy: OK — ${files.length} file(s), no licensing or pricing claims.`);
