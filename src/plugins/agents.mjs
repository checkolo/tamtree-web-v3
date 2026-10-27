// The machine-readable corpus (C4 contracts 2–3, C1 contract 3, T5.1–T5.2).
//
// Runs at `astro:build:done`, so it happens inside every `astro build` —
// `pnpm build` and `make deploy`'s bare `pnpm exec astro build` alike — and it
// reads nothing but `dist/`. That is the point: the corpus is derived from the
// pages the build actually produced, so it cannot list a route that does not
// exist or describe a page in words the page does not use.
//
// What it writes:
//
//   * a Markdown sibling for every page that is not a post — `/` → `/index.md`,
//     `/product/x/` → `/product/x.md` (the rule is `markdownPathFor` in
//     src/lib/seo.ts; change one, change both). Converted from the page's
//     <main>, with decoration (`aria-hidden`), hidden status text, forms and
//     scripts dropped. Posts are never touched: their `.md` is the source
//     itself (C1 contract 1) and gate:md holds it to that.
//   * /llms.txt and /llms-full.txt — the whole site, per llmstxt.org.
//   * /blog/llms.txt and /blog/llms-full.txt — posts only (C1 contract 3).
//
// Pages carrying `<meta name="robots" content="noindex">` (the 404) are left
// out of everything.

import { readdir, readFile, writeFile, mkdir, stat } from 'node:fs/promises';
import { dirname, join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import TurndownService from 'turndown';
import { gfm } from 'turndown-plugin-gfm';

const SUMMARY =
  'Tamtree is an agent-first workflow orchestrator: deterministic pipelines and autonomous agent ' +
  'crews on one crash-proof engine, with guardrails, evals and budgets built in.';

// Order in the index: what a reader asking "what is Tamtree?" needs first.
// Anything not listed sorts after, alphabetically, so a new page is never lost.
const PAGE_ORDER = ['/', '/product/', '/how-it-works/', '/blog/'];

const markdownPathFor = (pathname) => {
  const trimmed = pathname.replace(/\/+$/, '');
  return trimmed === '' ? '/index.md' : `${trimmed}.md`;
};

const ENTITIES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' };
const decode = (s) =>
  s.replace(/&(#x[0-9a-f]+|#\d+|\w+);/gi, (m, e) =>
    e[0] === '#'
      ? String.fromCodePoint(e[1].toLowerCase() === 'x' ? parseInt(e.slice(2), 16) : +e.slice(1))
      : (ENTITIES[e.toLowerCase()] ?? m)
  );

const meta = (html, attr, name) => {
  const re = new RegExp(`<meta[^>]*${attr}="${name}"[^>]*content="([^"]*)"`, 'i');
  const m = html.match(re);
  return m ? decode(m[1]) : undefined;
};

async function htmlFiles(dir, out = []) {
  for (const e of await readdir(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) {
      if (e.name !== '_astro') await htmlFiles(p, out);
    } else if (e.name === 'index.html') out.push(p);
  }
  return out;
}

function converter(site) {
  const td = new TurndownService({
    headingStyle: 'atx',
    codeBlockStyle: 'fenced',
    bulletListMarker: '-',
    emDelimiter: '*',
  });
  td.use(gfm);
  // `nav` is the breadcrumb trail; the page's place in the site is what
  // llms.txt and the JSON-LD BreadcrumbList already say.
  td.remove(['script', 'style', 'svg', 'canvas', 'form', 'iframe', 'noscript', 'template', 'button', 'nav']);
  // Decoration and not-yet-shown status text. `aria-hidden` is the page's own
  // statement that something carries no meaning; trusting it here is what
  // gate:semantic and gate:axe already hold the markup to.
  td.addRule('hidden', {
    filter: (node) =>
      node.nodeType === 1 && (node.getAttribute('aria-hidden') === 'true' || node.hasAttribute('hidden')),
    replacement: () => '',
  });
  // The animated scenes are drawings of a run, and as text they read as a
  // jumble of labels. C3 already makes each one carry a prose caption for
  // exactly this reader, so the caption stands in for the drawing. A figure
  // holding a table, image or code is real content and converts as usual.
  td.addRule('illustration', {
    filter: (node) =>
      node.nodeName === 'FIGURE' && !!node.querySelector('figcaption') && !node.querySelector('table, img, pre'),
    replacement: (_, node) => `\n\n*Illustration: ${node.querySelector('figcaption').textContent.trim()}*\n\n`,
  });
  return (html) =>
    td
      .turndown(
        html
          // A display heading's <br> is a visual line break, not a Markdown
          // hard break — which would end an ATX heading mid-sentence.
          .replace(/<br\b[^>]*>/gi, ' ')
          // CSS spaces adjacent inline elements apart; as text they would
          // fuse ("own.Tamtree", "step 7resumed").
          .replace(/<\/(span|em|strong|b|i|a|code|small|time|mark)>(?=<[a-z]|[A-Za-z0-9])/gi, '</$1> ')
          .replace(/([.!?:;])(?=<(span|em|strong|a)\b)/gi, '$1 ')
      )
      // Site-relative URLs made absolute: a Markdown file is read out of
      // context, often far from the origin that would resolve `/product/`.
      .replace(/\]\((\/[^)\s]*)/g, (_, p) => `](${new URL(p, site).href}`)
      .replace(/\n{3,}/g, '\n\n')
      .trim();
}

async function exists(p) {
  return (await stat(p).catch(() => null))?.isFile() ?? false;
}

export function agentsCorpus() {
  let site;
  return {
    name: 'tamtree:agents-corpus',
    hooks: {
      'astro:config:done': ({ config }) => {
        site = config.site;
      },
      'astro:build:done': async ({ dir, logger }) => {
        const dist = fileURLToPath(dir);
        const toMarkdown = converter(site);
        const pages = [];
        const posts = [];

        for (const file of await htmlFiles(dist)) {
          const html = await readFile(file, 'utf8');
          if (/<meta[^>]*name="robots"[^>]*content="[^"]*noindex/i.test(html)) continue;

          const rel = relative(dist, dirname(file)).split(sep).join('/');
          const path = rel ? `/${rel}/` : '/';
          const mdPath = markdownPathFor(path);
          const mdFile = join(dist, mdPath);
          const title = decode(html.match(/<title>([^<]*)<\/title>/i)?.[1] ?? path).replace(/ · Tamtree$/, '');
          const entry = {
            path,
            title,
            description: meta(html, 'name', 'description') ?? '',
            url: new URL(path, site).href,
            mdUrl: new URL(mdPath, site).href,
            published: meta(html, 'property', 'article:published_time'),
          };

          if (entry.published) {
            // A post. Its sibling is the source, written by the .md route.
            if (!(await exists(mdFile))) throw new Error(`[agents] ${path} is a post with no ${mdPath}`);
            entry.body = (await readFile(mdFile, 'utf8')).trim();
            posts.push(entry);
            continue;
          }

          const main = html.match(/<main\b[^>]*>([\s\S]*)<\/main>/i)?.[1];
          if (!main) throw new Error(`[agents] ${path} has no <main> to convert`);
          entry.body = toMarkdown(main);
          if (!entry.body) throw new Error(`[agents] ${path} converted to empty Markdown`);
          await mkdir(dirname(mdFile), { recursive: true });
          await writeFile(mdFile, `${entry.body}\n`);
          pages.push(entry);
        }

        const rank = (p) => {
          const i = PAGE_ORDER.indexOf(p.path);
          return i === -1 ? PAGE_ORDER.length : i;
        };
        pages.sort((a, b) => rank(a) - rank(b) || a.path.localeCompare(b.path));
        posts.sort((a, b) => b.published.localeCompare(a.published) || a.path.localeCompare(b.path));

        const line = (e) => `- [${e.title}](${e.mdUrl}): ${e.description}`;
        const fullEntry = (e) =>
          [`# ${e.title}`, '', `Source: ${e.url}`, ...(e.published ? [`Published: ${e.published.slice(0, 10)}`] : []), '', e.body].join('\n');

        const root = new URL('/', site).href;
        const llms = [
          '# Tamtree',
          '',
          `> ${SUMMARY}`,
          '',
          `Every page on ${root} has a Markdown sibling, linked below. The full text of every page and post ` +
            `in one file is at ${new URL('/llms-full.txt', site).href}.`,
          '',
          '## Pages',
          '',
          ...pages.map(line),
          '',
          '## Blog',
          '',
          ...posts.map(line),
          '',
          '## Optional',
          '',
          `- [Blog feed](${new URL('/blog/rss.xml', site).href}): RSS, newest first`,
          `- [Sitemap](${new URL('/sitemap-index.xml', site).href})`,
          '',
        ].join('\n');

        const blogLlms = [
          '# Tamtree blog',
          '',
          '> Notes from building a durable agent runtime — written for the people who will have to operate one.',
          '',
          `Each post's Markdown source is linked below. All of them in one file: ${new URL('/blog/llms-full.txt', site).href}.`,
          '',
          '## Posts',
          '',
          ...posts.map(line),
          '',
        ].join('\n');

        const sep2 = '\n\n---\n\n';
        await writeFile(join(dist, 'llms.txt'), llms);
        await writeFile(join(dist, 'llms-full.txt'), `# Tamtree\n\n> ${SUMMARY}${sep2}${[...pages, ...posts].map(fullEntry).join(sep2)}\n`);
        await mkdir(join(dist, 'blog'), { recursive: true });
        await writeFile(join(dist, 'blog', 'llms.txt'), blogLlms);
        await writeFile(join(dist, 'blog', 'llms-full.txt'), `${posts.map(fullEntry).join(sep2)}\n`);

        logger.info(`${pages.length} page .md siblings, ${posts.length} posts → llms.txt, llms-full.txt, blog/llms*.txt`);
      },
    },
  };
}
