export interface IsisRecord {
  mfn: number;
  fields: Record<string, string[]>;
}

export interface SourceSpan {
  start: number;
  end: number;
}

export interface Diagnostic extends SourceSpan {
  severity: 'error' | 'warning';
  message: string;
  code: string;
}

interface BaseNode extends SourceSpan {
  id: number;
}

export interface ProgramNode extends BaseNode {
  type: 'program';
  children: AstNode[];
}

export interface FieldNode extends BaseNode {
  type: 'field';
  tag: string;
  subfield?: string;
  occurrence?: number;
}

export interface LiteralNode extends BaseNode {
  type: 'literal';
  value: string;
}

export interface NewlineNode extends BaseNode {
  type: 'newline';
}

export interface GroupNode extends BaseNode {
  type: 'group';
  children: AstNode[];
}

export interface ConditionalNode extends BaseNode {
  type: 'conditional';
  condition: { kind: 'present' | 'absent'; field: FieldNode };
  consequent: AstNode[];
  alternate: AstNode[];
}

export type AstNode = FieldNode | LiteralNode | NewlineNode | GroupNode | ConditionalNode;

export interface ParseResult {
  ast: ProgramNode;
  diagnostics: Diagnostic[];
}

export interface TraceEvent extends SourceSpan {
  id: number;
  kind: 'field' | 'literal' | 'layout' | 'group' | 'condition';
  label: string;
  detail: string;
  output: string;
  depth: number;
}

export interface EvaluationResult extends ParseResult {
  output: string;
  trace: TraceEvent[];
}

export interface FstRow extends SourceSpan {
  line: number;
  targetTag: number;
  technique: 0 | 4;
  expression: string;
  expressionOffset: number;
}

export interface IndexTerm {
  targetTag: number;
  technique: 0 | 4;
  term: string;
  source: string;
  line: number;
}

export interface FstResult {
  rows: FstRow[];
  terms: IndexTerm[];
  diagnostics: Diagnostic[];
  traces: Array<{ row: FstRow; evaluation: EvaluationResult }>;
}
