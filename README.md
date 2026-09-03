# tamtree-web

The Tamtree marketing site — Astro 7, static output, zero JavaScript on the
critical path. This repo is the **build**; the plan it is built from lives in
`~/sites/agent-orchestrator/changes/2026-09-01-tamtree-web2-implementation/`.

Blog **content** lives in a second repo, `tamtree-ai/blog`, which
this build clones into `content/` before every run. One site, one domain, one
deploy — **[DEPLOYMENT.md](DEPLOYMENT.md)** is how to configure it, and is what
you want if you are setting up Vercel.

---

## Prerequisites

| | |
|---|---|
| **Node** | ≥ 22.12 (`engines`) |
| **pnpm** | 11.17.0 (`packageManager` — `corepack enable` is enough) |
| **Google Chrome** | at `/Applications/Google Chrome.app` — the visual, axe, screenshot and Lighthouse gates drive it through `puppeteer-core`. **No browser is downloaded by `pnpm install`.** On a non-mac, edit the `CHROME` constant at the top of the scripts in `scripts/gates/`. |

```sh
pnpm install
```

Nothing else. There is no `.env` to fill in to run the site: the waitlist posts
straight to Buttondown's public embed endpoint, and no key is read at build time.

---

## Run it

```sh
pnpm dev        # http://localhost:4321, hot reload
pnpm build      # → dist/
pnpm preview    # serve the built dist/ on :4330, the way Astro will
pnpm check      # astro check — types + template diagnostics
```

**Develop against `pnpm dev`, not against a build.** Every source edit —
`.astro`, CSS, content — reaches the browser without `pnpm build`. If a page
seems to need a rebuild to change, you are almost certainly looking at built
output rather than the dev server: check that `astro dev` is the process on
4321 (`lsof -nP -iTCP:4321 -sTCP:LISTEN`) and that the tab is not on `dist/`
over `file://`. `dev` now holds 4321 with `strictPort`, so a collision fails
loudly instead of moving the dev server to a port nobody has open; `preview`,
`serve` and the gates all live on 4322+.

`pnpm dev` shows drafts; a production build hides them. To include them in a
build, put `TT_INCLUDE_DRAFTS=1` in a `.env` file — it is read through
`import.meta.env`, and Vite does not pick up a plain shell variable.

---

## The gates

Fidelity, accessibility and content contracts are **checked, not eyeballed**.
Every gate is a plain Node script under `scripts/gates/`, and each one's header
comment explains what it proves and why it exists — those comments are the real
documentation; this is the index.

```sh
pnpm gates      # tokens · runs · md · directives · copy · semantic · links · axe · visual
```

> **Most gates read `dist/`, so run `pnpm build` first.** `pnpm gates` does not
> build for you — deliberately, so you can iterate on one gate without paying
> for a build each time.

| Gate | Needs a build | What it proves |
|---|---|---|
| `gate:tokens` | no | The two dark palette blocks are identical, every dark token also has a light value on bare `:root`, and every `var(--token)` in `src/` resolves. Reads the stylesheet, not the build. |
| `gate:runs` | no | Committed run fixtures parse against the §17.4 schema, **and** every field this site requires is still emitted by the product's own `events.py`. Skips cleanly when the product repo is not checked out; point `TAMTREE_EVENTS_PY` at it otherwise. |
| `gate:licenses` | no | Dependency licences, via `pnpm licenses list`. `lightningcss` (MPL-2.0) is a stated, build-time-only exception. |
| `gate:md` | yes | Every published post ships a machine-readable `.md` sibling (C1). |
| `gate:directives` | yes | Every `:::name` in the source survives into HTML as its `<tt-*>` element — **and** no post rendered an empty body. See the trap below; this gate is the guard, the resolver's throw is only dev feedback. |
| `gate:copy` | yes | Copy strings match their source of truth. |
| `gate:semantic` | yes | Heading levels, landmarks, and the document outline. |
| `gate:links` | yes | Crawls `dist/`; fails on broken internal links, anchors and assets. External links are written to `reports/external-links.txt` rather than fetched. |
| `gate:axe` | yes | axe-core on each route, **in both colour schemes**. Running both has already paid for itself twice. |
| `gate:visual` | yes | The built pages against the four frozen artboards. See below. |
| `gate:lighthouse` | yes | Performance/SEO budgets, via `npx lighthouse`. |
| `gate:screenshots` | yes | A PNG per route, for review rather than for pass/fail. |

### gate:visual

```sh
pnpm artboards:export     # design/artboards/*.dc.html → design/reference/*.png
pnpm build
pnpm gate:visual
```

The reference PNGs are **gitignored on purpose**: committing them would make
font rasterisation differences between machines look like design failures.
Export them once per checkout.

It diffs at **1440 and 390 only**, in **both themes**, with reduced motion
emulated on both sides. The artboards define the design at their own two widths
and nowhere else, so a claim about any width between them would be a claim about
the build's interpolation rather than about the design.

| Variable | Default | Use |
|---|---|---|
| `TT_VISUAL_TOLERANCE` | `0.5` | Share of pixels allowed to differ, as a percentage. |
| `TT_VISUAL_CLIP` | `0` (whole page) | Compare only the top N CSS pixels. This is how a section is measured the day it is ported, before the ones below it exist. **A full-height run is the real gate.** |
| `TT_VISUAL_ROUTE` | `/` | Which route to diff. |

Failures land in `design/diff/` as three PNGs per artboard — reference, actual,
and the diff mask. Read the mask first; it usually says "a few pixels of drift
per section, accumulating downward", which is a different fix from "one section
is wrong".

---

## Layout

```
src/
  brand/        tokens.css, base.css, scene.css, theme-init.js — the design system
  components/   primitives (Button, Chip, Eyebrow, Mark…) + sections/ for the homepage
  layouts/      Base.astro — <head>, nav, footer, the pre-paint theme script
  pages/        index.astro, blog/
  data/         figures the sections render (hero-run, cost-ledger)
  lib/          the fold from run events to a view, shared by everything that draws a run
  schemas/      the run-event schema gate:runs checks
  plugins/      the `:::directive` resolver
  content/      posts, authors, run fixtures
design/
  artboards/    the four frozen .dc.html artboards — the design's source of truth
  reference/    exported PNGs (gitignored)
  diff/         gate:visual output (gitignored)
scripts/
  gates/        one file per gate; the header comments are the spec
  artboards/    the artboard → PNG exporter
  runs/         record.mjs — capture a real run from the product as a fixture
docs/           decisions that outlive a task (waitlist.md is the provider contract)
```

### Theming

Three states: an explicit choice stamps `data-theme` on `<html>`; the default
stamps nothing and `prefers-color-scheme` decides. Every colour is defined on
bare `:root` and **redefined** in both dark blocks — never defined only inside a
media or `[data-theme]` block. `gate:tokens` enforces exactly this, because the
duplication is structural (CSS cannot share one block across a media boundary)
and structural duplication drifts.

`.island` is the third case: sections that are ink-black in *both* themes assert
the dark palette locally, so one DOM serves both themes rather than two.

---

## Writing content

Posts are Markdown under `content/posts/`, rendered through Sätteri with
Expressive Code and a small set of `:::directives`.

**One authoring trap, worth knowing before you write anything.** A Markdown
table runs until a blank line — so a closing `:::` written directly under the
last row is swallowed *as part of the table* rather than closing the block, and
the block then runs to EOF, eating every directive after it. Only tables do
this; lists, paragraphs and fenced code all close normally. Leave a blank line
before the `:::`. The resolver detects that exact signature and says so.

**A typo in a directive name does not fail the build.** A throw inside an mdast
plugin is caught by the glob loader, which caches the entry with an empty body
and exits 0 — and on the next build the cache is warm, so it is not even logged.
That is why `gate:directives` also fails any post that rendered an empty body,
and why it belongs in CI rather than in your habits.

---

## Recording a run fixture

The site never calls the product at build time. Fixtures are recorded by a human
against a running product and committed:

```sh
node scripts/runs/record.mjs <run-id> <fixture-id> --title "…" \
  [--api http://localhost:8000] [--token $TAMTREE_TOKEN]
```

Every figure a section draws — the hero's run, §06's ledger — comes from a
fixture through `src/lib/`. Where a number is a *configured budget* rather than a
measurement (the `$2.00` cap), it stays a literal; and a meter renders 0% rather
than a proportion when its total is unmeasured, because a bar drawn from a
missing number is a claim about a run nobody made.

---

## Deploying

Vercel, static output, `trailingSlash: 'always'`. Headers and CSP live in
`vercel.json` and **cannot be verified locally** — check them with `curl -sI`
against a preview deployment.
