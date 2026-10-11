# Deploying tamtree.io — two repos, one site

The site is **one build, one domain, one folder on one server**. Blog content
lives in a second repository that the build pulls in. There is no second
deploy, no subdomain, and no rewrite stitching two sites together.

| Repo | Holds | How it ships |
|---|---|---|
| `checkolo/tamtree-web-v3` | The Astro site — every page, component, style and gate | `make deploy`, from a clean `main` |
| `tamtree-ai/blog` | Markdown posts, authors, images — nothing else. Public, read-only to the world | Push there, then `make deploy` here |

`/blog/` is therefore an ordinary part of the site, not an integration. It
shares the origin, so the theme toggle survives navigating between the homepage
and a post; it shares the markdown corpus that `llms.txt` is built from; and it
will share one search index. Those three are the reason this is not two deploys.

---

## Day to day

```bash
make deploy ARGS=--check    # what would ship; changes nothing on the server
make deploy                 # sync content, build, ship, switch
make deploy-rollback        # back to the previous release, headers included
```

`make deploy` builds on your machine and ships files; the server never runs
Node. It refuses a branch other than `main` and a working tree with
uncommitted changes (`--any-branch` and `--allow-dirty` exist for the day you
mean it). `scripts/deploy_remote.sh --help` lists every option.

**Publishing a post** is a push to `tamtree-ai/blog`, then `make deploy` here.
Nothing in this repo changes and nothing needs committing: the release is
named `<site sha>-<content sha>`, so new content is a new release on its own.
Running `make deploy` when neither repo has moved says so and does nothing.

The preview and the deploy both print the line that answers "which version of
the content is live?":

```
content sync: github.com/tamtree-ai/blog.git@main → 385a77f (2026-09-03)
```

and the server keeps the history in `/opt/tamtree/web-site/.deploy-history`.

### What a deploy touches

| | |
|---|---|
| Uploads | `dist/` to a new `releases/<tag>/`, never over the live one |
| Switches | the `current` symlink, in one rename |
| Restarts Caddy | **only when `deploy/Caddyfile.web` changed** — a second or two of refused connections for every site on the server, `app.tamtree.io` included. The preview says in advance which kind of deploy it is |
| Keeps | the newest 3 releases, and always the current and the previous |

### When something is wrong

| Symptom | Cause |
|---|---|
| "the host is not set up for the site" | The one-time host setup below is missing; the message lists which part |
| "content sync FAILED" | Network or GitHub outage, or `tamtree-ai/blog` was made private without setting `TT_CONTENT_TOKEN` |
| "content/ has local edits" | You are mid-draft in `content/`. Commit and push there first; the live blog should be a commit, not a working copy |
| "src/brand/theme-init.js changed" | The CSP allows that script by hash. The message prints the new hash; put it in `deploy/Caddyfile.web` |
| `gate:links` fails | A page links to a page that does not exist. Fix the link, or `ARGS=--skip-gates` if you are shipping it knowingly |
| "the new Caddy config does not validate" | A mistake in `deploy/Caddyfile.web`. The old config was put back and the old release is still serving; the message prints a command that shows the error |
| Post pushed but not on the site | It is `draft: true`; drafts never ship to production. Or nobody has run `make deploy` since |
| Deploy succeeds, URL does not answer | DNS, or the certificate: `docker compose logs caddy` in `/opt/tamtree/deploy/docker` on the server |

---

## Where it runs

`ssh tamtree-app` — the same server as `app.tamtree.io` and `docs.tamtree.io`
(AWS, Sydney). One Caddy container there owns ports 80 and 443 for all three,
and gets and renews the certificates by itself.

```
/opt/tamtree/web-site/
  releases/<site sha>-<content sha>/            one built dist/ per deploy
  releases/<site sha>-<content sha>.Caddyfile   deploy/Caddyfile.web as that release shipped it
  current -> releases/<tag>                     what is live
  Caddyfile.web                                 the active copy of the snippet
  .deploy-history
```

Caddy sees that folder as `/srv/web` and serves `/srv/web/current`.

### DNS

At the registrar (Namecheap), two A records on `tamtree.io`:

| Host | Type | Value |
|---|---|---|
| `www` | A | `3.27.222.152` |
| `@` | A | `3.27.222.152` |

The apex must be an **A record**, not a URL redirect or a CNAME: the redirect to
`www` is Caddy's job (`deploy/Caddyfile.web`), and a CNAME at the apex would
take the mail-forwarding MX records down with it.

`astro.config.mjs` sets `site: 'https://www.tamtree.io'`, which is what
canonical URLs, the sitemap and the RSS feed are generated from — so if the
production domain ever changes, change it there and in `deploy/Caddyfile.web`,
or every canonical URL will point at the old one.

DNS has to resolve **before** the first deploy. Caddy asks Let's Encrypt for a
certificate the moment it loads the site block, and failed attempts are
rate-limited.

### One-time host setup

Three things on the server, none of them in any repo. They are written out so
the server can be rebuilt; a working one already has them.

1. The folder:

   ```bash
   mkdir -p /opt/tamtree/web-site/releases
   ```

2. The mount. In `/opt/tamtree/deploy/docker/docker-compose.local.yml`, under
   `services.caddy.volumes`, beside the docs line:

   ```yaml
         - /opt/tamtree/web-site:/srv/web:ro
   ```

   The whole folder, not `current`: a bind mount of a symlink is resolved once,
   when the container starts, and would go on serving the old release.

3. The site blocks. In `/opt/tamtree/deploy/docker/Caddyfile.local.sh`, just
   before the line that writes `Caddyfile.local`:

   ```bash
   web_snippet=/opt/tamtree/web-site/Caddyfile.web
   if [ -f "$web_snippet" ]; then { echo; cat "$web_snippet"; } >> "$tmp"; fi
   ```

   That script generates the Caddyfile the server actually runs, and the app's
   own deploy re-runs it — which is why the site blocks are appended there and
   not edited into `Caddyfile.local` by hand, where the next app deploy would
   remove them.

Then recreate Caddy so it has the mount (a second or two of downtime for the
app and the docs):

```bash
cd /opt/tamtree/deploy/docker && docker compose up -d --no-deps caddy
```

`make deploy ARGS=--check` reports whichever of the three is missing.

---

## Headers and the CSP

Astro's `output: 'static'` writes files, not response headers, so every header
the site depends on is host configuration: **`deploy/Caddyfile.web`**. It ships
with each release and is validated on the server before anything switches.

Why each part exists:

- `/blog/<slug>/` → `Link: </blog/<slug>.md>; rel="alternate"`. An RFC 8288
  pointer to the markdown sibling — without it, the sibling `.md` is
  undiscoverable to anything that doesn't already know the convention.
- `*.md` → served as `text/markdown` so a fetch renders as source rather
  than downloading, and `noindex` since the `.md` is a sibling of the real
  page, not a second page to rank.
- `/(llms|llms-full).txt` → `text/plain`, deliberately crawlable — these
  exist to be read by machines.
- `/_astro/*` → cached forever. Astro puts a content hash in those filenames,
  so a changed file is a new URL.
- Everything → the CSP. Its `form-action` allows `buttondown.email` because the
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
  it can't be a deferred module. It's allowed by exact hash, not
  `'unsafe-inline'`, so **editing `theme-init.js` means updating that hash** in
  `deploy/Caddyfile.web`. `make deploy` computes it and refuses to ship a
  mismatch, because the alternative is a script that silently stops running in
  production.
- 404s get the same headers. That is why `-Server` sits on its own line in the
  snippet rather than in the header block; the comment there has the detail.

To try a header change before shipping it, serve the local build through the
same Caddy image on plain HTTP:

```bash
pnpm build
sed -e 's#^tamtree.io {#http://apex.localhost:8080 {#' \
    -e 's#^www.tamtree.io {#http://localhost:8080 {#' deploy/Caddyfile.web > /tmp/Caddyfile.web.local
docker run --rm -p 8080:8080 \
  -v /tmp/Caddyfile.web.local:/etc/caddy/Caddyfile:ro \
  -v "$PWD/dist:/srv/web/current:ro" caddy:2-alpine
curl -sI http://localhost:8080/blog/
```

---

## Why content is fetched, not submodule-pinned

A git submodule records a **commit SHA** in the consuming repo. Publishing a
post would mean pushing to the content repo *and then* committing a pointer bump
to the site repo — the site would show stale content until someone did.

So `content/` is **gitignored** in the site repo and cloned at build time by
`scripts/content/sync.mjs`, at HEAD of the content repo's `main`. The site repo
records no pointer at all, and publishing a post needs no commit here.

`tamtree-ai/blog` is a public repo, so the sync clones it over a plain
`https://` URL with no credential.

Public means **readable, not writable** — GitHub does not grant outsiders push
access just because a repo can be cloned. Only org members/collaborators with
Write can push, and the org's default repository permission is `read`. The
trade-off worth knowing: since the repo is public, unpublished (`draft: true`)
posts are readable by anyone who looks at the repo directly, even though they
never render on the site.

Two optional overrides exist and should normally be left unset:
`TT_CONTENT_REPO` (default `github.com/tamtree-ai/blog.git`) and
`TT_CONTENT_REF` (default `main`). A `TT_CONTENT_TOKEN` environment variable is
still supported as an escape hatch (e.g. cloning a private fork), but is not
needed for the normal public-repo path.

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
  freshness. (`make deploy` refuses to ship one, for the same reason.)
- **`TT_CONTENT_LOCAL=1` skips the sync entirely**, for working offline or
  against a branch you checked out by hand.
- **Drafts are visible in `pnpm dev`** and in any build made with
  `TT_INCLUDE_DRAFTS=1`. They are never in a production build.

To write a post, work in `content/` directly — it is a normal clone of the
content repo, so commit and push from inside it.

---

## Images

Post images live in the **content** repo, under `images/`, and are pushed the
same way posts are — nothing extra to configure.

The one thing worth knowing is that the build optimizes them, which needs
`sharp` (a dependency of the site repo, installed by `pnpm install` like any
other). If it is ever missing, the build **fails loudly** with `Could not find
Sharp` rather than shipping the originals — which is the behaviour you want: a
silently unoptimized hero is a 2 MB page nobody notices until the Lighthouse
score arrives.

The artwork in `content/images/` was generated by `scripts/art/posts.mjs` in the
site repo. That generator lives here rather than in the content repo on purpose:
the content repo is Markdown with nothing to install, and it stays that way. Run
it here, commit the PNGs there.

## What is deliberately not here

- **No deploy on push.** A deploy is a person running `make deploy`. Doing it
  from CI would put an SSH key for the server that runs the app into a GitHub
  secret; the script takes everything from flags and environment variables, so
  that stays possible the day it is worth it.
- **No preview deploy per content PR.** Contributors are a small known team, and
  the local path above covers the same need without a second pipeline to
  maintain.
- **No CDN rewrite or subdomain.** Both would split the origin, and with it the
  theme toggle, the markdown corpus and the search index.
- **No CMS.** The markdown file *is* the artifact — it is published at
  `/blog/<slug>.md` alongside the page, and a build that renders a post
  differently from its source fails `gate:md`.
