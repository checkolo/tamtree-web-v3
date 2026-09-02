// @ts-check
import { defineConfig } from 'astro/config';
import { satteri } from '@astrojs/markdown-satteri';
import sitemap from '@astrojs/sitemap';
import expressiveCode from 'astro-expressive-code';

import { ttDirectives } from './src/plugins/directives.mjs';

/**
 * ⚠ `markdown.processor` MUST be set explicitly to `satteri(...)`.
 *
 * astro-expressive-code branches on it (dist/index.js:507–526): a Sätteri
 * processor gets a *hast* plugin, a unified processor gets a *rehype* plugin,
 * and an UNSET processor falls through to the rehype branch. Under Sätteri that
 * rehype plugin is never run — every fenced block would ship unhighlighted with
 * no error at all. The explicit processor below is what keeps that branch live.
 *
 * Corollary: `expressiveCode()` must appear in `integrations` and the processor
 * instance must be the same object it mutates, i.e. defined inline here.
 */
export default defineConfig({
  site: 'https://www.tamtree.io',
  trailingSlash: 'always',
  output: 'static',

  markdown: {
    processor: satteri({
      features: {
        directive: true,
        gfm: true,
        frontmatter: true,
      },
      mdastPlugins: [ttDirectives()],
    }),
  },

  integrations: [
    expressiveCode({
      themes: ['github-dark', 'github-light'],
      themeCssSelector: (theme) => `[data-code-theme='${theme.name}']`,
      styleOverrides: {
        borderRadius: 'var(--radius-md, 10px)',
        codeFontFamily: 'var(--mono)',
        uiFontFamily: 'var(--body)',
      },
    }),
    sitemap(),
  ],

  build: {
    // `/blog/<slug>.md` siblings (C1) are emitted as real files, so directory
    // -style page output must not swallow the extension.
    format: 'directory',
  },
});
