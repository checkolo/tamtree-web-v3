import rss from '@astrojs/rss';
import type { APIRoute } from 'astro';
import { category } from '../../lib/categories';
import { publishedPosts } from '../../lib/posts';

/**
 * T5.2 — the blog's feed. Summaries, not full text: the full text is a fetch
 * away as the post's `.md` sibling (C1), which is what a reader that wants
 * source should take, and a feed carrying rendered HTML would be a third copy
 * of every post to keep in step.
 *
 * `publishedPosts()` applies the draft rule, so a draft can no more leak here
 * than onto the index.
 */
export const GET: APIRoute = async (context) => {
  const posts = await publishedPosts();
  return rss({
    title: 'Tamtree blog',
    description:
      'Notes from building a durable agent runtime — written for the people who will have to operate one.',
    site: new URL('/blog/', context.site).href,
    items: posts.map((post) => ({
      title: post.data.title,
      description: post.data.description,
      pubDate: post.data.publishDate,
      link: `/blog/${post.id}/`,
      categories: [category(post.data.category).label, ...post.data.tags],
    })),
    customData: '<language>en</language>',
  });
};
