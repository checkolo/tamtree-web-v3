import { getCollection, type CollectionEntry } from 'astro:content';

export type Post = CollectionEntry<'posts'>;

/**
 * Every post the current build is allowed to show, newest first.
 *
 * **Ordering.** `publishDate` descending, and nothing else. There is no
 * popularity signal on a static site with no analytics, and inventing one — a
 * hand-kept "trending" list, a read-count nobody increments — is a lie the
 * markup would have to keep telling. Ties break on `id` so the order is total
 * and a build is reproducible: two posts sharing a date must not swap places
 * between builds and churn the visual gate.
 *
 * **Drafts** follow the same rule as the post route: visible in dev and under
 * TT_INCLUDE_DRAFTS, never in a production build. The rule lives here rather
 * than at each call site so a new page cannot forget it and leak a draft.
 */
export async function publishedPosts(): Promise<Post[]> {
  const includeDrafts = import.meta.env.DEV || !!import.meta.env.TT_INCLUDE_DRAFTS;
  const posts = await getCollection('posts', ({ data }) => includeDrafts || !data.draft);
  return posts.sort((a, b) => {
    const d = b.data.publishDate.valueOf() - a.data.publishDate.valueOf();
    return d !== 0 ? d : a.id.localeCompare(b.id);
  });
}

/**
 * The index's lead slot: the post flagged `featured`, or the newest one if
 * nothing is flagged. The caller is told which it got, because the badge has to
 * say the truth — a "Featured" pill over a post that is merely the most recent
 * is the kind of small lie that makes the rest of a page harder to believe.
 */
export function lead(posts: Post[]) {
  const flagged = posts.find((p) => p.data.featured);
  return flagged
    ? { post: flagged, reason: 'featured' as const }
    : posts.length
      ? { post: posts[0], reason: 'latest' as const }
      : null;
}

/** Rough reading time. Rounded up, floored at one minute. */
export function readingMinutes(body: string | undefined): number {
  const words = (body ?? '').trim().split(/\s+/).filter(Boolean).length;
  return Math.max(1, Math.ceil(words / 220));
}
