import { useEffect, useRef, useState } from 'react';
import { compileBatch, evaluateBatchRecord, type BatchMode, type BatchRecordResult } from '../core/batch';
import type { IsisRecord } from '../core/types';

export interface BatchEvaluationState {
  status: 'idle' | 'running' | 'done' | 'error';
  processed: number;
  total: number;
  results: BatchRecordResult[];
  durationMs?: number;
}

const initialState: BatchEvaluationState = { status: 'idle', processed: 0, total: 0, results: [] };

export function useBatchEvaluation(
  enabled: boolean,
  mode: BatchMode,
  source: string,
  records: IsisRecord[],
  blocked: boolean,
): BatchEvaluationState {
  const [state, setState] = useState<BatchEvaluationState>(initialState);
  const [worker, setWorker] = useState<Worker>();
  const requestId = useRef(0);
  const startedAt = useRef(0);

  useEffect(() => {
    if (typeof Worker === 'undefined') return;
    const instance = new Worker(new URL('../workers/evaluation.worker.ts', import.meta.url), { type: 'module' });
    instance.onmessage = (event: MessageEvent<{ type: 'chunk' | 'done'; id: number; processed?: number; total: number; results?: BatchRecordResult[] }>) => {
      const message = event.data;
      if (message.id !== requestId.current) return;
      if (message.type === 'chunk') {
        setState((current) => ({
          ...current,
          status: 'running',
          processed: message.processed ?? current.processed,
          total: message.total,
          results: [...current.results, ...(message.results ?? [])],
        }));
      } else {
        setState((current) => ({ ...current, status: 'done', processed: message.total, total: message.total, durationMs: performance.now() - startedAt.current }));
      }
    };
    instance.onerror = () => setState((current) => ({ ...current, status: 'error' }));
    setWorker(instance);
    return () => instance.terminate();
  }, []);

  useEffect(() => {
    worker?.postMessage({ type: 'set-records', records });
  }, [records, worker]);

  useEffect(() => {
    if (!enabled || blocked) {
      requestId.current++;
      setState({ ...initialState, total: enabled ? records.length : 0 });
      return;
    }

    const id = ++requestId.current;
    let cancelled = false;
    let fallbackTimer: ReturnType<typeof setTimeout> | undefined;
    const debounceTimer = setTimeout(() => {
      startedAt.current = performance.now();
      setState({ status: 'running', processed: 0, total: records.length, results: [] });
      if (worker) {
        worker.postMessage({ type: 'evaluate', id, mode, source, chunkSize: 100 });
        return;
      }

      const compiled = compileBatch(mode, source);
      const chunkSize = 100;
      const process = (offset: number) => {
        if (cancelled || id !== requestId.current) return;
        const end = Math.min(offset + chunkSize, records.length);
        const chunk = records.slice(offset, end).map((record) => evaluateBatchRecord(compiled, record));
        setState((current) => ({ ...current, processed: end, results: [...current.results, ...chunk] }));
        if (end < records.length) fallbackTimer = setTimeout(() => process(end), 0);
        else setState((current) => ({ ...current, status: 'done', durationMs: performance.now() - startedAt.current }));
      };
      process(0);
    }, 120);

    return () => {
      cancelled = true;
      clearTimeout(debounceTimer);
      if (fallbackTimer) clearTimeout(fallbackTimer);
    };
  }, [blocked, enabled, mode, records, source, worker]);

  return state;
}
