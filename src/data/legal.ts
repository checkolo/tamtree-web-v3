/**
 * The facts the Terms and Privacy pages are built from — one place to change.
 *
 * There is deliberately no email address here. The repo is public, so the
 * inbox that receives privacy, deletion and legal mail lives only in the
 * server's `CONTACT_TO` (waitlist/server.mjs); every page points at the
 * contact form instead.
 *
 * Changing anything a person would rely on (who we are, what we collect, who
 * we share it with) means updating `lastUpdated` too — both pages show it.
 */
export const legal = {
  /**
   * Who operates Tamtree. A partnership is not a legal entity of its own in
   * Australia, so the partners are the "we" — the ABN is the partnership's.
   * Read in a sentence: "operated by {entity} (ABN {abn})".
   */
  entity: 'the partners of Tamtree, a partnership',
  /** Australian Business Number, shown beside the entity. */
  abn: '13 506 987 156',
  /** Where privacy requests, data deletion and legal notices go: the form, not an address. */
  contactPath: '/contact/',
  /** The Australian State or Territory whose law governs the Terms. */
  governingState: 'New South Wales',
  /** ISO date the current text took effect. */
  lastUpdated: '2026-10-30',
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
