import { useEffect, useRef, useState } from 'react';
import type { MarcImportFormat, MarcImportWarning } from '../core/marc';
import type { IsisRecord } from '../core/types';

const MAX_IMPORT_BYTES = 100 * 1024 * 1024;

export interface ImportedDataset {
  name: string;
  size: number;
  format: MarcImportFormat;
  records: IsisRecord[];
  warnings: MarcImportWarning[];
}

export interface MarcImportState {
  status: 'idle' | 'reading' | 'parsing' | 'done' | 'error';
  progress: number;
  error?: { code: string; message: string };
  dataset?: ImportedDataset;
}

const initialState: MarcImportState = { status: 'idle', progress: 0 };

export function useMarcImport() {
  const [state, setState] = useState<MarcImportState>(initialState);
  const worker = useRef<Worker | undefined>(undefined);
  const requestId = useRef(0);

  const stopWorker = () => {
    worker.current?.terminate();
    worker.current = undefined;
  };

  useEffect(() => () => stopWorker(), []);

  const importFile = async (file: File) => {
    const id = ++requestId.current;
    const existingDataset = state.dataset;
    stopWorker();
    if (file.size > MAX_IMPORT_BYTES) {
      setState({
        status: 'error',
        progress: 0,
        error: { code: 'MARC_FILE_SIZE', message: `The file exceeds the ${MAX_IMPORT_BYTES / 1024 / 1024} MB import limit.` },
        dataset: existingDataset,
      });
      return;
    }
    setState({ status: 'reading', progress: 0, dataset: existingDataset });
    try {
      const buffer = await file.arrayBuffer();
      if (id !== requestId.current) return;
      setState({ status: 'parsing', progress: 0, dataset: existingDataset });
      if (typeof Worker === 'undefined') {
        setTimeout(async () => {
          if (id !== requestId.current) return;
          try {
            const { parseMarcData } = await import('../core/marc');
            const result = parseMarcData(new Uint8Array(buffer), file.name);
            setState({ status: 'done', progress: 1, dataset: { name: file.name, size: file.size, ...result } });
          } catch (error) {
            setState({
              status: 'error',
              progress: 0,
              dataset: existingDataset,
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
          setState({ status: 'done', progress: 1, dataset: { name: file.name, size: file.size, ...message.result } });
          stopWorker();
        } else if (message.type === 'error') {
          setState({ status: 'error', progress: 0, dataset: existingDataset, error: { code: message.code ?? 'MARC_IMPORT', message: message.message ?? 'The MARC file could not be imported.' } });
          stopWorker();
        }
      };
      instance.onerror = () => {
        if (id !== requestId.current) return;
        setState({ status: 'error', progress: 0, dataset: existingDataset, error: { code: 'MARC_WORKER', message: 'The MARC import worker stopped unexpectedly.' } });
        stopWorker();
      };
      instance.postMessage({ type: 'parse', id, fileName: file.name, buffer }, [buffer]);
    } catch (error) {
      setState({ status: 'error', progress: 0, dataset: existingDataset, error: { code: 'MARC_FILE_READ', message: error instanceof Error ? error.message : 'The file could not be read.' } });
    }
  };

  const cancel = () => {
    requestId.current++;
    stopWorker();
    setState((current) => current.dataset ? { status: 'done', progress: 1, dataset: current.dataset } : initialState);
  };

  const clear = () => {
    requestId.current++;
    stopWorker();
    setState(initialState);
  };

  return { state, importFile, cancel, clear };
}
