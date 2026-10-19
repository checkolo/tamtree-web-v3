/**
 * The facts the Terms and Privacy pages are built from — one place to fill in.
 *
 * ⚠ Before launch, replace every bracketed placeholder below. They render on
 * the live pages exactly as written, on purpose: a page that says "[LEGAL
 * ENTITY]" is obviously unfinished, where a plausible guess would read as a
 * real commitment.
 *
 * Changing anything a person would rely on (who we are, what we collect, who
 * we share it with) means updating `lastUpdated` too — both pages show it.
 */
export const legal = {
  /** The registered business that operates Tamtree, e.g. "Tamtree Pty Ltd". */
  entity: '[LEGAL ENTITY]',
  /** Australian Business Number, shown beside the entity. */
  abn: '[ABN]',
  /** Where privacy requests, data deletion and legal notices go. */
  contactEmail: '[CONTACT EMAIL]',
  /** The Australian State or Territory whose law governs the Terms. */
  governingState: '[STATE]',
  /** ISO date the current text took effect. */
  lastUpdated: '2026-10-11',
  site: 'https://www.tamtree.io',
} as const;

export function formatLegalDate(iso: string): string {
  return new Date(`${iso}T00:00:00Z`).toLocaleDateString('en-AU', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  });
}
