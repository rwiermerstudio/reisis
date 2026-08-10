import { describe, expect, it } from 'vitest';
import { records } from '../data/records';
import { displayField, parseRecordJson, subfieldValue } from './record';

describe('record model goldens', () => {
  it.each(records)('round-trips MFN $mfn through JSON', (record) => {
    expect(parseRecordJson(JSON.stringify(record)).record).toEqual(record);
  });

  it.each(records)('reads MFN $mfn title subfield', (record) => {
    expect(subfieldValue(record.fields['245'][0], 'a')).not.toBe('');
  });

  it.each(records)('renders MFN $mfn title for inspection', (record) => {
    expect(displayField(record.fields['245'][0])).not.toContain('^');
  });

  it.each([
    '{}',
    '[]',
    '{',
    '{"mfn":"one","fields":{}}',
    '{"mfn":1}',
    '{"mfn":1,"fields":{"bad-tag":[]}}',
    '{"mfn":1,"fields":{"245":"title"}}',
    '{"mfn":1,"fields":{"245":[1]}}',
    'null',
    '"record"',
  ])('rejects invalid record %s', (source) => {
    expect(parseRecordJson(source).error).toBeTruthy();
  });
});
