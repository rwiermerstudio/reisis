import { describe, expect, it } from 'vitest';
import { clearImportedDataset, IMPORTED_DATASET_CHUNK_SIZE, loadImportedDataset, saveImportedDataset, type ImportedDataset } from './datasetStorage';
import type { IsisRecord } from './types';

function dataset(size: number, name = 'records.xml'): ImportedDataset {
  const records: IsisRecord[] = Array.from({ length: size }, (_, index) => ({
    mfn: index + 1,
    fields: {
      '001': [`control-${index + 1}`],
      '245': [`^aPersistent title ${index + 1}`],
    },
    marc: {
      sourceFormat: 'marcxml',
      leader: '00000nam a2200000 a 4500',
      indicators: { '245': ['10'] },
    },
  }));
  return { name, size: size * 100, format: 'marcxml', records, warnings: [] };
}

describe('imported dataset storage', () => {
  it('round-trips records across multiple IndexedDB chunks', async () => {
    const source = dataset(IMPORTED_DATASET_CHUNK_SIZE * 2 + 17);
    await saveImportedDataset(source);

    const restored = await loadImportedDataset();

    expect(restored).toEqual(source);
  });

  it('atomically replaces all chunks from the previous dataset', async () => {
    await saveImportedDataset(dataset(IMPORTED_DATASET_CHUNK_SIZE * 3, 'large.xml'));
    const replacement = dataset(2, 'replacement.xml');
    await saveImportedDataset(replacement);

    expect(await loadImportedDataset()).toEqual(replacement);
  });

  it('clears persisted metadata and record chunks', async () => {
    await saveImportedDataset(dataset(10));
    await clearImportedDataset();

    expect(await loadImportedDataset()).toBeUndefined();
  });

  it('persists the supported 10,000-record boundary', async () => {
    const source = dataset(10_000, 'ten-thousand.xml');
    await saveImportedDataset(source);

    const restored = await loadImportedDataset();

    expect(restored?.records).toHaveLength(10_000);
    expect(restored?.records[9_999].fields['245']).toEqual(['^aPersistent title 10000']);
  });
});
