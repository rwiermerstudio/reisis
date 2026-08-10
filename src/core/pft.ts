import { fieldOccurrences, subfieldValue } from './record';
import { evaluateCisisExpression, expressionTruthy, parseCisisExpression } from './expression';
import type {
  AstNode,
  ConditionalNode,
  Diagnostic,
  EvaluationResult,
  FieldNode,
  ParseResult,
  OutputSegment,
  ProgramNode,
  TraceEvent,
  IsisRecord,
} from './types';

class Parser {
  private position = 0;
  private id = 0;
  readonly diagnostics: Diagnostic[] = [];

  constructor(private readonly source: string) {}

  private readonly outputFunctions = new Set(['size', 'instr', 'val', 'left', 'right', 'mid', 'replace', 'f', 's', 'date', 'rsum', 'rmin', 'rmax', 'ravr']);

  parse(): ParseResult {
    const children = this.parseSequence([]);
    const ast: ProgramNode = { type: 'program', id: this.id++, start: 0, end: this.source.length, children };
    return { ast, diagnostics: this.diagnostics };
  }

  private parseSequence(stops: string[]): AstNode[] {
    const nodes: AstNode[] = [];
    while (this.position < this.source.length) {
      this.skipSeparators();
      if (this.position >= this.source.length || stops.some((stop) => this.atKeyword(stop))) break;
      const start = this.position;
      const char = this.source[this.position];
      if (char === "'" || char === '"' || char === '|') nodes.push(this.parseLiteral(char));
      else if (char === '+' && this.source[this.position + 1] === '|') { this.position++; nodes.push(this.parseLiteral('|', true)); }
      else if (this.source.startsWith('/*', this.position)) nodes.push(this.parseComment());
      else if (char === '/') nodes.push({ type: 'newline', kind: 'conditional', id: this.id++, start, end: ++this.position });
      else if (char === '#') nodes.push({ type: 'newline', kind: 'unconditional', id: this.id++, start, end: ++this.position });
      else if (char === '%') nodes.push({ type: 'layout', kind: 'reset', id: this.id++, start, end: ++this.position });
      else if (char === '(') nodes.push(this.parseGroup());
      else if (this.atKeyword('if')) nodes.push(this.parseConditional());
      else if (this.atKeyword('select')) nodes.push(this.parseSelect());
      else if (this.atKeyword('while')) nodes.push(this.parseWhile());
      else if (/^m[pdh][lu]/i.test(this.source.slice(this.position))) nodes.push(this.parseMode());
      else if (this.atKeyword('lw') && this.source[this.position + 2] === '(') nodes.push(this.parseLineWidth());
      else if (this.atKeyword('mfn')) nodes.push(this.parseMfn());
      else if (this.atKeyword('iocc')) nodes.push(this.parseIocc());
      else if (this.atKeyword('nocc')) nodes.push(this.parseNocc());
      else if (this.atKeyword('break')) nodes.push(this.parseControl('break'));
      else if (this.atKeyword('continue')) nodes.push(this.parseControl('continue'));
      else if (/^[es]\d\s*:=/i.test(this.source.slice(this.position))) nodes.push(this.parseAssignment());
      else if (/^[es]\d\b/i.test(this.source.slice(this.position))) nodes.push(this.parseVariable());
      else if (this.atKeyword('date') && this.source[this.position + 4] !== '(') nodes.push(this.parseBareExpression('date'));
      else if ([...this.outputFunctions].some((name) => this.atKeyword(name) && this.source[this.position + name.length] === '(')) nodes.push(this.parseOutputFunction());
      else if (/[dDnN]/.test(char) && /\d/.test(this.source[this.position + 1] ?? '')) nodes.push(this.parseDummy());
      else if (/[xXcC]/.test(char) && /\d/.test(this.source[this.position + 1] ?? '')) nodes.push(this.parseLayout());
      else if (/[vV]/.test(char) && /\d/.test(this.source[this.position + 1] ?? '')) nodes.push(this.parseField());
      else {
        const token = this.source.slice(start).match(/^[^\s,()/'"|]+/)?.[0] ?? char;
        this.position += token.length;
        this.error(start, this.position, `Unsupported or unexpected token "${token}".`, 'PFT_UNSUPPORTED');
      }
    }
    return nodes;
  }

  private skipSeparators(): void {
    while (this.position < this.source.length && /[\s,]/.test(this.source[this.position])) this.position++;
  }

  private skipConditionalTrivia(): void {
    this.skipSeparators();
    while (this.source.startsWith('/*', this.position)) {
      this.parseComment();
      this.skipSeparators();
    }
  }

  private parseLiteral(delimiter: string, suppressLast = false): AstNode {
    const start = this.position++;
    let value = '';
    while (this.position < this.source.length && this.source[this.position] !== delimiter) {
      value += this.source[this.position++];
    }
    if (this.source[this.position] === delimiter) this.position++;
    else this.error(start, this.position, 'Unterminated literal.', 'PFT_LITERAL');
    const suppressFirst = delimiter === '|' && this.source[this.position] === '+';
    if (suppressFirst) this.position++;
    const kind = delimiter === "'" ? 'unconditional' : delimiter === '"' ? 'conditional' : 'repeatable-conditional';
    return { type: 'literal', id: this.id++, start, end: this.position, value, kind, suppressFirst, suppressLast };
  }

  private parseComment(): AstNode {
    const start = this.position;
    this.position += 2;
    const contentStart = this.position;
    const close = this.source.indexOf('*/', this.position);
    if (close === -1) {
      this.position = this.source.length;
      this.error(start, this.position, 'Comment is missing */.', 'PFT_COMMENT');
      return { type: 'comment', id: this.id++, start, end: this.position, value: this.source.slice(contentStart) };
    }
    this.position = close + 2;
    return { type: 'comment', id: this.id++, start, end: this.position, value: this.source.slice(contentStart, close) };
  }

  private parseLayout(): AstNode {
    const start = this.position;
    const command = this.source[this.position++].toLowerCase();
    const numberStart = this.position;
    while (/\d/.test(this.source[this.position] ?? '')) this.position++;
    const amount = Number(this.source.slice(numberStart, this.position));
    return { type: 'layout', kind: command === 'x' ? 'spaces' : 'column', amount, id: this.id++, start, end: this.position };
  }

  private parseMfn(): AstNode {
    const start = this.position;
    this.consumeKeyword('mfn');
    let width: number | undefined;
    if (this.source[this.position] === '(') {
      this.position++;
      this.skipSeparators();
      const numberStart = this.position;
      while (/\d/.test(this.source[this.position] ?? '')) this.position++;
      if (numberStart < this.position) width = Number(this.source.slice(numberStart, this.position));
      else this.error(numberStart, this.position + 1, 'MFN width must be a positive integer.', 'PFT_MFN');
      this.skipSeparators();
      if (this.source[this.position] === ')') this.position++;
      else this.error(start, this.position, 'MFN width is missing a closing parenthesis.', 'PFT_MFN');
    }
    return { type: 'system', kind: 'mfn', width, id: this.id++, start, end: this.position };
  }

  private parseIocc(): AstNode {
    const start = this.position;
    this.consumeKeyword('iocc');
    return { type: 'system', kind: 'iocc', id: this.id++, start, end: this.position };
  }

  private parseNocc(): AstNode {
    const start = this.position;
    this.consumeKeyword('nocc');
    if (this.source[this.position] !== '(') {
      this.error(start, this.position, 'NOCC must look like nocc(v650).', 'PFT_NOCC');
      return { type: 'system', kind: 'nocc', id: this.id++, start, end: this.position };
    }
    this.position++;
    this.skipSeparators();
    const field = /[vV]/.test(this.source[this.position] ?? '') && /\d/.test(this.source[this.position + 1] ?? '')
      ? this.parseField()
      : undefined;
    if (!field) this.error(this.position, this.position + 1, 'NOCC expects a field selector.', 'PFT_NOCC');
    this.skipSeparators();
    if (this.source[this.position] === ')') this.position++;
    else this.error(start, this.position, 'NOCC is missing a closing parenthesis.', 'PFT_NOCC');
    return { type: 'system', kind: 'nocc', field, id: this.id++, start, end: this.position };
  }

  private parseControl(kind: 'break' | 'continue'): AstNode {
    const start = this.position;
    this.consumeKeyword(kind);
    return { type: 'control', kind, id: this.id++, start, end: this.position };
  }

  private callEnd(start: number): number {
    let depth = 0;
    let quote = '';
    for (let index = start; index < this.source.length; index++) {
      const char = this.source[index];
      if (quote) { if (char === quote) quote = ''; continue; }
      if (char === "'" || char === '"') { quote = char; continue; }
      if (char === '(') depth++;
      else if (char === ')' && --depth === 0) return index + 1;
    }
    return this.source.length;
  }

  private parseOutputFunction(): AstNode {
    const start = this.position;
    const end = this.callEnd(start);
    const parsed = parseCisisExpression(this.source.slice(start, end), start);
    this.diagnostics.push(...parsed.diagnostics);
    this.position = end;
    if (this.source[end - 1] !== ')') this.error(start, end, 'Function call is missing a closing parenthesis.', 'PFT_EXPRESSION');
    return { type: 'function', expression: parsed.expression, id: this.id++, start, end };
  }

  private parseField(): FieldNode {
    const start = this.position;
    this.position++;
    const tagStart = this.position;
    while (/\d/.test(this.source[this.position] ?? '')) this.position++;
    const tag = this.source.slice(tagStart, this.position);
    let subfield: string | undefined;
    let occurrence: number | undefined;
    let occurrenceEnd: number | 'LAST' | undefined;
    if (this.source[this.position] === '^') {
      this.position++;
      const code = this.source[this.position];
      if (/[a-z0-9]/i.test(code ?? '')) {
        subfield = code.toLowerCase();
        this.position++;
      } else this.error(this.position - 1, this.position, 'Expected a subfield code after ^.', 'PFT_SUBFIELD');
    }
    if (this.source[this.position] === '[') {
      const bracketStart = this.position++;
      const numberStart = this.position;
      if (this.source.slice(this.position, this.position + 4).toUpperCase() === 'LAST') { occurrenceEnd = 'LAST'; occurrence = -1; this.position += 4; }
      else while (/\d/.test(this.source[this.position] ?? '')) this.position++;
      if (this.source.startsWith('..', this.position) && this.position > numberStart) {
        occurrence = Number(this.source.slice(numberStart, this.position));
        this.position += 2;
        const endStart = this.position;
        if (this.source.slice(this.position, this.position + 4).toUpperCase() === 'LAST') { occurrenceEnd = 'LAST'; this.position += 4; }
        else { while (/\d/.test(this.source[this.position] ?? '')) this.position++; occurrenceEnd = this.position > endStart ? Number(this.source.slice(endStart, this.position)) : 'LAST'; }
      }
      if (this.source[this.position] === ']' && (this.position > numberStart || occurrence === -1)) {
        if (occurrence === undefined) occurrence = Number(this.source.slice(numberStart, this.position));
        this.position++;
        if (occurrence === -1) { occurrence = undefined; occurrenceEnd = 'LAST'; }
        else if (occurrence < 1) this.error(bracketStart, this.position, 'Occurrence numbers start at 1.', 'PFT_OCCURRENCE');
      } else {
        while (this.position < this.source.length && this.source[this.position] !== ']') this.position++;
        if (this.source[this.position] === ']') this.position++;
        this.error(bracketStart, this.position, 'Occurrence selector must look like [2].', 'PFT_OCCURRENCE');
      }
    }
    let sliceOffset: number | undefined;
    let sliceLength: number | undefined;
    if (this.source[this.position] === '*') {
      this.position++;
      const offsetStart = this.position;
      while (/\d/.test(this.source[this.position] ?? '')) this.position++;
      sliceOffset = Number(this.source.slice(offsetStart, this.position) || 0);
      if (this.source[this.position] === '.') {
        this.position++;
        const lengthStart = this.position;
        while (/\d/.test(this.source[this.position] ?? '')) this.position++;
        if (this.position > lengthStart) sliceLength = Number(this.source.slice(lengthStart, this.position));
      }
    }
    let indentFirst: number | undefined;
    let indentNext: number | undefined;
    if (this.source[this.position] === '(') {
      const indentStart = this.position++;
      const firstStart = this.position;
      while (/\d/.test(this.source[this.position] ?? '')) this.position++;
      indentFirst = Number(this.source.slice(firstStart, this.position));
      if (this.source[this.position] === ',') this.position++;
      const nextStart = this.position;
      while (/\d/.test(this.source[this.position] ?? '')) this.position++;
      indentNext = Number(this.source.slice(nextStart, this.position));
      if (this.source[this.position] === ')') this.position++;
      else this.error(indentStart, this.position, 'Field indentation must look like (5,5).', 'PFT_INDENT');
    }
    return { type: 'field', id: this.id++, start, end: this.position, tag, subfield, occurrence, occurrenceEnd, sliceOffset, sliceLength, indentFirst, indentNext };
  }

  private parseDummy(): AstNode {
    const start = this.position;
    const kind = this.source[this.position++].toLowerCase() === 'd' ? 'present' : 'absent';
    const field = this.parseFieldAfterPrefix(start);
    return { type: 'dummy', kind, field, id: this.id++, start, end: this.position };
  }

  private parseFieldAfterPrefix(start: number): FieldNode {
    const tagStart = this.position;
    while (/\d/.test(this.source[this.position] ?? '')) this.position++;
    const tag = this.source.slice(tagStart, this.position);
    let subfield: string | undefined;
    if (this.source[this.position] === '^' && /[a-z0-9]/i.test(this.source[this.position + 1] ?? '')) { subfield = this.source[this.position + 1].toLowerCase(); this.position += 2; }
    return { type: 'field', id: this.id++, start, end: this.position, tag, subfield };
  }

  private parseMode(): AstNode {
    const start = this.position;
    const token = this.source.slice(this.position, this.position + 3).toLowerCase();
    this.position += 3;
    return { type: 'mode', mode: token[1] === 'p' ? 'proof' : token[1] === 'h' ? 'heading' : 'data', uppercase: token[2] === 'u', id: this.id++, start, end: this.position };
  }

  private parseLineWidth(): AstNode {
    const start = this.position;
    this.position += 3;
    const numberStart = this.position;
    while (/\d/.test(this.source[this.position] ?? '')) this.position++;
    const amount = Number(this.source.slice(numberStart, this.position));
    if (this.source[this.position] === ')') this.position++;
    else this.error(start, this.position, 'LW must look like lw(80).', 'PFT_LINE_WIDTH');
    return { type: 'layout', kind: 'line-width', amount, id: this.id++, start, end: this.position };
  }

  private parseVariable(): AstNode {
    const start = this.position;
    const name = this.source.slice(this.position, this.position + 2).toLowerCase();
    this.position += 2;
    return { type: 'variable', name, id: this.id++, start, end: this.position };
  }

  private parseBareExpression(name: string): AstNode {
    const start = this.position;
    this.position += name.length;
    const parsed = parseCisisExpression(name, start);
    return { type: 'function', expression: parsed.expression, id: this.id++, start, end: this.position };
  }

  private parseAssignment(): AstNode {
    const start = this.position;
    const name = this.source.slice(this.position, this.position + 2).toLowerCase();
    this.position += 2;
    while (/\s/.test(this.source[this.position] ?? '')) this.position++;
    this.position += 2;
    while (/\s/.test(this.source[this.position] ?? '')) this.position++;
    if (name.startsWith('s') && this.source[this.position] === '(') {
      this.position++;
      const children = this.parseSequence([')']);
      if (this.source[this.position] === ')') this.position++;
      else this.error(start, this.position, 'String-variable assignment is missing a closing parenthesis.', 'PFT_ASSIGNMENT');
      return { type: 'assignment', name, children, id: this.id++, start, end: this.position };
    }
    const end = this.findExpressionEnd(this.position);
    if (end === this.position) {
      this.error(this.position, this.position + 1, `Assignment to ${name} requires a value${name.startsWith('s') ? ' or parenthesized format' : ''}.`, 'PFT_ASSIGNMENT');
      return { type: 'assignment', name, expression: { type: 'literal', value: name.startsWith('s') ? '' : 0 }, id: this.id++, start, end };
    }
    const parsed = parseCisisExpression(this.source.slice(this.position, end), this.position);
    this.diagnostics.push(...parsed.diagnostics);
    this.position = end;
    return { type: 'assignment', name, expression: parsed.expression, id: this.id++, start, end };
  }

  private findExpressionEnd(start: number): number {
    let depth = 0;
    let quote = '';
    for (let index = start; index < this.source.length; index++) {
      const char = this.source[index];
      if (quote) { if (char === quote) quote = ''; continue; }
      if (char === "'" || char === '"') { quote = char; continue; }
      if (char === '(') depth++;
      else if (char === ')') { if (depth === 0) return index; depth--; }
      else if (char === ',' && depth === 0) return index;
    }
    return this.source.length;
  }

  private parseWhile(): AstNode {
    const start = this.position;
    this.consumeKeyword('while');
    this.skipSeparators();
    const conditionStart = this.position;
    const bodyStart = this.findLastTopLevelOpen(conditionStart);
    if (bodyStart < 0) {
      this.error(start, this.source.length, 'WHILE expects a condition followed by (format).', 'PFT_WHILE');
      this.position = this.source.length;
      return { type: 'while', condition: { type: 'literal', value: 0 }, children: [], id: this.id++, start, end: this.position };
    }
    const parsed = parseCisisExpression(this.source.slice(conditionStart, bodyStart), conditionStart);
    this.diagnostics.push(...parsed.diagnostics);
    this.position = bodyStart + 1;
    const children = this.parseSequence([')']);
    if (this.source[this.position] === ')') this.position++;
    else this.error(start, this.position, 'WHILE body is missing a closing parenthesis.', 'PFT_WHILE');
    return { type: 'while', condition: parsed.expression, children, id: this.id++, start, end: this.position };
  }

  private findLastTopLevelOpen(start: number): number {
    let depth = 0;
    let quote = '';
    let candidate = -1;
    for (let index = start; index < this.source.length; index++) {
      const char = this.source[index];
      if (quote) { if (char === quote) quote = ''; continue; }
      if (char === "'" || char === '"') { quote = char; continue; }
      if (char === '(') { if (depth === 0) candidate = index; depth++; }
      else if (char === ')') depth--;
      else if (char === ',' && depth === 0 && candidate >= 0) break;
    }
    return candidate;
  }

  private parseSelect(): AstNode {
    const start = this.position;
    this.consumeKeyword('select');
    this.skipSeparators();
    const expressionStart = this.position;
    const firstCase = this.findStructuralKeyword('case', expressionStart);
    if (firstCase < 0) {
      this.error(start, this.source.length, 'SELECT requires at least one CASE.', 'PFT_SELECT');
      this.position = this.source.length;
      return { type: 'select', expression: { type: 'literal', value: '' }, cases: [], alternate: [], id: this.id++, start, end: this.position };
    }
    const parsed = parseCisisExpression(this.source.slice(expressionStart, firstCase), expressionStart);
    this.diagnostics.push(...parsed.diagnostics);
    this.position = firstCase;
    const cases: Array<{ option: import('./types').CisisExpression; children: AstNode[] }> = [];
    while (this.atKeyword('case')) {
      this.consumeKeyword('case');
      this.skipSeparators();
      const optionStart = this.position;
      const colon = this.source.indexOf(':', optionStart);
      if (colon < 0) { this.error(optionStart, this.source.length, 'CASE requires a colon.', 'PFT_SELECT'); break; }
      const option = parseCisisExpression(this.source.slice(optionStart, colon), optionStart);
      this.diagnostics.push(...option.diagnostics);
      this.position = colon + 1;
      cases.push({ option: option.expression, children: this.parseSequence(['case', 'elsecase', 'endsel']) });
    }
    let alternate: AstNode[] = [];
    if (this.atKeyword('elsecase')) { this.consumeKeyword('elsecase'); alternate = this.parseSequence(['endsel']); }
    if (this.atKeyword('endsel')) this.consumeKeyword('endsel');
    else this.error(start, this.position, 'SELECT is missing ENDSEL.', 'PFT_SELECT');
    return { type: 'select', expression: parsed.expression, cases, alternate, id: this.id++, start, end: this.position };
  }

  private parseGroup(): AstNode {
    const start = this.position++;
    const children = this.parseSequence([')']);
    if (this.source[this.position] === ')') this.position++;
    else this.error(start, this.position, 'Repeatable group is missing a closing parenthesis.', 'PFT_GROUP');
    return { type: 'group', id: this.id++, start, end: this.position, children };
  }

  private parseConditional(): ConditionalNode {
    const start = this.position;
    this.consumeKeyword('if');
    this.skipSeparators();
    const conditionStart = this.position;
    const thenPosition = this.findStructuralKeyword('then', conditionStart);
    const conditionEnd = thenPosition < 0 ? this.source.length : thenPosition;
    const parsedCondition = parseCisisExpression(this.source.slice(conditionStart, conditionEnd).replace(/\/\*[\s\S]*?\*\//g, ' '), conditionStart);
    this.diagnostics.push(...parsedCondition.diagnostics);
    if (thenPosition < 0) {
      this.position = this.source.length;
      this.error(conditionStart, this.position, 'Expected THEN after the condition.', 'PFT_THEN');
    } else {
      this.position = thenPosition;
      this.consumeKeyword('then');
    }
    const consequent = this.parseSequence(['else', 'fi']);
    let alternate: AstNode[] = [];
    if (this.atKeyword('else')) {
      this.consumeKeyword('else');
      alternate = this.parseSequence(['fi']);
    }
    if (this.atKeyword('fi')) this.consumeKeyword('fi');
    else this.error(start, this.position, 'Conditional is missing FI.', 'PFT_FI');
    return {
      type: 'conditional', id: this.id++, start, end: this.position,
      condition: parsedCondition.expression, consequent, alternate,
    };
  }

  private findStructuralKeyword(keyword: string, start: number): number {
    let depth = 0;
    let quote = '';
    for (let index = start; index < this.source.length; index++) {
      const char = this.source[index];
      if (quote) { if (char === quote) quote = ''; continue; }
      if (char === "'" || char === '"') { quote = char; continue; }
      if (this.source.startsWith('/*', index)) {
        const close = this.source.indexOf('*/', index + 2);
        index = close < 0 ? this.source.length : close + 1;
        continue;
      }
      if (char === '(') depth++;
      else if (char === ')') depth--;
      else if (depth === 0) {
        const candidate = this.source.slice(index, index + keyword.length);
        const previous = this.source[index - 1];
        const next = this.source[index + keyword.length];
        if (candidate.toLowerCase() === keyword && (!previous || !/[a-z0-9_]/i.test(previous)) && (!next || !/[a-z0-9_]/i.test(next))) return index;
      }
    }
    return -1;
  }

  private atKeyword(keyword: string): boolean {
    const candidate = this.source.slice(this.position, this.position + keyword.length);
    const next = this.source[this.position + keyword.length];
    return candidate.toLowerCase() === keyword && (!next || !/[a-z0-9_]/i.test(next));
  }

  private consumeKeyword(keyword: string): void {
    this.position += keyword.length;
  }

  private error(start: number, end: number, message: string, code: string): void {
    this.diagnostics.push({ start, end: Math.max(start + 1, end), message, code, severity: 'error' });
  }
}

export function parsePft(source: string): ParseResult {
  return new Parser(source).parse();
}

function fieldsIn(nodes: AstNode[]): FieldNode[] {
  return nodes.flatMap((node): FieldNode[] => {
    if (node.type === 'field') return [node];
    if (node.type === 'group') return fieldsIn(node.children);
    if (node.type === 'conditional') return [...fieldsIn(node.consequent), ...fieldsIn(node.alternate)];
    return [];
  });
}

export function evaluateParsedPft(parsed: ParseResult, record: IsisRecord, includeTrace = true): EvaluationResult {
  const trace: TraceEvent[] = [];
  const segments: OutputSegment[] = [];
  const runtimeDiagnostics: Diagnostic[] = [];
  let traceId = 0;
  let output = '';
  let displayMode: 'proof' | 'heading' | 'data' = 'proof';
  let uppercase = false;
  let lineWidth = Number.POSITIVE_INFINITY;
  const variables = new Map<string, string | number>();
  for (let index = 0; index < 10; index++) { variables.set(`e${index}`, 0); variables.set(`s${index}`, ''); }
  const BREAK = Symbol('break');
  const CONTINUE = Symbol('continue');

  const emit = (node: AstNode | FieldNode, kind: TraceEvent['kind'], label: string, detail: string, output: string, depth: number) => {
    if (!includeTrace) return;
    trace.push({ id: traceId++, start: node.start, end: node.end, kind, label, detail, output, depth });
  };

  const segment = (node: AstNode | FieldNode, origin: OutputSegment['origin'], text: string) => {
    if (!includeTrace || !text) return;
    segments.push({ nodeId: node.id, start: node.start, end: node.end, origin, text });
  };

  const append = (node: AstNode | FieldNode, origin: OutputSegment['origin'], text: string) => {
    let rendered = '';
    for (const char of text) {
      const column = output.length + rendered.length - Math.max(output.lastIndexOf('\n'), (output + rendered).lastIndexOf('\n')) - 1;
      if (char !== '\n' && Number.isFinite(lineWidth) && column >= lineWidth) rendered += '\n';
      rendered += char;
    }
    output += rendered;
    segment(node, origin, rendered);
  };

  const rawFieldValue = (field: FieldNode, occurrence: number | undefined): string => {
    const values = fieldOccurrences(record, field.tag);
    let selectedValues: string[];
    if (occurrence !== undefined && field.occurrence === undefined && field.occurrenceEnd === undefined) selectedValues = [values[occurrence - 1] ?? ''];
    else if (field.occurrenceEnd !== undefined) {
      const start = field.occurrence ?? values.length;
      const end = field.occurrenceEnd === 'LAST' ? values.length : field.occurrenceEnd;
      selectedValues = values.slice(Math.max(0, start - 1), end);
    } else selectedValues = [values[(field.occurrence ?? 1) - 1] ?? ''];
    return selectedValues.map((raw) => field.subfield ? subfieldValue(raw, field.subfield) : raw).join('');
  };

  const transformField = (field: FieldNode, occurrence: number | undefined): string => {
    let value = rawFieldValue(field, occurrence);
    if (field.sliceOffset !== undefined) value = [...value].slice(field.sliceOffset, field.sliceLength === undefined ? undefined : field.sliceOffset + field.sliceLength).join('');
    if (displayMode !== 'proof') {
      if (!field.subfield && /\^[a-z0-9]/i.test(value)) {
        const parts = [...value.matchAll(/\^[a-z0-9]([^\^]*)/gi)].map((match) => match[1].trim()).filter(Boolean);
        value = parts.join(', ');
      }
      value = value.replace(/[<>]/g, '');
      if (displayMode === 'data' && value) value = `${value.replace(/[.\s]+$/, '')}.  `;
    }
    if (uppercase) value = value.toUpperCase();
    return value;
  };

  const expressionContext = (occurrence: number | undefined) => ({ record, occurrence, variables, fieldResolver: (field: FieldNode) => transformField(field, occurrence) });

  const associatedPresence = (nodes: AstNode[], index: number, occurrence: number | undefined): boolean => {
    for (let next = index + 1; next < nodes.length; next++) {
      const candidate = nodes[next];
      if (candidate.type === 'comment') continue;
      if (candidate.type === 'field') return transformField(candidate, occurrence).length > 0;
      if (candidate.type === 'dummy') {
        const present = transformField(candidate.field, occurrence).length > 0;
        return candidate.kind === 'present' ? present : !present;
      }
      break;
    }
    for (let previous = index - 1; previous >= 0; previous--) {
      const candidate = nodes[previous];
      if (candidate.type === 'comment') continue;
      if (candidate.type === 'field') return transformField(candidate, occurrence).length > 0;
      if (candidate.type === 'dummy') {
        const present = transformField(candidate.field, occurrence).length > 0;
        return candidate.kind === 'present' ? present : !present;
      }
      break;
    }
    return false;
  };

  const resetBlankLines = () => {
    output = output.replace(/\n+$/, '');
    while (segments.at(-1)?.origin === 'layout' && /^\n+$/.test(segments.at(-1)?.text ?? '')) segments.pop();
  };

  const evaluateNodes = (nodes: AstNode[], occurrence: number | undefined, depth: number, groupCount?: number): void => nodes.forEach((node, index) => {
    if (node.type === 'literal') {
      const present = associatedPresence(nodes, index, occurrence);
      const allowed = node.kind === 'unconditional'
        || (present && (node.kind === 'repeatable-conditional' || occurrence === undefined || occurrence === 1));
      const plusAllowed = !(node.suppressFirst && occurrence === 1) && !(node.suppressLast && occurrence !== undefined && occurrence === groupCount);
      const value = allowed && plusAllowed ? node.value : '';
      emit(node, 'literal', `${node.kind} literal`, value ? `Emitted ${node.value.length} character${node.value.length === 1 ? '' : 's'}.` : 'Suppressed by field association or + position.', value, depth);
      append(node, 'literal', value);
      return;
    }
    if (node.type === 'newline') {
      const value = node.kind === 'unconditional' || (output.length > 0 && !output.endsWith('\n')) ? '\n' : '';
      emit(node, 'layout', `${node.kind === 'conditional' ? 'Conditional' : 'Unconditional'} new line`, value ? 'Moved output to the next line.' : 'Already at the beginning of a line.', value, depth);
      append(node, 'layout', value);
      return;
    }
    if (node.type === 'layout') {
      if (node.kind === 'line-width') {
        lineWidth = Math.max(1, node.amount ?? 80);
        emit(node, 'layout', `Line width ${lineWidth}`, 'Changed the active output width.', '', depth);
        return;
      }
      if (node.kind === 'reset') {
        resetBlankLines();
        emit(node, 'layout', 'Reset blank lines', 'Removed trailing blank lines.', '', depth);
        return;
      }
      const currentColumn = output.length - (output.lastIndexOf('\n') + 1);
      const amount = node.amount ?? 0;
      const value = node.kind === 'spaces'
        ? ' '.repeat(amount)
        : currentColumn < amount - 1
          ? ' '.repeat(amount - 1 - currentColumn)
          : `\n${' '.repeat(Math.max(0, amount - 1))}`;
      emit(node, 'layout', node.kind === 'spaces' ? `Space x${amount}` : `Column c${amount}`, `Inserted ${value.length} layout character${value.length === 1 ? '' : 's'}.`, value, depth);
      append(node, 'layout', value);
      return;
    }
    if (node.type === 'comment') {
      emit(node, 'comment', 'Comment', 'Ignored during evaluation.', '', depth);
      return;
    }
    if (node.type === 'mode') {
      displayMode = node.mode;
      uppercase = node.uppercase;
      emit(node, 'function', `Mode ${node.mode}`, node.uppercase ? 'Uppercase conversion enabled.' : 'Case unchanged.', '', depth);
      return;
    }
    if (node.type === 'dummy') {
      emit(node, 'condition', `${node.kind} dummy v${node.field.tag}`, 'Used only for conditional literal association.', '', depth);
      return;
    }
    if (node.type === 'system') {
      let value = '';
      let label = node.kind.toUpperCase();
      if (node.kind === 'mfn') value = String(record.mfn).padStart(node.width ?? 0, '0');
      else if (node.kind === 'iocc') value = String(occurrence ?? 0);
      else if (node.field) {
        const values = fieldOccurrences(record, node.field.tag);
        value = String(node.field.subfield ? values.filter((item) => subfieldValue(item, node.field!.subfield!).length > 0).length : values.length);
        label = `NOCC v${node.field.tag}${node.field.subfield ? `^${node.field.subfield}` : ''}`;
      }
      emit(node, 'function', label, `Returned ${value}.`, value, depth);
      append(node, 'system', value);
      return;
    }
    if (node.type === 'function') {
      const value = String(evaluateCisisExpression(node.expression, expressionContext(occurrence)));
      emit(node, 'function', node.expression.type === 'call' ? `${node.expression.name}()` : 'Expression', `Returned ${value}.`, value, depth);
      append(node, 'system', value);
      return;
    }
    if (node.type === 'control') {
      emit(node, 'control', node.kind.toUpperCase(), node.kind === 'break' ? 'Stopped the current repeatable group.' : 'Advanced to the next occurrence.', '', depth);
      throw node.kind === 'break' ? BREAK : CONTINUE;
    }
    if (node.type === 'variable') {
      const value = String(variables.get(node.name) ?? '');
      emit(node, 'function', `Variable ${node.name}`, `Returned ${value}.`, value, depth);
      append(node, 'system', value);
      return;
    }
    if (node.type === 'assignment') {
      let value: string | number = 0;
      if (node.expression) value = evaluateCisisExpression(node.expression, expressionContext(occurrence)) as string | number;
      else if (node.children) {
        const outputStart = output.length;
        const segmentStart = segments.length;
        evaluateNodes(node.children, occurrence, depth + 1, groupCount);
        value = output.slice(outputStart);
        output = output.slice(0, outputStart);
        segments.splice(segmentStart);
      }
      variables.set(node.name, node.name.startsWith('e') ? Number(value) || 0 : String(value));
      emit(node, 'function', `Assign ${node.name}`, `Stored ${String(value)}.`, '', depth);
      return;
    }
    if (node.type === 'while') {
      let iterations = 0;
      while (expressionTruthy(evaluateCisisExpression(node.condition, expressionContext(occurrence))) && iterations < 1000) {
        iterations++;
        try { evaluateNodes(node.children, occurrence, depth + 1, groupCount); }
        catch (signal) { if (signal === BREAK) break; if (signal === CONTINUE) continue; throw signal; }
      }
      if (iterations === 1000 && expressionTruthy(evaluateCisisExpression(node.condition, expressionContext(occurrence)))) {
        runtimeDiagnostics.push({ start: node.start, end: node.end, severity: 'error', code: 'PFT_WHILE_LIMIT', message: 'WHILE exceeded the 1,000-iteration browser safety limit.' });
      }
      emit(node, 'control', 'WHILE', `${iterations} iteration${iterations === 1 ? '' : 's'} (limit 1000).`, '', depth);
      return;
    }
    if (node.type === 'select') {
      const selected = evaluateCisisExpression(node.expression, expressionContext(occurrence));
      const branch = node.cases.find((item) => evaluateCisisExpression(item.option, expressionContext(occurrence)) === selected)?.children ?? node.alternate;
      emit(node, 'condition', 'SELECT', `Selected ${String(selected)}.`, '', depth);
      evaluateNodes(branch, occurrence, depth + 1, groupCount);
      return;
    }
    if (node.type === 'field') {
      const values = fieldOccurrences(record, node.tag);
      const selected = node.occurrence ?? occurrence ?? 1;
      let value = transformField(node, occurrence);
      if (node.indentFirst !== undefined && output.length - output.lastIndexOf('\n') - 1 === 0) {
        const first = ' '.repeat(Math.max(0, node.indentFirst - 1));
        const next = ' '.repeat(Math.max(0, (node.indentNext ?? node.indentFirst) - 1));
        const available = Math.max(1, lineWidth - first.length);
        const words = value.split(/\s+/);
        const lines: string[] = [];
        let line = '';
        for (const word of words) { if (line && `${line} ${word}`.length > available) { lines.push(line); line = word; } else line = line ? `${line} ${word}` : word; }
        if (line) lines.push(line);
        value = lines.map((lineValue, lineIndex) => `${lineIndex ? next : first}${lineValue}`).join('\n');
      }
      const selector = `v${node.tag}${node.subfield ? `^${node.subfield}` : ''}`;
      emit(node, 'field', selector, values.length ? `Read occurrence ${selected} of ${values.length}.` : 'Field is absent.', value, depth);
      append(node, 'field', value);
      return;
    }
    if (node.type === 'group') {
      const candidates = fieldsIn(node.children).filter((field) => field.occurrence === undefined);
      const count = Math.max(0, ...candidates.map((field) => fieldOccurrences(record, field.tag).length));
      emit(node, 'group', 'Repeatable group', `${count} iteration${count === 1 ? '' : 's'}.`, '', depth);
      for (let childIndex = 0; childIndex < count; childIndex++) {
        try {
          evaluateNodes(node.children, childIndex + 1, depth + 1, count);
        } catch (signal) {
          if (signal === CONTINUE) continue;
          if (signal === BREAK) break;
          throw signal;
        }
      }
      return;
    }
    const conditionValue = evaluateCisisExpression(node.condition, expressionContext(occurrence));
    const matches = expressionTruthy(conditionValue);
    emit(node, 'condition', 'Expression condition', `${String(conditionValue)} is ${matches ? 'true' : 'false'}.`, '', depth);
    evaluateNodes(matches ? node.consequent : node.alternate, occurrence, depth + 1, groupCount);
  });

  try {
    evaluateNodes(parsed.ast.children, undefined, 0);
  } catch (signal) {
    if (signal !== BREAK && signal !== CONTINUE) throw signal;
  }
  return { ...parsed, diagnostics: [...parsed.diagnostics, ...runtimeDiagnostics], output, trace, segments };
}

export function evaluatePft(source: string, record: IsisRecord): EvaluationResult {
  return evaluateParsedPft(parsePft(source), record);
}
