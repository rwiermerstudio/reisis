import { compileFst, evaluateCompiledFst, type CompiledFst } from './fst';
import { evaluateParsedPft, parsePft } from './pft';
import type { IndexTerm, IsisRecord, ParseResult } from './types';

export type BatchMode = 'pft' | 'fst';

export interface BatchTerm extends Pick<IndexTerm, 'targetTag' | 'technique' | 'term' | 'line'> {}

export interface BatchRecordResult {
  mfn: number;
  output?: string;
  terms?: BatchTerm[];
}

export type CompiledBatch =
  | { mode: 'pft'; parsed: ParseResult }
  | { mode: 'fst'; compiled: CompiledFst };

export function compileBatch(mode: BatchMode, source: string): CompiledBatch {
  return mode === 'pft'
    ? { mode, parsed: parsePft(source) }
    : { mode, compiled: compileFst(source) };
}

export function evaluateBatchRecord(compiled: CompiledBatch, record: IsisRecord): BatchRecordResult {
  if (compiled.mode === 'pft') {
    return { mfn: record.mfn, output: evaluateParsedPft(compiled.parsed, record, false).output };
  }
  const result = evaluateCompiledFst(compiled.compiled, record, false);
  return {
    mfn: record.mfn,
    terms: result.terms.map(({ targetTag, technique, term, line }) => ({ targetTag, technique, term, line })),
  };
}

export function evaluateBatchRecords(mode: BatchMode, source: string, records: IsisRecord[]): BatchRecordResult[] {
  const compiled = compileBatch(mode, source);
  return records.map((record) => evaluateBatchRecord(compiled, record));
}
