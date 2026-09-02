// Gate G9 — production dependencies must be permissively licensed.
//
// Rewritten for pnpm: the ported script walked `npm ls --omit=dev --json`,
// which reports nothing useful against a pnpm store. `pnpm licenses list`
// reads the lockfile directly and already groups by license.
import { execSync } from 'node:child_process';

const ALLOWED = new Set([
  'MIT',
  'Apache-2.0',
  'BSD-2-Clause',
  'BSD-3-Clause',
  'ISC',
  '0BSD',
  'CC0-1.0',
  'BlueOak-1.0.0',
  'Unlicense',
  'Python-2.0',
]);

// Reviewed exceptions. Each is a package we ship or build with whose license is
// acceptable for a reason that has to be stated, not assumed.
const EXCEPTIONS = [
  // SIL OFL-1.1 is the standard libre font license. Fonts are embedded assets,
  // not linked code.
  { pattern: /^@fontsource/, licenses: ['OFL-1.1'] },
  // Prebuilt libvips binaries behind Astro's sharp dependency. Build-time only
  // — nothing LGPL is distributed in dist/.
  { pattern: /^@img\/sharp-libvips/, licenses: ['LGPL-3.0-or-later'] },
  // Astro's CSS minifier and its platform binary. MPL-2.0 is file-level
  // copyleft: it reaches modifications to lightningcss's own source, which we
  // do not make and do not distribute. It runs at build time and no part of it
  // ships in dist/.
  { pattern: /^lightningcss(-|$)/, licenses: ['MPL-2.0'] },
];

function permissive(license) {
  if (!license) return false;
  if (ALLOWED.has(license)) return true;
  // SPDX disjunctions: acceptable if any branch is.
  if (license.startsWith('(') && license.endsWith(')')) {
    return license
      .slice(1, -1)
      .split(/\s+OR\s+/)
      .some((l) => ALLOWED.has(l.trim()));
  }
  return false;
}

let raw;
try {
  raw = execSync('pnpm licenses list --prod --json', {
    encoding: 'utf8',
    maxBuffer: 64e6,
    stdio: ['ignore', 'pipe', 'ignore'],
  });
} catch (err) {
  // pnpm exits non-zero when it has nothing to report on some versions.
  raw = err.stdout?.toString() ?? '';
}

if (!raw.trim()) {
  console.error('G9 FAIL — `pnpm licenses list` returned nothing; cannot verify.');
  process.exit(1);
}

const byLicense = JSON.parse(raw);
const bad = [];
let count = 0;

for (const [license, packages] of Object.entries(byLicense)) {
  for (const pkg of packages) {
    count++;
    const name = pkg.name ?? '(unnamed)';
    const excepted = EXCEPTIONS.some(
      (e) => e.pattern.test(name) && e.licenses.includes(license)
    );
    if (!excepted && !permissive(license)) {
      bad.push(`${name}@${(pkg.versions ?? []).join(',') || '?'}: ${license}`);
    }
  }
}

if (bad.length) {
  console.error('G9 FAIL — disallowed licenses:');
  for (const x of bad) console.error('  ' + x);
  process.exit(1);
}
console.log(`G9: OK — ${count} production packages, all permissive.`);
