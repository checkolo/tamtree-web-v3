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
 * When T0.8 lands: replace the export below with a fixture read, and delete
 * this notice. Until then this is tracked as C5 debt in the handover, not as a
 * satisfied contract.
 */

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

export const heroRun = {
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
