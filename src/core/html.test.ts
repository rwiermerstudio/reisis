import { describe, expect, it } from 'vitest';
import { records } from '../data/records';
import { analyzeHtml } from './html';
import { evaluatePft } from './pft';

describe('HTML output analysis', () => {
  it('keeps valid generated markup in the sandbox document', () => {
    const result = evaluatePft("'<article><h2>', v245^a, '</h2></article>'", records[0]);
    const analysis = analyzeHtml(result.output, result.segments);

    expect(analysis.sanitized).toContain('<h2>The name of the rose</h2>');
    expect(analysis.previewDocument).toContain("default-src 'none'");
    expect(analysis.issues.filter((issue) => issue.severity === 'error')).toEqual([]);
    expect(analysis.removedCount).toBe(0);
  });

  it('removes scripts and event handlers', () => {
    const analysis = analyzeHtml('<article onclick="alert(1)"><script>alert(1)</script>Safe</article>');

    expect(analysis.sanitized).toBe('<article>Safe</article>');
    expect(analysis.removedCount).toBeGreaterThan(0);
  });

  it('blocks remote links, images, and CSS URLs', () => {
    const analysis = analyzeHtml('<a href="https://example.com">Link</a><img src="https://example.com/a.png"><p style="background:url(https://example.com/a.png)">Text</p>');

    expect(analysis.sanitized).not.toContain('https://');
    expect(analysis.removedCount).toBe(3);
  });

  it('maps malformed generated markup back to a PFT literal', () => {
    const result = evaluatePft("'<article><h2>', v245^a, '</article>'", records[0]);
    const issue = analyzeHtml(result.output, result.segments).issues.find((item) => item.severity === 'error');

    expect(issue).toMatchObject({ start: expect.any(Number), end: expect.any(Number) });
  });
});
