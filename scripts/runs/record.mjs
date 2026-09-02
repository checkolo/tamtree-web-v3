// Record a real run from the product into a committed fixture (T0.8, C5).
//
// Usage:
//   node scripts/runs/record.mjs <run-id> <fixture-id> --title "..."
//     [--api http://localhost:8000] [--token $TAMTREE_TOKEN]
//
// This is run BY A HUMAN, against a running product, and its output is
// committed. The web build must never call the product — the coupling C5 allows
// is a script someone runs, not a build edge. Nothing in the Astro build
// imports this file.
import { writeFile, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { execSync } from 'node:child_process';

const ROOT = new URL('../../', import.meta.url).pathname;
const OUT = join(ROOT, 'src/content/runs');

const [runId, fixtureId, ...rest] = process.argv.slice(2);
const flag = (name, fallback) => {
  const i = rest.indexOf(`--${name}`);
  return i >= 0 ? rest[i + 1] : fallback;
};

if (!runId || !fixtureId) {
  console.error(
    'usage: node scripts/runs/record.mjs <run-id> <fixture-id> --title "…" [--api URL] [--token TOKEN]'
  );
  process.exit(2);
}

const api = flag('api', process.env.TAMTREE_API ?? 'http://localhost:8000');
const token = flag('token', process.env.TAMTREE_TOKEN);
const title = flag('title', fixtureId);

/** The product version the run executed on — provenance, not decoration. */
function productRef() {
  const repo = process.env.TAMTREE_REPO ?? join(ROOT, '../tamtree');
  try {
    return execSync('git rev-parse --short HEAD', { cwd: repo, encoding: 'utf8' }).trim();
  } catch {
    return 'unknown';
  }
}

const url = `${api}/v1/runs/${runId}/stream`;
console.log(`Recording ${url} …`);

const res = await fetch(url, {
  headers: {
    Accept: 'text/event-stream',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  },
});

if (!res.ok || !res.body) {
  console.error(`✗ ${res.status} ${res.statusText} — is the product running at ${api}?`);
  process.exit(1);
}

// Minimal SSE parse: `data:` lines, blank line terminates an event.
const events = [];
let buffer = '';
const decoder = new TextDecoder();

for await (const chunk of res.body) {
  buffer += decoder.decode(chunk, { stream: true });
  let i;
  while ((i = buffer.indexOf('\n\n')) >= 0) {
    const frame = buffer.slice(0, i);
    buffer = buffer.slice(i + 2);
    const data = frame
      .split('\n')
      .filter((l) => l.startsWith('data:'))
      .map((l) => l.slice(5).trim())
      .join('');
    if (!data) continue;
    try {
      const parsed = JSON.parse(data);
      // Token events are the model's output streaming character by character.
      // They are excluded: they are best-effort by the product's own delivery
      // split, they dominate the file, and nothing on this site renders them.
      if (parsed.event !== 'token') events.push(parsed);
      if (parsed.event === 'run_complete' || parsed.event === 'run_failed') {
        console.log(`  terminal: ${parsed.event}`);
      }
    } catch {
      console.warn('  (skipped a frame that was not JSON)');
    }
  }
}

if (events.length === 0) {
  console.error('✗ no events recorded — nothing written.');
  process.exit(1);
}

const fixture = {
  id: fixtureId,
  title,
  source: {
    recordedAt: new Date().toISOString(),
    productRef: productRef(),
    method: `scripts/runs/record.mjs ${runId}`,
  },
  events,
};

await mkdir(OUT, { recursive: true });
const path = join(OUT, `${fixtureId}.json`);
await writeFile(path, JSON.stringify(fixture, null, 2) + '\n');
console.log(`✓ ${events.length} events → src/content/runs/${fixtureId}.json`);
console.log('  Now run `pnpm gate:runs` to validate it before committing.');
