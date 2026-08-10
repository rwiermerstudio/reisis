import type { LessonMode } from './lessons';
import { starterFst, starterPft } from './records';

export interface PlaygroundPreset {
  id: string;
  title: string;
  description: string;
  mode: LessonMode;
  recordMfn: number;
  source: string;
}

export const playgroundPresets: PlaygroundPreset[] = [
  {
    id: 'catalog-card',
    title: 'Catalog card',
    description: 'Title, author, publication, and subjects',
    mode: 'pft',
    recordMfn: 1,
    source: starterPft,
  },
  {
    id: 'compact-citation',
    title: 'Compact citation',
    description: 'A reusable single-line citation',
    mode: 'pft',
    recordMfn: 5,
    source: 'v100^a, ". ", v245^a, ". ", v260^a, ": ", v260^b, ", ", v260^c, "."',
  },
  {
    id: 'optional-subtitle',
    title: 'Optional subtitle',
    description: 'Conditional punctuation and fallback text',
    mode: 'pft',
    recordMfn: 4,
    source: "v245^a, if p(v245^b) then \": \", v245^b else ' [no subtitle]' fi",
  },
  {
    id: 'contributors',
    title: 'Contributor list',
    description: 'Aligned values in a repeatable group',
    mode: 'pft',
    recordMfn: 9,
    source: "'Contributors', /, (|- |, v700^a, | (|, v700^e, |)|, /)",
  },
  {
    id: 'cisis-report',
    title: 'CISIS record report',
    description: 'MFN, columns, occurrence counts, and comments',
    mode: 'pft',
    recordMfn: 3,
    source: "/* Compact administrative report */\n'Record',c12,mfn(4),/,'Title',c12,v245^a,/,'Subjects',c12,nocc(v650),/",
  },
  {
    id: 'numbered-subjects',
    title: 'Numbered subjects',
    description: 'Occurrence index and repeatable labels',
    mode: 'pft',
    recordMfn: 10,
    source: "'Subjects',/, (iocc,|. |v650^a,/)",
  },
  {
    id: 'expression-report',
    title: 'Expression report',
    description: 'Comparisons, boolean logic, and string functions',
    mode: 'pft',
    recordMfn: 1,
    source: "if val(v260^c) < 2010 and p(v245^b) then 'Classic: ',left(v245^a,12),' ...',/,'Subtitle length: ',size(v245^b) fi",
  },
  {
    id: 'complete-fst',
    title: 'FST techniques',
    description: 'Subfields, phrases, words, and prefixed words',
    mode: 'fst',
    recordMfn: 1,
    source: "10 1 v245\n20 2 '<libraries><cataloging>'\n30 3 '/library school/'\n40 4 v650^a\n50 8 '|TI_|',v245^a",
  },
  {
    id: 'mode-layout-report',
    title: 'Mode and layout report',
    description: 'Modes, width, indentation, ranges, and slices',
    mode: 'pft',
    recordMfn: 1,
    source: "mhu,'AUTHOR',/,mhl,v100,/,lw(32),v245(3,5),/,'Subjects: ',(v650^a+|; |),/,'Code: ',v20*0.6",
  },
  {
    id: 'extended-control',
    title: 'Variables and control',
    description: 'Variables, while, select, and aggregates',
    mode: 'pft',
    recordMfn: 3,
    source: "s0:=('Subjects: '),s0,nocc(v650),/,e0:=1,while e0<=nocc(v650)(e0,|. |v650^a,/,e0:=e0+1),select nocc(v650) case 3:'Complete set' elsecase 'Other count' endsel",
  },
  {
    id: 'title-index',
    title: 'Title word index',
    description: 'Technique 4 over title and subtitle',
    mode: 'fst',
    recordMfn: 3,
    source: '20 4 v245^a, " ", v245^b',
  },
  {
    id: 'multi-index',
    title: 'Multi-row index',
    description: 'Exact ISBN plus title, author, and subjects',
    mode: 'fst',
    recordMfn: 10,
    source: '10 0 v20\n20 4 v245^a\n30 4 v100^a\n40 4 (v650^a, /)',
  },
  {
    id: 'blank-pft',
    title: 'Blank PFT',
    description: 'Start a format from an empty editor',
    mode: 'pft',
    recordMfn: 1,
    source: '',
  },
  {
    id: 'blank-fst',
    title: 'Blank FST',
    description: 'Start a field selection table',
    mode: 'fst',
    recordMfn: 1,
    source: '',
  },
];

export const quickInserts: Array<{ label: string; detail: string; mode: LessonMode; source: string; group: 'common' | 'record' | 'advanced' }> = [
  { label: 'Field selector', detail: 'Read title subfield a', mode: 'pft', source: 'v245^a', group: 'common' },
  { label: 'New line', detail: 'Layout operator', mode: 'pft', source: '/', group: 'common' },
  { label: 'Repeat group', detail: 'Loop over subjects', mode: 'pft', source: '(v650^a, /)', group: 'common' },
  { label: 'Presence test', detail: 'Optional subtitle', mode: 'pft', source: 'if p(v245^b) then v245^b fi', group: 'common' },
  { label: 'Absence test', detail: 'Unconditional fallback', mode: 'pft', source: "if a(v700) then 'No contributor' fi", group: 'common' },
  { label: 'Record number', detail: 'Four-character MFN', mode: 'pft', source: 'mfn(4)', group: 'record' },
  { label: 'Occurrence index', detail: 'Current group iteration', mode: 'pft', source: 'iocc', group: 'record' },
  { label: 'Occurrence count', detail: 'Count subject fields', mode: 'pft', source: 'nocc(v650)', group: 'record' },
  { label: 'Column', detail: 'Move to column 20', mode: 'pft', source: 'c20', group: 'record' },
  { label: 'Comment', detail: 'CISIS format comment', mode: 'pft', source: '/* explain this format */', group: 'record' },
  { label: 'Comparison', detail: 'Numeric year condition', mode: 'pft', source: "if val(v260^c) < 2000 then 'Older' fi", group: 'advanced' },
  { label: 'Text function', detail: 'Shorten the title', mode: 'pft', source: 'left(v245^a,20)', group: 'advanced' },
  { label: 'Break group', detail: 'Limit repeat output', mode: 'pft', source: 'if iocc > 3 then break fi', group: 'advanced' },
  { label: 'Exact term row', detail: 'Technique 0', mode: 'fst', source: '10 0 v20', group: 'common' },
  { label: 'Word term row', detail: 'Technique 4', mode: 'fst', source: '20 4 v245^a', group: 'common' },
  { label: 'Subfield row', detail: 'Technique 1', mode: 'fst', source: '20 1 v245', group: 'common' },
  { label: 'Angle phrase row', detail: 'Technique 2', mode: 'fst', source: "30 2 '<term><phrase>'", group: 'advanced' },
  { label: 'Prefixed word row', detail: 'Technique 8', mode: 'fst', source: "40 8 '|TI_|',v245^a", group: 'advanced' },
];
