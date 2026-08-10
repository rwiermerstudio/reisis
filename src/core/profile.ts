export const languageProfile = {
  id: 'abcd-cisis',
  name: 'ABCD / CISIS',
  shortName: 'CISIS',
  version: 'milestone 4',
  description: 'ABCD-oriented CISIS PFT and FST learning subset',
} as const;

export type LanguageProfile = typeof languageProfile;
