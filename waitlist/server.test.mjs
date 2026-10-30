// pnpm test:waitlist
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { createServer } from 'node:http';

import {
  checkStamp,
  configFrom,
  contactPayload,
  createHandler,
  leadingZeroBits,
  parseContact,
  parseSignup,
  rateLimiter,
  stampMemory,
} from './server.mjs';

const ENV = {
  RESEND_API_KEY: 're_test',
  WAITLIST_FROM: 'Tamtree <waitlist@tamtree.io>',
  WAITLIST_NOTIFY_TO: 'inbox@tamtree.io',
  RESEND_TOPIC_LAUNCH_NEWS: 'topic-news',
  // Cheap enough to solve per test; production is 15.
  WAITLIST_POW_BITS: '4',
};
const BITS = 4;

/** What the form's script does, in node: find a nonce meeting `bits`. */
function solve(email, ts, bits = BITS) {
  for (let n = 0; ; n++) {
    const d = createHash('sha256').update(`${email}:${ts}:${n}`).digest();
    if (leadingZeroBits(d) >= bits) return n;
  }
}
const nowS = () => Math.floor(Date.now() / 1000);
const stamped = (body, ts = nowS()) => {
  const email = (new URLSearchParams(body).get('email') || '').trim().toLowerCase();
  return `${body}&pow_ts=${ts}&pow_nonce=${solve(email, ts)}`;
};
const quiet = { warn() {}, error() {}, log() {} };

/** A fake Resend: records every call, answers each path with the status given. */
function fakeResend(statuses = {}) {
  const calls = [];
  const fetchImpl = async (url, init) => {
    const path = new URL(url).pathname;
    calls.push({ path, body: JSON.parse(init.body), auth: init.headers.Authorization });
    const status = statuses[path] ?? 200;
    return new Response(JSON.stringify({ id: 'x' }), { status });
  };
  return { calls, fetchImpl };
}

async function withServer(deps, fn) {
  const server = createServer(createHandler(configFrom(ENV), { log: quiet, ...deps }));
  await new Promise((r) => server.listen(0, r));
  const base = `http://127.0.0.1:${server.address().port}`;
  try {
    await fn(base);
  } finally {
    server.close();
  }
}

/** POSTs with a valid stamp added, unless the body already says pow_ or `raw` is set. */
const post = (base, body, headers = {}, { raw = false, path = '/api/waitlist' } = {}) =>
  fetch(`${base}${path}`, {
    method: 'POST',
    redirect: 'manual',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', ...headers },
    body: raw || body.includes('pow_') ? body : stamped(body),
  });

test('config refuses to start without its secrets', () => {
  assert.throws(() => configFrom({}), /RESEND_API_KEY, WAITLIST_FROM, WAITLIST_NOTIFY_TO/);
});

test('parse keeps known tags once and drops the rest', () => {
  const s = parseSignup('email=%20A@B.io%20&tag=waitlist&tag=launch-news&tag=launch-news&tag=evil');
  assert.equal(s.email, 'a@b.io');
  assert.deepEqual(s.tags, ['waitlist', 'launch-news']);
});

test('opt-ins map to topics; an unset topic id is skipped', () => {
  const p = contactPayload(configFrom(ENV), { email: 'a@b.io', tags: ['waitlist'] });
  assert.deepEqual(p.topics, [{ id: 'topic-news', subscription: 'opt_out' }]);
  assert.equal(p.segments, undefined);
});

test('no-JS signup saves the contact, notifies, and 303s to thanks', async () => {
  const resend = fakeResend();
  await withServer({ fetchImpl: resend.fetchImpl }, async (base) => {
    const res = await post(base, 'email=a@b.io&tag=waitlist&tag=launch-news');
    assert.equal(res.status, 303);
    assert.equal(res.headers.get('location'), 'https://www.tamtree.io/waitlist/thanks/');
  });
  assert.deepEqual(resend.calls.map((c) => c.path), ['/contacts', '/emails']);
  assert.equal(resend.calls[0].auth, 'Bearer re_test');
  assert.deepEqual(resend.calls[0].body.topics, [{ id: 'topic-news', subscription: 'opt_in' }]);
  assert.equal(resend.calls[1].body.reply_to, 'a@b.io');
  assert.match(resend.calls[1].body.subject, /a@b\.io \(launch-news\)/);
});

test('the JSON path answers JSON', async () => {
  const resend = fakeResend();
  await withServer({ fetchImpl: resend.fetchImpl }, async (base) => {
    const res = await post(base, 'email=a@b.io', { Accept: 'application/json' });
    assert.equal(res.status, 200);
    assert.deepEqual(await res.json(), { ok: true });
  });
});

test('a failed contact write still succeeds through the notification, and says so', async () => {
  const resend = fakeResend({ '/contacts': 422 });
  await withServer({ fetchImpl: resend.fetchImpl }, async (base) => {
    const res = await post(base, 'email=a@b.io', { Accept: 'application/json' });
    assert.equal(res.status, 200);
  });
  assert.match(resend.calls[1].body.text, /Saved as a Resend contact: NO/);
});

test('both writes failing is reported as a failure', async () => {
  const resend = fakeResend({ '/contacts': 500, '/emails': 500 });
  await withServer({ fetchImpl: resend.fetchImpl }, async (base) => {
    const json = await post(base, 'email=a@b.io', { Accept: 'application/json' });
    assert.equal(json.status, 502);
    assert.deepEqual(await json.json(), { ok: false, error: 'unavailable' });
    const form = await post(base, 'email=c@d.io');
    assert.equal(form.headers.get('location'), 'https://www.tamtree.io/waitlist/sorry/?reason=unavailable');
  });
});

test('a bad email never reaches Resend', async () => {
  const resend = fakeResend();
  await withServer({ fetchImpl: resend.fetchImpl }, async (base) => {
    const res = await post(base, 'email=nope', { Accept: 'application/json' });
    assert.equal(res.status, 400);
  });
  assert.equal(resend.calls.length, 0);
});

test('the honeypot looks like success and writes nothing', async () => {
  const resend = fakeResend();
  await withServer({ fetchImpl: resend.fetchImpl }, async (base) => {
    const res = await post(base, 'email=a@b.io&company=Acme', { Accept: 'application/json' });
    assert.equal(res.status, 200);
  });
  assert.equal(resend.calls.length, 0);
});

test('a foreign Origin is refused', async () => {
  const resend = fakeResend();
  await withServer({ fetchImpl: resend.fetchImpl }, async (base) => {
    const res = await post(base, 'email=a@b.io', { Origin: 'https://evil.example', Accept: 'application/json' });
    assert.equal(res.status, 403);
  });
  assert.equal(resend.calls.length, 0);
});

test('rate limit: the sixth try in a window is refused, the next window is not', () => {
  let t = 0;
  const allow = rateLimiter({ now: () => t, max: 5, windowMs: 1000 });
  for (let i = 0; i < 5; i++) assert.equal(allow('ip'), true);
  assert.equal(allow('ip'), false);
  assert.equal(allow('other'), true);
  t = 1000;
  assert.equal(allow('ip'), true);
});

test('only POST /api/waitlist is served', async () => {
  await withServer({ fetchImpl: fakeResend().fetchImpl }, async (base) => {
    assert.equal((await fetch(`${base}/api/waitlist`)).status, 405);
    assert.equal((await fetch(`${base}/elsewhere`)).status, 404);
    assert.equal((await fetch(`${base}/healthz`)).status, 200);
  });
});

test('leading zero bits counts across bytes', () => {
  assert.equal(leadingZeroBits(Uint8Array.from([0, 0x0f])), 12);
  assert.equal(leadingZeroBits(Uint8Array.from([0x80])), 0);
  assert.equal(leadingZeroBits(Uint8Array.from([0, 0])), 16);
});

test('stamp: valid once, bound to the email, inside the clock window', () => {
  const seen = stampMemory();
  const ts = 1_000_000;
  const n = solve('a@b.io', ts);
  const signup = { email: 'a@b.io', stampTs: String(ts), stampNonce: String(n) };
  assert.equal(checkStamp(signup, { bits: BITS, nowS: ts, seen }), 'ok');
  assert.equal(checkStamp(signup, { bits: BITS, nowS: ts, seen }), 'stamp', 'reused');
  // The stamp is bound to its address: pick a ts where a@b.io's nonce does not
  // also happen to meet the target for x@b.io (1 in 16 at 4 bits), then reuse it.
  let t2 = ts;
  while (leadingZeroBits(createHash('sha256').update(`x@b.io:${t2}:${solve('a@b.io', t2)}`).digest()) >= BITS) t2++;
  const moved = { email: 'x@b.io', stampTs: String(t2), stampNonce: String(solve('a@b.io', t2)) };
  assert.equal(checkStamp(moved, { bits: BITS, nowS: t2, seen: stampMemory() }), 'stamp');
  assert.equal(checkStamp(signup, { bits: BITS, nowS: ts + 301, seen: stampMemory() }), 'clock');
  assert.equal(checkStamp({ ...signup, stampNonce: 'abc' }, { bits: BITS, nowS: ts, seen: stampMemory() }), 'stamp');
});

test('a POST without a stamp — the no-JS path — is refused before Resend', async () => {
  const resend = fakeResend();
  await withServer({ fetchImpl: resend.fetchImpl }, async (base) => {
    const res = await post(base, 'email=a@b.io', {}, { raw: true });
    assert.equal(res.status, 303);
    assert.equal(res.headers.get('location'), 'https://www.tamtree.io/waitlist/sorry/?reason=stamp');
  });
  assert.equal(resend.calls.length, 0);
});

test('a stale clock gets the server time back, and a re-stamp with it succeeds', async () => {
  const resend = fakeResend();
  await withServer({ fetchImpl: resend.fetchImpl }, async (base) => {
    const json = { Accept: 'application/json' };
    const stale = await post(base, stamped('email=a@b.io', nowS() - 3600), json);
    assert.equal(stale.status, 400);
    const body = await stale.json();
    assert.equal(body.error, 'clock');
    const retry = await post(base, stamped('email=a@b.io', body.now), json);
    assert.equal(retry.status, 200);
  });
});

test('the hourly cap refuses signups across every address', async () => {
  const resend = fakeResend();
  const hourlyCap = rateLimiter({ max: 2, windowMs: 3_600_000 });
  await withServer({ fetchImpl: resend.fetchImpl, hourlyCap, rateLimit: () => true }, async (base) => {
    const json = { Accept: 'application/json' };
    assert.equal((await post(base, 'email=a@b.io', json)).status, 200);
    assert.equal((await post(base, 'email=c@d.io', json)).status, 200);
    const third = await post(base, 'email=e@f.io', json);
    assert.equal(third.status, 429);
    assert.deepEqual(await third.json(), { ok: false, error: 'busy' });
  });
  assert.equal(resend.calls.length, 4);
});

const message = (base, body, headers = {}, opts = {}) => post(base, body, headers, { ...opts, path: '/api/contact' });

test('contact parse: one-line name, known topic or general, normalised newlines', () => {
  const c = parseContact('name=Ann%0ABcc:%20x@y.io&email=%20A@B.io&topic=evil&message=%20hi%0D%0Athere%20');
  assert.equal(c.name, 'Ann Bcc: x@y.io');
  assert.equal(c.email, 'a@b.io');
  assert.equal(c.topic, 'general');
  assert.equal(c.message, 'hi\nthere');
  assert.equal(parseContact('topic=deletion').topic, 'deletion');
  assert.equal(parseContact('topic=toString').topic, 'general');
});

test('contact goes to CONTACT_TO with the sender as reply-to', async () => {
  const resend = fakeResend();
  const server = createServer(
    createHandler(configFrom({ ...ENV, CONTACT_TO: 'private@example.com' }), { log: quiet, fetchImpl: resend.fetchImpl }),
  );
  await new Promise((r) => server.listen(0, r));
  try {
    const base = `http://127.0.0.1:${server.address().port}`;
    const res = await message(base, 'name=Ann&email=a@b.io&topic=deletion&message=Delete%20me', { Accept: 'application/json' });
    assert.equal(res.status, 200);
    assert.deepEqual(await res.json(), { ok: true });
  } finally {
    server.close();
  }
  assert.deepEqual(resend.calls.map((c) => c.path), ['/emails']);
  const mail = resend.calls[0].body;
  assert.deepEqual(mail.to, ['private@example.com']);
  assert.equal(mail.reply_to, 'a@b.io');
  assert.equal(mail.subject, 'Data deletion request: Ann');
  assert.match(mail.text, /From: Ann <a@b\.io>/);
  assert.match(mail.text, /\n\nDelete me\n/);
});

test('contact falls back to the waitlist inbox when CONTACT_TO is unset', async () => {
  const resend = fakeResend();
  await withServer({ fetchImpl: resend.fetchImpl }, async (base) => {
    const res = await message(base, 'email=a@b.io&message=hello');
    assert.equal(res.status, 303);
    assert.equal(res.headers.get('location'), 'https://www.tamtree.io/contact/sent/');
  });
  assert.deepEqual(resend.calls[0].body.to, ['inbox@tamtree.io']);
  assert.equal(resend.calls[0].body.subject, 'General question: a@b.io');
});

test('contact refuses an empty or oversized message before Resend', async () => {
  const resend = fakeResend();
  await withServer({ fetchImpl: resend.fetchImpl }, async (base) => {
    const json = { Accept: 'application/json' };
    const empty = await message(base, 'email=a@b.io&message=%20%20', json);
    assert.equal(empty.status, 400);
    assert.deepEqual(await empty.json(), { ok: false, error: 'message' });
    const long = await message(base, `email=a@b.io&message=${'x'.repeat(5001)}`, json);
    assert.deepEqual(await long.json(), { ok: false, error: 'message' });
  });
  assert.equal(resend.calls.length, 0);
});

test('contact: no stamp lands on not-sent, a failed send says unavailable', async () => {
  const resend = fakeResend({ '/emails': 500 });
  await withServer({ fetchImpl: resend.fetchImpl }, async (base) => {
    const raw = await message(base, 'email=a@b.io&message=hi', {}, { raw: true });
    assert.equal(raw.headers.get('location'), 'https://www.tamtree.io/contact/not-sent/?reason=stamp');
    const down = await message(base, 'email=a@b.io&message=hi', { Accept: 'application/json' });
    assert.equal(down.status, 502);
    assert.deepEqual(await down.json(), { ok: false, error: 'unavailable' });
  });
});

test('contact has its own limits, apart from the waitlist', async () => {
  const resend = fakeResend();
  const contactHourlyCap = rateLimiter({ max: 1, windowMs: 3_600_000 });
  await withServer({ fetchImpl: resend.fetchImpl, contactHourlyCap }, async (base) => {
    const json = { Accept: 'application/json' };
    assert.equal((await message(base, 'email=a@b.io&message=one', json)).status, 200);
    assert.equal((await message(base, 'email=c@d.io&message=two', json)).status, 429);
    assert.equal((await post(base, 'email=e@f.io', json)).status, 200);
  });
});

test('the honeypot on the contact form looks like success and sends nothing', async () => {
  const resend = fakeResend();
  await withServer({ fetchImpl: resend.fetchImpl }, async (base) => {
    const res = await message(base, 'email=a@b.io&message=hi&company=Acme', { Accept: 'application/json' });
    assert.equal(res.status, 200);
  });
  assert.equal(resend.calls.length, 0);
});
