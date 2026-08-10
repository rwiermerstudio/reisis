import { describe, expect, it } from 'vitest';
import { records } from '../data/records';
import { compileBatch, evaluateBatchRecord, evaluateBatchRecords } from './batch';
import type { IsisRecord } from './types';

function largeDataset(size: number): IsisRecord[] {
  return Array.from({ length: size }, (_, index) => {
    const template = records[index % records.length];
    return {
      mfn: index + 1,
      fields: {
        ...template.fields,
        '20': [`ID-${String(index + 1).padStart(6, '0')}`],
        '245': [`^aSynthetic title ${index + 1}^bBatch fixture`],
      },
    };
  });
}

describe('compiled batch evaluation', () => {
  it('evaluates 10,000 PFT records with compact results', () => {
    const dataset = largeDataset(10_000);
    const results = evaluateBatchRecords('pft', 'v20, " / ", v245^a', dataset);
    expect(results).toHaveLength(10_000);
    expect(results[0]).toEqual({ mfn: 1, output: 'ID-000001 / Synthetic title 1' });
    expect(results[9_999]).toEqual({ mfn: 10_000, output: 'ID-010000 / Synthetic title 10000' });
    expect(results.every((result) => !('trace' in result) && !('ast' in result))).toBe(true);
  });

  it('evaluates 2,000 FST records without trace payloads', () => {
    const dataset = largeDataset(2_000);
    const results = evaluateBatchRecords('fst', '10 0 v20\n20 4 v245^a', dataset);
    expect(results).toHaveLength(2_000);
    expect(results[0].terms?.map((term) => term.term)).toEqual(['ID-000001', 'SYNTHETIC', 'TITLE', '1']);
    expect(results[1_999].terms?.some((term) => term.term === '2000')).toBe(true);
    expect(results.every((result) => result.terms?.every((term) => !('source' in term)))).toBe(true);
  });

  it('reuses one compiled format across independently evaluated records', () => {
    const compiled = compileBatch('pft', 'v245^a');
    expect(evaluateBatchRecord(compiled, records[0]).output).toBe('The name of the rose');
    expect(evaluateBatchRecord(compiled, records[9]).output).toBe('Beloved');
  });
});
