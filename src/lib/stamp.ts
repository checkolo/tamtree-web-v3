/**
 * The proof-of-work stamp both forms send (waitlist/server.mjs, checkStamp),
 * and the stamped JSON POST that carries it. Browser-only: it runs from the
 * forms' <script>s, never at build time.
 */

// Must match WAITLIST_POW_BITS in waitlist/server.mjs (default 15).
const POW_BITS = 15;

function zeroBits(bytes: Uint8Array): number {
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

/** The nonce for sha256(`${email}:${ts}:${nonce}`) — waitlist/server.mjs checkStamp. */
async function stamp(email: string, ts: number): Promise<number> {
  const enc = new TextEncoder();
  for (let nonce = 0; ; nonce++) {
    const digest = await crypto.subtle.digest('SHA-256', enc.encode(`${email}:${ts}:${nonce}`));
    if (zeroBits(new Uint8Array(digest)) >= POW_BITS) return nonce;
  }
}

export interface Sent {
  ok: boolean;
  error: string;
  now: number;
}

async function sendOnce(form: HTMLFormElement, ts: number): Promise<Sent> {
  const body = new URLSearchParams(new FormData(form) as unknown as Record<string, string>);
  // Normalised exactly as the server does, or the hash would not match.
  const email = (body.get('email') ?? '').trim().toLowerCase();
  body.set('pow_ts', String(ts));
  body.set('pow_nonce', String(await stamp(email, ts)));
  const res = await fetch(form.action, { method: 'POST', headers: { Accept: 'application/json' }, body });
  const data = await res.json().catch(() => ({}));
  return { ok: res.ok && data.ok === true, error: String(data.error ?? ''), now: Number(data.now) };
}

/** Stamps and posts the form; a device whose clock is off by minutes re-stamps against the server's. */
export async function sendStamped(form: HTMLFormElement): Promise<Sent> {
  let result = { ok: false, error: '', now: NaN };
  try {
    result = await sendOnce(form, Math.floor(Date.now() / 1000));
    if (result.error === 'clock' && Number.isFinite(result.now)) result = await sendOnce(form, result.now);
  } catch {
    // Offline, or the endpoint is down: the caller's fallback copy covers both.
  }
  return result;
}
