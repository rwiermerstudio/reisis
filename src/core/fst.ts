import { evaluatePft } from './pft';
import type { Diagnostic, FstResult, FstRow, IndexTerm, IsisRecord } from './types';

export function evaluateFst(source: string, record: IsisRecord): FstResult {
  const rows: FstRow[] = [];
  const terms: IndexTerm[] = [];
  const diagnostics: Diagnostic[] = [];
  const traces: FstResult['traces'] = [];
  let offset = 0;

  for (const [lineIndex, line] of source.split('\n').entries()) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) {
      offset += line.length + 1;
      continue;
    }
    const match = line.match(/^(\s*)(\d+)\s+(\d+)\s+(.+)$/);
    if (!match) {
      diagnostics.push({ start: offset, end: offset + Math.max(1, line.length), severity: 'error', code: 'FST_ROW', message: 'Expected: target-tag technique PFT-expression.' });
      offset += line.length + 1;
      continue;
    }
    const targetTag = Number(match[2]);
    const techniqueNumber = Number(match[3]);
    const expression = match[4];
    const expressionOffset = offset + line.indexOf(expression);
    if (techniqueNumber !== 0 && techniqueNumber !== 4) {
      diagnostics.push({ start: offset + line.indexOf(match[3]), end: offset + line.indexOf(match[3]) + match[3].length, severity: 'error', code: 'FST_TECHNIQUE', message: `Technique ${techniqueNumber} is outside this milestone; use 0 or 4.` });
      offset += line.length + 1;
      continue;
    }
    const row: FstRow = { start: offset, end: offset + line.length, line: lineIndex + 1, targetTag, technique: techniqueNumber, expression, expressionOffset };
    rows.push(row);
    const evaluation = evaluatePft(expression, record);
    traces.push({ row, evaluation });
    diagnostics.push(...evaluation.diagnostics.map((diagnostic) => ({ ...diagnostic, start: diagnostic.start + expressionOffset, end: diagnostic.end + expressionOffset })));
    if (evaluation.diagnostics.some((diagnostic) => diagnostic.severity === 'error')) {
      offset += line.length + 1;
      continue;
    }
    const extracted = row.technique === 0
      ? evaluation.output.split(/\r?\n/).map((term) => term.trim()).filter(Boolean)
      : evaluation.output.match(/[\p{L}\p{N}]+(?:['\-][\p{L}\p{N}]+)*/gu)?.map((term) => term.toUpperCase()) ?? [];
    const seen = new Set<string>();
    for (const term of extracted) {
      if (seen.has(term)) continue;
      seen.add(term);
      terms.push({ targetTag, technique: row.technique, term, source: evaluation.output, line: row.line });
    }
    offset += line.length + 1;
  }
  return { rows, terms, diagnostics, traces };
}
