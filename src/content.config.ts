import { defineCollection, reference } from 'astro:content';
import { glob } from 'astro/loaders';
// Astro 7 deprecates the `z` re-export from `astro:content` in favour of the
// real package, which is a direct dependency so the schema and the validator
// cannot drift to different majors.
import { z } from 'zod';
import { CATEGORY_SLUGS } from './lib/categories';

/**
 * Posts live in `content/`, which is a git submodule (`tamtree-blog-content`)
 * so a writer can clone a repo of nothing but Markdown. The loader treats it as
 * an ordinary directory, so local dev against a plain checkout is identical to
 * CI against the submodule.
 */
const posts = defineCollection({
  loader: glob({ base: './content/posts', pattern: '**/*.md' }),
  schema: ({ image }) =>
    z.object({
      title: z.string().max(120),
      description: z.string().min(40).max(300),
      publishDate: z.coerce.date(),
      updatedDate: z.coerce.date().optional(),
      // Closed, because a category is a route. See lib/categories.ts for why
      // this is an enum and tags are not.
      category: z.enum(CATEGORY_SLUGS),
      tags: z.array(z.string()).default([]),
      author: reference('authors'),
      hero: image().optional(),
      heroAlt: z.string().optional(),
      draft: z.boolean().default(false),
      featured: z.boolean().default(false),
    }),
});

const authors = defineCollection({
  loader: glob({ base: './content/authors', pattern: '**/*.md' }),
  schema: z.object({
    name: z.string(),
    title: z.string().optional(),
    url: z.string().url().optional(),
  }),
});

export const collections = { posts, authors };
