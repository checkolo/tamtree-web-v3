import type { RunEvent, RunFixture } from '../schemas/run-events';

/**
 * Derive what a directive renders from a recorded event stream.
 *
 * `:::run`, `:::ledger` and `::dag` all read the same fixture and differ only
 * in what they draw, so the fold from events to a view happens once, here.
 *
 * Every figure a directive can show comes out of this function. Nothing
 * downstream may compute a duration, a cost or a token count of its own — that
 * is how C5 stays true after the fixture lands, rather than only on the day it
 * does.
 */

export type StepStatus = 'done' | 'running' | 'waiting' | 'queued' | 'failed';

export interface StepView {
  id: string;
  name: string;
  status: StepStatus;
  /** Milliseconds, or null when the step never completed. */
  durationMs: number | null;
  costUsd: number | null;
  tokensIn: number | null;
  tokensOut: number | null;
  /** Human-readable status line: "done · 0.8s". */
  meta: string;
  /** Set when the run paused here for a person. */
  awaiting?: { kind: 'input' | 'approval'; prompt: string };
}

export interface RunView {
  id: string;
  title: string;
  steps: StepView[];
  totals: {
    durationMs: number | null;
    costUsd: number | null;
    tokensIn: number | null;
    tokensOut: number | null;
  };
  guardrails: { rule: string; action: string; detail: string | null }[];
  status: string | null;
  recordedAt: Date;
  productRef: string;
}

/** "0.8s", "1m 04s" — the artboards' shape, not a library's. */
export function formatDuration(ms: number | null): string {
  if (ms === null) return BRACKET;
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60_000) return `${(ms / 1000).toFixed(1)}s`;
  const m = Math.floor(ms / 60_000);
  const s = Math.round((ms % 60_000) / 1000);
  return `${m}m ${String(s).padStart(2, '0')}s`;
}

export function formatCost(usd: number | null): string {
  if (usd === null) return BRACKET;
  return usd < 0.01 ? `$${usd.toFixed(4)}` : `$${usd.toFixed(2)}`;
}

/**
 * The placeholder C5 mandates for a figure with no recorded source.
 *
 * It is deliberately conspicuous. A missing figure that renders as an empty
 * cell or a dash reads as "this run cost nothing"; one that reads `[pending]`
 * cannot be mistaken for a measurement, which is the entire point of the rule.
 */
export const BRACKET = '[pending]';

export function runView(fixture: RunFixture): RunView {
  const steps = new Map<string, StepView>();
  const order: string[] = [];
  const guardrails: RunView['guardrails'] = [];
  let status: string | null = null;
  let totalDuration: number | null = null;
  let totalCost: number | null = null;
  let tokensIn: number | null = null;
  let tokensOut: number | null = null;

  const ensure = (id: string, name?: string): StepView => {
    let s = steps.get(id);
    if (!s) {
      s = {
        id,
        name: name ?? id,
        status: 'queued',
        durationMs: null,
        costUsd: null,
        tokensIn: null,
        tokensOut: null,
        meta: 'queued',
      };
      steps.set(id, s);
      order.push(id);
    }
    if (name) s.name = name;
    return s;
  };

  for (const e of fixture.events as RunEvent[]) {
    switch (e.event) {
      case 'step_start': {
        const s = ensure(e.step_path ?? e.step_id, e.node_id ?? e.step_id);
        s.status = 'running';
        s.meta = 'running';
        break;
      }
      case 'step_complete': {
        const s = ensure(e.step_path ?? e.step_id, e.node_id ?? e.step_id);
        s.durationMs = e.duration_ms;
        s.costUsd = e.cost_usd;
        s.tokensIn = e.tokens_in;
        s.tokensOut = e.tokens_out;
        s.status = e.status === 'ok' || e.status === 'success' ? 'done' : 'failed';
        s.meta = `${s.status} · ${formatDuration(e.duration_ms)}`;
        break;
      }
      case 'awaiting_human': {
        // The pause attaches to whichever step is currently running — the
        // stream does not name one, and the running step is what it interrupted.
        const running = order.map((id) => steps.get(id)!).findLast((s) => s.status === 'running');
        if (running) {
          running.status = 'waiting';
          running.meta = 'paused · you decide';
          running.awaiting = { kind: e.kind, prompt: e.prompt };
        }
        break;
      }
      case 'guardrail':
        guardrails.push({ rule: e.rule, action: e.action, detail: e.detail ?? null });
        break;
      case 'usage':
        tokensIn = e.tokens_in;
        tokensOut = e.tokens_out;
        totalCost = e.cost_usd;
        break;
      case 'run_complete':
        status = e.status;
        totalDuration = e.duration_ms;
        totalCost = e.total_cost_usd;
        break;
      case 'run_failed':
        status = 'failed';
        break;
    }
  }

  return {
    id: fixture.id,
    title: fixture.title,
    steps: order.map((id) => steps.get(id)!),
    totals: { durationMs: totalDuration, costUsd: totalCost, tokensIn, tokensOut },
    guardrails,
    status,
    recordedAt: fixture.source.recordedAt,
    productRef: fixture.source.productRef,
  };
}
