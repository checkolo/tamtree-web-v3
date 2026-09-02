/**
 * The hero's run scene.
 *
 * ⚠ C5 STATUS — read before changing a number here.
 *
 * The contract is that no figure describing a Tamtree run may be hand-typed:
 * durations, costs and token counts come from a recorded run of the product, or
 * they are bracketed as placeholders. T0.8 — the export pipeline that turns the
 * product's §17.4 event stream into fixtures under `content/runs/` — is not
 * built yet, so no recorded run exists to read.
 *
 * The figures below are the ones the approved artboard draws. They are
 * therefore not invented here, but they are also not sourced, which is exactly
 * the state C5 exists to end. They live in this one module rather than inline
 * in the markup so that pointing the hero at a real fixture is a change to a
 * single file instead of a re-port of the section.
 *
 * T0.8 HAS LANDED as machinery: the schema, the recorder, the derivation and
 * gate:runs all exist and are tested. What does not exist is a RECORDING —
 * that needs the product running, which is a human's action, not a build's.
 *
 * So `heroScene()` below reads a fixture named `hero` if one has been recorded
 * and falls back to these artboard values if not. The debt closes itself: the
 * moment someone runs
 *
 *     node scripts/runs/record.mjs <run-id> hero --title "…"
 *
 * the hero becomes sourced with no change to any component. Until then the
 * fallback is in force and the figures remain unsourced.
 */

import { getRun } from '../lib/runs';
import { formatDuration } from '../lib/run-view';

export type StepStatus = 'done' | 'running' | 'waiting' | 'queued';

export interface RunStep {
  /** The step's name, as the orchestrator knows it. */
  name: string;
  status: StepStatus;
  /** Short status line under the name. */
  meta: string;
  /** Optional badge text shown beside the name. */
  badge?: string;
  /** Sub-agents shown working inside the step. */
  agents?: string[];
  /** Connector leading INTO this step is dashed — the run has not reached it. */
  pendingEdge?: boolean;
}

/** Fixture id the hero prefers, when one has been recorded. */
export const HERO_RUN_ID = 'hero';

const artboardFallback = {
  /** The caption. Required by C3: a scene that conveys its point through
   *  motion must carry a text equivalent that survives with JS and CSS off. */
  caption:
    'A single orchestration mid-run: two deterministic steps have completed, an ' +
    'autonomous crew of three agents is working, the run is paused at a human ' +
    'approval step costing nothing while it waits, and the final step is queued ' +
    'behind it.',
  elapsed: '00:12.4',
  steps: [
    { name: 'fetch orders', status: 'done', meta: 'done · 0.8s' },
    { name: 'enrich', status: 'done', meta: 'done · 1.2s' },
    {
      name: 'research crew',
      status: 'running',
      badge: 'running',
      meta: '3 agents · lead decides each move',
      agents: ['lead', 'pricing agent', 'web agent'],
    },
    { name: 'human approval', status: 'waiting', badge: 'waiting', meta: 'paused · you decide' },
    { name: 'post to Slack', status: 'queued', meta: 'queued', pendingEdge: true },
  ] satisfies RunStep[],
};

/**
 * The scene the hero renders: the recorded run when there is one, the
 * artboard's illustrative values when there is not.
 *
 * `sourced` is returned rather than inferred so a component can say which it is
 * showing. Nothing currently renders it differently — but a caller that wants
 * to mark unsourced figures does not have to reach back into this module to
 * find out, and V3's no-invented-claims rule is one product decision away from
 * needing exactly that.
 */
export function heroScene(): {
  steps: RunStep[];
  caption: string;
  elapsed: string;
  sourced: boolean;
} {
  const recorded = getRun(HERO_RUN_ID);
  if (!recorded) return { ...artboardFallback, sourced: false };

  return {
    caption: artboardFallback.caption,
    elapsed: formatDuration(recorded.totals.durationMs),
    sourced: true,
    steps: recorded.steps.map((s) => ({
      name: s.name,
      status: s.status === 'failed' ? 'queued' : s.status,
      meta: s.meta,
      badge: s.status === 'running' ? 'running' : s.status === 'waiting' ? 'waiting' : undefined,
    })),
  };
}
