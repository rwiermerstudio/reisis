/// <reference lib="webworker" />

import { MarcImportError, parseMarcData, type MarcImportResult } from '../core/marc';

interface ImportMessage {
  type: 'parse';
  id: number;
  fileName: string;
  buffer: ArrayBuffer;
}

type OutputMessage =
  | { type: 'progress'; id: number; processedBytes: number; totalBytes: number }
  | { type: 'done'; id: number; result: MarcImportResult }
  | { type: 'error'; id: number; code: string; message: string };

function send(message: OutputMessage): void {
  self.postMessage(message);
}

self.onmessage = (event: MessageEvent<ImportMessage>) => {
  const { id, fileName, buffer } = event.data;
  try {
    const result = parseMarcData(new Uint8Array(buffer), fileName, {
      onProgress: (processedBytes, totalBytes) => send({ type: 'progress', id, processedBytes, totalBytes }),
    });
    send({ type: 'done', id, result });
  } catch (error) {
    send({
      type: 'error',
      id,
      code: error instanceof MarcImportError ? error.code : 'MARC_IMPORT',
      message: error instanceof Error ? error.message : 'The MARC file could not be imported.',
    });
  }
};
