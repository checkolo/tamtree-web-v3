/**
 * JSON-LD for C4 contract 4 — one builder per schema.org type the site emits.
 *
 * **Nothing here is a claim the page does not make.** No `offers`, no prices,
 * no `aggregateRating`: Google's rich results want them for a
 * SoftwareApplication, and inventing them to earn a star widget is exactly the
 * marketing-site lie V3 rules out. What an answer engine repeats about Tamtree
 * should be what the page says, so every string below is either the page's own
 * copy (passed in) or a fact true of the site as a whole.
 *
 * Entities reference each other by `@id` rather than nesting copies, so the
 * Organization a post names as publisher is the same node the homepage
 * describes, not a second, slightly different one.
 */
export const SITE = 'https://www.tamtree.io';
export const ORG_ID = `${SITE}/#organization`;
export const WEBSITE_ID = `${SITE}/#website`;
export const APP_ID = `${SITE}/#software`;

const abs = (path: string) => new URL(path, SITE).href;

export function organization() {
  return {
    '@type': 'Organization',
    '@id': ORG_ID,
    name: 'Tamtree',
    url: `${SITE}/`,
    logo: abs('/icon-512.png'),
    // The public org that hosts the blog's source — the one external identity
    // the site already links its content to.
    sameAs: ['https://github.com/tamtree-ai'],
  };
}

export function website() {
  return {
    '@type': 'WebSite',
    '@id': WEBSITE_ID,
    name: 'Tamtree',
    url: `${SITE}/`,
    publisher: { '@id': ORG_ID },
    inLanguage: 'en',
  };
}

export function softwareApplication(description: string) {
  return {
    '@type': 'SoftwareApplication',
    '@id': APP_ID,
    name: 'Tamtree',
    description,
    url: abs('/product/'),
    applicationCategory: 'DeveloperApplication',
    operatingSystem: 'Web',
    publisher: { '@id': ORG_ID },
  };
}

export interface Crumb {
  label: string;
  href?: string;
}

/**
 * A breadcrumb trail as the page draws it, with Home prepended — the visible
 * trail starts one level down, but schema.org wants the whole path. The last
 * crumb is the current page and has no href, so it takes the page's own URL.
 */
export function breadcrumbs(crumbs: Crumb[], currentPath: string) {
  const trail = [{ label: 'Home', href: '/' }, ...crumbs];
  return {
    '@type': 'BreadcrumbList',
    itemListElement: trail.map((c, i) => ({
      '@type': 'ListItem',
      position: i + 1,
      name: c.label,
      item: abs(c.href ?? currentPath),
    })),
  };
}

export interface PostFacts {
  path: string;
  title: string;
  description: string;
  published: Date;
  updated?: Date;
  section: string;
  tags: string[];
  author: { name: string; url?: string };
  image?: string;
  markdownPath: string;
}

export function blogPosting(p: PostFacts) {
  return {
    '@type': 'BlogPosting',
    '@id': `${abs(p.path)}#article`,
    headline: p.title,
    description: p.description,
    datePublished: p.published.toISOString(),
    dateModified: (p.updated ?? p.published).toISOString(),
    articleSection: p.section,
    ...(p.tags.length ? { keywords: p.tags.join(', ') } : {}),
    author: { '@type': 'Person', name: p.author.name, ...(p.author.url ? { url: p.author.url } : {}) },
    publisher: { '@id': ORG_ID },
    isPartOf: { '@id': WEBSITE_ID },
    mainEntityOfPage: abs(p.path),
    image: abs(p.image ?? '/og-default.png'),
    inLanguage: 'en',
    // The source the page is a rendering of (C1) — an extractor that prefers
    // Markdown is told where it is in the data it already reads.
    encoding: { '@type': 'MediaObject', encodingFormat: 'text/markdown', contentUrl: abs(p.markdownPath) },
  };
}

/** One `@graph` per page, so the entities above can reference each other. */
export function graph(nodes: object[]) {
  return { '@context': 'https://schema.org', '@graph': nodes };
}

/**
 * Where a page's Markdown sibling lives (C4 contract 2): `/` → `/index.md`,
 * `/product/x/` → `/product/x.md`. The same rule `src/plugins/agents.mjs`
 * writes the files by — change one, change both.
 */
export function markdownPathFor(pathname: string): string {
  const trimmed = pathname.replace(/\/+$/, '');
  return trimmed === '' ? '/index.md' : `${trimmed}.md`;
}
