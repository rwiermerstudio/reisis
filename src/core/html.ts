import DOMPurify from 'dompurify';
import { HtmlValidate } from 'html-validate/browser';
import type { OutputSegment, SourceSpan } from './types';

export interface HtmlIssue extends Partial<SourceSpan> {
  severity: 'error' | 'warning';
  message: string;
  ruleId: string;
  line: number;
  column: number;
}

export interface HtmlAnalysis {
  raw: string;
  sanitized: string;
  previewDocument: string;
  issues: HtmlIssue[];
  removedCount: number;
}

const validator = new HtmlValidate({
  extends: ['html-validate:recommended'],
  rules: {
    'doctype-style': 'off',
    'no-inline-style': 'off',
    'prefer-native-element': 'off',
  },
});

function sourceSpanForOffset(segments: OutputSegment[], offset: number): SourceSpan | undefined {
  let cursor = 0;
  for (const segment of segments) {
    const end = cursor + segment.text.length;
    if (offset >= cursor && offset <= end) return { start: segment.start, end: segment.end };
    cursor = end;
  }
  return undefined;
}

function allowUrl(value: string, attribute: 'href' | 'src'): boolean {
  const normalized = value.trim().toLowerCase();
  if (attribute === 'href') return normalized.startsWith('#') || normalized.startsWith('mailto:');
  return /^data:image\/(?:png|gif|jpe?g|webp);base64,/i.test(normalized);
}

export function analyzeHtml(raw: string, segments: OutputSegment[] = []): HtmlAnalysis {
  const report = validator.validateStringSync(raw || '<span></span>');
  const issues: HtmlIssue[] = report.results.flatMap((result) => result.messages.map((message) => {
    const span = sourceSpanForOffset(segments, Math.max(0, (message.offset ?? 1) - 1));
    return {
      ...span,
      severity: message.severity === 2 ? 'error' as const : 'warning' as const,
      message: message.message,
      ruleId: message.ruleId ?? 'html',
      line: message.line,
      column: message.column,
    };
  }));

  const sanitizedBase = DOMPurify.sanitize(raw, {
    USE_PROFILES: { html: true },
    FORBID_TAGS: ['script', 'iframe', 'object', 'embed', 'form', 'input', 'button', 'base', 'meta', 'link'],
    FORBID_ATTR: ['srcset', 'action', 'formaction'],
    ALLOW_DATA_ATTR: false,
  });
  let removedCount = DOMPurify.removed.length;
  const template = document.createElement('template');
  template.innerHTML = sanitizedBase;
  template.content.querySelectorAll<HTMLElement>('[href], [src]').forEach((element) => {
    for (const attribute of ['href', 'src'] as const) {
      const value = element.getAttribute(attribute);
      if (value !== null && !allowUrl(value, attribute)) {
        element.removeAttribute(attribute);
        removedCount++;
      }
    }
  });
  template.content.querySelectorAll<HTMLElement>('[style]').forEach((element) => {
    if (/url\s*\(|@import/i.test(element.getAttribute('style') ?? '')) {
      element.removeAttribute('style');
      removedCount++;
    }
  });
  template.content.querySelectorAll('style').forEach((element) => {
    const original = element.textContent ?? '';
    element.textContent = original.replace(/@import[^;]+;?/gi, '').replace(/url\s*\([^)]*\)/gi, 'none');
    if (element.textContent !== original) removedCount++;
  });
  const sanitized = template.innerHTML;
  const previewDocument = `<!doctype html><html><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; img-src data:; font-src 'none'; media-src 'none'; frame-src 'none'; form-action 'none'; base-uri 'none'"><style>html{color:#202522;background:#fff;font:14px/1.5 system-ui,sans-serif}body{margin:18px}table{border-collapse:collapse}th,td{padding:6px 8px;border:1px solid #ccd2ce;text-align:left}img{max-width:100%;height:auto}</style></head><body>${sanitized}</body></html>`;
  return { raw, sanitized, previewDocument, issues, removedCount };
}
