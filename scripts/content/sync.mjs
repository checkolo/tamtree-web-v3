// Fetch blog content from its own repo, at build time.
//
// D1 said "submodule". A submodule records a commit SHA in this repo, which
// means publishing a post would require someone to bump that pointer and commit
// it here — the site would sit on stale content until they did. The owner's
// requirement is the opposite: push a post to the content repo and the site
// picks it up with nothing to do here. So the content is cloned at HEAD of
// `main` instead, and this repo records no pointer at all.
//
// Local development is the case this must not break. A contributor editing a
// post has a working copy in `content/` with uncommitted changes; blowing that
// away to get a clean clone would destroy their draft. So a dirty checkout is
// always left exactly as it is, and TT_CONTENT_LOCAL=1 skips the sync outright.

import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';

const DIR = resolve(process.cwd(), 'content');
const REPO = process.env.TT_CONTENT_REPO ?? 'github.com/tamtree-ai/blog.git';
const REF = process.env.TT_CONTENT_REF ?? 'main';
const TOKEN = process.env.TT_CONTENT_TOKEN;

// The repo is public, so TOKEN is normally unset and url() below falls back to
// a plain https URL — no credential needed. TT_CONTENT_TOKEN remains as an
// escape hatch (e.g. a private preview fork). When it is set, it is passed to
// `git fetch`/`git clone` as a positional URL and never stored: writing it
// with `remote set-url` would persist it in content/.git/config, and an early
// version of this script did exactly that — a failed fetch left the
// credential sitting on disk, since the line that cleaned it up came after the
// line that failed. A URL handed to a single command cannot outlive it.
const url = () => (TOKEN ? `https://x-access-token:${TOKEN}@${REPO}` : `https://${REPO}`);
const redact = (s) => (TOKEN ? s.replaceAll(TOKEN, '***') : s);

const git = (args, opts = {}) =>
  execFileSync('git', args, { encoding: 'utf8', stdio: 'pipe', ...opts }).trim();

function fail(message, cause) {
  // Loudly, and with a non-zero exit. The failure mode this guards against is a
  // network blip producing a green build of a blog with no posts in it —
  // a silently empty site is far worse than a red build.
  console.error(`\ncontent sync FAILED — ${message}`);
  if (cause) console.error(redact(String(cause.stderr || cause.message || cause)).trim());
  console.error(
    '\nThe blog content lives in tamtree-ai/blog. This build cannot continue\n' +
      'without it: shipping a blog with zero posts would look like success.\n' +
      'If TT_CONTENT_TOKEN is set, check that it is still valid.\n',
  );
  process.exit(1);
}

if (process.env.TT_CONTENT_LOCAL === '1') {
  console.log('content sync: skipped (TT_CONTENT_LOCAL=1) — using content/ as it stands.');
  process.exit(0);
}

if (existsSync(`${DIR}/.git`)) {
  let dirty = '';
  try {
    dirty = git(['status', '--porcelain'], { cwd: DIR });
  } catch (err) {
    fail('content/ exists but is not a readable git checkout', err);
  }

  if (dirty) {
    // Someone is mid-edit. Their work wins over freshness, every time.
    console.log('content sync: local changes in content/ — left untouched.');
    console.log(dirty.split('\n').map((l) => `  ${l}`).join('\n'));
    process.exit(0);
  }

  try {
    git(['fetch', '--depth', '1', url(), REF], { cwd: DIR });
    git(['checkout', '-q', '--detach', 'FETCH_HEAD'], { cwd: DIR });
  } catch (err) {
    fail(`could not update content/ to ${REF}`, err);
  }
} else {
  if (existsSync(DIR)) fail('content/ exists but is not a git checkout — move it aside and retry.');
  try {
    git(['clone', '--depth', '1', '--branch', REF, url(), DIR]);
  } catch (err) {
    fail(`could not clone ${REPO} at ${REF}`, err);
  } finally {
    // `clone` is the one command that records the URL it was given, so the
    // token is scrubbed whether or not the clone succeeded.
    if (existsSync(`${DIR}/.git`)) {
      try {
        git(['remote', 'set-url', 'origin', `https://${REPO}`], { cwd: DIR });
      } catch {
        fail('cloned content/ but could not scrub the credential from its remote URL');
      }
    }
  }
}

const sha = git(['rev-parse', '--short', 'HEAD'], { cwd: DIR });
const when = git(['log', '-1', '--format=%cs'], { cwd: DIR });
console.log(`content sync: ${REPO}@${REF} → ${sha} (${when})`);
