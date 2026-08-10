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
  occurrenceEnd?: number | 'LAST';
  sliceOffset?: number;
  sliceLength?: number;
  indentFirst?: number;
  indentNext?: number;
}

export interface LiteralNode extends BaseNode {
  type: 'literal';
  value: string;
  kind: 'unconditional' | 'conditional' | 'repeatable-conditional';
  suppressFirst?: boolean;
  suppressLast?: boolean;
}

export interface DummyNode extends BaseNode {
  type: 'dummy';
  kind: 'present' | 'absent';
  field: FieldNode;
}

export interface NewlineNode extends BaseNode {
  type: 'newline';
  kind: 'conditional' | 'unconditional';
}

export interface LayoutNode extends BaseNode {
  type: 'layout';
  kind: 'reset' | 'spaces' | 'column' | 'line-width';
  amount?: number;
}

export interface CommentNode extends BaseNode {
  type: 'comment';
  value: string;
}

export interface SystemNode extends BaseNode {
  type: 'system';
  kind: 'mfn' | 'iocc' | 'nocc';
  width?: number;
  field?: FieldNode;
}

export interface GroupNode extends BaseNode {
  type: 'group';
  children: AstNode[];
}

export interface ConditionalNode extends BaseNode {
  type: 'conditional';
  condition: CisisExpression;
  consequent: AstNode[];
  alternate: AstNode[];
}

export interface ExpressionNode extends BaseNode {
  type: 'function';
  expression: CisisExpression;
}

export interface ControlNode extends BaseNode {
  type: 'control';
  kind: 'break' | 'continue';
}

export interface ModeNode extends BaseNode {
  type: 'mode';
  mode: 'proof' | 'heading' | 'data';
  uppercase: boolean;
}

export interface AssignmentNode extends BaseNode {
  type: 'assignment';
  name: string;
  expression?: CisisExpression;
  children?: AstNode[];
}

export interface VariableNode extends BaseNode {
  type: 'variable';
  name: string;
}

export interface WhileNode extends BaseNode {
  type: 'while';
  condition: CisisExpression;
  children: AstNode[];
}

export interface SelectNode extends BaseNode {
  type: 'select';
  expression: CisisExpression;
  cases: Array<{ option: CisisExpression; children: AstNode[] }>;
  alternate: AstNode[];
}

export type CisisExpression =
  | { type: 'literal'; value: string | number }
  | { type: 'field'; field: FieldNode }
  | { type: 'identifier'; name: string }
  | { type: 'call'; name: string; args: CisisExpression[] }
  | { type: 'unary'; operator: 'not' | '-' | '+'; operand: CisisExpression }
  | { type: 'binary'; operator: string; left: CisisExpression; right: CisisExpression };

export type AstNode = FieldNode | DummyNode | LiteralNode | NewlineNode | LayoutNode | CommentNode | SystemNode | ExpressionNode | ControlNode | ModeNode | AssignmentNode | VariableNode | WhileNode | SelectNode | GroupNode | ConditionalNode;

export interface ParseResult {
  ast: ProgramNode;
  diagnostics: Diagnostic[];
}

export interface TraceEvent extends SourceSpan {
  id: number;
  kind: 'field' | 'literal' | 'layout' | 'group' | 'condition' | 'function' | 'comment' | 'control';
  label: string;
  detail: string;
  output: string;
  depth: number;
}

export interface EvaluationResult extends ParseResult {
  output: string;
  trace: TraceEvent[];
  segments: OutputSegment[];
}

export interface OutputSegment extends SourceSpan {
  nodeId: number;
  origin: 'field' | 'literal' | 'layout' | 'system';
  text: string;
}

export interface FstRow extends SourceSpan {
  line: number;
  targetTag: number;
  technique: 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8;
  expression: string;
  expressionOffset: number;
}

export interface IndexTerm {
  targetTag: number;
  technique: FstRow['technique'];
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
