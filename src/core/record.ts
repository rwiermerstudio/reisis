import type { IsisRecord } from './types';

export function fieldOccurrences(record: IsisRecord, tag: string): string[] {
  return record.fields[tag] ?? [];
}

export function subfieldValue(value: string, code: string): string {
  const marker = `^${code.toLowerCase()}`;
  const lower = value.toLowerCase();
  const start = lower.indexOf(marker);
  if (start < 0) return '';
  const contentStart = start + 2;
  const next = value.indexOf('^', contentStart);
  return value.slice(contentStart, next < 0 ? undefined : next);
}

export function displayField(value: string): string {
  return value.replace(/\^([a-z0-9])/gi, ' $1:').trim();
}

export function parseRecordJson(source: string): { record?: IsisRecord; error?: string } {
  try {
    const value = JSON.parse(source) as unknown;
    if (!value || typeof value !== 'object') throw new Error('The record must be an object.');
    const candidate = value as Partial<IsisRecord>;
    if (!Number.isInteger(candidate.mfn) || !candidate.fields || typeof candidate.fields !== 'object') {
      throw new Error('Expected an integer "mfn" and a "fields" object.');
    }
    for (const [tag, occurrences] of Object.entries(candidate.fields)) {
      if (!/^\d+$/.test(tag) || !Array.isArray(occurrences) || occurrences.some((item) => typeof item !== 'string')) {
        throw new Error(`Field ${tag} must be an array of strings.`);
      }
    }
    return { record: candidate as IsisRecord };
  } catch (error) {
    return { error: error instanceof Error ? error.message : 'Invalid JSON record.' };
  }
}
