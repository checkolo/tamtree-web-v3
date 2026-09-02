import { z } from 'zod';

/**
 * The product's run-event contract (§17.4), mirrored for fixture validation.
 *
 * ⚠ The authority is `~/sites/tamtree/packages/sdk/tamtree_sdk/events.py`, NOT
 * the §17.4 snippet in `docs/architecture.md`. The two have already drifted:
 * the SDK carries `member`, `step_path`, `node_id`, `iteration`, `items_in`,
 * `items_out`, `ports` and `variables` that the doc's snippet does not show.
 * A schema written from the doc would reject a real recorded run.
 *
 * `gate:runs` compares this file against the SDK when the product repo is
 * present, so the drift C5 promises to catch is caught by a check rather than
 * by someone remembering. Fields added by the product are additive by its own
 * rule, so unknown keys are permitted; a field this schema requires and the
 * product no longer emits is what the gate is looking for.
 */

const base = {
  run_id: z.string(),
  seq: z.number().int(),
  ts: z.coerce.date(),
};

export const tokenEvent = z.object({
  ...base,
  event: z.literal('token'),
  step_id: z.string(),
  delta: z.string(),
  member: z.string().nullish(),
});

export const stepStartEvent = z.object({
  ...base,
  event: z.literal('step_start'),
  step_id: z.string(),
  node_id: z.string().nullish(),
  node_type: z.string(),
  iteration: z.number().int().nullish(),
  step_path: z.string().nullish(),
});

export const stepCompleteEvent = z.object({
  ...base,
  event: z.literal('step_complete'),
  step_id: z.string(),
  status: z.string(),
  duration_ms: z.number().int(),
  output_ref: z.string().nullish(),
  tokens_in: z.number().int(),
  tokens_out: z.number().int(),
  cost_usd: z.number(),
  node_id: z.string().nullish(),
  iteration: z.number().int().nullish(),
  step_path: z.string().nullish(),
  // `null`, never 0 — a count that was never measured must not read as
  // "nothing came out". The product is explicit about this and so is the site.
  items_in: z.number().int().nullish(),
  items_out: z.number().int().nullish(),
  ports: z.record(z.string(), z.number().int()).nullish(),
  variables: z.record(z.string(), z.unknown()).nullish(),
});

export const thinkEvent = z.object({
  ...base,
  event: z.literal('think'),
  iteration: z.number().int(),
  summary: z.string(),
  member: z.string().nullish(),
});

export const actEvent = z.object({
  ...base,
  event: z.literal('act'),
  iteration: z.number().int(),
  act_type: z.enum(['tool', 'delegate']),
  target: z.string(),
});

export const observeEvent = z.object({
  ...base,
  event: z.literal('observe'),
  iteration: z.number().int(),
  summary: z.string(),
  member: z.string().nullish(),
});

export const awaitingHumanEvent = z.object({
  ...base,
  event: z.literal('awaiting_human'),
  kind: z.enum(['input', 'approval']),
  prompt: z.string(),
  payload: z.record(z.string(), z.unknown()).nullish(),
});

export const humanMessageEvent = z.object({
  ...base,
  event: z.literal('human_message'),
  content: z.string(),
});

export const guardrailEvent = z.object({
  ...base,
  event: z.literal('guardrail'),
  rule: z.string(),
  action: z.string(),
  detail: z.string().nullish(),
  retracted_step_id: z.string().nullish(),
});

export const usageEvent = z.object({
  ...base,
  event: z.literal('usage'),
  tokens_in: z.number().int(),
  tokens_out: z.number().int(),
  cost_usd: z.number(),
});

export const runCompleteEvent = z.object({
  ...base,
  event: z.literal('run_complete'),
  status: z.string(),
  output_ref: z.string().nullish(),
  duration_ms: z.number().int(),
  total_cost_usd: z.number(),
});

export const runFailedEvent = z.object({
  ...base,
  event: z.literal('run_failed'),
  error_code: z.string(),
  message: z.string(),
  category: z.string(),
  ref: z.string().nullish(),
  node_id: z.string().nullish(),
  attempt: z.number().int(),
});

/**
 * Composer events (`flow_edit`, `composer_done`) are deliberately absent. They
 * describe a canvas edit, not a run — a recording that contains them is a
 * composer turn, and nothing on this site should present one as a run.
 */
export const runEvent = z.discriminatedUnion('event', [
  tokenEvent,
  stepStartEvent,
  stepCompleteEvent,
  thinkEvent,
  actEvent,
  observeEvent,
  awaitingHumanEvent,
  humanMessageEvent,
  guardrailEvent,
  usageEvent,
  runCompleteEvent,
  runFailedEvent,
]);

export type RunEvent = z.infer<typeof runEvent>;

/** A committed fixture: a recording, with the provenance that makes it usable. */
export const runFixture = z.object({
  /** Stable id the directives reference: `::run{src="support-triage"}`. */
  id: z.string().regex(/^[a-z0-9-]+$/),
  /** What this run does, in one sentence, for the caption. */
  title: z.string(),
  /**
   * Where the recording came from. C5's whole point is that a figure on this
   * site is traceable, so a fixture without provenance is not a fixture.
   */
  source: z.object({
    recordedAt: z.coerce.date(),
    /** The product version or commit the run executed on. */
    productRef: z.string(),
    /** How it was produced — the command, or "synthetic" if it ever is. */
    method: z.string(),
  }),
  events: z.array(runEvent).min(1),
});

export type RunFixture = z.infer<typeof runFixture>;
