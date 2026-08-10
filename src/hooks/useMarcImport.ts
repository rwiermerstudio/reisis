import { useEffect, useRef, useState } from 'react';
import type { MarcImportFormat, MarcImportWarning } from '../core/marc';
import {
  DatasetStorageError,
  clearImportedDataset,
  loadImportedDataset,
  saveImportedDataset,
  type ImportedDataset,
} from '../core/datasetStorage';
import type { IsisRecord } from '../core/types';

const MAX_IMPORT_BYTES = 100 * 1024 * 1024;

export interface MarcImportState {
  status: 'restoring' | 'idle' | 'reading' | 'parsing' | 'saving' | 'clearing' | 'done' | 'error';
  progress: number;
  error?: { code: string; message: string };
  dataset?: ImportedDataset;
  datasetSource?: 'storage' | 'import';
}

const initialState: MarcImportState = { status: 'idle', progress: 0 };

export function useMarcImport() {
  const [state, setState] = useState<MarcImportState>({ status: 'restoring', progress: 0 });
  const worker = useRef<Worker | undefined>(undefined);
  const requestId = useRef(0);

  const stopWorker = () => {
    worker.current?.terminate();
    worker.current = undefined;
  };

  useEffect(() => {
    let active = true;
    const id = requestId.current;
    void loadImportedDataset().then((dataset) => {
      if (!active || id !== requestId.current) return;
      setState(dataset
        ? { status: 'done', progress: 1, dataset, datasetSource: 'storage' }
        : initialState);
    }).catch((error) => {
      if (!active || id !== requestId.current) return;
      setState({
        status: 'error',
        progress: 0,
        error: {
          code: error instanceof DatasetStorageError ? error.code : 'DATASET_STORAGE',
          message: error instanceof Error ? error.message : 'The saved imported dataset could not be restored.',
        },
      });
    });
    return () => {
      active = false;
      requestId.current++;
      stopWorker();
    };
  }, []);

  const finishImport = async (dataset: ImportedDataset, id: number) => {
    if (id !== requestId.current) return;
    setState({ status: 'saving', progress: 1, dataset, datasetSource: 'import' });
    try {
      await saveImportedDataset(dataset);
      if (id !== requestId.current) return;
      setState({ status: 'done', progress: 1, dataset, datasetSource: 'import' });
    } catch (error) {
      if (id !== requestId.current) return;
      setState({
        status: 'error',
        progress: 1,
        dataset,
        datasetSource: 'import',
        error: {
          code: error instanceof DatasetStorageError ? error.code : 'DATASET_STORAGE',
          message: error instanceof Error ? error.message : 'The imported dataset could not be saved.',
        },
      });
    }
  };

  const importFile = async (file: File) => {
    const id = ++requestId.current;
    const existingDataset = state.dataset;
    const existingSource = state.datasetSource;
    stopWorker();
    if (file.size > MAX_IMPORT_BYTES) {
      setState({
        status: 'error',
        progress: 0,
        error: { code: 'MARC_FILE_SIZE', message: `The file exceeds the ${MAX_IMPORT_BYTES / 1024 / 1024} MB import limit.` },
        dataset: existingDataset,
        datasetSource: existingSource,
      });
      return;
    }
    setState({ status: 'reading', progress: 0, dataset: existingDataset, datasetSource: existingSource });
    try {
      const buffer = await file.arrayBuffer();
      if (id !== requestId.current) return;
      setState({ status: 'parsing', progress: 0, dataset: existingDataset, datasetSource: existingSource });
      if (typeof Worker === 'undefined') {
        setTimeout(async () => {
          if (id !== requestId.current) return;
          try {
            const { parseMarcData } = await import('../core/marc');
            const result = parseMarcData(new Uint8Array(buffer), file.name);
            await finishImport({ name: file.name, size: file.size, ...result }, id);
          } catch (error) {
            setState({
              status: 'error',
              progress: 0,
              dataset: existingDataset,
              datasetSource: existingSource,
              error: {
                code: error instanceof Error && 'code' in error && typeof error.code === 'string' ? error.code : 'MARC_IMPORT',
                message: error instanceof Error ? error.message : 'The MARC file could not be imported.',
              },
            });
          }
        }, 0);
        return;
      }

      const instance = new Worker(new URL('../workers/import.worker.ts', import.meta.url), { type: 'module' });
      worker.current = instance;
      instance.onmessage = (event: MessageEvent<{
        type: 'progress' | 'done' | 'error';
        id: number;
        processedBytes?: number;
        totalBytes?: number;
        result?: { format: MarcImportFormat; records: IsisRecord[]; warnings: MarcImportWarning[] };
        code?: string;
        message?: string;
      }>) => {
        const message = event.data;
        if (message.id !== requestId.current) return;
        if (message.type === 'progress') {
          setState((current) => ({ ...current, status: 'parsing', progress: (message.processedBytes ?? 0) / (message.totalBytes || 1) }));
        } else if (message.type === 'done' && message.result) {
          stopWorker();
          void finishImport({ name: file.name, size: file.size, ...message.result }, id);
        } else if (message.type === 'error') {
          setState({ status: 'error', progress: 0, dataset: existingDataset, datasetSource: existingSource, error: { code: message.code ?? 'MARC_IMPORT', message: message.message ?? 'The MARC file could not be imported.' } });
          stopWorker();
        }
      };
      instance.onerror = () => {
        if (id !== requestId.current) return;
        setState({ status: 'error', progress: 0, dataset: existingDataset, datasetSource: existingSource, error: { code: 'MARC_WORKER', message: 'The MARC import worker stopped unexpectedly.' } });
        stopWorker();
      };
      instance.postMessage({ type: 'parse', id, fileName: file.name, buffer }, [buffer]);
    } catch (error) {
      setState({ status: 'error', progress: 0, dataset: existingDataset, datasetSource: existingSource, error: { code: 'MARC_FILE_READ', message: error instanceof Error ? error.message : 'The file could not be read.' } });
    }
  };

  const cancel = () => {
    requestId.current++;
    stopWorker();
    setState((current) => current.dataset ? { status: 'done', progress: 1, dataset: current.dataset, datasetSource: current.datasetSource } : initialState);
  };

  const clear = async (): Promise<boolean> => {
    const id = ++requestId.current;
    stopWorker();
    const existingDataset = state.dataset;
    const existingSource = state.datasetSource;
    setState({ status: 'clearing', progress: 0, dataset: existingDataset, datasetSource: existingSource });
    try {
      await clearImportedDataset();
      if (id !== requestId.current) return false;
      setState(initialState);
      return true;
    } catch (error) {
      if (id !== requestId.current) return false;
      setState({
        status: 'error',
        progress: 0,
        dataset: existingDataset,
        datasetSource: existingSource,
        error: {
          code: error instanceof DatasetStorageError ? error.code : 'DATASET_STORAGE',
          message: error instanceof Error ? error.message : 'The saved imported dataset could not be removed.',
        },
      });
      return false;
    }
  };

  return { state, importFile, cancel, clear };
}
