# Deploying tamtree.io — two repos, one site

The site is **one Vercel project, one domain, one build**. Blog content lives in
a second repository that the build pulls in. There is no second deploy, no
subdomain, and no edge rewrite stitching two sites together.

| Repo | Holds | Triggers a deploy? |
|---|---|---|
| `checkolo/tamtree-web-v3` | The Astro site — every page, component, style and gate | Yes, on push to `main` (Vercel's own git integration) |
| `checkolo/tamtree-blog-content` | Markdown posts, authors, images — nothing else | Yes, on push to `main`, via a deploy hook |

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

### 2. Give the build read access to the content repo

The content repo is private, so the build must authenticate to clone it.

Create a GitHub token with **read-only access to `checkolo/tamtree-blog-content`
and nothing else** — a fine-grained personal access token with `Contents: Read`,
or a machine user's token if you prefer the access not to be tied to a person.

In Vercel → the project → **Settings → Environment Variables**, add:

| Name | Value | Environments |
|---|---|---|
| `TT_CONTENT_TOKEN` | the token | Production, Preview, Development |

Two optional overrides exist and should normally be left unset:
`TT_CONTENT_REPO` (default `github.com/checkolo/tamtree-blog-content.git`) and
`TT_CONTENT_REF` (default `main`). Point `TT_CONTENT_REF` at a branch if you ever
want a preview deploy to build against draft content.

> Without this variable the build **fails**, loudly and on purpose. A missing
> token must not produce a green deploy of a blog with no posts in it.

### 3. Create the deploy hook

Vercel → the project → **Settings → Git → Deploy Hooks**.

- Name: `blog-content`
- Branch: `main`

Copy the URL it gives you. Treat it as a credential — anyone holding it can
trigger builds.

### 4. Give the content repo that hook

GitHub → `checkolo/tamtree-blog-content` → **Settings → Secrets and variables →
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
content sync: github.com/checkolo/tamtree-blog-content.git@main → 7cd0156 (2026-09-03)
```

That line is the answer to "which version of the content is live?", and it is
worth knowing where to find it before you need it.

### When something is wrong

| Symptom | Cause |
|---|---|
| Action fails, "VERCEL_DEPLOY_HOOK is not set" | Step 4 not done |
| Action green, no Vercel build | Hook was deleted or points at another project — recreate it (steps 3–4) |
| Build fails, "content sync FAILED" | `TT_CONTENT_TOKEN` missing, expired, or lacking read access to the content repo |
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
