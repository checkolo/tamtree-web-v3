/**
 * The product pages' single source (T2.3).
 *
 * The footer's link columns, the /product/ overview grid and every
 * /product/<slug>/ page are all generated from this list, so a feature cannot
 * be linked from one place and missing from another — which is exactly how the
 * footer shipped six links to routes that did not exist.
 *
 * Every claim here is traceable to the product spec
 * (`~/sites/tamtree/docs/architecture.md` — §3 positioning, §6 execution, WS3
 * AI, WS4 trust layer, WS5 editor). The pre-launch rules from the copy deck
 * still bind: no figure that is not sourced, no licensing or pricing language
 * (gate:copy), and nothing that reads as a ship date.
 */

export type Tone = 'brand' | 'compose' | 'warn' | 'good' | 'live' | 'danger';

export interface Point {
  title: string;
  body: string;
}

export interface Feature {
  slug: string;
  name: string;
  /** Footer column the link sits in. */
  group: 'product' | 'platform';
  tone: Tone;
  /** The page's <h1>. */
  title: string;
  /** Meta description and the overview card's line. */
  summary: string;
  lede: string;
  points: Point[];
  /** "In a run" — a short, ordered account of the feature doing its job. */
  flow: { title: string; steps: string[] };
  chips: string[];
}

export const FEATURES: Feature[] = [
  {
    slug: 'pipelines',
    name: 'Pipelines',
    group: 'product',
    tone: 'brand',
    title: 'The same steps, in the same order, every time.',
    summary:
      'Deterministic workflows for work that should be boring — sync, ETL, billing — on an engine that resumes where it stopped.',
    lede:
      'A pipeline is a deterministic graph of steps: you decide the order, and it never improvises. Draw it on a canvas, test it against real data, and run it on durable execution — so a crash in the middle is an interruption, not a loss.',
    points: [
      {
        title: 'A canvas with typed ports',
        body: 'Drag steps from a palette of triggers, logic, data shaping, connectors and human checkpoints. Connections are validated as you draw them, not when the run fails.',
      },
      {
        title: 'Expressions when you need them',
        body: '{{ }} expressions reach into upstream data, with autocomplete from the steps before. When an expression is not enough, a sandboxed Code step takes Python or JavaScript.',
      },
      {
        title: 'Test against real data',
        body: 'Run a draft from any step. Pin sample data upstream and see each step’s input and output side by side — without re-running everything before it.',
      },
      {
        title: 'Crash-proof by construction',
        body: 'Every step is checkpointed by durable execution. If a process dies or a host is replaced, the run continues from the last completed step with its state intact.',
      },
      {
        title: 'Humans in the loop',
        body: 'An approval step parks the run until someone answers — an hour later or next week — and it uses no compute while it waits.',
      },
      {
        title: 'A step can be a crew',
        body: 'When one step needs judgment, drop a crew into it. Everything around it stays deterministic, and the crew’s work is traced like any other step.',
      },
    ],
    flow: {
      title: 'A nightly sync, end to end',
      steps: [
        'A schedule trigger starts the run and records which published version it runs.',
        'Steps fetch, reshape and validate records, each one persisting its output before the next begins.',
        'A worker restarts halfway through. The run resumes at the step that was in flight; completed steps are not repeated.',
        'An approval step holds the write until a person signs it off.',
        'The final step writes the result, and the run lands in history with every step’s input, output, duration and cost.',
      ],
    },
    chips: ['webhook · schedule · polling triggers', 'sub-workflows', 'error workflows', 'sandboxed code', 'versioned publishes'],
  },
  {
    slug: 'crews',
    name: 'Crews',
    group: 'product',
    tone: 'compose',
    title: 'A lead agent. A team. No script.',
    summary:
      'Multi-agent teams for open-ended work — research, triage, support — where a lead agent decides each move.',
    lede:
      'Some work cannot be written down in advance. A crew is a team of agents with a lead that decides each move: who to ask, which tool to call, when it is done. You set who is on the team and what each member may touch; the lead works out the rest.',
    points: [
      {
        title: 'A lead and its members',
        body: 'The lead delegates to members, each with its own instructions, tools and knowledge. You see every hand-off, not just the final answer.',
      },
      {
        title: 'Agents built from parts',
        body: 'Model, tools, skills, knowledge, memory, persona and guardrails attach to an agent on the same canvas. An agent is defined once and reused across every flow that needs it.',
      },
      {
        title: 'Conversations that survive',
        body: 'A crew’s thread is durable state. A user can come back days later and the conversation resumes from where it stopped, even after the run that started it has ended.',
      },
      {
        title: 'Watch it think',
        body: 'The chat panel streams the crew as it works — its reasoning steps, the tool it called, what came back, and the running cost of the turn.',
      },
      {
        title: 'Asks before it acts',
        body: 'On a run started from a public channel, a tool that changes something in the world waits for a person to approve it by default. Letting an agent act alone is an explicit, per-tool switch, and it is written to the audit log.',
      },
      {
        title: 'Pipelines as tools',
        body: 'A crew can call a pipeline the way it calls any tool, so the parts of the job that must be exact stay exact.',
      },
    ],
    flow: {
      title: 'A support question, end to end',
      steps: [
        'A visitor asks a question in the chat widget, which starts or resumes their conversation.',
        'The lead reads the question and hands the lookup to a member grounded on the help centre.',
        'The member searches the knowledge base and reports back, and its sources are recorded for the groundedness check.',
        'The lead decides a refund is needed. The refund tool changes something, so the run pauses for approval.',
        'A teammate approves; the run resumes, the refund is issued, and the visitor gets an answer.',
      ],
    },
    chips: ['lead → members', 'durable threads', 'tool approval', 'skills', 'personas', 'reusable agents'],
  },
  {
    slug: 'guardrails',
    name: 'Guardrails',
    group: 'product',
    tone: 'warn',
    title: 'Checked by the runtime, on every call.',
    summary:
      'PII, prompt injection, moderation and groundedness checks on every model call — enforced by the runtime, not requested of the model.',
    lede:
      'Asking a model nicely is not a control. Tamtree puts guardrails in the path of every model call, and each one decides what happens next: let it through, redact it, block it, regenerate it, or hand it to a person.',
    points: [
      {
        title: 'Fast checks, in the call path',
        body: 'PII, prompt-injection heuristics, output schema and size limits run inline, before a response is used. They can allow, redact, block or regenerate.',
      },
      {
        title: 'Judged checks, off the hot path',
        body: 'Moderation, groundedness and a model-based injection classifier run right after the response, so they do not slow the conversation down. They can flag, escalate to a person, or retract and regenerate. Where a check has to block, you can move it inline.',
      },
      {
        title: 'PII, redacted',
        body: 'Email addresses, phone numbers, card numbers, IBANs and high-entropy secrets are detected and redacted on the way in and on the way out.',
      },
      {
        title: 'Injection, contained',
        body: 'Known jailbreak phrasings and encoded payloads are caught, and retrieved documents and tool results are fenced off as data, so the model is told they are not instructions.',
      },
      {
        title: 'Groundedness, checked',
        body: 'When an agent answers from a knowledge base, its claims are checked against the passages it actually retrieved on that turn.',
      },
      {
        title: 'Every decision on the record',
        body: 'Each verdict is an event on the run’s trace: which rule fired, what it saw, and what it did. Set defaults for the workspace and override them per agent or per flow.',
      },
    ],
    flow: {
      title: 'One reply, three verdicts',
      steps: [
        'An agent drafts a reply that includes a customer’s email address.',
        'The PII check redacts the address before the reply leaves the runtime.',
        'A tool result tries to smuggle in “ignore previous instructions”, and the injection check blocks it.',
        'After the reply streams, the groundedness judge confirms its claim matches a retrieved passage.',
        'All three verdicts sit on the run’s trace as guardrail events.',
      ],
    },
    chips: ['block', 'redact', 'regenerate', 'escalate to a human', 'flag', 'retract & regenerate'],
  },
  {
    slug: 'evals',
    name: 'Evals',
    group: 'platform',
    tone: 'good',
    title: 'CI for agent behavior.',
    summary:
      'Eval suites, LLM-as-judge and promotion gates, so a prompt change that hurts quality never reaches production.',
    lede:
      'A prompt is code that nobody compiles. Tamtree treats a change to an agent like a change to software: it runs a suite, gets a score, and does not publish if the score falls short.',
    points: [
      {
        title: 'Suites of real cases',
        body: 'Each case is an input plus assertions: exact or partial matches, regex, JSON schema, which tools were or were not called, and limits on cost, latency and tokens.',
      },
      {
        title: 'LLM-as-judge',
        body: 'For answers with no single right string, a judge model scores the output against a rubric you write, each with its own pass threshold.',
      },
      {
        title: 'Simulation, not side effects',
        body: 'Eval runs execute in simulate mode: tools that would change something return recorded fixtures or valid mocks instead. Grading an agent never sends the email.',
      },
      {
        title: 'Promotion gates',
        body: 'Publishing is blocked unless every suite attached to the gate meets its threshold. The score is stored on the version, so you can always see what it earned.',
      },
      {
        title: 'Watching after release',
        body: 'Online evals sample production runs and judge them, and a drift alert fires when quality slips below what the version scored at its gate.',
      },
      {
        title: 'From trace to test',
        body: 'Turn any step of any run into an eval case in one action, and user feedback on a run seeds new cases automatically.',
      },
    ],
    flow: {
      title: 'A prompt change, gated',
      steps: [
        'You edit an agent’s instructions and save a draft.',
        'Publishing runs the attached suites against the draft in simulate mode.',
        'The draft scores below the gate’s threshold, so the publish is refused and the current version keeps serving.',
        'You open the failing cases, fix the instruction, and publish again.',
        'The new version clears the gate and goes live, with its score recorded against it.',
      ],
    },
    chips: ['eval suites', 'LLM-as-judge', 'simulate mode', 'promotion gates', 'online evals', 'drift alerts'],
  },
  {
    slug: 'knowledge',
    name: 'Knowledge',
    group: 'platform',
    tone: 'live',
    title: 'Grounded on your data. Remembers your users.',
    summary:
      'Built-in knowledge bases ground agents on your own documents, and long-term memory carries context across conversations.',
    lede:
      'An agent that does not know your business guesses. Tamtree builds retrieval in — knowledge bases, search, and per-user memory — so grounding an agent is configuration, not a side project of vector plumbing.',
    points: [
      {
        title: 'Knowledge bases, built in',
        body: 'Upload files or point at a URL. Text, markdown and PDF are parsed, chunked and embedded for you, with the chunking and embedding model set per knowledge base.',
      },
      {
        title: 'Hybrid retrieval',
        body: 'Search combines vector similarity with full-text matching and fuses the two rankings, with an optional re-ranking step on top.',
      },
      {
        title: 'A tool, not plumbing',
        body: 'Agents search a knowledge base as a managed tool, and pipelines use a Search Knowledge step. Neither needs glue code.',
      },
      {
        title: 'Grounding you can check',
        body: 'The passages retrieved on each step are recorded, which is what lets the groundedness guardrail test an answer against its sources.',
      },
      {
        title: 'Memory per end user',
        body: 'Tamtree keeps an identity for each person your agents talk to, so a returning visitor is recognised rather than met as a stranger.',
      },
      {
        title: 'Memory beyond the thread',
        body: 'After a conversation, durable facts are extracted and recalled on later turns. Choose per agent: no memory, the conversation, a running summary, or long-term memory.',
      },
    ],
    flow: {
      title: 'A returning customer',
      steps: [
        'Your product docs are ingested into a knowledge base: parsed, chunked and embedded.',
        'A customer who asked about invoices last month opens the chat again.',
        'The agent recalls what it learned about them and searches the docs for the current answer.',
        'Its reply cites the passages it retrieved, and the groundedness check confirms the claim.',
        'New durable facts from the conversation are saved for next time.',
      ],
    },
    chips: ['knowledge bases', 'hybrid search', 're-ranking', 'per-user identity', 'long-term memory'],
  },
  {
    slug: 'cost-controls',
    name: 'Cost controls',
    group: 'platform',
    tone: 'danger',
    title: 'Watch every token. Cap every run.',
    summary:
      'Token and cost tracking per step, a ledger, budgets with a real kill-switch, and model routing that sends easy work to cheaper models.',
    lede:
      'Agent spend is variable by nature, which is exactly why it needs hard edges. Tamtree records what every step costs, rolls it into a ledger, and stops spending when a budget says so — not after the invoice arrives.',
    points: [
      {
        title: 'Cost per step',
        body: 'Every step records its input tokens, output tokens and cost, and the run view updates the running total while it works.',
      },
      {
        title: 'A ledger, not a guess',
        body: 'Step costs roll into a usage ledger, and the dashboard shows spend over time next to the runs that spent it.',
      },
      {
        title: 'Budgets with a kill-switch',
        body: 'When a budget is breached, new runs are refused and runs in flight stop at their next step boundary. It is enforced by the runtime, not by an alert someone has to read.',
      },
      {
        title: 'Model routing',
        body: 'Group models into ordered collections: the first is the default and the rest are failover. Point routine work at a cheaper collection and keep the expensive model for the hard parts.',
      },
      {
        title: 'Waiting costs nothing',
        body: 'A run parked on a human, a schedule or another system holds no compute while it waits, however long that is.',
      },
      {
        title: 'Spend less per call',
        body: 'The stable part of a prompt is marked cacheable where the provider supports it, and long conversations are summarised by a cheaper model before they outgrow the context window.',
      },
    ],
    flow: {
      title: 'A runaway loop, stopped',
      steps: [
        'A crew starts looping on a question it cannot answer.',
        'Each turn’s tokens and cost land on the ledger as they happen.',
        'The workspace budget is reached partway through a turn.',
        'The run stops at its next step boundary, and new runs are refused until the budget is raised.',
        'The run view shows exactly which steps spent what, so the fix starts from facts.',
      ],
    },
    chips: ['per-step cost', 'usage ledger', 'budgets', 'kill-switch', 'model routing', 'prompt caching'],
  },
];

export const featureHref = (slug: string) => `/product/${slug}/`;

export const featureBySlug = (slug: string) => FEATURES.find((f) => f.slug === slug);

/** Previous and next feature, wrapping, for the foot of each feature page. */
export function neighbours(slug: string) {
  const i = FEATURES.findIndex((f) => f.slug === slug);
  const n = FEATURES.length;
  return { prev: FEATURES[(i - 1 + n) % n], next: FEATURES[(i + 1) % n] };
}
