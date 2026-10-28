/**
 * The waitlist endpoint — the one piece of tamtree.io that is not a file.
 *
 * Caddy proxies `POST www.tamtree.io/api/waitlist` here (deploy/Caddyfile.web).
 * Each signup becomes a Resend Contact, so the list lives where launch mail is
 * sent from, and the inbox gets a notification. Contract and setup:
 * docs/waitlist.md.
 *
 * No dependencies on purpose: node:http and the built-in fetch are the whole
 * runtime, so the image is node:alpine plus this file and there is nothing to
 * audit, update or install on the server.
 *
 * Two response shapes from one route. A plain form POST (no JS) gets a 303 to
 * /waitlist/thanks/ or /waitlist/sorry/ — the zero-JS floor. The form's script
 * sends `Accept: application/json` and renders the in-page message from the
 * JSON instead, which is what lets it say "you're on the list" only when that
 * is true.
 *
 * Bots: a proof-of-work stamp (see checkStamp) on top of a honeypot, a per-IP
 * limit and an hourly cap on all signups. The stamp needs the form's script to
 * compute, so a no-JS POST is refused; the form says so in a <noscript>.
 */
import { createHash } from 'node:crypto';
import { createServer } from 'node:http';
import { pathToFileURL } from 'node:url';

const RESEND_API = 'https://api.resend.com';
const MAX_BODY = 8 * 1024;
const RATE_WINDOW_MS = 10 * 60 * 1000;
const RATE_MAX = 5;
const HOUR_MS = 60 * 60 * 1000;
// How far a stamp's timestamp may sit from the server's clock, either way.
const STAMP_WINDOW_S = 5 * 60;
// `waitlist` is the hidden field every form sends; the other two are §10's
// opt-ins. Anything else in `tag` is dropped rather than stored.
const KNOWN_TAGS = ['waitlist', 'launch-news', 'early-access'];
// Deliberately loose: one @, no spaces, a dot in the domain. Resend does the
// real validation; this only keeps obvious junk out of the inbox.
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function configFrom(env) {
  const missing = ['RESEND_API_KEY', 'WAITLIST_FROM', 'WAITLIST_NOTIFY_TO'].filter((k) => !env[k]);
  if (missing.length) throw new Error(`waitlist: missing env ${missing.join(', ')}`);
  return {
    apiKey: env.RESEND_API_KEY,
    from: env.WAITLIST_FROM,
    notifyTo: env.WAITLIST_NOTIFY_TO,
    siteOrigin: (env.SITE_ORIGIN || 'https://www.tamtree.io').replace(/\/$/, ''),
    // Must match POW_BITS in src/components/WaitlistForm.astro. Each extra bit
    // doubles the work: 15 is ~32k hashes, well under a second on a phone.
    powBits: Number(env.WAITLIST_POW_BITS || 15),
    // Accepted signups per hour across every address — the ceiling on what a
    // bot spread over many IPs can push into the list and the inbox.
    hourlyCap: Number(env.WAITLIST_HOURLY_CAP || 100),
    segmentId: env.RESEND_SEGMENT_ID || '',
    // Resend topics are what a Broadcast is sent to, so each opt-in maps to
    // one. Unset ids are skipped: the opt-in still reaches the notification.
    topics: {
      'launch-news': env.RESEND_TOPIC_LAUNCH_NEWS || '',
      'early-access': env.RESEND_TOPIC_EARLY_ACCESS || '',
    },
  };
}

/** Per-address fixed window. In memory: one process, and a restart forgiving everyone is fine. */
export function rateLimiter({ now = Date.now, max = RATE_MAX, windowMs = RATE_WINDOW_MS } = {}) {
  const hits = new Map();
  return (key) => {
    const t = now();
    const entry = hits.get(key);
    if (!entry || t - entry.start >= windowMs) {
      hits.set(key, { start: t, count: 1 });
      if (hits.size > 10_000) {
        for (const [k, v] of hits) if (t - v.start >= windowMs) hits.delete(k);
      }
      return true;
    }
    entry.count += 1;
    return entry.count <= max;
  };
}

export function parseSignup(body) {
  const params = new URLSearchParams(body);
  const email = (params.get('email') || '').trim().toLowerCase();
  const tags = [...new Set(params.getAll('tag'))].filter((t) => KNOWN_TAGS.includes(t));
  // The honeypot: a field a person never sees, so only a bot fills it in.
  const trap = (params.get('company') || '').trim();
  return { email, tags, trap, stampTs: params.get('pow_ts') || '', stampNonce: params.get('pow_nonce') || '' };
}

export function leadingZeroBits(bytes) {
  let bits = 0;
  for (const byte of bytes) {
    if (byte === 0) {
      bits += 8;
      continue;
    }
    return bits + Math.clz32(byte) - 24;
  }
  return bits;
}

/**
 * The proof-of-work stamp. The browser searches for a nonce such that
 * sha256(`${email}:${ts}:${nonce}`) starts with `bits` zero bits, `ts` being
 * its own clock in unix seconds. No challenge endpoint and no secret: binding
 * the email makes each stamp good for one address, the clock window makes it
 * good for a few minutes, and `seen` makes it good once. What it buys is cost —
 * a bot pays the same compute per signup that a person pays once.
 *
 * Returns 'ok', 'clock' (ts outside the window — the caller retries with the
 * server's time) or 'stamp' (missing, malformed, too weak or reused).
 */
export function checkStamp({ email, stampTs, stampNonce }, { bits, nowS, seen }) {
  if (!/^\d{1,12}$/.test(stampTs) || !/^\d{1,16}$/.test(stampNonce)) return 'stamp';
  if (Math.abs(Number(stampTs) - nowS) > STAMP_WINDOW_S) return 'clock';
  const digest = createHash('sha256').update(`${email}:${stampTs}:${stampNonce}`).digest();
  if (leadingZeroBits(digest) < bits) return 'stamp';
  const key = digest.toString('hex');
  if (!seen.add(key, nowS)) return 'stamp';
  return 'ok';
}

/** Stamps already spent, kept just past the window they could still be valid in. */
export function stampMemory() {
  const spent = new Map();
  return {
    add(key, nowS) {
      if (spent.has(key)) return false;
      spent.set(key, nowS);
      if (spent.size > 5_000) {
        for (const [k, t] of spent) if (nowS - t > 2 * STAMP_WINDOW_S) spent.delete(k);
      }
      return true;
    },
  };
}

export function isValidEmail(email) {
  return email.length <= 254 && EMAIL_RE.test(email);
}

async function resend(fetchImpl, apiKey, path, payload) {
  const res = await fetchImpl(`${RESEND_API}${path}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(8000),
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => '');
    throw new Error(`resend ${path} ${res.status}: ${detail.slice(0, 300)}`);
  }
  return res.json().catch(() => ({}));
}

export function contactPayload(cfg, { email, tags }) {
  const payload = { email, unsubscribed: false };
  if (cfg.segmentId) payload.segments = [{ id: cfg.segmentId }];
  const topics = Object.entries(cfg.topics)
    .filter(([, id]) => id)
    .map(([tag, id]) => ({ id, subscription: tags.includes(tag) ? 'opt_in' : 'opt_out' }));
  if (topics.length) payload.topics = topics;
  return payload;
}

export function notificationPayload(cfg, { email, tags }, contactOk, at) {
  const optIns = tags.filter((t) => t !== 'waitlist');
  return {
    from: cfg.from,
    to: [cfg.notifyTo],
    reply_to: email,
    subject: `Waitlist: ${email}${optIns.length ? ` (${optIns.join(', ')})` : ''}`,
    text: [
      `${email} joined the Tamtree waitlist.`,
      '',
      `Opt-ins: ${optIns.length ? optIns.join(', ') : 'none'}`,
      `Saved as a Resend contact: ${contactOk ? 'yes' : 'NO — add them by hand, see the server log'}`,
      `At: ${at.toISOString()}`,
    ].join('\n'),
  };
}

/**
 * The signup itself. It succeeds if either write lands: a contact with no
 * notification is still on the list, and a notification with no contact is
 * still in the inbox to add by hand. Only both failing loses the person, and
 * only then does the visitor hear that it failed.
 */
export async function subscribe(cfg, signup, { fetchImpl = fetch, log = console, now = () => new Date() } = {}) {
  let contactOk = false;
  try {
    await resend(fetchImpl, cfg.apiKey, '/contacts', contactPayload(cfg, signup));
    contactOk = true;
  } catch (err) {
    // A repeat signup is the likeliest failure here and is not a loss.
    log.warn(`waitlist: contact not saved for ${signup.email}: ${err.message}`);
  }
  let notifyOk = false;
  try {
    await resend(fetchImpl, cfg.apiKey, '/emails', notificationPayload(cfg, signup, contactOk, now()));
    notifyOk = true;
  } catch (err) {
    log.error(`waitlist: notification failed for ${signup.email}: ${err.message}`);
  }
  return contactOk || notifyOk;
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on('data', (chunk) => {
      size += chunk.length;
      if (size > MAX_BODY) {
        reject(Object.assign(new Error('body too large'), { status: 413 }));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}

export function createHandler(cfg, deps = {}) {
  const allow = deps.rateLimit ?? rateLimiter();
  const underCap = deps.hourlyCap ?? rateLimiter({ max: cfg.hourlyCap, windowMs: HOUR_MS });
  const seen = deps.stamps ?? stampMemory();
  const clock = deps.now ?? (() => new Date());
  const log = deps.log ?? console;

  return async function handle(req, res) {
    const url = new URL(req.url, 'http://internal');

    if (req.method === 'GET' && url.pathname === '/healthz') {
      res.writeHead(200, { 'Content-Type': 'text/plain' }).end('ok');
      return;
    }
    if (url.pathname !== '/api/waitlist') {
      res.writeHead(404, { 'Content-Type': 'text/plain' }).end('not found');
      return;
    }
    if (req.method !== 'POST') {
      res.writeHead(405, { Allow: 'POST', 'Content-Type': 'text/plain' }).end('method not allowed');
      return;
    }

    const wantsJson = (req.headers.accept || '').includes('application/json');
    const reply = (status, ok, error, extra = {}) => {
      if (wantsJson) {
        res.writeHead(status, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
        res.end(JSON.stringify(ok ? { ok } : { ok, error, ...extra }));
      } else {
        const page = ok ? '/waitlist/thanks/' : `/waitlist/sorry/?reason=${error}`;
        res.writeHead(303, { Location: `${cfg.siteOrigin}${page}`, 'Cache-Control': 'no-store' }).end();
      }
    };

    // Another site posting its visitors' addresses into our list. A missing
    // Origin is allowed: some privacy settings strip it from form POSTs.
    const origin = req.headers.origin;
    if (origin && origin !== cfg.siteOrigin) return reply(403, false, 'origin');

    // Caddy sets X-Forwarded-For to the caller; nothing else reaches this port.
    const ip = String(req.headers['x-forwarded-for'] || req.socket.remoteAddress || '').split(',')[0].trim();
    if (!allow(ip)) return reply(429, false, 'busy');

    let body;
    try {
      body = await readBody(req);
    } catch (err) {
      return reply(err.status || 400, false, 'invalid');
    }

    const signup = parseSignup(body);
    // Answer the bot exactly as a person, so it has nothing to learn from.
    if (signup.trap) return reply(200, true);
    if (!isValidEmail(signup.email)) return reply(400, false, 'email');

    const nowS = Math.floor(clock().getTime() / 1000);
    const stamp = checkStamp(signup, { bits: cfg.powBits, nowS, seen });
    // `now` lets a visitor whose clock is off re-stamp against ours.
    if (stamp === 'clock') return reply(400, false, 'clock', { now: nowS });
    if (stamp !== 'ok') return reply(400, false, 'stamp');
    if (!underCap('all')) {
      log.warn('waitlist: hourly cap reached — refusing signups until the window rolls over');
      return reply(429, false, 'busy');
    }

    const ok = await subscribe(cfg, signup, { fetchImpl: deps.fetchImpl, log, now: clock });
    return ok ? reply(200, true) : reply(502, false, 'unavailable');
  };
}

if (import.meta.url === pathToFileURL(process.argv[1] || '').href) {
  const cfg = configFrom(process.env);
  const port = Number(process.env.PORT || 8787);
  const server = createServer(createHandler(cfg));
  server.requestTimeout = 15_000;
  server.listen(port, () => console.log(`waitlist: listening on :${port}`));
  for (const sig of ['SIGTERM', 'SIGINT']) process.on(sig, () => server.close(() => process.exit(0)));
}
