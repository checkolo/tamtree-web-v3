import { defineCollection, reference } from 'astro:content';
import { glob } from 'astro/loaders';
// Astro 7 deprecates the `z` re-export from `astro:content` in favour of the
// real package, which is a direct dependency so the schema and the validator
// cannot drift to different majors.
import { z } from 'zod';
import { CATEGORY_SLUGS } from './lib/categories';

/**
 * Posts live in `content/`, a separate repo (`tamtree-ai/blog`) so a writer
 * can clone nothing but Markdown. It is *not* a submodule: a submodule pins a
 * SHA here, so publishing a post would need a pointer bump committed to this
 * repo. `scripts/content/sync.mjs` clones it at HEAD before every build
 * instead, and pushing to the content repo triggers that build.
 *
 * The loader neither knows nor cares — `content/` is an ordinary directory by
 * the time Astro looks at it, which is what keeps local dev against a plain
 * checkout identical to CI.
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
    })
      /**
       * A hero without alt text is a build failure, not a warning.
       *
       * `heroAlt` cannot simply be required — it is meaningless without a hero
       * — and it cannot be defaulted, because every default anyone would reach
       * for ("", the title) is worse than nothing: an empty alt is valid HTML
       * meaning *decorative, skip me*, and the title repeats what the screen
       * reader just read. So the pair is validated together, which is the only
       * place the "hero set, alt missing" state is visible at all.
       */
      .refine((d) => !d.hero || (d.heroAlt ?? '').trim().length > 0, {
        path: ['heroAlt'],
        message:
          'heroAlt is required when hero is set — describe what the image shows. ' +
          'An empty alt tells a screen reader to skip the image; the title tells it ' +
          'the same thing twice.',
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
