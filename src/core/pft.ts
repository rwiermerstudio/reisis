import { fieldOccurrences, subfieldValue } from './record';
import type {
  AstNode,
  ConditionalNode,
  Diagnostic,
  EvaluationResult,
  FieldNode,
  ParseResult,
  ProgramNode,
  TraceEvent,
  IsisRecord,
} from './types';

class Parser {
  private position = 0;
  private id = 0;
  readonly diagnostics: Diagnostic[] = [];

  constructor(private readonly source: string) {}

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
      else if (char === '/') nodes.push({ type: 'newline', id: this.id++, start, end: ++this.position });
      else if (char === '(') nodes.push(this.parseGroup());
      else if (this.atKeyword('if')) nodes.push(this.parseConditional());
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

  private parseLiteral(delimiter: string): AstNode {
    const start = this.position++;
    let value = '';
    while (this.position < this.source.length && this.source[this.position] !== delimiter) {
      value += this.source[this.position++];
    }
    if (this.source[this.position] === delimiter) this.position++;
    else this.error(start, this.position, 'Unterminated literal.', 'PFT_LITERAL');
    return { type: 'literal', id: this.id++, start, end: this.position, value };
  }

  private parseField(): FieldNode {
    const start = this.position;
    this.position++;
    const tagStart = this.position;
    while (/\d/.test(this.source[this.position] ?? '')) this.position++;
    const tag = this.source.slice(tagStart, this.position);
    let subfield: string | undefined;
    let occurrence: number | undefined;
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
      while (/\d/.test(this.source[this.position] ?? '')) this.position++;
      if (this.source[this.position] === ']' && this.position > numberStart) {
        occurrence = Number(this.source.slice(numberStart, this.position));
        this.position++;
        if (occurrence < 1) this.error(bracketStart, this.position, 'Occurrence numbers start at 1.', 'PFT_OCCURRENCE');
      } else {
        while (this.position < this.source.length && this.source[this.position] !== ']') this.position++;
        if (this.source[this.position] === ']') this.position++;
        this.error(bracketStart, this.position, 'Occurrence selector must look like [2].', 'PFT_OCCURRENCE');
      }
    }
    return { type: 'field', id: this.id++, start, end: this.position, tag, subfield, occurrence };
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
    const functionStart = this.position;
    const functionName = (this.source[this.position] ?? '').toLowerCase();
    this.position++;
    const kind = functionName === 'a' ? 'absent' : 'present';
    if (!['p', 'a'].includes(functionName) || this.source[this.position] !== '(') {
      this.error(functionStart, this.position, 'Only p(vN) and a(vN) conditions are supported.', 'PFT_CONDITION');
    }
    if (this.source[this.position] === '(') this.position++;
    this.skipSeparators();
    const field = this.source[this.position]?.toLowerCase() === 'v'
      ? this.parseField()
      : { type: 'field' as const, id: this.id++, start: this.position, end: this.position, tag: '0' };
    this.skipSeparators();
    if (this.source[this.position] === ')') this.position++;
    else this.error(this.position, this.position + 1, 'Condition is missing a closing parenthesis.', 'PFT_CONDITION');
    this.skipSeparators();
    if (this.atKeyword('then')) this.consumeKeyword('then');
    else this.error(this.position, this.position + 1, 'Expected THEN after the condition.', 'PFT_THEN');
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
      condition: { kind, field }, consequent, alternate,
    };
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

export function evaluatePft(source: string, record: IsisRecord): EvaluationResult {
  const parsed = parsePft(source);
  const trace: TraceEvent[] = [];
  let traceId = 0;

  const emit = (node: AstNode | FieldNode, kind: TraceEvent['kind'], label: string, detail: string, output: string, depth: number) => {
    trace.push({ id: traceId++, start: node.start, end: node.end, kind, label, detail, output, depth });
  };

  const evaluateNodes = (nodes: AstNode[], occurrence: number | undefined, depth: number): string => nodes.map((node) => {
    if (node.type === 'literal') {
      emit(node, 'literal', 'Literal', `Emitted ${node.value.length} character${node.value.length === 1 ? '' : 's'}.`, node.value, depth);
      return node.value;
    }
    if (node.type === 'newline') {
      emit(node, 'layout', 'New line', 'Moved output to the next line.', '\n', depth);
      return '\n';
    }
    if (node.type === 'field') {
      const values = fieldOccurrences(record, node.tag);
      const selected = node.occurrence ?? occurrence ?? 1;
      const raw = values[selected - 1] ?? '';
      const output = node.subfield ? subfieldValue(raw, node.subfield) : raw;
      const selector = `v${node.tag}${node.subfield ? `^${node.subfield}` : ''}`;
      emit(node, 'field', selector, values.length ? `Read occurrence ${selected} of ${values.length}.` : 'Field is absent.', output, depth);
      return output;
    }
    if (node.type === 'group') {
      const candidates = fieldsIn(node.children).filter((field) => field.occurrence === undefined);
      const count = Math.max(0, ...candidates.map((field) => fieldOccurrences(record, field.tag).length));
      emit(node, 'group', 'Repeatable group', `${count} iteration${count === 1 ? '' : 's'}.`, '', depth);
      return Array.from({ length: count }, (_, index) => evaluateNodes(node.children, index + 1, depth + 1)).join('');
    }
    const values = fieldOccurrences(record, node.condition.field.tag);
    const raw = node.condition.field.occurrence
      ? values[node.condition.field.occurrence - 1] ?? ''
      : values[0] ?? '';
    const selected = node.condition.field.subfield ? subfieldValue(raw, node.condition.field.subfield) : raw;
    const present = selected.length > 0;
    const matches = node.condition.kind === 'present' ? present : !present;
    emit(node, 'condition', `${node.condition.kind === 'present' ? 'Present' : 'Absent'} v${node.condition.field.tag}`, matches ? 'Condition passed.' : 'Condition failed.', '', depth);
    return evaluateNodes(matches ? node.consequent : node.alternate, occurrence, depth + 1);
  }).join('');

  return { ...parsed, output: evaluateNodes(parsed.ast.children, undefined, 0), trace };
}
