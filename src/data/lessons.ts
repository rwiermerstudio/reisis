export type LessonMode = 'pft' | 'fst';

export interface Lesson {
  id: number;
  title: string;
  section: string;
  mode: LessonMode;
  recordMfn: number;
  brief: string;
  focus: string;
  starter: string;
  solution: string;
  expected: string[];
}

export const lessons: Lesson[] = [
  { id: 1, section: 'Fields', title: 'Display a title', mode: 'pft', recordMfn: 1, brief: 'Display subfield a from title field 245.', focus: 'Field and subfield selectors', starter: 'v245', solution: 'v245^a', expected: ['The name of the rose'] },
  { id: 2, section: 'Fields', title: 'Author name', mode: 'pft', recordMfn: 1, brief: 'Display only the author name, without dates.', focus: 'Subfield selection', starter: 'v100', solution: 'v100^a', expected: ['Eco, Umberto'] },
  { id: 3, section: 'Fields', title: 'Second subject', mode: 'pft', recordMfn: 1, brief: 'Select the second occurrence of subject field 650.', focus: 'Occurrence selection', starter: 'v650^a', solution: 'v650^a[2]', expected: ['Italy'] },
  { id: 4, section: 'Fields', title: 'Missing field', mode: 'pft', recordMfn: 2, brief: 'Observe how an absent field emits no text.', focus: 'Absent values', starter: '', solution: 'v700^a', expected: [''] },
  { id: 5, section: 'Fields', title: 'Publication year', mode: 'pft', recordMfn: 3, brief: 'Display the publication year from field 260.', focus: 'Publication subfields', starter: 'v260', solution: 'v260^c', expected: ['2006'] },
  { id: 6, section: 'Literals', title: 'Label the title', mode: 'pft', recordMfn: 4, brief: 'Prefix the title with a readable label.', focus: 'Double-quoted literals', starter: 'v245^a', solution: '"Title: ", v245^a', expected: ['Title: Pride and prejudice'] },
  { id: 7, section: 'Literals', title: 'Build a citation', mode: 'pft', recordMfn: 5, brief: 'Combine author and title with punctuation.', focus: 'Composition', starter: 'v100^a, v245^a', solution: 'v100^a, ". ", v245^a, "."', expected: ['Borges, Jorge Luis. Labyrinths.'] },
  { id: 8, section: 'Literals', title: 'Two output lines', mode: 'pft', recordMfn: 6, brief: 'Put author and title on separate lines.', focus: 'Slash layout operator', starter: 'v100^a, v245^a', solution: 'v100^a, /, v245^a', expected: ['Achebe, Chinua\nThings fall apart'] },
  { id: 9, section: 'Literals', title: 'Publisher statement', mode: 'pft', recordMfn: 7, brief: 'Format publisher and year in parentheses.', focus: 'Literal punctuation', starter: 'v260^b, v260^c', solution: 'v260^b, " (", v260^c, ")"', expected: ['Vintage International (1989)'] },
  { id: 10, section: 'Literals', title: 'Pipe literal', mode: 'pft', recordMfn: 8, brief: 'Use a pipe-delimited literal between values.', focus: 'Pipe literals', starter: 'v245^a, v260^c', solution: 'v245^a, | - |, v260^c', expected: ["The handmaid's tale - 2010"] },
  { id: 11, section: 'Repetition', title: 'All subjects', mode: 'pft', recordMfn: 3, brief: 'Emit every subject occurrence.', focus: 'Repeatable groups', starter: 'v650^a', solution: '(v650^a, /)', expected: ['Cloning\nMemory\nFriendship\n'] },
  { id: 12, section: 'Repetition', title: 'Contributors', mode: 'pft', recordMfn: 4, brief: 'List contributor names with one per line.', focus: 'Repeated subfields', starter: 'v700^a', solution: '(v700^a, /)', expected: ['Jones, Vivien\nTanner, Tony\n'] },
  { id: 13, section: 'Repetition', title: 'Subject labels', mode: 'pft', recordMfn: 10, brief: 'Prefix every subject with a dash.', focus: 'Literals inside groups', starter: '(v650^a)', solution: '("- ", v650^a, /)', expected: ['- African American women'] },
  { id: 14, section: 'Repetition', title: 'Indexed occurrence', mode: 'pft', recordMfn: 9, brief: 'Select only the second contributor.', focus: 'Explicit occurrence', starter: '(v700^a, /)', solution: 'v700^a[2]', expected: ['Knox, Bernard'] },
  { id: 15, section: 'Repetition', title: 'Names and roles', mode: 'pft', recordMfn: 5, brief: 'Display every contributor with their role.', focus: 'Aligned subfields', starter: '(v700^a, /)', solution: '(v700^a, " - ", v700^e, /)', expected: ['Yates, Donald A. - editor'] },
  { id: 16, section: 'Conditions', title: 'Optional subtitle', mode: 'pft', recordMfn: 1, brief: 'Emit a subtitle only when subfield b exists.', focus: 'Presence condition', starter: 'v245^a, v245^b', solution: 'v245^a, if p(v245^b) then ": ", v245^b fi', expected: ['The name of the rose: A novel'] },
  { id: 17, section: 'Conditions', title: 'Absent contributor', mode: 'pft', recordMfn: 2, brief: 'Show a fallback when field 700 is absent.', focus: 'Absence condition', starter: 'v700^a', solution: 'if a(v700) then "No contributor recorded" else v700^a fi', expected: ['No contributor recorded'] },
  { id: 18, section: 'Conditions', title: 'Conditional publisher', mode: 'pft', recordMfn: 6, brief: 'Label the publisher only if field 260 exists.', focus: 'Conditional block', starter: 'v260^b', solution: 'if p(v260) then "Publisher: ", v260^b fi', expected: ['Publisher: Anchor Books'] },
  { id: 19, section: 'Conditions', title: 'Subtitle fallback', mode: 'pft', recordMfn: 4, brief: 'Supply a fallback when the subtitle is absent.', focus: 'Else branch', starter: 'v245^b', solution: 'if p(v245^b) then v245^b else "No subtitle" fi', expected: ['No subtitle'] },
  { id: 20, section: 'Conditions', title: 'Contributor role', mode: 'pft', recordMfn: 7, brief: 'Format the role only when it exists.', focus: 'Subfield presence', starter: 'v700^a, v700^e', solution: 'v700^a, if p(v700^e) then " (", v700^e, ")" fi', expected: ['Ward, Matthew (translator)'] },
  { id: 21, section: 'Indexing', title: 'ISBN term', mode: 'fst', recordMfn: 1, brief: 'Index the complete ISBN with technique 0.', focus: 'FST technique 0', starter: '10 0', solution: '10 0 v20', expected: ['9780141187761'] },
  { id: 22, section: 'Indexing', title: 'Title words', mode: 'fst', recordMfn: 2, brief: 'Extract individual title words with technique 4.', focus: 'FST technique 4', starter: '20 0 v245^a', solution: '20 4 v245^a', expected: ['TO', 'KILL', 'A', 'MOCKINGBIRD'] },
  { id: 23, section: 'Indexing', title: 'Author words', mode: 'fst', recordMfn: 3, brief: 'Create word terms from the author name.', focus: 'Unicode word extraction', starter: '30 4 v100', solution: '30 4 v100^a', expected: ['ISHIGURO', 'KAZUO'] },
  { id: 24, section: 'Indexing', title: 'All subject words', mode: 'fst', recordMfn: 10, brief: 'Index words from every subject occurrence.', focus: 'Repeated FST extraction', starter: '40 4 v650^a', solution: '40 4 (v650^a, /)', expected: ['AFRICAN', 'AMERICAN', 'WOMEN', 'ENSLAVED', 'PERSONS', 'OHIO'] },
  { id: 25, section: 'Indexing', title: 'Multi-row table', mode: 'fst', recordMfn: 8, brief: 'Build exact ISBN and word-based title indexes.', focus: 'Multiple FST rows', starter: '10 0 v20', solution: '10 0 v20\n20 4 v245^a', expected: ['9780099528532', 'THE', "HANDMAID'S", 'TALE'] },
];
