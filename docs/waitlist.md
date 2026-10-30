# Waitlist contract (T0.7 · D8, amended 2026-10-28)

**Provider: Resend, behind an endpoint of our own** (`waitlist/server.mjs`).

D8 originally chose Buttondown's embed endpoint, so the site would own no runtime.
That account was never created. On 2026-10-28 the owner chose Resend with a small
backend-for-frontend instead. It also fixes something the embed approach never
solved: a cross-origin POST into a hidden iframe can't read the response, so the
form claimed success whether or not the signup arrived. It shipped that bug to
production twice (a CSP `frame-src` gap on 2026-10-15, then the
`buttondown.email` → `.com` redirect).

The same service also takes the **contact form** (`POST /api/contact`, added
2026-10-30, see below). The site shows no email address anywhere, since the repo
is public. Privacy, deletion and legal mail reaches the inbox only through that
form.

## Shape

```
browser ── POST /api/waitlist ──▶ Caddy (www.tamtree.io) ──▶ waitlist:8787 ──▶ api.resend.com
                                                                 ├─ POST /contacts  (the list)
                                                                 └─ POST /emails    (notification to the inbox)
```

One file, no dependencies (`node:http` + built-in `fetch`). It runs as its own
container next to the app stack on `tamtree-app`, has no published port, and
Caddy is the only way in.

## The endpoint

```
POST /api/waitlist
Content-Type: application/x-www-form-urlencoded

email=<address>&tag=waitlist[&tag=launch-news][&tag=early-access]
  &pow_ts=<unix seconds>&pow_nonce=<integer>[&company=<honeypot>]
```

| Caller sends | Success | Failure |
|---|---|---|
| a plain form POST (no JS) | `303 → /waitlist/thanks/` | `303 → /waitlist/sorry/?reason=<code>` |
| `Accept: application/json` (the form's script) | `200 {"ok":true}` | `4xx/5xx {"ok":false,"error":"<code>"}` |

Error codes:

- `email` (400): the address is malformed.
- `stamp` (400): the proof-of-work stamp is missing, weak or reused. Every no-JS POST gets this.
- `clock` (400): the stamp's timestamp is more than 5 minutes off. The response
  carries `now`, and the form re-stamps once with it.
- `busy` (429): more than 5 tries per IP in 10 minutes, or the hourly cap was reached.
- `origin` (403): `Origin` is set and isn't `SITE_ORIGIN`.
- `invalid`: the body is oversized or unreadable.
- `unavailable` (502): both Resend writes failed.

**What counts as success.** A signup succeeds if *either* write lands. A contact
saved without a notification is still on the list. A notification sent without
a contact is still in the inbox to add by hand (it says `Saved as a Resend
contact: NO`). This is also how a repeat signup behaves, since Resend may refuse
a duplicate contact. Only when both fail does the visitor hear that it failed.

**Abuse.** The endpoint only ever emails *us*, never the address entered, so it
can't be used to mail a stranger. The worst a bot can do is put junk into the
list and the inbox. In the order they are checked:

1. **`Origin`** must be ours when present.
2. **Per-IP rate limit:** 5 tries per 10 minutes, in memory.
3. **Honeypot:** `company` is off-screen and out of the tab order. A filled one
   gets a fake success and is never written.
4. **Proof-of-work stamp:** the form's script finds a nonce such that
   `sha256("<email>:<pow_ts>:<pow_nonce>")` starts with `WAITLIST_POW_BITS` zero
   bits (default 15, ~32k hashes, well under a second on a phone). The email is
   lowercased and trimmed. The stamp is bound to one address and a ±5-minute
   window, and the server remembers spent stamps, so each one works once. There
   is no challenge endpoint and no secret. What it buys is cost: a bot pays per
   signup the compute a person pays once. **The bits are set in two places**:
   the env var and `POW_BITS` in `src/lib/stamp.ts`.
5. **Hourly cap:** `WAITLIST_HOURLY_CAP` (default 100) accepted signups per hour
   across *all* addresses. This is the ceiling for a bot spread over many IPs.
   Reaching it logs a warning.

Why not a CAPTCHA (decided 2026-10-28): Turnstile, reCAPTCHA and hCaptcha all
put a third-party script and frame into the CSP and onto the privacy page. The
stamp needs neither. The escalation path, if a stamp-paying bot ever shows up,
is Turnstile.

**This is the one place the site needs JavaScript.** A stamp can only be
computed in script, so a no-JS POST is refused (`stamp` → `/waitlist/sorry/`).
The form's `<noscript>` says so up front and points to `/contact/` instead
(which needs script too: there is deliberately no public address to fall back on). Every other page and the content pipeline stay zero-JS-dependent.

## The contact form

```
POST /api/contact
Content-Type: application/x-www-form-urlencoded

email=<address>&message=<text>[&name=<text>][&topic=general|privacy|deletion|legal|waitlist]
  &pow_ts=<unix seconds>&pow_nonce=<integer>[&company=<honeypot>]
```

One Resend `POST /emails` to `CONTACT_TO`, with the sender as `reply_to` and
the topic label leading the subject (`Data deletion request: Ann`), so replying
from the inbox answers them directly. It uses the same guards as the waitlist,
in the same order (Origin, per-IP limit, honeypot, stamp bound to the email,
hourly cap), but with its own limiter and cap, so a busy waitlist can't block a
deletion request. It adds one error code, `message` (400): the message is empty
or longer than 5000 characters. With only one write there's no partial success.
A failed send is `unavailable` (502). No-JS receipts are `/contact/sent/` and
`/contact/not-sent/?reason=<code>`.

`CONTACT_TOPICS` in `server.mjs` is the list of topics. `/contact/` renders its
select from it, and `?topic=<value>` preselects one. The legal pages link with
`?topic=privacy`, `deletion`, `legal` and `waitlist`. Like the waitlist, it never
mails the address entered, so it can't be used to mail a stranger.

**Prove it after deploy:** send one message from the live `/contact/` and check
that it arrives at `CONTACT_TO` and that Reply goes to the sender. Meta, Google
and TikTok app reviews check that the privacy and deletion pages have a working
contact.

## Opt-ins → Resend topics

`launch-news` and `early-access` map to Resend **topics**
(`RESEND_TOPIC_LAUNCH_NEWS`, `RESEND_TOPIC_EARLY_ACCESS`): `opt_in` when ticked
and `opt_out` when not, so a Broadcast sent to a topic reaches exactly the
people who asked for it. If a topic id is unset, that topic is skipped and the
opt-in only appears in the notification. `RESEND_SEGMENT_ID` optionally adds
every signup to one segment. `waitlist` itself is not stored, because being a
contact *is* being on the waitlist.

## CSP (recorded against `deploy/Caddyfile.web`)

| Directive | Value | Why |
|---|---|---|
| `form-action` | `'self'` | the form posts to its own origin |
| `connect-src` | `'self'` | the script's `fetch` is same-origin |
| `script-src` | `'self'` | unchanged — no provider SDK |
| `frame-src` | (removed) | there is no iframe anymore |

## Configuration

`waitlist/.env` on the host (template: `waitlist/.env.example`):

| Var | Required | |
|---|---|---|
| `RESEND_API_KEY` | yes | **Full access** — a *Sending access* key can send the notification but not create contacts |
| `WAITLIST_FROM` | yes | e.g. `Tamtree <waitlist@tamtree.io>`; the domain must be verified in Resend |
| `WAITLIST_NOTIFY_TO` | yes | the inbox that receives each signup |
| `SITE_ORIGIN` | no | defaults to `https://www.tamtree.io` |
| `WAITLIST_POW_BITS` | no | default 15; change `POW_BITS` in `src/lib/stamp.ts` with it |
| `WAITLIST_HOURLY_CAP` | no | default 100 accepted signups per hour, all addresses |
| `CONTACT_TO` | no | the inbox contact messages go to; defaults to `WAITLIST_NOTIFY_TO`. **Only ever here** — never in the repo |
| `CONTACT_HOURLY_CAP` | no | default 30 contact messages per hour, all senders |
| `RESEND_SEGMENT_ID`, `RESEND_TOPIC_*` | no | see above |

The service refuses to start without the three required values.

## Host setup (once)

1. **Resend.** Add `tamtree.io` as a domain, then put its DKIM/SPF (and the
   recommended DMARC) records in DNS and wait for *Verified*. Create the two
   topics, plus a segment if wanted, and an API key.
2. **The service.** On `tamtree-app`:

   ```bash
   mkdir -p /opt/tamtree/web-site/waitlist && cd $_
   # copy waitlist/{server.mjs,Dockerfile,compose.yml,.env.example} here
   cp .env.example .env && chmod 600 .env   # fill it in, CADDY_NETWORK included
   docker inspect $(docker ps -qf name=caddy) -f '{{json .NetworkSettings.Networks}}'   # → CADDY_NETWORK
   docker compose up -d --build
   ```

3. **Caddy** already proxies `/api/waitlist` and `/api/contact` to `waitlist:8787`
   (it ships with `deploy/Caddyfile.web`). Until the container exists the route answers 502
   and the form shows its error message. It never claims success.
4. **Prove it:** run one real signup on the live site with both opt-ins ticked.
   Check that the contact appears in Resend with both topics `opt_in`, and that
   the notification arrives.

## Local development

`pnpm dev` serves no `/api/waitlist`, so a signup there shows the form's error
message. To exercise the real path, run
`RESEND_API_KEY=… WAITLIST_FROM=… WAITLIST_NOTIFY_TO=… WAITLIST_POW_BITS=0 node waitlist/server.mjs`
and post to `:8787` directly. `POW_BITS=0` accepts any well-formed stamp, so
`pow_ts=$(date +%s)&pow_nonce=0` will do. The tests (`pnpm test:waitlist`) fake Resend and
need no key.

## Not decided here

Double opt-in and the welcome email's copy remain launch tasks (T7.1). Resend
Contacts has no built-in double opt-in, so adding it would mean a confirm link
signed by this service.
