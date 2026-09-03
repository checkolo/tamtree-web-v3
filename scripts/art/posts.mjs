// Post artwork, generated rather than sourced.
//
// Three reasons this is a script and not a folder of stock photography:
//
//   1. **Licence.** Every stock image carries terms, and gate:licenses exists
//      because nobody remembers which ones a year later. Art that is generated
//      here has no terms to remember.
//   2. **Palette.** These are drawn from the same hex values as tokens.css, so
//      a hero sits next to the page's own ember without the "close but wrong"
//      effect a photograph gives.
//   3. **Truth.** The diagrams describe how a run actually behaves — a retried
//      attempt, a fan-out, a ledger row. A picture of a laptop describes
//      nothing, and this blog's whole argument is that the details matter.
//
// The output lands in `content/images/`, which belongs to the CONTENT repo:
// this generator stays here because that repo is deliberately Markdown-only
// with nothing to install. Regenerate, then commit the PNGs there.
//
//   node scripts/art/posts.mjs
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import sharp from 'sharp';

const OUT = resolve(process.cwd(), 'content/images');

// Straight from tokens.css. The art is a fixed image in both themes, so it uses
// the dark ground in either — a light diagram inverts badly against dark mode
// and a dark one simply reads as a picture.
const C = {
  ground: '#0b1120',
  ground2: '#111a2b',
  panel: '#162034',
  line: '#24304a',
  ember: '#ea580c',
  ember2: '#f97316',
  emberDim: '#7c3a12',
  violet: '#a78bfa',
  green: '#2eb47c',
  warn: '#d99417',
  danger: '#b3313c',
  ink: '#f1f5f9',
  ink2: '#cbd5e1',
  ink3: '#94a3b8',
};

// Single quotes inside the stack, deliberately: these strings land inside a
// double-quoted SVG attribute, and a nested double quote closes it — producing
// an "Opening and ending tag mismatch" from the rasteriser that points at the
// wrong line entirely.
const F = "Instrument Sans, Helvetica Neue, Helvetica, Arial, sans-serif";
const M = "JetBrains Mono, SF Mono, Menlo, monospace";

/** The starfield the site's own constellation draws, frozen. */
function stars(w, h, n, seed = 7) {
  let s = seed;
  const rnd = () => ((s = (s * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
  let out = '';
  for (let i = 0; i < n; i++) {
    const x = rnd() * w;
    const y = rnd() * h;
    const r = 0.6 + rnd() * 1.5;
    out += `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="${r.toFixed(2)}" fill="${C.ember2}" opacity="${(0.06 + rnd() * 0.2).toFixed(2)}"/>`;
  }
  return out;
}

const ground = (w, h, seed) => `
  <rect width="${w}" height="${h}" fill="${C.ground}"/>
  <rect width="${w}" height="${h}" fill="url(#wash)"/>
  ${stars(w, h, Math.round((w * h) / 5200), seed)}`;

const defs = `
  <defs>
    <radialGradient id="wash" cx="18%" cy="12%" r="95%">
      <stop offset="0%" stop-color="${C.ember}" stop-opacity="0.22"/>
      <stop offset="55%" stop-color="${C.ember}" stop-opacity="0.05"/>
      <stop offset="100%" stop-color="${C.ground}" stop-opacity="0"/>
    </radialGradient>
    <!-- userSpaceOnUse, not the default. A bounding-box gradient on a straight
         horizontal stroke has zero height, and the stroke renders as nothing at
         all — the arrowheads survive and the lines silently disappear. -->
    <linearGradient id="edge" gradientUnits="userSpaceOnUse" x1="0" y1="0" x2="1200" y2="0">
      <stop offset="0%" stop-color="${C.ember}" stop-opacity="0.85"/>
      <stop offset="100%" stop-color="${C.violet}" stop-opacity="0.75"/>
    </linearGradient>
  </defs>`;

/** A node box: the same object the builder canvas draws. */
function box(x, y, w, h, label, sub, tone = C.ember, opts = {}) {
  const r = 12;
  return `
  <g>
    <rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${r}" fill="${C.panel}" stroke="${opts.stroke ?? C.line}" stroke-width="1.5"/>
    <rect x="${x}" y="${y}" width="4" height="${h}" rx="2" fill="${tone}"/>
    <circle cx="${x + 22}" cy="${y + h / 2}" r="5" fill="${tone}"/>
    <text x="${x + 38}" y="${y + (sub ? h / 2 - 4 : h / 2 + 5)}" font-family="${F}" font-size="15" font-weight="600" fill="${C.ink}">${label}</text>
    ${sub ? `<text x="${x + 38}" y="${y + h / 2 + 15}" font-family="${M}" font-size="11.5" fill="${C.ink3}">${sub}</text>` : ''}
  </g>`;
}

/** An edge with an arrowhead, drawn as a rounded elbow. */
function edge(x1, y1, x2, y2, opts = {}) {
  const mid = (x1 + x2) / 2;
  const d =
    Math.abs(y1 - y2) < 2
      ? `M ${x1} ${y1} L ${x2} ${y2}`
      : `M ${x1} ${y1} H ${mid - 14} Q ${mid} ${y1} ${mid} ${y1 + (y2 > y1 ? 14 : -14)} V ${y2 - (y2 > y1 ? 14 : -14)} Q ${mid} ${y2} ${mid + 14} ${y2} H ${x2}`;
  return `
  <path d="${d}" fill="none" stroke="${opts.stroke ?? 'url(#edge)'}" stroke-width="${opts.w ?? 2}" ${opts.dash ? `stroke-dasharray="${opts.dash}"` : ''} stroke-linecap="round"/>
  <path d="M ${x2 - 7} ${y2 - 5} L ${x2} ${y2} L ${x2 - 7} ${y2 + 5}" fill="none" stroke="${opts.stroke ?? C.violet}" stroke-width="${opts.w ?? 2}" stroke-linecap="round" stroke-linejoin="round"/>`;
}

const pill = (x, y, text, tone, w) => `
  <g>
    <rect x="${x}" y="${y}" width="${w}" height="26" rx="13" fill="${tone}" opacity="0.16"/>
    <rect x="${x}" y="${y}" width="${w}" height="26" rx="13" fill="none" stroke="${tone}" stroke-opacity="0.55"/>
    <text x="${x + w / 2}" y="${y + 17.5}" text-anchor="middle" font-family="${M}" font-size="11" letter-spacing="0.08em" fill="${tone}">${text}</text>
  </g>`;

const svg = (w, h, body) =>
  `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">${defs}${body}</svg>`;

// ── the pictures ──────────────────────────────────────────────────────────

/** Hero: a run that failed once and carried on. */
const heroDurable = () => {
  const W = 1200, H = 630;
  return svg(W, H, `${ground(W, H, 11)}
    <text x="72" y="112" font-family="${M}" font-size="13" letter-spacing="0.26em" fill="${C.ember2}">RUN 4f2a · ATTEMPT 2</text>
    <text x="72" y="176" font-family="${F}" font-size="52" font-weight="700" fill="${C.ink}">It failed at step three.</text>
    <text x="72" y="234" font-family="${F}" font-size="52" font-weight="700" fill="${C.ember2}">It did not start over.</text>

    ${edge(320, 372, 392, 372)}
    ${edge(640, 372, 712, 372)}
    ${box(72, 340, 248, 64, 'fetch invoices', 'cached · 0.4s', C.green)}
    ${box(392, 340, 248, 64, 'classify', 'cached · 2.1s', C.green)}
    ${box(712, 340, 248, 64, 'post to ledger', 'retry 2 · ok', C.ember)}

    <path d="M 900 408 V 452 Q 900 466 886 466 H 772 Q 758 466 758 452 V 410" fill="none" stroke="${C.danger}" stroke-width="2" stroke-dasharray="5 5" stroke-linecap="round"/>
    <path d="M 752 418 L 758 408 L 764 418" fill="none" stroke="${C.danger}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
    <text x="920" y="471" font-family="${M}" font-size="12.5" fill="${C.ink3}">attempt 1 · 502 from upstream</text>

    ${pill(72, 500, 'DETERMINISTIC', C.violet, 148)}
    ${pill(236, 500, 'RESUMABLE', C.ember2, 122)}
    ${pill(374, 500, 'AUDITED', C.green, 106)}
  `);
};

/** Hero: the builder canvas. */
const heroBuilder = () => {
  const W = 1200, H = 630;
  let gridLines = '';
  for (let x = 0; x <= W; x += 40) gridLines += `<line x1="${x}" y1="0" x2="${x}" y2="${H}" stroke="${C.line}" stroke-opacity="0.35"/>`;
  for (let y = 0; y <= H; y += 40) gridLines += `<line x1="0" y1="${y}" x2="${W}" y2="${y}" stroke="${C.line}" stroke-opacity="0.35"/>`;
  return svg(W, H, `${ground(W, H, 23)}${gridLines}
    <text x="72" y="104" font-family="${M}" font-size="13" letter-spacing="0.26em" fill="${C.ember2}">CANVAS · WORKFLOW 12</text>
    <text x="72" y="164" font-family="${F}" font-size="48" font-weight="700" fill="${C.ink}">A diagram you can run.</text>

    ${edge(392, 292, 470, 292)}
    ${edge(718, 292, 796, 292)}
    ${edge(392, 292, 470, 424)}
    ${edge(718, 424, 796, 316)}
    ${box(144, 260, 248, 64, 'webhook', 'trigger', C.violet)}
    ${box(470, 260, 248, 64, 'agent · triage', 'tools: 3', C.ember)}
    ${box(470, 392, 248, 64, 'agent · enrich', 'parallel', C.ember)}
    ${box(796, 260, 248, 64, 'approve', 'human · blocking', C.warn)}

    <rect x="470" y="248" width="248" height="88" rx="14" fill="none" stroke="${C.ember2}" stroke-width="2" stroke-dasharray="6 6" opacity="0.8"/>
    <text x="472" y="240" font-family="${M}" font-size="11.5" fill="${C.ember2}">selected · editing typed inputs</text>

    ${pill(144, 520, 'TYPED PORTS', C.violet, 128)}
    ${pill(288, 520, 'LIVE VALIDATION', C.green, 158)}
    ${pill(462, 520, 'SAME GRAPH AT RUNTIME', C.ember2, 224)}
  `);
};

/** Hero: the comparison. */
const heroCompare = () => {
  const W = 1200, H = 630;
  const lane = (x, title, tone, rows) => `
    <rect x="${x}" y="248" width="316" height="300" rx="18" fill="${C.panel}" stroke="${C.line}" stroke-width="1.5"/>
    <rect x="${x + 18}" y="248" width="280" height="4" rx="2" fill="${tone}"/>
    <text x="${x + 26}" y="296" font-family="${F}" font-size="21" font-weight="700" fill="${C.ink}">${title}</text>
    ${rows
      .map(
        (r, i) => `
      <circle cx="${x + 33}" cy="${337 + i * 46}" r="8" fill="none" stroke="${r[1]}" stroke-width="2"/>
      ${r[1] === C.green ? `<path d="M ${x + 29} ${337 + i * 46} l 3 3.5 l 6 -7" fill="none" stroke="${C.green}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>` : `<path d="M ${x + 30} ${333 + i * 46} l 6.5 8 M ${x + 36.5} ${333 + i * 46} l -6.5 8" fill="none" stroke="${r[1]}" stroke-width="2" stroke-linecap="round"/>`}
      <text x="${x + 54}" y="${342 + i * 46}" font-family="${F}" font-size="15" fill="${C.ink2}">${r[0]}</text>`
      )
      .join('')}`;
  return svg(W, H, `${ground(W, H, 41)}
    <text x="72" y="112" font-family="${M}" font-size="13" letter-spacing="0.26em" fill="${C.ember2}">SIDE BY SIDE</text>
    <text x="72" y="180" font-family="${F}" font-size="48" font-weight="700" fill="${C.ink}">Same picture. Different machine underneath.</text>
    ${lane(72, 'Flow automation', C.ink3, [['Steps fire in order', C.green], ['Resume mid-run', C.danger], ['Replay an attempt', C.danger], ['Agents as first class', C.danger]])}
    ${lane(442, 'Agent frameworks', C.violet, [['Steps fire in order', C.green], ['Resume mid-run', C.danger], ['Replay an attempt', C.green], ['Agents as first class', C.green]])}
    ${lane(812, 'Tamtree', C.ember, [['Steps fire in order', C.green], ['Resume mid-run', C.green], ['Replay an attempt', C.green], ['Agents as first class', C.green]])}
  `);
};

/** Figure: what one ledger row holds. */
const figLedger = () => {
  const W = 1100, H = 520;
  const row = (y, n, name, status, tone, ms) => `
    <rect x="60" y="${y}" width="980" height="58" rx="10" fill="${C.panel}" stroke="${C.line}"/>
    <text x="84" y="${y + 35}" font-family="${M}" font-size="12.5" fill="${C.ink3}">${n}</text>
    <text x="150" y="${y + 35}" font-family="${F}" font-size="16" font-weight="600" fill="${C.ink}">${name}</text>
    ${pill(600, y + 16, status, tone, 118)}
    <text x="1016" y="${y + 35}" text-anchor="end" font-family="${M}" font-size="12.5" fill="${C.ink3}">${ms}</text>`;
  return svg(W, H, `${ground(W, H, 5)}
    <text x="60" y="72" font-family="${M}" font-size="12.5" letter-spacing="0.24em" fill="${C.ember2}">LEDGER · RUN 4f2a</text>
    ${row(104, '01', 'fetch invoices', 'OK', C.green, '412ms')}
    ${row(174, '02', 'classify', 'OK', C.green, '2.1s')}
    ${row(244, '03', 'post to ledger', 'FAILED', C.danger, '30.0s')}
    ${row(314, '03', 'post to ledger', 'RETRY 2 · OK', C.ember2, '780ms')}
    ${row(384, '04', 'notify', 'OK', C.green, '96ms')}
    <text x="60" y="486" font-family="${M}" font-size="12.5" fill="${C.ink3}">every attempt kept · nothing overwritten</text>
  `);
};

/** Figure: fan-out and join. */
const figFanout = () => {
  const W = 1100, H = 460;
  return svg(W, H, `${ground(W, H, 61)}
    <text x="60" y="66" font-family="${M}" font-size="12.5" letter-spacing="0.24em" fill="${C.ember2}">FAN-OUT · 3 BRANCHES · ONE JOIN</text>
    ${edge(308, 230, 400, 128)}
    ${edge(308, 230, 400, 230)}
    ${edge(308, 230, 400, 332)}
    ${edge(648, 128, 740, 230)}
    ${edge(648, 230, 740, 230)}
    ${edge(648, 332, 740, 230)}
    ${box(60, 198, 248, 64, 'split by region', '3 items', C.violet)}
    ${box(400, 96, 248, 64, 'emea', 'ok · 1.2s', C.green)}
    ${box(400, 198, 248, 64, 'amer', 'ok · 0.9s', C.green)}
    ${box(400, 300, 248, 64, 'apac', 'retry 1 · ok', C.ember)}
    ${box(740, 198, 300, 64, 'join', 'waits for all three', C.ember2)}
  `);
};

/** Figure: the same workflow, three ways of writing it. */
const figThreeWays = () => {
  const W = 1100, H = 470;
  const col = (x, title, tone, lines) => `
    <rect x="${x}" y="112" width="316" height="292" rx="16" fill="${C.panel}" stroke="${C.line}" stroke-width="1.5"/>
    <rect x="${x + 16}" y="112" width="284" height="4" rx="2" fill="${tone}"/>
    <text x="${x + 24}" y="156" font-family="${F}" font-size="18" font-weight="700" fill="${C.ink}">${title}</text>
    ${lines.map((l, i) => `<text xml:space="preserve" x="${x + 24}" y="${196 + i * 26}" font-family="${M}" font-size="12.5" fill="${i === 0 ? C.ink2 : C.ink3}">${l}</text>`).join('')}`;
  return svg(W, H, `${ground(W, H, 89)}
    <text x="60" y="72" font-family="${M}" font-size="12.5" letter-spacing="0.24em" fill="${C.ember2}">ONE WORKFLOW · THREE SURFACES · ONE GRAPH</text>
    ${col(60, 'Canvas', C.ember, ['drag a node', 'connect a typed port', 'run it', '', 'what most people', 'open first'])}
    ${col(392, 'YAML', C.violet, ['steps:', '\u00a0\u00a0- id: triage', '\u00a0\u00a0\u00a0\u00a0uses: agent', '\u00a0\u00a0\u00a0\u00a0with: {tools: 3}', '', 'reviewable in a diff'])}
    ${col(724, 'API', C.green, ['POST /v1/runs', '{"workflow": 12}', '', 'the canvas and the', 'YAML both end up', 'calling this'])}
  `);
};

const PICTURES = {
  'hero-durable-runs.png': heroDurable,
  'hero-builder-canvas.png': heroBuilder,
  'hero-compare.png': heroCompare,
  'ledger-attempts.png': figLedger,
  'fan-out-join.png': figFanout,
  'three-surfaces.png': figThreeWays,
};

await mkdir(OUT, { recursive: true });
for (const [name, draw] of Object.entries(PICTURES)) {
  const src = draw(); if (process.env.DUMP) { await writeFile(resolve(OUT, name + ".svg"), src); }
  const png = await sharp(Buffer.from(src)).png({ compressionLevel: 9 }).toBuffer();
  await writeFile(resolve(OUT, name), png);
  console.log(`  ${name}  ${(png.length / 1024).toFixed(0)} KB`);
}
console.log(`\nwrote ${Object.keys(PICTURES).length} image(s) to content/images/ — commit them in the content repo.`);
