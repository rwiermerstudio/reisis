import { fieldOccurrences, subfieldValue } from './record';
import type { CisisExpression, Diagnostic, FieldNode, IsisRecord } from './types';

interface Token {
  kind: 'number' | 'string' | 'field' | 'identifier' | 'operator' | 'punctuation' | 'eof';
  value: string;
  start: number;
  end: number;
}

export interface ExpressionContext {
  record: IsisRecord;
  occurrence?: number;
  variables?: Map<string, string | number>;
  fieldResolver?: (field: FieldNode) => string;
}

const supportedFunctions = new Set(['p', 'a', 'nocc', 'size', 'instr', 'val', 'left', 'right', 'mid', 'replace', 'f', 's', 'date', 'rsum', 'rmin', 'rmax', 'ravr']);
const functionArities: Record<string, [minimum: number, maximum: number]> = {
  p: [1, 1], a: [1, 1], nocc: [1, 1], size: [1, 1], val: [1, 1],
  instr: [2, 2], left: [2, 2], right: [2, 2], mid: [3, 3], replace: [3, 3], f: [1, 3],
  s: [0, 99], date: [0, 1], rsum: [1, 1], rmin: [1, 1], rmax: [1, 1], ravr: [1, 1],
};

function tokenize(source: string): { tokens: Token[]; diagnostics: Diagnostic[] } {
  const tokens: Token[] = [];
  const diagnostics: Diagnostic[] = [];
  let position = 0;
  while (position < source.length) {
    if (/\s/.test(source[position])) { position++; continue; }
    const start = position;
    const char = source[position];
    if (char === "'" || char === '"') {
      position++;
      let value = '';
      while (position < source.length && source[position] !== char) value += source[position++];
      if (source[position] === char) position++;
      else diagnostics.push({ start, end: Math.max(start + 1, position), severity: 'error', code: 'PFT_EXPRESSION_STRING', message: 'Expression string is unterminated.' });
      tokens.push({ kind: 'string', value, start, end: position });
      continue;
    }
    const field = source.slice(position).match(/^[vV](\d+)(?:\^([a-z0-9]))?(?:\[(\d+)\])?/i)?.[0];
    if (field) {
      position += field.length;
      tokens.push({ kind: 'field', value: field, start, end: position });
      continue;
    }
    const number = source.slice(position).match(/^\d+(?:\.\d+)?/)?.[0];
    if (number) {
      position += number.length;
      tokens.push({ kind: 'number', value: number, start, end: position });
      continue;
    }
    const identifier = source.slice(position).match(/^[a-z_][a-z0-9_]*/i)?.[0];
    if (identifier) {
      position += identifier.length;
      const lower = identifier.toLowerCase();
      tokens.push({ kind: ['and', 'or', 'not'].includes(lower) ? 'operator' : 'identifier', value: lower, start, end: position });
      continue;
    }
    const operator = ['>=', '<=', '<>', '!=', '=='].find((candidate) => source.startsWith(candidate, position)) ?? (/[=<>+\-*/]/.test(char) ? char : undefined);
    if (operator) {
      position += operator.length;
      tokens.push({ kind: 'operator', value: operator, start, end: position });
      continue;
    }
    if (char === '(' || char === ')' || char === ',') {
      position++;
      tokens.push({ kind: 'punctuation', value: char, start, end: position });
      continue;
    }
    position++;
    diagnostics.push({ start, end: position, severity: 'error', code: 'PFT_EXPRESSION_TOKEN', message: `Unexpected expression character "${char}".` });
  }
  tokens.push({ kind: 'eof', value: '', start: source.length, end: source.length });
  return { tokens, diagnostics };
}

class ExpressionParser {
  private position = 0;
  readonly diagnostics: Diagnostic[];

  constructor(private readonly tokens: Token[], diagnostics: Diagnostic[]) {
    this.diagnostics = diagnostics;
  }

  parse(): CisisExpression {
    const expression = this.parseOr();
    if (this.current().kind !== 'eof') this.error(this.current(), `Unexpected token "${this.current().value}".`);
    return expression;
  }

  private parseOr(): CisisExpression {
    let left = this.parseAnd();
    while (this.matchOperator('or')) left = { type: 'binary', operator: 'or', left, right: this.parseAnd() };
    return left;
  }

  private parseAnd(): CisisExpression {
    let left = this.parseComparison();
    while (this.matchOperator('and')) left = { type: 'binary', operator: 'and', left, right: this.parseComparison() };
    return left;
  }

  private parseComparison(): CisisExpression {
    let left = this.parseAdditive();
    while (['=', '==', '!=', '<>', '<', '<=', '>', '>='].includes(this.current().value)) {
      const operator = this.advance().value;
      left = { type: 'binary', operator, left, right: this.parseAdditive() };
    }
    return left;
  }

  private parseAdditive(): CisisExpression {
    let left = this.parseMultiplicative();
    while (['+', '-'].includes(this.current().value)) {
      const operator = this.advance().value;
      left = { type: 'binary', operator, left, right: this.parseMultiplicative() };
    }
    return left;
  }

  private parseMultiplicative(): CisisExpression {
    let left = this.parseUnary();
    while (['*', '/'].includes(this.current().value)) {
      const operator = this.advance().value;
      left = { type: 'binary', operator, left, right: this.parseUnary() };
    }
    return left;
  }

  private parseUnary(): CisisExpression {
    if (['not', '-', '+'].includes(this.current().value)) {
      const operator = this.advance().value as 'not' | '-' | '+';
      return { type: 'unary', operator, operand: this.parseUnary() };
    }
    return this.parsePrimary();
  }

  private parsePrimary(): CisisExpression {
    const token = this.advance();
    if (token.kind === 'number') return { type: 'literal', value: Number(token.value) };
    if (token.kind === 'string') return { type: 'literal', value: token.value };
    if (token.kind === 'field') {
      const match = token.value.match(/^[vV](\d+)(?:\^([a-z0-9]))?(?:\[(\d+)\])?/i)!;
      const field: FieldNode = { type: 'field', id: -1, start: token.start, end: token.end, tag: match[1], subfield: match[2]?.toLowerCase(), occurrence: match[3] ? Number(match[3]) : undefined };
      return { type: 'field', field };
    }
    if (token.value === '(') {
      const expression = this.parseOr();
      if (!this.match(')')) this.error(this.current(), 'Expression is missing a closing parenthesis.');
      return expression;
    }
    if (token.kind === 'identifier') {
      if (!this.match('(')) {
        if (token.value === 'mfn' || token.value === 'iocc' || token.value === 'date' || /^(?:e|s)\d$/i.test(token.value)) return { type: 'identifier', name: token.value };
        if (token.value === 'dateonly' || token.value === 'datetime') return { type: 'literal', value: token.value.toUpperCase() };
        this.error(token, `Unknown expression identifier "${token.value}".`);
        return { type: 'literal', value: 0 };
      }
      const args: CisisExpression[] = [];
      if (!this.match(')')) {
        do args.push(this.parseOr()); while (this.match(','));
        if (!this.match(')')) this.error(this.current(), 'Function call is missing a closing parenthesis.');
      }
      if (!supportedFunctions.has(token.value)) this.error(token, `Unsupported function "${token.value}".`);
      else {
        const [minimum, maximum] = functionArities[token.value];
        if (args.length < minimum || args.length > maximum) this.error(token, `${token.value}() expects ${minimum === maximum ? minimum : `${minimum}-${maximum}`} argument${maximum === 1 ? '' : 's'}; received ${args.length}.`);
      }
      return { type: 'call', name: token.value, args };
    }
    this.error(token, 'Expected an expression value.');
    return { type: 'literal', value: 0 };
  }

  private current(): Token { return this.tokens[this.position] ?? this.tokens[this.tokens.length - 1]; }
  private advance(): Token {
    const token = this.current();
    if (token.kind !== 'eof') this.position++;
    return token;
  }
  private match(value: string): boolean { if (this.current().value !== value) return false; this.position++; return true; }
  private matchOperator(value: string): boolean { return this.current().kind === 'operator' && this.match(value); }
  private error(token: Token, message: string): void { this.diagnostics.push({ start: token.start, end: Math.max(token.start + 1, token.end), severity: 'error', code: 'PFT_EXPRESSION', message }); }
}

export function parseCisisExpression(source: string, offset = 0): { expression: CisisExpression; diagnostics: Diagnostic[] } {
  const tokenized = tokenize(source);
  const parser = new ExpressionParser(tokenized.tokens, tokenized.diagnostics);
  const expression = parser.parse();
  return {
    expression,
    diagnostics: parser.diagnostics.map((item) => ({ ...item, start: item.start + offset, end: item.end + offset })),
  };
}

function fieldValue(field: FieldNode, context: ExpressionContext): string {
  if (context.fieldResolver) return context.fieldResolver(field);
  const values = fieldOccurrences(context.record, field.tag);
  const selected = field.occurrence ?? context.occurrence ?? 1;
  const raw = values[selected - 1] ?? '';
  return field.subfield ? subfieldValue(raw, field.subfield) : raw;
}

function truthy(value: string | number | boolean): boolean {
  return typeof value === 'boolean' ? value : typeof value === 'number' ? value !== 0 && !Number.isNaN(value) : value.length > 0;
}

function numeric(value: string | number | boolean): number {
  if (typeof value === 'number') return value;
  if (typeof value === 'boolean') return value ? 1 : 0;
  return Number.parseFloat(value.trim()) || 0;
}

export function evaluateCisisExpression(expression: CisisExpression, context: ExpressionContext): string | number | boolean {
  if (expression.type === 'literal') return expression.value;
  if (expression.type === 'field') return fieldValue(expression.field, context);
  if (expression.type === 'identifier') {
    if (expression.name === 'mfn') return context.record.mfn;
    if (expression.name === 'iocc') return context.occurrence ?? 0;
    if (expression.name === 'date') return formatDate();
    return context.variables?.get(expression.name) ?? (expression.name.startsWith('e') ? 0 : '');
  }
  if (expression.type === 'unary') {
    const value = evaluateCisisExpression(expression.operand, context);
    return expression.operator === 'not' ? !truthy(value) : expression.operator === '-' ? -numeric(value) : numeric(value);
  }
  if (expression.type === 'binary') {
    const left = evaluateCisisExpression(expression.left, context);
    if (expression.operator === 'and') return truthy(left) && truthy(evaluateCisisExpression(expression.right, context));
    if (expression.operator === 'or') return truthy(left) || truthy(evaluateCisisExpression(expression.right, context));
    const right = evaluateCisisExpression(expression.right, context);
    if (expression.operator === '+') return numeric(left) + numeric(right);
    if (expression.operator === '-') return numeric(left) - numeric(right);
    if (expression.operator === '*') return numeric(left) * numeric(right);
    if (expression.operator === '/') return numeric(right) === 0 ? 0 : numeric(left) / numeric(right);
    const numericComparison = typeof left === 'number' || typeof right === 'number';
    const a = numericComparison ? numeric(left) : String(left);
    const b = numericComparison ? numeric(right) : String(right);
    if (expression.operator === '=' || expression.operator === '==') return a === b;
    if (expression.operator === '!=' || expression.operator === '<>') return a !== b;
    if (expression.operator === '<') return a < b;
    if (expression.operator === '<=') return a <= b;
    if (expression.operator === '>') return a > b;
    return a >= b;
  }

  const args = expression.args.map((arg) => evaluateCisisExpression(arg, context));
  const text = (index: number) => String(args[index] ?? '');
  const number = (index: number) => numeric(args[index] ?? 0);
  if (expression.name === 'p' || expression.name === 'a') {
    const present = truthy(args[0] ?? '');
    return expression.name === 'p' ? present : !present;
  }
  if (expression.name === 'nocc') {
    const field = expression.args[0]?.type === 'field' ? expression.args[0].field : undefined;
    if (!field) return 0;
    const values = fieldOccurrences(context.record, field.tag);
    return field.subfield ? values.filter((value) => subfieldValue(value, field.subfield!).length > 0).length : values.length;
  }
  if (expression.name === 'size') return [...text(0)].length;
  if (expression.name === 'instr') { const index = text(0).indexOf(text(1)); return index < 0 ? 0 : index + 1; }
  if (expression.name === 'val') return Number(text(0).match(/[-+]?\d+(?:\.\d+)?/)?.[0] ?? 0);
  if (expression.name === 'left') return [...text(0)].slice(0, Math.max(0, number(1))).join('');
  if (expression.name === 'right') return [...text(0)].slice(-Math.max(0, number(1))).join('');
  if (expression.name === 'mid') return [...text(0)].slice(Math.max(0, number(1) - 1), Math.max(0, number(1) - 1) + Math.max(0, number(2))).join('');
  if (expression.name === 'replace') return text(1) ? text(0).split(text(1)).join(text(2)) : text(0);
  if (expression.name === 's') return args.map(String).join('');
  if (expression.name === 'date') return formatDate(text(0));
  if (['rsum', 'rmin', 'rmax', 'ravr'].includes(expression.name)) {
    const values = text(0).match(/[-+]?\d+(?:\.\d+)?/g)?.map(Number) ?? [];
    if (!values.length) return 0;
    if (expression.name === 'rsum') return values.reduce((sum, value) => sum + value, 0);
    if (expression.name === 'rmin') return Math.min(...values);
    if (expression.name === 'rmax') return Math.max(...values);
    return values.reduce((sum, value) => sum + value, 0) / values.length;
  }
  if (expression.name === 'f') {
    const numericValue = number(0);
    if (args.length === 1) return numericValue.toExponential(6).padStart(16, ' ');
    const width = Math.max(0, number(1));
    if (args.length === 2) return numericValue.toExponential(Math.max(0, width - 7)).padStart(width, ' ');
    return numericValue.toFixed(Math.max(0, number(2))).padStart(width, ' ');
  }
  return '';
}

function formatDate(keyword = ''): string {
  const now = new Date();
  const pad = (value: number) => String(value).padStart(2, '0');
  const shortYear = String(now.getFullYear()).slice(-2);
  if (keyword.toUpperCase() === 'DATEONLY') return `${pad(now.getDate())}/${pad(now.getMonth() + 1)}/${shortYear}`;
  if (keyword.toUpperCase() === 'DATETIME') return `${pad(now.getDate())}/${pad(now.getMonth() + 1)}/${shortYear} ${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}`;
  const start = new Date(now.getFullYear(), 0, 0);
  const day = Math.floor((now.getTime() - start.getTime()) / 86400000);
  return `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())} ${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())} ${now.getDay()} ${String(day).padStart(3, '0')}`;
}

export function expressionTruthy(value: string | number | boolean): boolean {
  return truthy(value);
}
