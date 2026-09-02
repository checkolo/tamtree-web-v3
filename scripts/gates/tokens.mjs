// Gate — the token and theme contract (C6), checked on the source stylesheet.
//
// C6.2 mandates the dark palette be declared twice: once under
// `prefers-color-scheme: dark` guarded by `:root:not([data-theme="light"])`,
// and once under `:root[data-theme="dark"]` so an explicit toggle wins in both
// directions. CSS has no way to share one declaration block across a media
// query boundary, so the duplication is structural rather than sloppy.
//
// Structural duplication drifts. Someone adjusts one hue, the other block keeps
// the old value, and the bug only shows for users who toggled — a population
// that does not include whoever made the change. This gate makes that a build
// failure instead of a report from a stranger.
//
// It asserts three things:
//   1. The two dark blocks declare exactly the same properties, with exactly
//      the same values.
//   2. Every property either dark block declares also has a value on the bare
//      `:root` — no colour defined only inside a media or [data-theme] block
//      (C6.2), which would resolve to nothing for a light-mode viewer.
//   3. Every `var(--token)` referenced anywhere in src/ resolves to something
//      the bare `:root` defines.
import { readdir, readFile } from 'node:fs/promises';
import { join, relative } from 'node:path';

const ROOT = new URL('../../', import.meta.url).pathname;
const TOKENS = join(ROOT, 'src/brand/tokens.css');
const SRC = join(ROOT, 'src');

// Comments are stripped before parsing: a `/* … */` immediately before a
// declaration otherwise glues onto it and the declaration is silently missed —
// which reads as "this token is dark-only" and is not.
const stripComments = (text) => text.replace(/\/\*[\s\S]*?\*\//g, '');

const css = stripComments(await readFile(TOKENS, 'utf8'));

/** Body of the first rule whose selector line matches `re`, brace-balanced. */
function ruleBody(source, re) {
  const m = re.exec(source);
  if (!m) return null;
  let i = source.indexOf('{', m.index) + 1;
  let depth = 1;
  const start = i;
  while (i < source.length && depth > 0) {
    if (source[i] === '{') depth++;
    else if (source[i] === '}') depth--;
    i++;
  }
  return source.slice(start, i - 1);
}

function declarations(body) {
  const out = new Map();
  if (!body) return out;
  // Only top-level declarations — skip anything inside a nested block.
  let depth = 0;
  let buf = '';
  for (const ch of body) {
    if (ch === '{') depth++;
    else if (ch === '}') depth--;
    else if (ch === ';' && depth === 0) {
      const m = /^\s*(--[\w-]+)\s*:\s*([\s\S]+)$/.exec(buf);
      if (m) out.set(m[1], m[2].trim().replace(/\s+/g, ' '));
      buf = '';
      continue;
    }
    if (depth === 0) buf += ch;
  }
  return out;
}

const failures = [];

// The bare :root — first rule in the file whose selector is exactly `:root`.
const light = declarations(ruleBody(css, /(^|\n)\s*:root\s*\{/));
// The two dark blocks.
const mediaDark = declarations(ruleBody(css, /:root:not\(\[data-theme="light"\]\)\s*\{/));
const explicitDark = declarations(ruleBody(css, /:root\[data-theme="dark"\]\s*\{/));

if (light.size === 0) failures.push('no bare `:root` block found in tokens.css');
if (mediaDark.size === 0) failures.push('no `:root:not([data-theme="light"])` block found');
if (explicitDark.size === 0) failures.push('no `:root[data-theme="dark"]` block found');

// 1 — the two dark blocks must agree exactly.
for (const key of new Set([...mediaDark.keys(), ...explicitDark.keys()])) {
  const a = mediaDark.get(key);
  const b = explicitDark.get(key);
  if (a === undefined) {
    failures.push(`${key} is set in :root[data-theme="dark"] but not in the media block — a dark-system viewer would not get it`);
  } else if (b === undefined) {
    failures.push(`${key} is set in the media block but not in :root[data-theme="dark"] — a viewer who toggled to dark would not get it`);
  } else if (a !== b) {
    failures.push(`${key} differs between the two dark blocks:\n      media:    ${a}\n      explicit: ${b}`);
  }
}

// 2 — nothing may be dark-only (C6.2).
for (const key of new Set([...mediaDark.keys(), ...explicitDark.keys()])) {
  if (key === 'color-scheme') continue;
  if (!light.has(key)) {
    failures.push(`${key} has no value on the bare :root — a light-mode viewer resolves it to nothing. Every token's complete light value belongs in :root.`);
  }
}

// 3 — every var() used in src/ must resolve.
const files = [];
async function walk(dir) {
  for (const e of await readdir(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) await walk(p);
    else if (/\.(css|astro|ts|mjs)$/.test(e.name)) files.push(p);
  }
}
await walk(SRC);

const LOCAL_OK = /^--(ec|sl|code|mx|my)/; // Expressive Code + pointer vars set inline
const used = new Map();
for (const f of files) {
  const text = await readFile(f, 'utf8');
  for (const m of text.matchAll(/var\(\s*(--[\w-]+)/g)) {
    if (!used.has(m[1])) used.set(m[1], relative(ROOT, f));
  }
}
for (const [name, file] of used) {
  if (light.has(name) || LOCAL_OK.test(name)) continue;
  // A token defined locally on a component (e.g. inside .island) is fine.
  if (new RegExp(`${name}\\s*:`).test(css)) continue;
  const declaredLocally = await Promise.all(
    files.map(async (f) => new RegExp(`${name}\\s*:`).test(await readFile(f, 'utf8')))
  );
  if (declaredLocally.some(Boolean)) continue;
  failures.push(`${file} uses var(${name}), which nothing defines`);
}

if (failures.length) {
  console.error(`gate:tokens FAIL — ${failures.length} problem(s):`);
  for (const f of failures) console.error('  ' + f);
  process.exit(1);
}
console.log(
  `gate:tokens: OK — ${light.size} tokens on :root, both dark blocks identical (${mediaDark.size} each), ${used.size} var() reference(s) resolve.`
);
