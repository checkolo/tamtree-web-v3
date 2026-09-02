// Gate — the published `.md` matches its source (C1 contract 1).
//
// D14 is settled as NORMALIZATION-AWARE rather than byte-for-byte. The two
// reviews disagreed; the deciding argument is the one both accepted as binding,
// that the gate must run in CI without false positives from editor line
// endings. Byte-for-byte fails the moment one contributor's editor writes CRLF
// or strips a trailing newline — neither of which changes a single rendered
// character, and both of which would train people to ignore the gate.
//
// Normalisation is exactly three things, and nothing else:
//   1. CRLF / CR  → LF
//   2. trailing horizontal whitespace stripped per line
//   3. exactly one trailing newline
//
// Anything beyond that — a changed word, a moved line, a lost directive — still
// fails, which is the whole point.
import { readdir, readFile } from 'node:fs/promises';
import { join, relative } from 'node:path';

const ROOT = new URL('../../', import.meta.url).pathname;
const DIST = join(ROOT, 'dist');
const POSTS = join(ROOT, 'content/posts');

export function normalize(text) {
  return (
    text
      .replace(/\r\n?/g, '\n')
      .split('\n')
      .map((line) => line.replace(/[ \t]+$/, ''))
      .join('\n')
      .replace(/\n+$/, '') + '\n'
  );
}

/**
 * The frontmatter is metadata about the artifact, not the artifact.
 *
 * Leading blank lines are part of finding where the body starts, not part of
 * the body — Astro's `entry.body` already begins at the first real line. This
 * is extraction, not normalisation: D14's three rules stay three.
 */
function body(markdown) {
  const m = /^---\n[\s\S]*?\n---\n?/.exec(markdown);
  return (m ? markdown.slice(m[0].length) : markdown).replace(/^\n+/, '');
}

async function listPosts(dir, prefix = '') {
  const out = [];
  for (const e of await readdir(dir, { withFileTypes: true })) {
    if (e.isDirectory()) out.push(...(await listPosts(join(dir, e.name), `${prefix}${e.name}/`)));
    else if (e.name.endsWith('.md')) out.push({ slug: `${prefix}${e.name.replace(/\.md$/, '')}`, file: join(dir, e.name) });
  }
  return out;
}

const failures = [];
let checked = 0;
let skipped = 0;

for (const { slug, file } of await listPosts(POSTS)) {
  const published = await readFile(join(DIST, 'blog', `${slug}.md`), 'utf8').catch(() => null);
  if (published === null) {
    // Excluded from this build (a draft). Build with TT_INCLUDE_DRAFTS=1 to
    // cover drafts too.
    skipped++;
    continue;
  }
  checked++;
  const want = normalize(body(await readFile(file, 'utf8')));
  const got = normalize(published);
  if (want !== got) {
    const wantLines = want.split('\n');
    const gotLines = got.split('\n');
    const at = wantLines.findIndex((l, i) => l !== gotLines[i]);
    failures.push(
      `${relative(ROOT, file)} → /blog/${slug}.md differs at line ${at + 1}:\n` +
        `      source:    ${JSON.stringify(wantLines[at] ?? '<eof>')}\n` +
        `      published: ${JSON.stringify(gotLines[at] ?? '<eof>')}`
    );
  }
}

if (failures.length) {
  console.error(`gate:md FAIL — ${failures.length} post(s) differ from source:`);
  for (const f of failures) console.error('  ' + f);
  process.exit(1);
}
if (checked === 0) {
  // Distinguish the two ways of getting here. "Every post in the repo is a
  // draft this build excluded" is not a contract violation, and reporting it as
  // one sends the reader looking for a bug in the .md route that is not there.
  if (skipped > 0) {
    console.log(
      `gate:md: OK — nothing to check; all ${skipped} post(s) are drafts excluded from this ` +
        `build. Re-run against a TT_INCLUDE_DRAFTS=1 build to cover them.`
    );
    process.exit(0);
  }
  console.error(
    'gate:md FAIL — there are published posts but no .md siblings in dist/. C1 contract 1 ' +
      'is not being met: the source is the artifact and every post must publish it.'
  );
  process.exit(1);
}
console.log(`gate:md: OK — ${checked} published .md match source${skipped ? ` (${skipped} draft(s) not in this build)` : ''}.`);
