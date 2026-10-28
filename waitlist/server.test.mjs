// pnpm test:waitlist
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';

import { configFrom, contactPayload, createHandler, parseSignup, rateLimiter } from './server.mjs';

const ENV = {
  RESEND_API_KEY: 're_test',
  WAITLIST_FROM: 'Tamtree <waitlist@tamtree.io>',
  WAITLIST_NOTIFY_TO: 'inbox@tamtree.io',
  RESEND_TOPIC_LAUNCH_NEWS: 'topic-news',
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

const post = (base, body, headers = {}) =>
  fetch(`${base}/api/waitlist`, {
    method: 'POST',
    redirect: 'manual',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', ...headers },
    body,
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
