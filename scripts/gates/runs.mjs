// Gate — run fixtures are valid, and the schema still matches the product.
//
// Two jobs. The first is ordinary: every committed fixture must parse against
// the §17.4 schema, so a malformed recording fails the build rather than
// rendering as a run with holes in it.
//
// The second is the one C5 actually promises — "the marketing build becomes a
// check on the product's own event format, so drift in §17.4 breaks the site
// loudly". That only happens if something compares them. This does: it reads
// the field names off the product's own `events.py` and checks that every field
// this site's schema REQUIRES is still emitted.
//
// The comparison is deliberately one-directional. The product adds fields
// additively by its own rule, so a field the product has and the site does not
// is normal and not reported. A field the site requires and the product has
// dropped or renamed is the drift that would silently produce wrong figures.
//
// Reading the sibling repo is not a build edge: this is a gate a developer or
// CI runs, and it skips cleanly when the product is not checked out.
import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { runFixture } from '../../src/schemas/run-events.ts';

const ROOT = new URL('../../', import.meta.url).pathname;
const FIXTURES = join(ROOT, 'src/content/runs');
const PRODUCT_EVENTS =
  process.env.TAMTREE_EVENTS_PY ?? join(ROOT, '../tamtree/packages/sdk/tamtree_sdk/events.py');

const failures = [];
const notes = [];

// ── 1 · every fixture parses ────────────────────────────────────────────────
let files = [];
try {
  files = (await readdir(FIXTURES)).filter((f) => f.endsWith('.json'));
} catch {
  /* directory not created yet */
}

for (const f of files) {
  const raw = await readFile(join(FIXTURES, f), 'utf8');
  let json;
  try {
    json = JSON.parse(raw);
  } catch (err) {
    failures.push(`${f}: not valid JSON — ${err.message}`);
    continue;
  }
  const result = runFixture.safeParse(json);
  if (!result.success) {
    const issues = result.error.issues
      .slice(0, 5)
      .map((i) => `      ${i.path.join('.') || '(root)'}: ${i.message}`)
      .join('\n');
    failures.push(`${f}: does not match the §17.4 fixture schema\n${issues}`);
  }
}

// ── 2 · schema vs the product's events.py ───────────────────────────────────
const py = await readFile(PRODUCT_EVENTS, 'utf8').catch(() => null);

if (py === null) {
  notes.push(
    `product not checked out at ${PRODUCT_EVENTS} — drift check skipped. ` +
      `Set TAMTREE_EVENTS_PY to run it.`
  );
} else {
  // Field names per event class, from the product's own source.
  const productFields = new Map();
  for (const m of py.matchAll(/class (\w+Event)\(_Base\):([\s\S]*?)(?=\nclass |\n# |$)/g)) {
    const body = m[2];
    const literal = /event:\s*Literal\["([^"]+)"\]/.exec(body);
    if (!literal) continue;
    const fields = new Set(['run_id', 'seq', 'ts', 'event']);
    for (const f of body.matchAll(/^\s{4}(\w+)\s*:/gm)) fields.add(f[1]);
    productFields.set(literal[1], fields);
  }

  if (productFields.size === 0) {
    failures.push(
      `could not parse any event classes out of ${PRODUCT_EVENTS} — the drift check is blind, ` +
        `which is worse than absent. Its parser needs updating to the file's current shape.`
    );
  }

  // Field names this site REQUIRES, read off the Zod schema.
  const ts = await readFile(join(ROOT, 'src/schemas/run-events.ts'), 'utf8');
  const siteRequired = new Map();
  for (const m of ts.matchAll(/z\.object\(\{([\s\S]*?)\n\}\)/g)) {
    const body = m[1];
    const literal = /event:\s*z\.literal\('([^']+)'\)/.exec(body);
    if (!literal) continue;
    const required = new Set(['run_id', 'seq', 'ts', 'event']);
    for (const f of body.matchAll(/^\s{2}(\w+):\s*z\.(?!.*nullish\(\))/gm)) required.add(f[1]);
    siteRequired.set(literal[1], required);
  }

  for (const [eventName, required] of siteRequired) {
    const theirs = productFields.get(eventName);
    if (!theirs) {
      failures.push(
        `DRIFT — the site's schema has an event "${eventName}" the product no longer defines. ` +
          `Every figure derived from it is now unsourced.`
      );
      continue;
    }
    for (const field of required) {
      if (!theirs.has(field)) {
        failures.push(
          `DRIFT — "${eventName}.${field}" is required by this site but the product no longer ` +
            `emits it. A fixture recorded today would fail, and any figure read from that field ` +
            `is stale.`
        );
      }
    }
  }
  notes.push(`drift check ran against ${productFields.size} product event class(es).`);
}

// ── report ──────────────────────────────────────────────────────────────────
for (const n of notes) console.log(`  (${n})`);

if (failures.length) {
  console.error(`gate:runs FAIL — ${failures.length} problem(s):`);
  for (const f of failures) console.error('  ' + f);
  process.exit(1);
}

if (files.length === 0) {
  console.log(
    'gate:runs: OK — schema valid, no fixtures recorded yet.\n' +
      '  ⚠ C5 DEBT: with no fixture, every run figure on the site must be bracketed\n' +
      '    as [pending]. Record one with `node scripts/runs/record.mjs <run-id> <name>`.'
  );
} else {
  console.log(`gate:runs: OK — ${files.length} fixture(s) valid against §17.4.`);
}
