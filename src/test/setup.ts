import '@testing-library/jest-dom/vitest';
import 'fake-indexeddb/auto';
import { cleanup } from '@testing-library/react';
import { afterEach } from 'vitest';
import { IMPORTED_DATASET_DB } from '../core/datasetStorage';

afterEach(async () => {
  cleanup();
  await new Promise<void>((resolve) => {
    const request = indexedDB.deleteDatabase(IMPORTED_DATASET_DB);
    request.onsuccess = () => resolve();
    request.onerror = () => resolve();
    request.onblocked = () => resolve();
  });
});
