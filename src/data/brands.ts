/**
 * The facts /brands/ is built from — one place to change a price, a date or
 * the number of founding places left.
 *
 * The plan these come from is
 * `agent-orchestrator/marketing/2026-11-03-social-media-workflows/00-PLAN.md`.
 * Prices are AUD, ex-GST, monthly. `placesLeft` is printed on the page as a
 * public count, so it must only ever be the true number: lower it by hand as
 * places are taken, and close the offer by setting it to 0.
 */
export const founding = {
  places: 5,
  placesLeft: 5,
  /** ISO date the founding offer closes, if the places have not gone first. */
  closes: '2026-11-30',
  months: 3,
  /** The discount founding clients keep on standard prices after the founding months. */
  afterDiscount: 25,
  afterMonths: 12,
} as const;

/** Live today; the rest are in development and join every option at no extra cost. */
export const platforms = {
  live: ['YouTube', 'Facebook', 'Instagram'],
  soon: ['TikTok', 'LinkedIn'],
} as const;

export interface BrandOption {
  id: string;
  n: string;
  name: string;
  tagline: string;
  forYou: string;
  includes: string[];
  standard: string;
  standardNote: string;
  founding: string;
  foundingUnit: string;
  foundingNote: string;
  featured?: boolean;
}

export const options: BrandOption[] = [
  {
    id: 'publish',
    n: '01',
    name: 'Publish',
    tagline: 'You film it. We ship it.',
    forYou: 'You already have finished long videos — a podcast, webinars, YouTube, talks — and a brand kit.',
    includes: [
      'Up to 20 branded shorts a month',
      'Best moments picked against your brand brief',
      'Vertical reframe, captions, your fonts and colours',
      'Weekly approval: nothing posts until you say yes',
      'Published to YouTube, Facebook and Instagram',
      'Monthly performance report',
    ],
    standard: 'A$790',
    standardNote: '/mo + A$990 setup',
    founding: 'A$199',
    foundingUnit: '/mo',
    foundingNote: 'Setup included',
    featured: true,
  },
  {
    id: 'produce',
    n: '02',
    name: 'Produce',
    tagline: 'You have footage. We make it a campaign.',
    forYou: 'You have phone clips, event footage or b-roll, but no finished pieces and no editor.',
    includes: [
      '12 produced shorts a month',
      'Creative direction: content pillars, hooks, a shot list',
      'Edit, captions or voiceover, b-roll where it fits',
      'Two revision rounds inside the approval step',
      'Published to YouTube, Facebook and Instagram',
      'Monthly 30-minute strategy call',
    ],
    standard: 'A$2,200',
    standardNote: '/mo + A$2,500 setup',
    founding: 'A$790',
    foundingUnit: '/mo',
    foundingNote: 'Setup included',
  },
  {
    id: 'brand',
    n: '03',
    name: 'Brand & Launch',
    tagline: 'No brand yet? We build it, then run it.',
    forYou: 'You don’t have a logo, a look or a content strategy yet — and you want to start right.',
    includes: [
      'Logo, palette, type and a voice-and-tone guide',
      'Social templates built for your feeds',
      'A 90-day content strategy',
      'Brand kit delivered in weeks 1–3',
      'Then Produce runs every month, on your new brand',
    ],
    standard: 'A$2,900',
    standardNote: 'brand kit + Produce',
    founding: 'A$1,490',
    foundingUnit: 'brand kit',
    foundingNote: '+ Produce at the founding price',
  },
];
