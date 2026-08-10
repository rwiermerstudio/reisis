/// <reference lib="webworker" />

import { compileBatch, evaluateBatchRecord, type BatchMode, type CompiledBatch } from '../core/batch';
import type { IsisRecord } from '../core/types';

type InputMessage =
  | { type: 'set-records'; records: IsisRecord[] }
  | { type: 'evaluate'; id: number; mode: BatchMode; source: string; chunkSize?: number };

let records: IsisRecord[] = [];
let activeId = 0;

function runChunk(id: number, compiled: CompiledBatch, offset: number, chunkSize: number): void {
  if (id !== activeId) return;
  const end = Math.min(offset + chunkSize, records.length);
  const results = records.slice(offset, end).map((record) => evaluateBatchRecord(compiled, record));
  self.postMessage({ type: 'chunk', id, processed: end, total: records.length, results });
  if (end < records.length) {
    setTimeout(() => runChunk(id, compiled, end, chunkSize), 0);
  } else {
    self.postMessage({ type: 'done', id, total: records.length });
  }
}

self.onmessage = (event: MessageEvent<InputMessage>) => {
  const message = event.data;
  if (message.type === 'set-records') {
    records = message.records;
    return;
  }
  activeId = message.id;
  const compiled = compileBatch(message.mode, message.source);
  runChunk(message.id, compiled, 0, message.chunkSize ?? 100);
};
