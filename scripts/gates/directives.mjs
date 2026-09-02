// Gate — every directive in source survives into the built HTML as its element.
//
// This gate is load-bearing, and the reason is worth stating because it is not
// obvious. Measured on Astro 7.2.10 with the Sätteri content loader:
//
//   * A throw inside an mdast plugin does NOT fail the build. The glob loader
//     catches it, logs `[glob-loader] Error rendering <file>`, and caches the
//     entry with EMPTY rendered content. `astro build` exits 0.
//   * The page still ships — as `<article><h1>Title</h1></article>` and nothing
//     else. The entire body is gone.
//   * On the NEXT build the content cache is warm, so the error is not even
//     logged. Exit 0, no output at all, broken page still in dist/.
//
// So the resolver's unknown-directive throw is good dev feedback and no kind of
// guard. The guard is here: source and dist are compared after the fact, which
// no cache can hide from.
//
// It checks two things:
//   1. Every `:::name` / `::name` in a published source file appears in that
//      page's HTML as its mapped `<tt-*>` element, in at least equal count.
//   2. No published post rendered to an empty body — the signature of the
//      swallowed-throw failure above, whatever caused it.
import { readdir, readFile } from 'node:fs/promises';
import { join, relative } from 'node:path';
import { DIRECTIVE_ELEMENTS } from '../../src/plugins/directives.mjs';

const ROOT = new URL('../../', import.meta.url).pathname;
const DIST = join(ROOT, 'dist');
const POSTS = join(ROOT, 'content/posts');

/** `:::name` or `::name`, at the start of a line, not inside a fenced block. */
function directivesIn(markdown) {
  const body = markdown.replace(/^---\n[\s\S]*?\n---\n/, '');
  const found = new Map();
  let inFence = false;
  for (const line of body.split('\n')) {
    if (/^\s*(```|~~~)/.test(line)) {
      inFence = !inFence;
      continue;
    }
    if (inFence) continue;
    const m = /^(:::?)([a-zA-Z][\w-]*)/.exec(line);
    if (!m) continue;
    found.set(m[2], (found.get(m[2]) ?? 0) + 1);
  }
  return found;
}

function countElement(html, tag) {
  return (html.match(new RegExp(`<${tag}[\\s>]`, 'g')) ?? []).length;
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
let checkedPosts = 0;
let checkedDirectives = 0;

for (const { slug, file } of await listPosts(POSTS)) {
  const source = await readFile(file, 'utf8');
  const htmlPath = join(DIST, 'blog', slug, 'index.html');
  const html = await readFile(htmlPath, 'utf8').catch(() => null);

  if (html === null) {
    // A draft that this build excluded. Run the gate against a build made with
    // TT_INCLUDE_DRAFTS=1 to cover drafts too.
    continue;
  }
  checkedPosts++;

  const bodyMatch = /<article[^>]*>([\s\S]*?)<\/article>/.exec(html);
  const body = bodyMatch ? bodyMatch[1] : html;
  const prose = body.replace(/<h1[^>]*>[\s\S]*?<\/h1>/, '').replace(/<[^>]+>/g, '').trim();
  if (prose.length === 0) {
    failures.push(
      `${relative(ROOT, file)} → /blog/${slug}/ rendered an EMPTY body. This is the ` +
        `signature of a swallowed render error: the build exits 0 and ships the shell. ` +
        `Delete .astro/ and rebuild to see the underlying error.`
    );
    continue;
  }

  for (const [name, count] of directivesIn(source)) {
    const tag = DIRECTIVE_ELEMENTS[name];
    if (!tag) {
      failures.push(
        `${relative(ROOT, file)} uses ":::${name}", which is not in the vocabulary. ` +
          `An unhandled directive is deleted from the output silently.`
      );
      continue;
    }
    checkedDirectives += count;
    const got = countElement(body, tag);
    if (got < count) {
      failures.push(
        `${relative(ROOT, file)} → /blog/${slug}/ : source has ${count} ":::${name}" ` +
          `but the HTML has ${got} <${tag}>. The directive was lost between source and page.`
      );
    }
  }
}

if (failures.length) {
  console.error(`gate:directives FAIL — ${failures.length} problem(s):`);
  for (const f of failures) console.error('  ' + f);
  process.exit(1);
}
console.log(
  `gate:directives: OK — ${checkedPosts} post(s), ${checkedDirectives} directive(s) survived into HTML.`
);
