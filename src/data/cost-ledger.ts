import { getRun } from '../lib/runs';
import { formatCost, BRACKET } from '../lib/run-view';

/**
 * §06's cost ledger.
 *
 * ⚠ C5, and this is the second place it bites — as predicted when the hero was
 * ported. Every figure here describes a Tamtree run: a spend, a cap, and three
 * per-step costs. The contract is that these come from a recorded run or they
 * are bracketed.
 *
 * Same mechanism as the hero, for the same reason: read a fixture named
 * `ledger` if one has been recorded, otherwise fall back to the approved
 * artboard's illustrative values. Recording a run closes the debt with no
 * change to the component.
 *
 *     node scripts/runs/record.mjs <run-id> ledger --title "…"
 *
 * The cap is NOT a measurement — it is a configured budget, so it stays a
 * literal in either case.
 */

export const LEDGER_RUN_ID = 'ledger';
export const RUN_CAP_USD = 2.0;

const artboardFallback = {
  spentLabel: '$0.41',
  steps: [
    { step: 'research crew · haiku', cost: '$0.06' },
    { step: 'summarize · opus', cost: '$0.31' },
    { step: 'enrich · no model', cost: '$0.00' },
  ],
  percent: 21,
  sourced: false,
};

export function costLedger() {
  const run = getRun(LEDGER_RUN_ID);
  if (!run) return artboardFallback;

  const total = run.totals.costUsd;
  return {
    spentLabel: formatCost(total),
    steps: run.steps.map((s) => ({
      step: s.name,
      cost: s.costUsd === null ? BRACKET : formatCost(s.costUsd),
    })),
    // A bar with no measured total would be drawing a proportion of nothing.
    percent: total === null ? 0 : Math.min(100, Math.round((total / RUN_CAP_USD) * 100)),
    sourced: true,
  };
}
