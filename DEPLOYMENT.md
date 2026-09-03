# Deploying tamtree.io — two repos, one site

The site is **one Vercel project, one domain, one build**. Blog content lives in
a second repository that the build pulls in. There is no second deploy, no
subdomain, and no edge rewrite stitching two sites together.

| Repo | Holds | Triggers a deploy? |
|---|---|---|
| `checkolo/tamtree-web-v3` | The Astro site — every page, component, style and gate | Yes, on push to `main` (Vercel's own git integration) |
| `tamtree-ai/blog` | Markdown posts, authors, images — nothing else. Public, read-only to the world | Yes, on push to `main`, via a deploy hook |

`/blog/` is therefore an ordinary part of the site, not an integration. It
shares the origin, so the theme toggle survives navigating between the homepage
and a post; it shares the markdown corpus that `llms.txt` is built from; and it
will share one search index. Those three are the reason this is not two deploys.

---

## Why content is fetched, not submodule-pinned

A git submodule records a **commit SHA** in the consuming repo. Publishing a
post would mean pushing to the content repo *and then* committing a pointer bump
to the site repo — the site would show stale content until someone did.

So `content/` is **gitignored** in the site repo and cloned at build time by
`scripts/content/sync.mjs`, at HEAD of the content repo's `main`. The site repo
records no pointer at all, and publishing a post is one `git push`.

---

## Setup — five steps, all in dashboards

### 1. Import the site repo into Vercel

Import `checkolo/tamtree-web-v3`. `vercel.json` in the repo already sets the
framework, build command, output directory, `trailingSlash` and every response
header, so accept what it detects and change nothing.

Confirm the **Production Branch** is `main`.

**Why each header block exists** (`vercel.json`'s schema rejects `//` comment
keys inside a header entry, so the rationale lives here instead):

- `/blog/:slug/` → `Link: </blog/:slug.md>; rel="alternate"`. Astro's
  `output: 'static'` writes files, not response headers, so this RFC 8288
  pointer to the markdown sibling is host configuration and can only live
  here — without it, the sibling `.md` is undiscoverable to anything that
  doesn't already know the convention.
- `/(.*).md` → served as `text/markdown` so a fetch renders as source rather
  than downloading, and `noindex` since the `.md` is a sibling of the real
  page, not a second page to rank.
- `/(llms|llms-full).txt` → `text/plain`, deliberately crawlable — these
  exist to be read by machines.
- `/(.*)` → the CSP's `form-action` allows `buttondown.email` because the
  waitlist form POSTs there directly (no runtime or database of ours sits
  between); `style-src 'unsafe-inline'` is for Expressive Code, which sets
  per-token colours as style attributes. `style-src`/`font-src` also allowlist
  `fonts.googleapis.com`/`fonts.gstatic.com` — Bricolage Grotesque, Instrument
  Sans and JetBrains Mono are loaded from Google Fonts (`Base.astro`'s
  `<link>`s), a real cross-origin fetch a `'self'`-only policy silently
  drops, with no console error to point at. `script-src` does **not** allow
  `'unsafe-inline'` — Astro's `vite.build.assetsInlineLimit: 0`
  (`astro.config.mjs`) forces every page's own `<script>` out to an external,
  `'self'`-origin file instead of being inlined below the 4KB default, which
  is what a bare `script-src 'self'` needs to run them at all. The one
  exception is the pre-paint theme block (`Base.astro`'s `is:inline` script,
  sourced from `theme-init.js`) — it must run before the first stylesheet, so
  it can't be a deferred module. It's allowed by exact hash
  (`'sha256-dc4Dkcbb+LDKAowpbGY8L3pvQ4vSff6qtm4WUVZQwyA='`), not
  `'unsafe-inline'`, so **editing `theme-init.js` means recomputing that hash**
  (`openssl dgst -sha256 -binary src/brand/theme-init.js | openssl base64 -A`)
  and updating it in `vercel.json`, or the script silently stops running in
  production — same failure mode as the two bugs above, just for one specific
  script instead of all of them.

### 2. Nothing to authenticate — the content repo is public

`tamtree-ai/blog` is a public repo, so `scripts/content/sync.mjs` clones it
over a plain `https://` URL with no credential. No Vercel environment variable
is required for this step.

Public means **readable, not writable** — GitHub does not grant outsiders push
access just because a repo can be cloned. Only org members/collaborators with
Write can push, and the org's default repository permission is `read`. The
trade-off worth knowing: since the repo is public, unpublished (`draft: true`)
posts are readable by anyone who looks at the repo directly, even though they
never render on the site.

Two optional overrides exist and should normally be left unset:
`TT_CONTENT_REPO` (default `github.com/tamtree-ai/blog.git`) and
`TT_CONTENT_REF` (default `main`). Point `TT_CONTENT_REF` at a branch if you
ever want a preview deploy to build against draft content.

A `TT_CONTENT_TOKEN` environment variable is still supported as an escape
hatch (e.g. cloning a private fork for a sensitive preview), but is not needed
for the normal public-repo path.

### 3. Create the deploy hook

Vercel → the project → **Settings → Git → Deploy Hooks**.

- Name: `blog-content`
- Branch: `main`

Copy the URL it gives you. Treat it as a credential — anyone holding it can
trigger builds.

### 4. Give the content repo that hook

GitHub → `tamtree-ai/blog` → **Settings → Secrets and variables →
Actions → New repository secret**.

- Name: `VERCEL_DEPLOY_HOOK`
- Value: the URL from step 3

The workflow at `.github/workflows/deploy-site.yml` in that repo is already
written and waiting for it. It fires on pushes touching `posts/`, `authors/` or
`images/`, collapses a burst of pushes into one deploy, and fails red if the
secret is missing or the hook returns an error.

### 5. Attach the domain

Vercel → **Settings → Domains** → add `www.tamtree.io` and redirect the apex to
it. `astro.config.mjs` sets `site: 'https://www.tamtree.io'`, which is what
canonical URLs, the sitemap and the RSS feed are generated from — so if the
production domain ever changes, change it there too or every canonical URL will
point at the old one.

---

## Verifying it works

After step 5, prove the loop end to end rather than assuming it:

1. In the content repo, edit any post and push to `main`.
2. GitHub → Actions → the **Deploy site** run goes green.
3. Vercel → Deployments → a new production build starts within a few seconds,
   with no push to the site repo.
4. The change is live.

Then check the build log for the sync line, which names the exact content commit
the site was built from:

```
content sync: github.com/tamtree-ai/blog.git@main → 7cd0156 (2026-09-03)
```

That line is the answer to "which version of the content is live?", and it is
worth knowing where to find it before you need it.

### When something is wrong

| Symptom | Cause |
|---|---|
| Action fails, "VERCEL_DEPLOY_HOOK is not set" | Step 4 not done |
| Action green, no Vercel build | Hook was deleted or points at another project — recreate it (steps 3–4) |
| Build fails, "content sync FAILED" | Network/GitHub outage, or `tamtree-ai/blog` was made private without setting `TT_CONTENT_TOKEN` |
| Post pushed but not on the site | It is `draft: true`; drafts never ship to production |
| Build fails on an unknown directive | The vocabulary is closed. The error names the line and lists the valid names |
| Build fails, `gate:links` | A post links to a page that does not exist yet |

---

## Local development

```bash
git clone git@github.com:checkolo/tamtree-web-v3.git
cd tamtree-web-v3
pnpm install
pnpm dev            # clones content/ on first run, then serves on :4321
```

`pnpm dev` and `pnpm build` both sync content first. Three things about that are
worth knowing:

- **A dirty `content/` is never touched.** If you have uncommitted edits in
  there, the sync leaves them alone and says so. Your draft always beats
  freshness.
- **`TT_CONTENT_LOCAL=1` skips the sync entirely**, for working offline or
  against a branch you checked out by hand.
- **Drafts are visible in `pnpm dev`** and in any build made with
  `TT_INCLUDE_DRAFTS=1`. They are never in a production build.

To write a post, work in `content/` directly — it is a normal clone of the
content repo, so commit and push from inside it.

---

## Images

Post images live in the **content** repo, under `images/`, and are pushed the
same way posts are — nothing extra to configure in Vercel.

The one thing worth knowing is that the build now optimizes them, which needs
`sharp` (a dependency of the site repo, installed by `pnpm install` like any
other). Vercel's Node runtime builds it without help. If it is ever missing, the
build **fails loudly** with `Could not find Sharp` rather than shipping the
originals — which is the behaviour you want: a silently unoptimized hero is a
2 MB page nobody notices until the Lighthouse score arrives.

The artwork in `content/images/` was generated by `scripts/art/posts.mjs` in the
site repo. That generator lives here rather than in the content repo on purpose:
the content repo is Markdown with nothing to install, and it stays that way. Run
it here, commit the PNGs there.

## What is deliberately not here

- **No preview deploy per content PR.** Contributors are a small known team, and
  the local path above covers the same need without a second pipeline to
  maintain.
- **No CDN rewrite or subdomain.** Both would split the origin, and with it the
  theme toggle, the markdown corpus and the search index.
- **No CMS.** The markdown file *is* the artifact — it is published at
  `/blog/<slug>.md` alongside the page, and a build that renders a post
  differently from its source fails `gate:md`.
