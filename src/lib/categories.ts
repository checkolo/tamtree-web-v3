/**
 * The blog taxonomy — closed, and closed deliberately.
 *
 * A category is a URL (`/blog/category/<slug>/`), and a URL is a promise. With
 * `category: z.string()` nothing stops `engineering`, `Engineering` and `eng`
 * from all existing and generating three routes for one idea; the first post
 * with a typo in its front matter silently mints a category page nobody meant
 * to publish. Tightening this after posts exist is a content migration, so it
 * is tightened before there are any.
 *
 * Adding a category is a deliberate act: add it here, and every route, filter
 * and label follows. That is the point — a taxonomy that grows by accident is
 * not a taxonomy.
 *
 * `tags` stay free-form (`z.array(z.string())`) on purpose. They are not routes
 * yet — T6.3 owns that — and a closed tag list would be a tax on writing for no
 * URL guarantee in return.
 */
export const CATEGORIES = [
  {
    slug: 'engineering',
    label: 'Engineering',
    tone: 'brand',
    blurb: 'How the runtime is actually built — the executor protocol, the ledger, and the failures that shaped both.',
  },
  {
    slug: 'architecture',
    label: 'Architecture',
    tone: 'compose',
    blurb: 'The decisions underneath the code: what we chose, what we rejected, and what it cost to find out.',
  },
  {
    slug: 'product',
    label: 'Product',
    tone: 'good',
    blurb: 'What an agent-first workflow tool owes the people who have to operate it.',
  },
] as const;

export type CategorySlug = (typeof CATEGORIES)[number]['slug'];

/** The slugs alone, in the shape Zod's `enum` wants. */
export const CATEGORY_SLUGS = CATEGORIES.map((c) => c.slug) as unknown as [
  CategorySlug,
  ...CategorySlug[],
];

const BY_SLUG = new Map(CATEGORIES.map((c) => [c.slug, c]));

/**
 * The schema guarantees the slug is one of `CATEGORIES`, so this cannot miss
 * for content that built. It still throws rather than returning a placeholder:
 * a category that resolves to "Unknown" on a live page is a bug that ships,
 * and one that fails the build is a bug that does not.
 */
export function category(slug: CategorySlug) {
  const found = BY_SLUG.get(slug);
  if (!found) throw new Error(`Unknown category "${slug}" — not in CATEGORIES.`);
  return found;
}

export const categoryHref = (slug: CategorySlug) => `/blog/category/${slug}/`;
