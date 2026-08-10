import { describe, expect, it } from 'vitest';
import { records } from '../data/records';
import { evaluatePft, parsePft } from './pft';

function subfield(raw: string, code: string): string {
  const match = raw.match(new RegExp(`\\^${code}([^\\^]*)`, 'i'));
  return match?.[1] ?? '';
}

const rawFieldCases = records.flatMap((record) => ['20', '100', '245', '260', '300'].map((tag) => ({
  name: `MFN ${record.mfn} reads v${tag}`,
  record,
  source: `v${tag}`,
  expected: record.fields[tag]?.[0] ?? '',
})));

const subfieldCases = records.flatMap((record) => [
  ['100', 'a'], ['245', 'a'], ['260', 'a'], ['260', 'b'], ['260', 'c'],
].map(([tag, code]) => ({
  name: `MFN ${record.mfn} reads v${tag}^${code}`,
  record,
  source: `v${tag}^${code}`,
  expected: subfield(record.fields[tag]?.[0] ?? '', code),
})));

describe('PFT field goldens', () => {
  it.each(rawFieldCases)('$name', ({ record, source, expected }) => {
    expect(evaluatePft(source, record).output).toBe(expected);
  });

  it.each(subfieldCases)('$name', ({ record, source, expected }) => {
    expect(evaluatePft(source, record).output).toBe(expected);
  });
});

describe('PFT composition goldens', () => {
  it.each(records)('MFN $mfn composes a labelled title', (record) => {
    expect(evaluatePft('"Title: ", v245^a', record).output).toBe(`Title: ${subfield(record.fields['245'][0], 'a')}`);
  });

  it.each(records)('MFN $mfn creates two lines', (record) => {
    const expected = `${subfield(record.fields['100'][0], 'a')}\n${subfield(record.fields['245'][0], 'a')}`;
    expect(evaluatePft('v100^a, /, v245^a', record).output).toBe(expected);
  });

  it.each(records)('MFN $mfn takes the present branch', (record) => {
    expect(evaluatePft('if p(v260) then v260^c else "unknown" fi', record).output).toBe(subfield(record.fields['260'][0], 'c'));
  });

  it.each(records)('MFN $mfn takes the absent branch', (record) => {
    const hasContributor = Boolean(record.fields['700']?.length);
    expect(evaluatePft("if a(v700) then 'none' else 'has contributor' fi", record).output).toBe(hasContributor ? 'has contributor' : 'none');
  });

  it.each(records)('MFN $mfn repeats every subject', (record) => {
    const expected = record.fields['650'].map((value) => `${subfield(value, 'a')}\n`).join('');
    expect(evaluatePft('(v650^a, /)', record).output).toBe(expected);
  });

  it.each(records)('MFN $mfn selects a second occurrence safely', (record) => {
    const expected = subfield(record.fields['650'][1] ?? '', 'a');
    expect(evaluatePft('v650^a[2]', record).output).toBe(expected);
  });
});

describe('PFT diagnostics', () => {
  const invalid = [
    ['v', 'PFT_UNSUPPORTED'],
    ['v245[abc]', 'PFT_OCCURRENCE'],
    ['v245[0]', 'PFT_OCCURRENCE'],
    ['"open', 'PFT_LITERAL'],
    ['(v245', 'PFT_GROUP'],
    ['if p(v245) then v245', 'PFT_FI'],
    ['if x(v245) then v245 fi', 'PFT_EXPRESSION'],
    ['if p(v245 then v245 fi', 'PFT_THEN'],
    ['if p(v245) v245 fi', 'PFT_THEN'],
    ['unknown(v245)', 'PFT_UNSUPPORTED'],
  ];

  it.each(invalid)('reports %s', (source, code) => {
    expect(parsePft(source).diagnostics.some((diagnostic) => diagnostic.code === code)).toBe(true);
  });
});

describe('ABCD/CISIS literal metadata', () => {
  it.each([
    ["'always'", 'unconditional'],
    ['"when present"', 'conditional'],
    ['|for each occurrence|', 'repeatable-conditional'],
  ] as const)('classifies %s as %s', (source, kind) => {
    const literal = parsePft(source).ast.children[0];
    expect(literal).toMatchObject({ type: 'literal', kind });
  });
});

describe('ABCD/CISIS milestone 2 behavior', () => {
  const record = records[0];

  it('suppresses conditional literals when their associated field is absent', () => {
    expect(evaluatePft('"Contributor: "v999', record).output).toBe('');
  });

  it('emits a conditional literal only on the first group occurrence', () => {
    expect(evaluatePft('("Subjects: "v650^a/)', record).output).toBe('Subjects: Monastic libraries\nItaly\n');
  });

  it('emits repeatable conditional literals for every present occurrence', () => {
    expect(evaluatePft('(|Subject: |v650^a/)', record).output).toBe('Subject: Monastic libraries\nSubject: Italy\n');
  });

  it('collapses conditional newlines but preserves unconditional newlines', () => {
    expect(evaluatePft("/,'A',/,/,#,'B'", record).output).toBe('A\n\nB');
  });

  it('resets trailing blank lines', () => {
    expect(evaluatePft("'A',###,%,'B'", record).output).toBe('AB');
  });

  it('ignores CISIS comments', () => {
    expect(evaluatePft("'A',/* a multiline\ncomment */,'B'", record).output).toBe('AB');
    expect(evaluatePft("if p(v245) /* title exists */ then v245^a fi", record).output).toBe('The name of the rose');
  });

  it('supports spaces and absolute columns', () => {
    expect(evaluatePft("'A',x3,'B',c8,'C'", record).output).toBe('A   B  C');
    expect(evaluatePft("'too long',c4,'C'", record).output).toBe('too long\n   C');
  });

  it('outputs MFN with optional zero-padding', () => {
    expect(evaluatePft("'Record ',mfn,' / ',mfn(4)", record).output).toBe('Record 1 / 0001');
  });

  it('outputs the current occurrence index', () => {
    expect(evaluatePft("(iocc,': ',v650^a,/)", record).output).toBe('1: Monastic libraries\n2: Italy\n');
  });

  it('counts field and subfield occurrences', () => {
    expect(evaluatePft("nocc(v650),' / ',nocc(v650^y)", record).output).toBe('2 / 1');
  });

  it.each([
    ['/* open', 'PFT_COMMENT'],
    ['mfn(x)', 'PFT_MFN'],
    ['nocc()', 'PFT_NOCC'],
  ])('reports invalid CISIS syntax in %s', (source, code) => {
    expect(parsePft(source).diagnostics.some((item) => item.code === code)).toBe(true);
  });
});

describe('ABCD/CISIS milestone 3 expressions and functions', () => {
  const record = records[0];

  it('evaluates string, numeric, and boolean conditions', () => {
    expect(evaluatePft("if v260^c = '2004' then 'match' fi", record).output).toBe('match');
    expect(evaluatePft("if mfn >= 1 and nocc(v650) = 2 then 'match' fi", record).output).toBe('match');
    expect(evaluatePft("if not a(v245) and (2 + 3) * 2 = 10 then 'match' fi", record).output).toBe('match');
    expect(evaluatePft("if a(v999) or p(v700) then 'match' fi", record).output).toBe('match');
  });

  it('supports nested string and numeric functions in conditions', () => {
    expect(evaluatePft("if size(v245^a) > 10 and instr(v245^a,'rose') > 0 then left(v245^a,8) fi", record).output).toBe('The name');
  });

  it('evaluates pure output functions', () => {
    expect(evaluatePft("left(v245^a,3),'|',right(v245^a,4),'|',mid(v245^a,5,4)", record).output).toBe('The|rose|name');
    expect(evaluatePft("replace(v245^a,'rose','book')", record).output).toBe('The name of the book');
    expect(evaluatePft("size(v245^a),'|',instr(v245^a,'rose'),'|',val(v260^c)", record).output).toBe('20|17|2004');
    expect(evaluatePft("f(3.1415,6,2)", record).output).toBe('  3.14');
  });

  it('breaks and continues repeatable groups', () => {
    expect(evaluatePft("(if iocc > 1 then break fi,v650^a,/)", record).output).toBe('Monastic libraries\n');
    expect(evaluatePft("(if iocc = 1 then continue fi,v650^a,/)", record).output).toBe('Italy\n');
  });

  it('reports unsupported expression functions', () => {
    expect(parsePft("if mystery(v245) then v245 fi").diagnostics.some((item) => item.code === 'PFT_EXPRESSION')).toBe(true);
    expect(parsePft('left(v245)').diagnostics.some((item) => item.code === 'PFT_EXPRESSION')).toBe(true);
  });
});

describe('ABCD/CISIS milestone 4 formatting and extended control', () => {
  const record = records[0];

  it('applies proof, heading, data, and uppercase modes', () => {
    expect(evaluatePft('mpl,v100', record).output).toBe('^aEco, Umberto^d1932-2016');
    expect(evaluatePft('mhl,v100', record).output).toBe('Eco, Umberto, 1932-2016');
    expect(evaluatePft('mhu,v100', record).output).toBe('ECO, UMBERTO, 1932-2016');
    expect(evaluatePft('mdl,v245^a', record).output).toBe('The name of the rose.  ');
  });

  it('supports occurrence ranges, LAST, slicing, and indentation', () => {
    expect(evaluatePft('v650^a[2..LAST]', record).output).toBe('Italy');
    expect(evaluatePft('v650^a[LAST]', record).output).toBe('Italy');
    expect(evaluatePft('v245^a*4.4', record).output).toBe('name');
    expect(evaluatePft('lw(14),v245^a(3,5)', record).output).toContain('\n    ');
    expect(evaluatePft("lw(10),'abcdefghijkl'", record).output).toBe('abcdefghij\nkl');
  });

  it('supports dummy selectors and prefix/suffix plus suppression', () => {
    expect(evaluatePft('"Contributor"d700,"Missing"n999', record).output).toBe('ContributorMissing');
    expect(evaluatePft('(v650^a+|; |)', record).output).toBe('Monastic libraries; Italy');
    expect(evaluatePft('(|; |+v650^a)', record).output).toBe('Monastic libraries; Italy');
  });

  it('evaluates string, date, aggregate, and full numeric formats', () => {
    expect(evaluatePft("s(v245^a,' / ',v260^c)", record).output).toBe('The name of the rose / 2004');
    expect(evaluatePft("rsum('10,20,-5'),'|',rmin('10,20,-5'),'|',rmax('10,20,-5'),'|',ravr('10,20,30')", record).output).toBe('25|-5|20|20');
    expect(evaluatePft('f(12.5)', record).output).toHaveLength(16);
    expect(evaluatePft('f(12.5,10)', record).output).toContain('e+');
    expect(evaluatePft('f(12.5,8,2)', record).output).toBe('   12.50');
    expect(evaluatePft('date(DATEONLY)', record).output).toMatch(/^\d{2}\/\d{2}\/\d{2}$/);
    expect(evaluatePft('date', record).output).toMatch(/^\d{8} \d{6} \d \d{3}$/);
  });

  it('assigns numeric and string format variables', () => {
    expect(evaluatePft('e0:=2,e0:=e0*3,e0', record).output).toBe('6');
    expect(evaluatePft('s0:=(v245^a),s0', record).output).toBe('The name of the rose');
  });

  it.each(['s0:=', 'e0:='])('reports an incomplete assignment without throwing for %s', (source) => {
    const result = evaluatePft(source, record);
    expect(result.output).toBe('');
    expect(result.diagnostics.some((item) => item.code === 'PFT_ASSIGNMENT')).toBe(true);
  });

  it('runs bounded while loops and select branches', () => {
    expect(evaluatePft('e0:=1,while e0<=3(e0,e0:=e0+1)', record).output).toBe('123');
    expect(evaluatePft("select nocc(v650) case 0:'none' case 1:'one' case 2:'two' elsecase 'many' endsel", record).output).toBe('two');
  });

  it('stops non-terminating while loops at the browser safety limit', () => {
    const result = evaluatePft("while 1('x')", record);
    expect(result.output).toHaveLength(1000);
    expect(result.diagnostics.some((item) => item.code === 'PFT_WHILE_LIMIT')).toBe(true);
  });

  it('supports nested repeatable groups deterministically', () => {
    expect(evaluatePft("(v700^a,':',(| |v650^a),/)", record).output).toContain('Weaver, William: Monastic libraries Italy');
  });
});
