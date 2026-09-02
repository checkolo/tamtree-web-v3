# Waitlist provider contract (T0.7 · D8)

**Provider: Buttondown.** Decided 2026-09-02, ahead of the form being built, so
T2.2 is written against the real contract rather than redesigned around it later.

## Why a provider endpoint rather than our own

No runtime, no database, no GDPR surface owned here, and the list lives where it
will be mailed from. The alternative — a Vercel function writing to a store —
buys nothing before launch and adds a system that has to be operated, secured
and exported from.

## The endpoint

```
POST https://buttondown.email/api/emails/embed-subscribe/<username>
Content-Type: application/x-www-form-urlencoded

email=<address>&tag=waitlist
```

A plain HTML form POST works with no JavaScript, which is what the form uses:
the site is zero-JS by default (C4 contract 1) and a waitlist that needs script
to submit is a waitlist that silently loses the visitors most likely to read the
rest of the page.

**Responses.** Buttondown redirects on success. Because the redirect leaves our
origin, the form posts into a hidden iframe and the page renders its own success
state — the deck's copy, not the provider's. The no-JS path lets the redirect
happen and lands on Buttondown's own confirmation; that is a worse experience
and an acceptable floor, not the default.

## CSP consequences (recorded against `vercel.json`)

| Directive | Value | Why |
|---|---|---|
| `form-action` | `'self' https://buttondown.email` | the form POSTs cross-origin |
| `connect-src` | `'self'` | unchanged — no `fetch`, the form is a real form |
| `script-src` | `'self'` | unchanged — no provider SDK is loaded |

That last row is the reason this provider was chosen over the alternatives with
richer automation: an embed script would have forced a third-party origin into
`script-src` on every page of a site whose whole delivery argument (C4) is that
nothing important needs script to become visible.

## The finale's opt-ins — an assumption, flagged

§10's form adds two checkboxes (`launch news`, `early-access beta`) as further
`tag` fields alongside the hidden `tag=waitlist`. **That repeated `tag` fields
produce multiple tags on the subscriber is assumed, not verified** — the embed
endpoint is documented for the single-tag case. If it turns out only the first
or last wins, the fix is `metadata__*` fields, which is a change to the form's
field names and nothing else. Verify against a real list at T7.1, before the
first real subscriber depends on it.

## Not decided here

Double opt-in, the confirmation email's copy, and the sending domain's DNS are
launch tasks (T7.1), not build tasks.
