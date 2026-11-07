/**
 * Tamtree's own social profiles — the links /social/ is built from, and the
 * one place to add a profile when an account goes live.
 *
 * A profile with an empty `url` is not rendered, so a platform can be listed
 * here before its account exists without the page linking to nothing. The
 * handles and IDs are the ones in `tamtree_crew/marketing-resources/README.md`.
 */
export interface SocialProfile {
  id: 'instagram' | 'facebook' | 'youtube' | 'tiktok' | 'linkedin';
  name: string;
  handle: string;
  url: string;
}

export const profiles: SocialProfile[] = [
  { id: 'instagram', name: 'Instagram', handle: '@tamtree.io', url: 'https://www.instagram.com/tamtree.io/' },
  // The Page has no username yet, so it is linked by ID. Swap in
  // facebook.com/<username> once one is set (Page settings › Username).
  { id: 'facebook', name: 'Facebook', handle: 'Tamtree', url: 'https://www.facebook.com/1424997467365330' },
  { id: 'youtube', name: 'YouTube', handle: '@tamtree-io', url: 'https://www.youtube.com/@tamtree-io' },
  { id: 'tiktok', name: 'TikTok', handle: '', url: '' },
  { id: 'linkedin', name: 'LinkedIn', handle: '', url: '' },
];
