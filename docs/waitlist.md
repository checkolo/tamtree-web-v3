# Waitlist contract (T0.7 · D8, amended 2026-10-28)

**Provider: Resend, behind an endpoint of our own** (`waitlist/server.mjs`).

D8 originally chose Buttondown's embed endpoint, so the site would own no runtime.
That account was never created. On 2026-10-28 the owner chose Resend with a small
backend-for-frontend instead. It also fixes something the embed approach never
solved: a cross-origin POST into a hidden iframe can't read the response, so the
form claimed success whether or not the signup arrived. It shipped that bug to
production twice (a CSP `frame-src` gap on 2026-10-15, then the
`buttondown.email` → `.com` redirect).

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

email=<address>&tag=waitlist[&tag=launch-news][&tag=early-access][&company=<honeypot>]
```

| Caller sends | Success | Failure |
|---|---|---|
| a plain form POST (no JS) | `303 → /waitlist/thanks/` | `303 → /waitlist/sorry/?reason=<code>` |
| `Accept: application/json` (the form's script) | `200 {"ok":true}` | `4xx/5xx {"ok":false,"error":"<code>"}` |

Error codes: `email` (400, malformed), `busy` (429, more than 5 tries per IP in
10 minutes), `origin` (403, `Origin` is set and isn't `SITE_ORIGIN`), `invalid`
(oversized or unreadable body), `unavailable` (502, both Resend writes failed).

**What counts as success.** A signup succeeds if *either* write lands. A contact
saved without a notification is still on the list. A notification sent without
a contact is still in the inbox to add by hand (it says `Saved as a Resend
contact: NO`). This is also how a repeat signup behaves, since Resend may refuse
a duplicate contact. Only when both fail does the visitor hear that it failed.

**Abuse.** Three measures: a honeypot field (`company`, off-screen and out of the
tab order), which gets a fake success and is never written; an in-memory per-IP
rate limit; and the `Origin` check. No CAPTCHA: none of the providers would
leave `script-src 'self'` intact.

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
| `RESEND_API_KEY` | yes | a key with *sending* + *contacts* access, nothing more |
| `WAITLIST_FROM` | yes | e.g. `Tamtree <waitlist@tamtree.io>`; the domain must be verified in Resend |
| `WAITLIST_NOTIFY_TO` | yes | the inbox that receives each signup |
| `SITE_ORIGIN` | no | defaults to `https://www.tamtree.io` |
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
   cp .env.example .env && chmod 600 .env   # fill it in
   docker network ls                         # the app stack's network
   CADDY_NETWORK=<that name> docker compose up -d --build
   ```

3. **Caddy** already proxies `/api/waitlist` to `waitlist:8787` (it ships with
   `deploy/Caddyfile.web`). Until the container exists the route answers 502
   and the form shows its error message. It never claims success.
4. **Prove it:** run one real signup on the live site with both opt-ins ticked.
   Check that the contact appears in Resend with both topics `opt_in`, and that
   the notification arrives.

## Local development

`pnpm dev` serves no `/api/waitlist`, so a signup there shows the form's error
message. To exercise the real path, run
`RESEND_API_KEY=… WAITLIST_FROM=… WAITLIST_NOTIFY_TO=… node waitlist/server.mjs`
and post to `:8787` directly. The tests (`pnpm test:waitlist`) fake Resend and
need no key.

## Not decided here

Double opt-in and the welcome email's copy remain launch tasks (T7.1). Resend
Contacts has no built-in double opt-in, so adding it would mean a confirm link
signed by this service.
