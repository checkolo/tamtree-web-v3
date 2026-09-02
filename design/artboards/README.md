# Frozen artboards

The four v3 homepage artboards, vendored here so `gate:visual` has a reference
that is versioned alongside the code rather than resolved through a path into
the planning repo. Source of truth remains
`agent-orchestrator/changes/2026-09-01-tamtree-web2-implementation/canvas-v3-*/`;
these are copies frozen on 2026-09-02 and should be re-copied deliberately, as
a commit that says the design changed.

| File | Width | Theme |
|---|---|---|
| `desktop-light.dc.html` | 1440 | light |
| `desktop-dark.dc.html` | 1440 | dark |
| `mobile-light.dc.html` | 390 | light |
| `mobile-dark.dc.html` | 390 | dark |

They are canvas documents, not pages: they carry `<x-dc>` and `<helmet>`
wrappers and reference a `support.js` that only exists inside the canvas editor.
`scripts/artboards/export.mjs` normalises that away before rendering — see the
comment there for exactly what it changes and why each change is safe.

**Known deltas from the built site**, deliberate and recorded rather than
absorbed into a tolerance:

| Token | Artboard | Built | Why |
|---|---|---|---|
| `--ink-3` (light) | `#64748b` | `#617086` | 4.27:1 on `--surface`, fails WCAG AA at 12px |
| `--ink-4` (light) | `#8b93a1` | `#696f7a` | 2.77:1, fails badly |
| `--ink-4` (dark) | `#64748b` | `#738196` | 3.75:1 on `--surface` |

Until the artboards are redrawn with these values, `gate:visual` will report a
difference wherever small secondary text sits. That is the gate being correct.
