import type { APIRoute, GetStaticPaths } from 'astro';
import { getCollection } from 'astro:content';

/**
 * C1 contract 1 — the `.md` file is the artifact and the page is a rendering of
 * it, so the source is published alongside every post at `/blog/<slug>.md`.
 *
 * The body is served exactly as authored, normalised only for line endings and
 * trailing whitespace (D14). `gate:md` asserts source and published copy agree
 * under that same normalisation.
 */
export const getStaticPaths: GetStaticPaths = async () => {
  const includeDrafts = import.meta.env.DEV || !!import.meta.env.TT_INCLUDE_DRAFTS;
  const posts = await getCollection('posts', ({ data }) => includeDrafts || !data.draft);
  return posts.map((post) => ({ params: { slug: post.id }, props: { post } }));
};

export const GET: APIRoute = ({ props }) => {
  const { post } = props as { post: { body?: string } };
  return new Response(post.body ?? '', {
    headers: { 'Content-Type': 'text/markdown; charset=utf-8' },
  });
};
