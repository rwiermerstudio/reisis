import { describe, expect, it } from 'vitest';
import { evaluateFst } from '../core/fst';
import { analyzeHtml } from '../core/html';
import { evaluatePft } from '../core/pft';
import { lessons } from './lessons';
import { records } from './records';

describe('executable lesson solutions', () => {
  it.each(lessons)('lesson $id: $title', (lesson) => {
    const record = records.find((candidate) => candidate.mfn === lesson.recordMfn)!;
    let output: string;
    if (lesson.mode === 'pft') {
      const result = evaluatePft(lesson.solution, record);
      expect(result.diagnostics).toEqual([]);
      output = result.output;
      if (lesson.output === 'html') {
        const analysis = analyzeHtml(output, result.segments);
        expect(analysis.issues.filter((issue) => issue.severity === 'error')).toEqual([]);
        expect(analysis.removedCount).toBe(0);
      }
    } else {
      const result = evaluateFst(lesson.solution, record);
      expect(result.diagnostics).toEqual([]);
      output = result.terms.map((term) => term.term).join('\n');
    }
    for (const expected of lesson.expected) expect(output).toContain(expected);
  });
});
