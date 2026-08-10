import type { IsisRecord } from '../core/types';

export const records: IsisRecord[] = [
  {
    mfn: 1,
    fields: {
      '20': ['9780141187761'],
      '100': ['^aEco, Umberto^d1932-2016'],
      '245': ['^aThe name of the rose^bA novel^cUmberto Eco'],
      '260': ['^aLondon^bVintage Classics^c2004'],
      '300': ['^a536 pages^c20 cm'],
      '650': ['^aMonastic libraries^xFiction', '^aItaly^xHistory^y14th century^xFiction'],
      '700': ['^aWeaver, William^erelator term: translator'],
    },
  },
  {
    mfn: 2,
    fields: {
      '20': ['9780061120084'],
      '100': ['^aLee, Harper^d1926-2016'],
      '245': ['^aTo kill a mockingbird'],
      '260': ['^aNew York^bHarper Perennial^c2006'],
      '300': ['^a336 pages'],
      '650': ['^aTrials^xFiction', '^aRace relations^xFiction'],
    },
  },
  {
    mfn: 3,
    fields: {
      '20': ['9780307476463'],
      '100': ['^aIshiguro, Kazuo^d1954-'],
      '245': ['^aNever let me go^bA novel'],
      '260': ['^aNew York^bVintage International^c2006'],
      '300': ['^a288 pages'],
      '650': ['^aCloning^xFiction', '^aMemory^xFiction', '^aFriendship^xFiction'],
    },
  },
  {
    mfn: 4,
    fields: {
      '20': ['9780141439518'],
      '100': ['^aAusten, Jane^d1775-1817'],
      '245': ['^aPride and prejudice'],
      '260': ['^aLondon^bPenguin Classics^c2003'],
      '300': ['^a480 pages'],
      '650': ['^aCourtship^xFiction', '^aSocial classes^xFiction'],
      '700': ['^aJones, Vivien^eeditor', '^aTanner, Tony^ewriter of introduction'],
    },
  },
  {
    mfn: 5,
    fields: {
      '20': ['9780374528379'],
      '100': ['^aBorges, Jorge Luis^d1899-1986'],
      '245': ['^aLabyrinths^bSelected stories and other writings'],
      '260': ['^aNew York^bNew Directions^c2007'],
      '300': ['^a256 pages'],
      '650': ['^aArgentine literature', '^aShort stories, Argentine'],
      '700': ['^aYates, Donald A.^eeditor', '^aIrby, James E.^eeditor'],
    },
  },
  {
    mfn: 6,
    fields: {
      '20': ['9780385490818'],
      '100': ['^aAchebe, Chinua^d1930-2013'],
      '245': ['^aThings fall apart'],
      '260': ['^aNew York^bAnchor Books^c1994'],
      '300': ['^a209 pages'],
      '650': ['^aIgbo people^xFiction', '^aColonialism^xFiction'],
    },
  },
  {
    mfn: 7,
    fields: {
      '20': ['9780679720201'],
      '100': ['^aCamus, Albert^d1913-1960'],
      '245': ["^aThe stranger^cAlbert Camus ; translated by Matthew Ward"],
      '260': ['^aNew York^bVintage International^c1989'],
      '300': ['^a123 pages'],
      '650': ['^aAlienation (Social psychology)^xFiction'],
      '700': ['^aWard, Matthew^etranslator'],
    },
  },
  {
    mfn: 8,
    fields: {
      '20': ['9780099528532'],
      '100': ['^aAtwood, Margaret^d1939-'],
      '245': ["^aThe handmaid's tale"],
      '260': ['^aLondon^bVintage^c2010'],
      '300': ['^a324 pages'],
      '650': ['^aWomen^xGovernment policy^xFiction', '^aDystopias'],
    },
  },
  {
    mfn: 9,
    fields: {
      '20': ['9780140449136'],
      '100': ['^aHomer'],
      '245': ['^aThe Odyssey'],
      '260': ['^aLondon^bPenguin Classics^c2003'],
      '300': ['^axxxv, 541 pages'],
      '650': ['^aOdysseus, King of Ithaca (Mythological character)^xPoetry'],
      '700': ['^aFagles, Robert^etranslator', '^aKnox, Bernard^ewriter of introduction'],
    },
  },
  {
    mfn: 10,
    fields: {
      '20': ['9780345803481'],
      '100': ['^aMorrison, Toni^d1931-2019'],
      '245': ['^aBeloved^bA novel'],
      '260': ['^aNew York^bVintage International^c2004'],
      '300': ['^a321 pages'],
      '650': ['^aAfrican American women^xFiction', '^aEnslaved persons^xFiction', '^aOhio^xFiction'],
    },
  },
];

export const starterPft = `v245^a, " / ", v100^a, /,
if p(v260) then "Published: ", v260^b, " (", v260^c, ")" fi, /,
"Subjects: ", (v650^a, |; |)`;

export const starterFst = `10 0 v20
20 4 v245^a
30 4 (v650^a, /)`;
