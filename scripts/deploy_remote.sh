#!/usr/bin/env bash
# Deploy this checkout to the web host over SSH: build here, ship dist/ as a
# release, switch the site to it. DEPLOYMENT.md has the one-time host setup.
#
#   scripts/deploy_remote.sh              # sync content, build, ship, switch
#   scripts/deploy_remote.sh --check      # show what would happen; change nothing on the host
#   scripts/deploy_remote.sh --rollback   # back to the previously deployed release
#
# Options:
#   --yes          do not ask for confirmation
#   --force        redeploy even when the host already serves this release
#   --allow-dirty  deploy uncommitted changes (tagged ...-dirty-<time>)
#   --any-branch   deploy from a branch other than main
#   --skip-gates   do not run gate:links and gate:md on the build
#
# Environment:
#   DEPLOY_HOST           ssh target                         (default tamtree-app)
#   DEPLOY_WEB_DIR        site folder on the host            (default /opt/tamtree/web-site)
#   DEPLOY_COMPOSE_DIR    compose directory running caddy    (default /opt/tamtree/deploy/docker)
#   DEPLOY_KEEP_RELEASES  releases kept for rollback         (default 3)
#   DEPLOY_URL            checked after a deploy             (default https://www.tamtree.io)
#
# What it does, and why this way:
#   1. Syncs content/ from the blog repo and names the release after both
#      commits, <site sha>-<content sha>: a new post is a new release even when
#      nothing here changed.
#   2. Builds here. The host has no Node, and a small box should not grow one.
#   3. rsyncs dist/ to releases/<tag>/ on the host, with deploy/Caddyfile.web
#      beside it as releases/<tag>.Caddyfile.
#   4. On the host: if that Caddy snippet differs from the active one, installs
#      it, regenerates the host's Caddyfile and validates it; then points the
#      `current` symlink at the release, and restarts caddy only if its config
#      changed. A restart is a second or two of refused connections for every
#      site on the host, the app included — which is why it is not the default.
#   5. Checks the public URL.
#
# Failure handling: nothing is switched until the release is fully uploaded and
# the Caddy config validates. A config that does not validate is put back, and
# the old release keeps serving on the old headers.
#
# Rollback re-activates the previous release with the Caddy snippet it shipped
# with. The CSP carries a hash of src/brand/theme-init.js, so headers from one
# release over the HTML of another is how the theme script silently stops.
set -euo pipefail

cd "$(dirname "$0")/.."

DEPLOY_HOST="${DEPLOY_HOST:-tamtree-app}"
WEB_DIR="${DEPLOY_WEB_DIR:-/opt/tamtree/web-site}"
COMPOSE_DIR="${DEPLOY_COMPOSE_DIR:-/opt/tamtree/deploy/docker}"
KEEP_RELEASES="${DEPLOY_KEEP_RELEASES:-3}"
SITE_URL="${DEPLOY_URL:-https://www.tamtree.io}"
SNIPPET=deploy/Caddyfile.web

MODE=deploy YES=0 FORCE=0 ALLOW_DIRTY=0 ANY_BRANCH=0 SKIP_GATES=0
for arg in "$@"; do
  case "$arg" in
    --check) MODE=check ;;
    --rollback) MODE=rollback ;;
    --yes | -y) YES=1 ;;
    --force) FORCE=1 ;;
    --allow-dirty) ALLOW_DIRTY=1 ;;
    --any-branch) ANY_BRANCH=1 ;;
    --skip-gates) SKIP_GATES=1 ;;
    -h | --help) sed -n '2,/^set -euo/{/^set -euo/d;s/^# \{0,1\}//;p;}' "$0"; exit 0 ;;
    *) printf 'unknown option: %s (see --help)\n' "$arg" >&2; exit 2 ;;
  esac
done

step() { printf '\n\033[1m== %s\033[0m\n' "$*"; }
fail() { printf '\n[deploy FAILED] %s\n' "$*" >&2; exit 1; }

confirm() {
  [ "$YES" = 1 ] && return 0
  local answer
  read -r -p "$1 [y/N] " answer </dev/tty
  [[ "$answer" == [yY]* ]] || { echo "aborted"; exit 1; }
}

# ---- the host side ---------------------------------------------------------
# Sent over ssh as one `bash -s` script. Everything lives inside main() so bash
# has read the whole script before anything runs, and main's stdin is
# /dev/null, so no docker command can swallow the rest of the script.
remote_lib() {
  cat <<'REMOTE'
main() {
  set -euo pipefail

  say() { printf '   %s\n' "$*"; }
  compose() { (cd "$COMPOSE_DIR" && docker compose "$@"); }
  current() { if [ -L "$WEB_DIR/current" ]; then basename "$(readlink "$WEB_DIR/current")"; fi; }
  # .deploy-history: "<utc time> <release> <note>", one line per completed deploy.
  record() { printf '%s %s %s\n' "$(date -u +%FT%TZ)" "$1" "$2" >>"$WEB_DIR/.deploy-history"; }
  previous() {
    [ -f "$WEB_DIR/.deploy-history" ] || return 0
    awk -v cur="$(current)" '$2 != cur { p = $2 } END { print p }' "$WEB_DIR/.deploy-history"
  }
  lock() {
    exec 9>/tmp/tamtree-web-deploy.lock
    flock -n 9 || { echo "another site deploy is running on this host" >&2; exit 1; }
  }

  # The host's Caddyfile is generated (Caddyfile.local.sh) and that generator
  # appends $WEB_DIR/Caddyfile.web. Validation runs in a throwaway container:
  # the running caddy has `admin off`, so there is nothing to ask.
  regenerate() { "$COMPOSE_DIR/Caddyfile.local.sh" >/dev/null; }
  validates() {
    compose run --rm --no-deps -T --entrypoint caddy caddy \
      validate --config /etc/caddy/Caddyfile >/dev/null 2>&1
  }
  running_config_is_stale() {
    ! compose exec -T caddy cat /etc/caddy/Caddyfile | cmp -s - "$COMPOSE_DIR/Caddyfile.local"
  }

  activate() { # activate <release>: its Caddy snippet, then the symlink
    local tag="$1" snippet="releases/$1.Caddyfile" installed=0 restart=0
    [ -f "releases/$tag/index.html" ] || { echo "releases/$tag is not a built site" >&2; exit 1; }
    [ -f "$snippet" ] || { echo "$snippet is missing" >&2; exit 1; }

    if ! cmp -s "$snippet" Caddyfile.web; then
      rm -f Caddyfile.web.prev
      if [ -f Caddyfile.web ]; then cp -p Caddyfile.web Caddyfile.web.prev; fi
      cp "$snippet" Caddyfile.web
      installed=1
      regenerate || { restore_snippet; echo "Caddyfile.local.sh failed — caddy keeps its config, the old release keeps serving" >&2; exit 1; }
    fi

    if running_config_is_stale; then
      if validates; then
        restart=1
      elif [ "$installed" = 1 ]; then
        restore_snippet
        echo "the new Caddy config does not validate — put back, the old release keeps serving. Try it with:" >&2
        echo "  docker run --rm -v \"\$PWD/deploy/Caddyfile.web:/etc/caddy/Caddyfile:ro\" caddy:2-alpine caddy validate --config /etc/caddy/Caddyfile" >&2
        exit 1
      else
        say "! the host's Caddyfile.local differs from what caddy runs and does not validate —"
        say "! not this deploy's change, so caddy is left alone"
      fi
    fi

    # ln then mv: rename(2) replaces the old link in one step, so there is no
    # moment at which `current` does not exist.
    ln -sfn "releases/$tag" current.new
    mv -T current.new current
    say "current -> releases/$tag"

    if [ "$restart" = 1 ]; then
      compose restart caddy >/dev/null
      say "caddy restarted on the new config"
    fi
    rm -f Caddyfile.web.prev
  }

  restore_snippet() {
    if [ -f Caddyfile.web.prev ]; then mv Caddyfile.web.prev Caddyfile.web; else rm -f Caddyfile.web; fi
    regenerate || true
  }

  prune() { # keep the newest $KEEP_RELEASES, and always the current and previous
    local dir tag
    # shellcheck disable=SC2012 # our own <sha>-<sha> names; ls -t is the simple sort
    ls -1dt releases/*/ | tail -n +"$((KEEP_RELEASES + 1))" |
      while IFS= read -r dir; do
        tag="$(basename "$dir")"
        [ -n "$tag" ] || continue
        [ "$tag" = "$1" ] || [ "$tag" = "$2" ] || rm -rf "releases/$tag" "releases/$tag.Caddyfile"
      done
  }

  case "$1" in
    facts)
      printf 'current=%s\n' "$(current)"
      printf 'previous=%s\n' "$(previous)"
      if [ -f "$WEB_DIR/Caddyfile.web" ]; then
        printf 'snippet=%s\n' "$(sha256sum "$WEB_DIR/Caddyfile.web" | cut -d' ' -f1)"
      fi
      # Each `problem` is a piece of the one-time host setup that is not there.
      [ -d "$WEB_DIR/releases" ] || echo "problem=$WEB_DIR/releases does not exist"
      grep -q 'Caddyfile\.web' "$COMPOSE_DIR/Caddyfile.local.sh" 2>/dev/null ||
        echo "problem=$COMPOSE_DIR/Caddyfile.local.sh does not append Caddyfile.web"
      compose exec -T caddy test -d /srv/web 2>/dev/null ||
        echo "problem=the caddy container has no /srv/web mount"
      ;;

    deploy)
      lock
      cd "$WEB_DIR"
      prev="$(current)"
      activate "$TAG"
      record "$TAG" "$NOTE"
      prune "$TAG" "$prev"
      ;;

    rollback)
      lock
      cd "$WEB_DIR"
      prev="$(current)"
      target="$(previous)"
      [ -n "$target" ] || { echo "no previous release in .deploy-history" >&2; exit 1; }
      [ -d "releases/$target" ] || { echo "releases/$target is no longer on this host" >&2; exit 1; }
      activate "$target"
      record "$target" "rollback from $prev"
      ;;

    *) echo "unknown remote command: $1" >&2; exit 2 ;;
  esac
}
main "$@" </dev/null
REMOTE
}

remote_run() { # remote_run <command> [NAME=value ...]
  local cmd="$1"
  shift
  remote_lib | ssh -o BatchMode=yes "$DEPLOY_HOST" \
    "$(printf '%q ' env WEB_DIR="$WEB_DIR" COMPOSE_DIR="$COMPOSE_DIR" KEEP_RELEASES="$KEEP_RELEASES" "$@")bash -s -- $cmd"
}

check_site() {
  local code apex
  code="$(curl -sS -o /dev/null -w '%{http_code}' --max-time 15 --retry 5 --retry-delay 3 --retry-all-errors \
    "${SITE_URL}/" || true)"
  if [ "$code" = 200 ]; then echo "   ${SITE_URL}/ -> 200"; else
    echo "   ${SITE_URL}/ -> ${code:-no answer}: the release is switched on the host; check DNS, the certificate or a firewall rule" >&2
    return 0
  fi
  if curl -sS -o /dev/null -D - --max-time 15 "${SITE_URL}/" | grep -qi '^content-security-policy:'; then
    echo "   Content-Security-Policy is set"
  else
    echo "   ! no Content-Security-Policy header — is ${SNIPPET} in the host's Caddyfile?" >&2
  fi
  apex="${SITE_URL/:\/\/www./://}"
  if [ "$apex" != "$SITE_URL" ]; then
    echo "   ${apex}/ -> $(curl -sS -o /dev/null -w '%{http_code} %{redirect_url}' --max-time 15 "${apex}/" || true)"
  fi
}

# ---- this side -------------------------------------------------------------
SHA="$(git rev-parse --short=8 HEAD)"
BRANCH="$(git branch --show-current)"
if [ -z "$(git status --porcelain)" ]; then DIRTY=0; else DIRTY=1; fi

step "preflight: ${DEPLOY_HOST}:${WEB_DIR}"
FACTS="$(remote_run facts)" || fail "cannot read the host's state (is DEPLOY_HOST=${DEPLOY_HOST} right?)"
CURRENT="" PREVIOUS="" HOST_SNIPPET="" PROBLEMS=""
while IFS='=' read -r key value; do
  case "$key" in
    current) CURRENT="$value" ;;
    previous) PREVIOUS="$value" ;;
    snippet) HOST_SNIPPET="$value" ;;
    problem) PROBLEMS="${PROBLEMS}     - ${value}"$'\n' ;;
  esac
done <<<"$FACTS"
echo "   host serves ${CURRENT:-nothing yet}"

refuse() { if [ "$MODE" = check ]; then echo "   ! $1"; else fail "$1"; fi; }
if [ -n "$PROBLEMS" ]; then
  printf '   the host is not set up for the site:\n%s' "$PROBLEMS"
  refuse "do the one-time host setup in DEPLOYMENT.md first"
fi

if [ "$MODE" = rollback ]; then
  [ -n "$PREVIOUS" ] || fail "the host has no previous release recorded"
  echo "   rollback: ${CURRENT} -> ${PREVIOUS} (with the Caddy snippet it shipped with)"
  confirm "Roll back?"
  step "rolling back"
  remote_run rollback
  step "verify"
  check_site
  exit 0
fi

if [ "$BRANCH" != main ] && [ "$ANY_BRANCH" = 0 ]; then
  refuse "checked out on '${BRANCH:-detached HEAD}', not main — switch, or pass --any-branch"
fi
if [ "$DIRTY" = 1 ] && [ "$ALLOW_DIRTY" = 0 ]; then
  refuse "uncommitted or untracked changes — commit them, or pass --allow-dirty"
fi

# The release is named after the content it carries, so the content has to be
# fetched before there is anything to compare with the host. This touches only
# content/ here; sync.mjs leaves a checkout with local edits exactly as it is.
node scripts/content/sync.mjs | sed 's/^/   /'
CSHA="$(git -C content rev-parse --short=8 HEAD)"
if [ -n "$(git -C content status --porcelain)" ]; then
  DIRTY=1
  [ "$ALLOW_DIRTY" = 1 ] || refuse "content/ has local edits, which would ship as ${CSHA} — commit and push them there, or pass --allow-dirty"
fi
TAG="${SHA}-${CSHA}"
[ "$DIRTY" = 0 ] || TAG="${TAG}-dirty-$(date -u +%Y%m%d%H%M%S)"

# Astro inlines theme-init.js into every page and the CSP allows it by hash,
# not by 'unsafe-inline'. A stale hash drops the script with no console error
# to point at, so it is checked here rather than discovered in production.
THEME_HASH="$(openssl dgst -sha256 -binary src/brand/theme-init.js | openssl base64 -A)"
grep -qF "'sha256-${THEME_HASH}'" "$SNIPPET" ||
  refuse "src/brand/theme-init.js changed: put 'sha256-${THEME_HASH}' in the script-src of ${SNIPPET}"

if [ "$CURRENT" = "$TAG" ] && [ "$FORCE" = 0 ]; then
  echo "   already serving ${TAG}; nothing to do (--force to redeploy it)"
  exit 0
fi

echo "   deploy:  ${CURRENT:-nothing} -> ${TAG} (site ${BRANCH:-detached HEAD} @ ${SHA}, content @ ${CSHA})"
OLD_SHA="${CURRENT%%-*}"
if [ -n "$OLD_SHA" ] && git cat-file -e "${OLD_SHA}^{commit}" 2>/dev/null; then
  # -n, not `| head`: under pipefail, head closing the pipe kills the script.
  echo "   commits: $(git rev-list --count "${OLD_SHA}..HEAD") in this repo (newest 20 shown)"
  git log --oneline -n 20 "${OLD_SHA}..HEAD" | sed 's/^/     /'
fi
if [ "$(shasum -a 256 "$SNIPPET" | cut -d' ' -f1)" = "$HOST_SNIPPET" ]; then
  echo "   caddy:   config unchanged — the symlink switches, nothing restarts"
else
  echo "   caddy:   ${SNIPPET} changed — caddy restarts (a second or two, for every site on the host)"
fi
echo "   gates:   $([ "$SKIP_GATES" = 1 ] && echo skipped || echo "gate:links, gate:md")"
[ "$MODE" = check ] && exit 0
confirm "Deploy?"

step "1/4 build ${TAG}"
pnpm install --frozen-lockfile
# content/ is already at the commit the tag names; a second sync could move it.
TT_CONTENT_LOCAL=1 pnpm exec astro build
[ -f dist/index.html ] && [ -f dist/blog/index.html ] || fail "the build has no index.html or no blog/index.html — not shipping it"
if [ "$SKIP_GATES" = 0 ]; then
  pnpm gate:links
  pnpm gate:md
fi

step "2/4 ship releases/${TAG} to ${DEPLOY_HOST}"
# --delete only matters under --force, where the folder already exists.
rsync -rlt --delete --stats dist/ "${DEPLOY_HOST}:${WEB_DIR}/releases/${TAG}/" |
  { grep -E '^Number of (regular )?files transferred|^Total transferred file size' || true; }
rsync -t "$SNIPPET" "${DEPLOY_HOST}:${WEB_DIR}/releases/${TAG}.Caddyfile"

step "3/4 on the host: caddy config, then switch"
remote_run deploy TAG="$TAG" NOTE="${SHA} $(git log -1 --format=%s | cut -c1-60)"

step "4/4 verify"
check_site
echo
echo "deployed ${TAG} to ${DEPLOY_HOST}. Undo with: make deploy-rollback"
