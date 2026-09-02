import { runFixture, type RunFixture } from '../schemas/run-events';
import { runView, type RunView } from './run-view';

/**
 * Load the recorded run fixtures.
 *
 * `import.meta.glob` with `eager` resolves at build time from files already in
 * the repo — there is no call to the product here, which is C5's rule. An
 * export script run by a human puts the JSON in `src/content/runs/`; the build
 * only ever reads it.
 */
const modules = import.meta.glob<{ default: unknown }>('../content/runs/*.json', { eager: true });

const fixtures = new Map<string, RunFixture>();

for (const [path, mod] of Object.entries(modules)) {
  const parsed = runFixture.safeParse(mod.default);
  if (!parsed.success) {
    // gate:runs reports this properly; here it must not become a silently
    // missing run, which is exactly the failure mode C5 exists to prevent.
    throw new Error(
      `[runs] ${path} does not match the §17.4 fixture schema. Run \`pnpm gate:runs\` for detail.`
    );
  }
  fixtures.set(parsed.data.id, parsed.data);
}

/** The recorded run with this id, or null when none has been recorded yet. */
export function getRun(id: string): RunView | null {
  const fixture = fixtures.get(id);
  return fixture ? runView(fixture) : null;
}

export function hasRun(id: string): boolean {
  return fixtures.has(id);
}

export const recordedRunIds = [...fixtures.keys()];
