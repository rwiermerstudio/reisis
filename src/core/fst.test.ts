import { describe, expect, it } from 'vitest';
import { records } from '../data/records';
import { evaluateFst } from './fst';

function subfield(raw: string, code: string): string {
  return raw.match(new RegExp(`\\^${code}([^\\^]*)`, 'i'))?.[1] ?? '';
}

describe('FST technique 0 goldens', () => {
  it.each(records)('MFN $mfn extracts an exact ISBN', (record) => {
    const result = evaluateFst('10 0 v20', record);
    expect(result.diagnostics).toEqual([]);
    expect(result.terms.map((term) => term.term)).toEqual([record.fields['20'][0]]);
  });

  it.each(records)('MFN $mfn extracts an exact title', (record) => {
    const result = evaluateFst('20 0 v245^a', record);
    expect(result.terms.map((term) => term.term)).toEqual([subfield(record.fields['245'][0], 'a')]);
  });
});

describe('FST technique 4 goldens', () => {
  it.each(records)('MFN $mfn tokenizes title words', (record) => {
    const title = subfield(record.fields['245'][0], 'a');
    const expected = title.match(/[\p{L}\p{N}]+(?:['-][\p{L}\p{N}]+)*/gu)?.map((word) => word.toUpperCase()) ?? [];
    expect(evaluateFst('20 4 v245^a', record).terms.map((term) => term.term)).toEqual([...new Set(expected)]);
  });

  it.each(records)('MFN $mfn tokenizes every subject', (record) => {
    const source = record.fields['650'].map((value) => subfield(value, 'a')).join('\n');
    const expected = source.match(/[\p{L}\p{N}]+(?:['-][\p{L}\p{N}]+)*/gu)?.map((word) => word.toUpperCase()) ?? [];
    expect(evaluateFst('30 4 (v650^a, /)', record).terms.map((term) => term.term)).toEqual([...new Set(expected)]);
  });

  it.each(records)('MFN $mfn evaluates multiple rows', (record) => {
    const result = evaluateFst('10 0 v20\n20 4 v245^a', record);
    expect(result.rows).toHaveLength(2);
    expect(result.terms[0].term).toBe(record.fields['20'][0]);
    expect(result.terms.slice(1).every((term) => term.targetTag === 20)).toBe(true);
  });
});

describe('FST techniques 1 through 8', () => {
  it('extracts one term per subfield with technique 1', () => {
    expect(evaluateFst('20 1 v245', records[0]).terms.map((term) => term.term)).toEqual(['The name of the rose', 'A novel', 'Umberto Eco']);
  });

  it('extracts angle-bracket phrases with technique 2', () => {
    expect(evaluateFst("20 2 '<libraries><14th century>'", records[0]).terms.map((term) => term.term)).toEqual(['libraries', '14th century']);
  });

  it('extracts slash-delimited phrases with technique 3', () => {
    expect(evaluateFst("20 3 '/library school/ and /documentation/'", records[0]).terms.map((term) => term.term)).toEqual(['library school', 'documentation']);
  });

  it.each([
    [5, "'|SU_|',v245", ['SU_The name of the rose', 'SU_A novel', 'SU_Umberto Eco']],
    [6, "'|KW_|<libraries><cataloging>'", ['KW_libraries', 'KW_cataloging']],
    [7, "'|PH_|/library school/'", ['PH_library school']],
    [8, "'|TI_|',v245^a", ['TI_THE', 'TI_NAME', 'TI_OF', 'TI_THE', 'TI_ROSE']],
  ] as const)('applies a prefix with technique %s', (technique, expression, expected) => {
    expect(evaluateFst(`20 ${technique} ${expression}`, records[0]).terms.map((term) => term.term)).toEqual([...new Set(expected)]);
  });

  it('reports a missing prefix for techniques 5 through 8', () => {
    expect(evaluateFst('20 8 v245^a', records[0]).diagnostics.some((item) => item.code === 'FST_PREFIX')).toBe(true);
  });
});

describe('FST diagnostics', () => {
  const cases = [
    ['not a row', 'FST_ROW'],
    ['10 9 v245', 'FST_TECHNIQUE'],
    ['10 4 (v245', 'PFT_GROUP'],
    ['10 0 "open', 'PFT_LITERAL'],
  ];
  it.each(cases)('rejects %s', (source, code) => {
    expect(evaluateFst(source, records[0]).diagnostics.some((diagnostic) => diagnostic.code === code)).toBe(true);
  });
});
