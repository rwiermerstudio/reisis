import type { MarcImportFormat, MarcImportWarning } from './marc';
import type { IsisRecord } from './types';

export const IMPORTED_DATASET_DB = 'reisis-language-studio';
export const IMPORTED_DATASET_CHUNK_SIZE = 250;

const DATABASE_VERSION = 1;
const DATASET_SCHEMA_VERSION = 1;
const META_STORE = 'dataset-meta';
const CHUNK_STORE = 'record-chunks';
const ACTIVE_DATASET_KEY = 'active';

export interface ImportedDataset {
  name: string;
  size: number;
  format: MarcImportFormat;
  records: IsisRecord[];
  warnings: MarcImportWarning[];
}

interface StoredDatasetMeta {
  schemaVersion: number;
  name: string;
  size: number;
  format: MarcImportFormat;
  warnings: MarcImportWarning[];
  recordCount: number;
  chunkCount: number;
  savedAt: number;
}

interface StoredRecordChunk {
  index: number;
  records: IsisRecord[];
}

export class DatasetStorageError extends Error {
  constructor(public readonly code: string, message: string) {
    super(message);
    this.name = 'DatasetStorageError';
  }
}

function requestResult<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('IndexedDB request failed.'));
  });
}

function transactionComplete(transaction: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onabort = () => reject(transaction.error ?? new Error('IndexedDB transaction was aborted.'));
    transaction.onerror = () => reject(transaction.error ?? new Error('IndexedDB transaction failed.'));
  });
}

function openDatabase(): Promise<IDBDatabase> {
  if (typeof indexedDB === 'undefined') {
    return Promise.reject(new DatasetStorageError('DATASET_STORAGE_UNAVAILABLE', 'IndexedDB is not available in this browser.'));
  }
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(IMPORTED_DATASET_DB, DATABASE_VERSION);
    request.onupgradeneeded = () => {
      const database = request.result;
      if (!database.objectStoreNames.contains(META_STORE)) database.createObjectStore(META_STORE);
      if (!database.objectStoreNames.contains(CHUNK_STORE)) database.createObjectStore(CHUNK_STORE, { keyPath: 'index' });
    };
    request.onsuccess = () => {
      const database = request.result;
      database.onversionchange = () => database.close();
      resolve(database);
    };
    request.onerror = () => reject(new DatasetStorageError('DATASET_STORAGE_OPEN', request.error?.message ?? 'The imported-record database could not be opened.'));
    request.onblocked = () => reject(new DatasetStorageError('DATASET_STORAGE_BLOCKED', 'The imported-record database is blocked by another open page.'));
  });
}

function storageError(error: unknown, operation: string): DatasetStorageError {
  if (error instanceof DatasetStorageError) return error;
  const message = error instanceof Error ? error.message : 'Unknown IndexedDB error.';
  return new DatasetStorageError('DATASET_STORAGE', `Could not ${operation} the imported dataset. ${message}`);
}

export async function saveImportedDataset(dataset: ImportedDataset): Promise<void> {
  let database: IDBDatabase | undefined;
  try {
    database = await openDatabase();
    const chunks: StoredRecordChunk[] = [];
    for (let offset = 0; offset < dataset.records.length; offset += IMPORTED_DATASET_CHUNK_SIZE) {
      chunks.push({ index: chunks.length, records: dataset.records.slice(offset, offset + IMPORTED_DATASET_CHUNK_SIZE) });
    }
    const metadata: StoredDatasetMeta = {
      schemaVersion: DATASET_SCHEMA_VERSION,
      name: dataset.name,
      size: dataset.size,
      format: dataset.format,
      warnings: dataset.warnings,
      recordCount: dataset.records.length,
      chunkCount: chunks.length,
      savedAt: Date.now(),
    };
    const transaction = database.transaction([META_STORE, CHUNK_STORE], 'readwrite');
    transaction.objectStore(META_STORE).put(metadata, ACTIVE_DATASET_KEY);
    transaction.objectStore(CHUNK_STORE).clear();
    const chunkStore = transaction.objectStore(CHUNK_STORE);
    for (const chunk of chunks) chunkStore.put(chunk);
    await transactionComplete(transaction);
  } catch (error) {
    throw storageError(error, 'save');
  } finally {
    database?.close();
  }
}

export async function loadImportedDataset(): Promise<ImportedDataset | undefined> {
  let database: IDBDatabase | undefined;
  try {
    database = await openDatabase();
    const transaction = database.transaction([META_STORE, CHUNK_STORE], 'readonly');
    const metadataRequest = transaction.objectStore(META_STORE).get(ACTIVE_DATASET_KEY) as IDBRequest<StoredDatasetMeta | undefined>;
    const chunksRequest = transaction.objectStore(CHUNK_STORE).getAll() as IDBRequest<StoredRecordChunk[]>;
    const [metadata, chunks] = await Promise.all([requestResult(metadataRequest), requestResult(chunksRequest)]);
    await transactionComplete(transaction);
    if (!metadata) return undefined;
    if (metadata.schemaVersion !== DATASET_SCHEMA_VERSION
      || typeof metadata.name !== 'string'
      || !Number.isFinite(metadata.size)
      || !Array.isArray(metadata.warnings)
      || !['marcxml', 'iso2709'].includes(metadata.format)
      || !Number.isInteger(metadata.recordCount) || metadata.recordCount < 1
      || !Number.isInteger(metadata.chunkCount) || metadata.chunkCount < 1) {
      throw new DatasetStorageError('DATASET_STORAGE_CORRUPT', 'Stored imported-record metadata is invalid.');
    }
    const orderedChunks = chunks.sort((left, right) => left.index - right.index);
    if (orderedChunks.length !== metadata.chunkCount || orderedChunks.some((chunk, index) => chunk.index !== index || !Array.isArray(chunk.records))) {
      throw new DatasetStorageError('DATASET_STORAGE_CORRUPT', 'Stored imported-record chunks are incomplete.');
    }
    const records = orderedChunks.flatMap((chunk) => chunk.records);
    if (records.length !== metadata.recordCount || records.some((record) => !Number.isInteger(record?.mfn) || !record.fields || typeof record.fields !== 'object')) {
      throw new DatasetStorageError('DATASET_STORAGE_CORRUPT', 'Stored imported-record count does not match its metadata.');
    }
    return {
      name: metadata.name,
      size: metadata.size,
      format: metadata.format,
      warnings: metadata.warnings,
      records,
    };
  } catch (error) {
    throw storageError(error, 'restore');
  } finally {
    database?.close();
  }
}

export async function clearImportedDataset(): Promise<void> {
  let database: IDBDatabase | undefined;
  try {
    database = await openDatabase();
    const transaction = database.transaction([META_STORE, CHUNK_STORE], 'readwrite');
    transaction.objectStore(META_STORE).delete(ACTIVE_DATASET_KEY);
    transaction.objectStore(CHUNK_STORE).clear();
    await transactionComplete(transaction);
  } catch (error) {
    throw storageError(error, 'clear');
  } finally {
    database?.close();
  }
}
