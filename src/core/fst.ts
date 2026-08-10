import { evaluateParsedPft, parsePft } from './pft';
import type { Diagnostic, FstResult, FstRow, IndexTerm, IsisRecord, ParseResult } from './types';

export interface CompiledFst {
  rows: FstRow[];
  diagnostics: Diagnostic[];
  entries: Array<{ row: FstRow; parsed: ParseResult }>;
}

export function compileFst(source: string): CompiledFst {
  const rows: FstRow[] = [];
  const diagnostics: Diagnostic[] = [];
  const entries: CompiledFst['entries'] = [];
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
    if (!Number.isInteger(techniqueNumber) || techniqueNumber < 0 || techniqueNumber > 8) {
      diagnostics.push({ start: offset + line.indexOf(match[3]), end: offset + line.indexOf(match[3]) + match[3].length, severity: 'error', code: 'FST_TECHNIQUE', message: `Technique ${techniqueNumber} is invalid; use 0 through 8.` });
      offset += line.length + 1;
      continue;
    }
    const row: FstRow = { start: offset, end: offset + line.length, line: lineIndex + 1, targetTag, technique: techniqueNumber as FstRow['technique'], expression, expressionOffset };
    rows.push(row);
    const parsed = parsePft(expression);
    diagnostics.push(...parsed.diagnostics.map((diagnostic) => ({ ...diagnostic, start: diagnostic.start + expressionOffset, end: diagnostic.end + expressionOffset })));
    entries.push({ row, parsed });
    offset += line.length + 1;
  }
  return { rows, diagnostics, entries };
}

export function evaluateCompiledFst(compiled: CompiledFst, record: IsisRecord, includeTrace = true): FstResult {
  const terms: IndexTerm[] = [];
  const traces: FstResult['traces'] = [];
  const diagnostics = [...compiled.diagnostics];
  for (const { row, parsed } of compiled.entries) {
    const evaluation = evaluateParsedPft(parsed, record, includeTrace);
    if (includeTrace) traces.push({ row, evaluation });
    if (parsed.diagnostics.some((diagnostic) => diagnostic.severity === 'error')) continue;
    let source = evaluation.output;
    let technique = row.technique;
    let prefix = '';
    if (technique >= 5) {
      const delimiter = source[0];
      const end = delimiter ? source.indexOf(delimiter, 1) : -1;
      if (!delimiter || end < 1) {
        diagnostics.push({ start: row.start, end: row.end, severity: 'error', code: 'FST_PREFIX', message: `Technique ${technique} expects a delimiter-wrapped prefix such as '|TI_|'.` });
        continue;
      }
      prefix = source.slice(1, end);
      source = source.slice(end + 1);
      technique = (technique - 4) as FstRow['technique'];
    }
    const lines = source.split(/\r?\n/).map((term) => term.trim()).filter(Boolean);
    let extracted: string[];
    if (technique === 0) extracted = lines;
    else if (technique === 1) extracted = lines.flatMap((line) => {
      const subfields = [...line.matchAll(/\^[a-z0-9]([^\^]*)/gi)].map((match) => match[1].trim()).filter(Boolean);
      return subfields.length ? subfields : [line];
    });
    else if (technique === 2) extracted = [...source.matchAll(/<([^<>]+)>/g)].map((match) => match[1].trim()).filter(Boolean);
    else if (technique === 3) extracted = [...source.matchAll(/\/([^/]+)\//g)].map((match) => match[1].trim()).filter(Boolean);
    else extracted = source.match(/[\p{L}\p{N}]+(?:['\-][\p{L}\p{N}]+)*/gu)?.map((term) => term.toUpperCase()) ?? [];
    extracted = extracted.map((term) => `${prefix}${term}`);
    const seen = new Set<string>();
    for (const term of extracted) {
      if (seen.has(term)) continue;
      seen.add(term);
      terms.push({ targetTag: row.targetTag, technique: row.technique, term, source: evaluation.output, line: row.line });
    }
  }
  return { rows: compiled.rows, terms, diagnostics, traces };
}

export function evaluateFst(source: string, record: IsisRecord): FstResult {
  return evaluateCompiledFst(compileFst(source), record);
}
