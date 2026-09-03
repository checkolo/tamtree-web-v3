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

  /**
   * `strictPort` is the point of this block, not the port number.
   *
   * Without it, a `pnpm preview` or `pnpm serve` already holding 4321 makes
   * `astro dev` step quietly onto 4322 — and the tab left open at
   * localhost:4321 then shows a STATIC BUILD that never reloads, which reads
   * exactly like "HMR is broken" while the dev server is happily hot-reloading
   * on a port nobody is looking at. 4322 is also the screenshots gate's port,
   * so the drift lands on a second collision. Fail on the first one instead.
   */
  server: { port: 4321, host: true },
  vite: { server: { strictPort: true } },

  build: {
    // `/blog/<slug>.md` siblings (C1) are emitted as real files, so directory
    // -style page output must not swallow the extension.
    format: 'directory',
  },
});
