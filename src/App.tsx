import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import {
  AlertCircle,
  Beaker,
  BookOpen,
  Braces,
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  CircleHelp,
  CodeXml,
  Database,
  Eye,
  FileCode2,
  Files,
  ListTree,
  Play,
  Plus,
  RotateCcw,
  Search,
  ShieldCheck,
  TableProperties,
  TerminalSquare,
  Upload,
  X,
} from 'lucide-react';
import { evaluateFst } from './core/fst';
import { analyzeHtml, type HtmlAnalysis } from './core/html';
import { languageProfile } from './core/profile';
import { evaluatePft } from './core/pft';
import { displayField, parseRecordJson } from './core/record';
import type { Diagnostic, IsisRecord, SourceSpan } from './core/types';
import { useBatchEvaluation, type BatchEvaluationState } from './hooks/useBatchEvaluation';
import { useMarcImport } from './hooks/useMarcImport';
import { lessonModules, lessons, orderedLessons, type Lesson, type LessonMode } from './data/lessons';
import { playgroundPresets, quickInserts, type PlaygroundPreset } from './data/playground';
import { records as demoRecords, starterFst, starterPft } from './data/records';

type ResultTab = 'output' | 'rendered' | 'html' | 'validation' | 'trace' | 'ast';
type WorkspaceMode = 'learn' | 'playground';
type RecordScope = 'current' | 'all';

interface CompletionItem {
  label: string;
  insert: string;
  detail: string;
  kind: 'field' | 'keyword' | 'snippet' | 'row';
}

function toRecordSource(record: IsisRecord): string {
  return JSON.stringify(record, null, 2);
}

function sourceLocation(source: string, offset: number): string {
  const before = source.slice(0, offset);
  return `${before.split('\n').length}:${offset - before.lastIndexOf('\n')}`;
}

function highlightedCode(source: string, mode: LessonMode): ReactNode[] {
  const pattern = mode === 'pft'
    ? /(\/\*[\s\S]*?\*\/|\b(?:if|then|else|fi|and|or|not|break|continue|select|case|elsecase|endsel|while|p|a|mfn|iocc|nocc|size|instr|val|left|right|mid|replace|f|s|date|rsum|rmin|rmax|ravr|mpl|mpu|mhl|mhu|mdl|mdu|lw)\b|[es]\d|[dn]\d+(?:\^[a-z0-9])?|v\d+(?:\^[a-z0-9])?(?:\[(?:\d+|last)(?:\.\.(?:\d+|last)?)?\])?(?:\*\d+(?:\.\d+)?)?|"[^"]*"|'[^']*'|\|[^|]*\||[xc]\d+|:=|>=|<=|<>|!=|[=<>+*\-]|[\/#%:]|[()])/gi
    : /(^\s*\d+)(\s+)(\d+)|((?:v\d+(?:\^[a-z0-9])?(?:\[\d+\])?))|("[^"]*"|'[^']*'|\|[^|]*\|)|(#.*$)/gim;
  const parts: ReactNode[] = [];
  let last = 0;
  for (const match of source.matchAll(pattern)) {
    const index = match.index ?? 0;
    if (index > last) parts.push(source.slice(last, index));
    const value = match[0];
    let className = 'syntax-operator';
    if (/^v\d/i.test(value)) className = 'syntax-field';
    else if (/^["'|]/.test(value)) className = 'syntax-literal';
    else if (/^\/\*/.test(value)) className = 'syntax-comment';
    else if (/^\d/.test(value)) className = mode === 'fst' ? 'syntax-number' : className;
    else if (/^(if|then|else|fi|and|or|not|break|continue|select|case|elsecase|endsel|while|p|a|mfn|iocc|nocc|size|instr|val|left|right|mid|replace|f|s|date|rsum|rmin|rmax|ravr|mpl|mpu|mhl|mhu|mdl|mdu|lw)$/i.test(value)) className = 'syntax-keyword';
    if (className === 'syntax-literal' && /<\/?[a-z]/i.test(value)) {
      const literalParts = value.split(/(<\/?[a-z][^>]*>)/gi);
      parts.push(<span className={className} key={`${index}-${value}`}>{literalParts.map((part, partIndex) =>
        /^<\/?[a-z][^>]*>$/i.test(part)
          ? <span className="syntax-html" key={partIndex}>{part}</span>
          : part,
      )}</span>);
    } else {
      parts.push(<span className={className} key={`${index}-${value}`}>{value}</span>);
    }
    last = index + value.length;
  }
  if (last < source.length) parts.push(source.slice(last));
  return parts;
}

interface CodeEditorProps {
  value: string;
  mode: LessonMode;
  onChange: (value: string) => void;
  diagnostics: Diagnostic[];
  selection?: SourceSpan;
  onSelectionHandled: () => void;
  completions: CompletionItem[];
}

function pftCommentContext(source: string, cursor: number): 'none' | 'open' | 'closed' {
  const open = source.lastIndexOf('/*', cursor);
  if (open < 0) return 'none';
  const close = source.indexOf('*/', open + 2);
  if (close >= 0) return cursor <= close + 2 ? 'closed' : 'none';
  return open > source.lastIndexOf('*/', cursor) ? 'open' : 'none';
}

function CodeEditor({ value, mode, onChange, diagnostics, selection, onSelectionHandled, completions }: CodeEditorProps) {
  const textarea = useRef<HTMLTextAreaElement>(null);
  const backdrop = useRef<HTMLPreElement>(null);
  const [completionState, setCompletionState] = useState<{ start: number; end: number; items: CompletionItem[] }>();
  const [completionIndex, setCompletionIndex] = useState(0);

  const completionContext = (cursor: number, explicit = false, currentValue = value) => {
    if (mode === 'pft') {
      const commentContext = pftCommentContext(currentValue, cursor);
      if (commentContext === 'closed') {
        setCompletionState(undefined);
        return;
      }
      if (commentContext === 'open') {
        const openComment = currentValue.lastIndexOf('/*', cursor);
        const needsSpace = cursor > openComment + 2 && !/\s/.test(currentValue[cursor - 1] ?? '');
        const item: CompletionItem = {
          label: 'Close comment',
          insert: `${needsSpace ? ' ' : ''}*/`,
          detail: 'Close the current CISIS comment',
          kind: 'snippet',
        };
        setCompletionIndex(0);
        setCompletionState({ start: cursor, end: cursor, items: [item] });
        return;
      }
    }
    let start = cursor;
    while (start > 0 && /[a-z0-9^\[\]<>/]/i.test(currentValue[start - 1])) start--;
    const prefix = currentValue.slice(start, cursor).toLowerCase();
    if (!explicit && prefix.length < 1) {
      setCompletionState(undefined);
      return;
    }
    const items = completions
      .filter((item) => !prefix || item.label.toLowerCase().startsWith(prefix) || item.insert.toLowerCase().startsWith(prefix))
      .slice(0, 8);
    setCompletionIndex(0);
    setCompletionState(items.length ? { start, end: cursor, items } : undefined);
  };

  const applyCompletion = (item: CompletionItem) => {
    const input = textarea.current;
    if (!input || !completionState) return;
    const next = `${value.slice(0, completionState.start)}${item.insert}${value.slice(completionState.end)}`;
    const cursor = completionState.start + item.insert.length;
    onChange(next);
    setCompletionState(undefined);
    requestAnimationFrame(() => {
      input.focus();
      input.setSelectionRange(cursor, cursor);
    });
  };

  useEffect(() => {
    if (!selection || !textarea.current) return;
    textarea.current.focus();
    textarea.current.setSelectionRange(selection.start, selection.end);
    onSelectionHandled();
  }, [selection, onSelectionHandled]);

  return (
    <div className="code-editor-wrap">
      <pre ref={backdrop} className="code-highlight" aria-hidden="true">{highlightedCode(value, mode)}{'\n'}</pre>
      <textarea
        ref={textarea}
        className="code-input"
        value={value}
        onChange={(event) => {
          onChange(event.target.value);
          const cursor = event.target.selectionStart;
          const nextValue = event.target.value;
          requestAnimationFrame(() => completionContext(cursor, false, nextValue));
        }}
        onKeyDown={(event) => {
          if ((event.ctrlKey || event.metaKey) && event.code === 'Space') {
            event.preventDefault();
            completionContext(event.currentTarget.selectionStart, true);
            return;
          }
          if (!completionState) return;
          if (event.key === 'ArrowDown') {
            event.preventDefault();
            setCompletionIndex((index) => (index + 1) % completionState.items.length);
          } else if (event.key === 'ArrowUp') {
            event.preventDefault();
            setCompletionIndex((index) => (index - 1 + completionState.items.length) % completionState.items.length);
          } else if (event.key === 'Enter' || event.key === 'Tab') {
            if (mode === 'pft' && pftCommentContext(value, event.currentTarget.selectionStart) === 'closed') {
              setCompletionState(undefined);
              return;
            }
            event.preventDefault();
            applyCompletion(completionState.items[completionIndex]);
          } else if (event.key === 'Escape') {
            event.preventDefault();
            setCompletionState(undefined);
          }
        }}
        onBlur={() => setTimeout(() => setCompletionState(undefined), 120)}
        onScroll={(event) => {
          if (!backdrop.current) return;
          backdrop.current.scrollTop = event.currentTarget.scrollTop;
          backdrop.current.scrollLeft = event.currentTarget.scrollLeft;
        }}
        spellCheck={false}
        aria-label={`${mode.toUpperCase()} source editor`}
      />
      {completionState && (
        <div className="completion-menu" role="listbox" aria-label="Code completions">
          {completionState.items.map((item, index) => (
            <button
              className={index === completionIndex ? 'active' : ''}
              key={`${item.kind}-${item.label}`}
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => applyCompletion(item)}
              role="option"
              aria-selected={index === completionIndex}
            >
              <span className={`completion-kind ${item.kind}`}>{item.kind.slice(0, 1).toUpperCase()}</span>
              <span><strong>{item.label}</strong><small>{item.detail}</small></span>
              <code>{item.insert}</code>
            </button>
          ))}
        </div>
      )}
      <div className="editor-status">
        <span>{value.split('\n').length} lines</span>
        <span className={diagnostics.length ? 'status-error' : 'status-ok'}>
          {diagnostics.length ? `${diagnostics.length} issue${diagnostics.length === 1 ? '' : 's'}` : 'Syntax valid'}
        </span>
      </div>
    </div>
  );
}

function LessonList({ current, complete, onSelect }: { current?: number; complete: Set<number>; onSelect: (lesson: Lesson) => void }) {
  const [query, setQuery] = useState('');
  const moduleForLesson = (lessonId?: number) => lessonModules.find((module) =>
    module.sections.some((section) => lessons.some((lesson) => lesson.id === lessonId && lesson.section === section)),
  );
  const [openModule, setOpenModule] = useState<string>(() => moduleForLesson(current)?.id ?? lessonModules[0].id);
  const normalizedQuery = query.trim().toLowerCase();

  useEffect(() => {
    const activeModule = moduleForLesson(current);
    if (activeModule) setOpenModule(activeModule.id);
  }, [current]);

  return (
    <aside className="lesson-sidebar">
      <div className="sidebar-heading">
        <div>
          <span className="eyebrow">CURRICULUM</span>
          <strong>{complete.size} / {lessons.length}</strong>
        </div>
        <div className="progress-track"><span style={{ width: `${complete.size / lessons.length * 100}%` }} /></div>
      </div>
      <label className="search-box">
        <Search size={15} />
        <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Find a lesson" />
      </label>
      <div className="lesson-scroll">
        {lessonModules.map((module) => {
          const items = orderedLessons.filter((lesson) => module.sections.includes(lesson.section as never)
            && (!normalizedQuery || `${lesson.title} ${lesson.focus} ${lesson.brief}`.toLowerCase().includes(normalizedQuery)));
          if (!items.length) return null;
          const expanded = Boolean(normalizedQuery) || openModule === module.id;
          const completed = items.filter((lesson) => complete.has(lesson.id)).length;
          return <div className={`sidebar-group ${expanded ? 'expanded' : ''}`} key={module.id}>
            <button className="sidebar-group-toggle" aria-expanded={expanded} onClick={() => setOpenModule((value) => value === module.id ? '' : module.id)}>
              <span><strong>{module.title}</strong><small>{completed}/{items.length}</small></span>
              <ChevronDown size={14} />
            </button>
            {expanded && <div className="sidebar-group-items">{items.map((lesson) => (
              <button className={`lesson-row ${current === lesson.id ? 'active' : ''}`} key={lesson.id} onClick={() => onSelect(lesson)}>
                <span className={`lesson-number ${complete.has(lesson.id) ? 'done' : ''}`}>{complete.has(lesson.id) ? <Check size={13} /> : orderedLessons.indexOf(lesson) + 1}</span>
                <span><strong>{lesson.title}</strong><small>{lesson.focus}</small></span>
                <ChevronRight size={14} />
              </button>
            ))}</div>}
          </div>;
        })}
      </div>
    </aside>
  );
}

function buildCompletions(mode: LessonMode, record?: IsisRecord): CompletionItem[] {
  const items: CompletionItem[] = [];
  const seen = new Set<string>();
  const add = (item: CompletionItem) => {
    if (seen.has(item.insert)) return;
    seen.add(item.insert);
    items.push(item);
  };

  if (record) {
    for (const [tag, occurrences] of Object.entries(record.fields)) {
      add({ label: `v${tag}`, insert: `v${tag}`, detail: `${occurrences.length} occurrence${occurrences.length === 1 ? '' : 's'}`, kind: 'field' });
      const codes = new Set(occurrences.flatMap((value) => [...value.matchAll(/\^([a-z0-9])/gi)].map((match) => match[1].toLowerCase())));
      for (const code of codes) add({ label: `v${tag}^${code}`, insert: `v${tag}^${code}`, detail: `Subfield ${code}`, kind: 'field' });
    }
  }

  if (mode === 'pft') {
    add({ label: 'if present', insert: 'if p(v245^b) then v245^b fi', detail: 'Presence condition', kind: 'snippet' });
    add({ label: 'if absent', insert: "if a(v700) then 'No contributor' fi", detail: 'Absence condition', kind: 'snippet' });
    add({ label: 'repeat group', insert: '(v650^a, /)', detail: 'Repeat over occurrences', kind: 'snippet' });
    add({ label: 'p()', insert: 'p(v245)', detail: 'Value is present', kind: 'keyword' });
    add({ label: 'a()', insert: 'a(v245)', detail: 'Value is absent', kind: 'keyword' });
    add({ label: 'mfn(4)', insert: 'mfn(4)', detail: 'Zero-padded master file number', kind: 'keyword' });
    add({ label: 'iocc', insert: 'iocc', detail: 'Current repeatable-group occurrence', kind: 'keyword' });
    add({ label: 'nocc()', insert: 'nocc(v650)', detail: 'Number of field occurrences', kind: 'keyword' });
    add({ label: 'x spaces', insert: 'x4', detail: 'Insert four spaces', kind: 'snippet' });
    add({ label: 'c column', insert: 'c20', detail: 'Move output to column 20', kind: 'snippet' });
    add({ label: 'comment', insert: '/* explain this format */', detail: 'Ignored CISIS comment', kind: 'snippet' });
    add({ label: 'numeric comparison', insert: "if val(v260^c) < 2000 then 'Older' fi", detail: 'Expression-based condition', kind: 'snippet' });
    add({ label: 'boolean condition', insert: 'if p(v245^b) and size(v245^b) > 5 then v245^b fi', detail: 'AND with nested function', kind: 'snippet' });
    add({ label: 'left()', insert: 'left(v245^a,20)', detail: 'Left substring', kind: 'keyword' });
    add({ label: 'replace()', insert: "replace(v245^a,'old','new')", detail: 'Replace all matching text', kind: 'keyword' });
    add({ label: 'break', insert: 'if iocc > 3 then break fi', detail: 'Stop a repeatable group', kind: 'keyword' });
    add({ label: 'continue', insert: 'if iocc = 1 then continue fi', detail: 'Skip to the next occurrence', kind: 'keyword' });
    add({ label: 'heading mode', insert: 'mhl', detail: 'Readable field punctuation', kind: 'keyword' });
    add({ label: 'data mode', insert: 'mdl', detail: 'Data punctuation', kind: 'keyword' });
    add({ label: 'line width', insert: 'lw(40)', detail: 'Set active output width', kind: 'keyword' });
    add({ label: 'field range', insert: 'v650^a[2..LAST]', detail: 'Occurrence range', kind: 'field' });
    add({ label: 'field slice', insert: 'v245^a*0.20', detail: 'Offset and length extraction', kind: 'field' });
    add({ label: 's()', insert: "s(v100^a,' / ',v245^a)", detail: 'Concatenate format values', kind: 'keyword' });
    add({ label: 'aggregate', insert: "rsum('10,20,-5')", detail: 'Numeric aggregate', kind: 'keyword' });
    add({ label: 'date', insert: 'date(DATEONLY)', detail: 'Current date', kind: 'keyword' });
    add({ label: 'numeric variable', insert: 'e0:=1', detail: 'Assign WinISIS variable', kind: 'snippet' });
    add({ label: 'while', insert: 'e0:=1,while e0<=3(e0,e0:=e0+1)', detail: 'Bounded variable loop', kind: 'snippet' });
    add({ label: 'select', insert: "select nocc(v650) case 0:'none' case 1:'one' elsecase 'many' endsel", detail: 'Multi-branch control', kind: 'snippet' });
    add({ label: '<article>', insert: "'<article></article>'", detail: 'Semantic record container', kind: 'snippet' });
    add({ label: '<h2>', insert: "'<h2></h2>'", detail: 'Section heading', kind: 'snippet' });
    add({ label: '<p>', insert: "'<p></p>'", detail: 'Paragraph', kind: 'snippet' });
    add({ label: '<ul>', insert: "'<ul><li></li></ul>'", detail: 'Unordered list', kind: 'snippet' });
    add({ label: '<table>', insert: "'<table><tbody><tr><th></th><td></td></tr></tbody></table>'", detail: 'Accessible table structure', kind: 'snippet' });
    add({ label: '<style>', insert: "'<style>.record { padding: 12px; }</style>'", detail: 'Internal safe CSS', kind: 'snippet' });
  } else {
    add({ label: 'exact term row', insert: '10 0 v20', detail: 'Technique 0', kind: 'row' });
    add({ label: 'word term row', insert: '20 4 v245^a', detail: 'Technique 4', kind: 'row' });
    add({ label: 'subject word row', insert: '40 4 (v650^a, /)', detail: 'Repeat then tokenize', kind: 'row' });
    add({ label: 'subfield term row', insert: '30 1 v245', detail: 'Technique 1', kind: 'row' });
    add({ label: 'angle phrase row', insert: "40 2 '<term><phrase>'", detail: 'Technique 2', kind: 'row' });
    add({ label: 'slash phrase row', insert: "50 3 '/term/ and /phrase/'", detail: 'Technique 3', kind: 'row' });
    add({ label: 'prefixed word row', insert: "60 8 '|TI_|',v245^a", detail: 'Technique 8', kind: 'row' });
  }
  return items;
}

function BatchPagination({ page, total, available, onPage }: { page: number; total: number; available: number; onPage: (page: number) => void }) {
  const pageSize = 20;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  return <div className="batch-pagination">
    <button title="Previous result page" disabled={page === 0} onClick={() => onPage(page - 1)}><ChevronLeft size={14} /></button>
    <span>{page + 1} / {totalPages}</span>
    <button title="Next result page" disabled={page + 1 >= totalPages || (page + 1) * pageSize >= available} onClick={() => onPage(page + 1)}><ChevronRight size={14} /></button>
  </div>;
}

function HtmlResultView({ analysis, tab, batch, page, onPage, onSelect }: {
  analysis: HtmlAnalysis;
  tab: ResultTab;
  batch?: BatchEvaluationState;
  page: number;
  onPage: (page: number) => void;
  onSelect: (span: SourceSpan) => void;
}) {
  const issues = analysis.issues;
  return <div className="html-result-view">
    {tab === 'rendered' && <iframe className="html-preview" title="Sanitized HTML preview" sandbox="" srcDoc={analysis.previewDocument} />}
    {tab === 'html' && <pre className="html-source">{analysis.raw || 'No HTML output for this record.'}</pre>}
    {tab === 'validation' && <div className="validation-view">
      <div className={`validation-summary ${issues.some((issue) => issue.severity === 'error') || analysis.removedCount ? 'warning' : 'valid'}`}>
        <ShieldCheck size={17} />
        <span><strong>{issues.length ? `${issues.length} markup issue${issues.length === 1 ? '' : 's'}` : 'Valid HTML'}</strong><small>{analysis.removedCount ? `${analysis.removedCount} unsafe item${analysis.removedCount === 1 ? '' : 's'} removed from preview` : 'Nothing removed by the preview sanitizer'}</small></span>
      </div>
      {issues.map((issue, index) => {
        const hasSpan = issue.start !== undefined && issue.end !== undefined;
        return <button className="validation-issue" disabled={!hasSpan} key={`${issue.ruleId}-${index}`} onClick={() => hasSpan && onSelect({ start: issue.start!, end: issue.end! })}>
          <AlertCircle size={14} /><span><strong>{issue.ruleId}</strong>{issue.message}</span><small>{issue.line}:{issue.column}</small>
        </button>;
      })}
    </div>}
    {batch && <BatchPagination page={page} total={batch.total} available={batch.results.length} onPage={onPage} />}
  </div>;
}

function PlaygroundSidebar({
  mode,
  selected,
  onSelect,
  onInsert,
}: {
  mode: LessonMode;
  selected?: string;
  onSelect: (preset: PlaygroundPreset) => void;
  onInsert: (item: (typeof quickInserts)[number]) => void;
}) {
  const presetGroup = (preset: PlaygroundPreset) => {
    if (preset.id.startsWith('blank-')) return 'start';
    if (['catalog-card', 'compact-citation', 'optional-subtitle', 'contributors', 'title-index', 'multi-index'].includes(preset.id)) return 'templates';
    return 'examples';
  };
  const [openGroup, setOpenGroup] = useState('templates');
  useEffect(() => {
    const preset = playgroundPresets.find((item) => item.id === selected);
    if (preset) setOpenGroup(presetGroup(preset));
  }, [selected]);

  const groups = [
    { id: 'templates', title: 'Common templates', items: playgroundPresets.filter((item) => item.mode === mode && presetGroup(item) === 'templates'), kind: 'preset' as const },
    { id: 'examples', title: 'Advanced examples', items: playgroundPresets.filter((item) => item.mode === mode && presetGroup(item) === 'examples'), kind: 'preset' as const },
    { id: 'start', title: 'Start from scratch', items: playgroundPresets.filter((item) => item.mode === mode && presetGroup(item) === 'start'), kind: 'preset' as const },
    { id: 'common', title: 'Common snippets', items: quickInserts.filter((item) => item.mode === mode && item.group === 'common'), kind: 'snippet' as const },
    { id: 'record', title: 'Record & layout', items: quickInserts.filter((item) => item.mode === mode && item.group === 'record'), kind: 'snippet' as const },
    { id: 'advanced', title: 'Advanced snippets', items: quickInserts.filter((item) => item.mode === mode && item.group === 'advanced'), kind: 'snippet' as const },
  ].filter((group) => group.items.length);

  return (
    <aside className="lesson-sidebar playground-sidebar">
      <div className="sidebar-heading playground-heading">
        <div><span className="eyebrow">PLAYGROUND</span><strong>LIVE</strong></div>
      </div>
      <div className="lesson-scroll">
        {groups.map((group) => {
          const expanded = openGroup === group.id;
          return <div className={`sidebar-group ${expanded ? 'expanded' : ''}`} key={group.id}>
            <button className="sidebar-group-toggle" aria-expanded={expanded} onClick={() => setOpenGroup((value) => value === group.id ? '' : group.id)}>
              <span><strong>{group.title}</strong><small>{group.items.length}</small></span>
              <ChevronDown size={14} />
            </button>
            {expanded && <div className="sidebar-group-items">{group.kind === 'preset'
              ? (group.items as PlaygroundPreset[]).map((preset) => (
                <button className={`preset-row ${selected === preset.id ? 'active' : ''}`} key={preset.id} onClick={() => onSelect(preset)}>
                  <span className={`preset-kind ${preset.mode}`}>{preset.mode.toUpperCase()}</span>
                  <span><strong>{preset.title}</strong><small>{preset.description}</small></span>
                  <ChevronRight size={14} />
                </button>
              ))
              : (group.items as typeof quickInserts).map((item) => (
                <button className="quick-row" key={`${item.mode}-${item.label}`} onClick={() => onInsert(item)}>
                  <Plus size={13} />
                  <span><strong>{item.label}</strong><small>{item.detail}</small></span>
                </button>
              ))}</div>}
          </div>;
        })}
      </div>
    </aside>
  );
}

function RecordInspector({ record, source, onSourceChange }: { record?: IsisRecord; source: string; onSourceChange: (value: string) => void }) {
  const [view, setView] = useState<'fields' | 'json'>('fields');
  const parsed = parseRecordJson(source);
  return (
    <section className="panel record-panel">
      <header className="panel-header">
        <div className="panel-title"><Database size={16} /><span>Record</span>{record && <b>MFN {record.mfn}{record.marc ? ` / ${record.marc.sourceFormat.toUpperCase()}` : ''}</b>}</div>
        <div className="mini-tabs" role="tablist">
          <button className={view === 'fields' ? 'active' : ''} onClick={() => setView('fields')}>Fields</button>
          <button className={view === 'json' ? 'active' : ''} onClick={() => setView('json')}>JSON</button>
        </div>
      </header>
      {view === 'json' ? (
        <div className="record-json-wrap">
          <textarea value={source} onChange={(event) => onSourceChange(event.target.value)} spellCheck={false} aria-label="Record JSON editor" />
          {parsed.error && <div className="json-error"><AlertCircle size={14} />{parsed.error}</div>}
        </div>
      ) : (
        <div className="field-table">
          {record ? Object.entries(record.fields).map(([tag, occurrences]) => occurrences.map((value, index) => (
            <div className={`field-row ${record.marc ? 'marc-field' : ''}`} key={`${tag}-${index}`}>
              <span className="tag">{tag}</span>
              <span className="occurrence">{index + 1}</span>
              {record.marc && <span className="indicator" title="MARC indicators">{record.marc.indicators[tag]?.[index]?.replace(/ /g, '#') ?? '--'}</span>}
              <span>{displayField(value)}</span>
            </div>
          ))) : <div className="empty-state">Fix the record JSON to inspect its fields.</div>}
        </div>
      )}
    </section>
  );
}

function Diagnostics({ items, source, onSelect }: { items: Diagnostic[]; source: string; onSelect: (span: SourceSpan) => void }) {
  if (!items.length) return null;
  return <div className="diagnostics">
    {items.map((item, index) => (
      <button key={`${item.code}-${index}`} onClick={() => onSelect(item)}>
        <AlertCircle size={14} />
        <span><strong>{item.code}</strong>{item.message}</span>
        <small>{sourceLocation(source, item.start)}</small>
      </button>
    ))}
  </div>;
}

function BatchResults({
  batch,
  mode,
  page,
  onPage,
}: {
  batch: BatchEvaluationState;
  mode: LessonMode;
  page: number;
  onPage: (page: number) => void;
}) {
  const pageSize = mode === 'pft' ? 20 : 10;
  const totalPages = Math.max(1, Math.ceil(batch.total / pageSize));
  const visible = batch.results.slice(page * pageSize, (page + 1) * pageSize);
  return (
    <div className="batch-view">
      <div className="batch-progress">
        <div><span style={{ width: `${batch.total ? batch.processed / batch.total * 100 : 0}%` }} /></div>
        <strong>{batch.processed.toLocaleString()} / {batch.total.toLocaleString()}</strong>
        {batch.durationMs !== undefined && <small>{Math.round(batch.durationMs)} ms</small>}
      </div>
      {mode === 'pft' ? (
        <div className="batch-output-list">
          {visible.map((result) => (
            <div className="batch-output-row" key={result.mfn}>
              <span>MFN {result.mfn}</span>
              <pre>{result.output || ''}</pre>
            </div>
          ))}
        </div>
      ) : (
        <div className="terms-view batch-terms">
          <table><thead><tr><th>MFN</th><th>Target</th><th>Technique</th><th>Term</th></tr></thead>
            <tbody>{visible.flatMap((result) => (result.terms ?? []).map((term, index) => (
              <tr key={`${result.mfn}-${term.line}-${term.term}-${index}`}><td>{result.mfn}</td><td>{term.targetTag}</td><td>{term.technique}</td><td><code>{term.term}</code></td></tr>
            )))}</tbody>
          </table>
        </div>
      )}
      {!visible.length && batch.status !== 'running' && <div className="empty-state">No batch results.</div>}
      <div className="batch-pagination">
        <button title="Previous result page" disabled={page === 0} onClick={() => onPage(page - 1)}><ChevronLeft size={14} /></button>
        <span>{page + 1} / {totalPages}</span>
        <button title="Next result page" disabled={page + 1 >= totalPages || (page + 1) * pageSize >= batch.results.length} onClick={() => onPage(page + 1)}><ChevronRight size={14} /></button>
      </div>
    </div>
  );
}

function App() {
  const initialParams = useMemo(() => new URLSearchParams(window.location.search), []);
  const initialLesson = useMemo(() => {
    const id = Number(initialParams.get('lesson'));
    return lessons.find((lesson) => lesson.id === id);
  }, [initialParams]);
  const initialRecordIndex = initialLesson ? demoRecords.findIndex((item) => item.mfn === initialLesson.recordMfn) : 0;
  const showInitialSolution = initialParams.get('solution') === '1';
  const [workspaceMode, setWorkspaceMode] = useState<WorkspaceMode>(() =>
    !initialLesson && initialParams.get('workspace') === 'playground' ? 'playground' : 'learn',
  );
  const [mode, setMode] = useState<LessonMode>(() =>
    initialLesson?.mode ?? (initialParams.get('language') === 'fst' ? 'fst' : 'pft'),
  );
  const [recordScope, setRecordScope] = useState<RecordScope>(() =>
    initialParams.get('scope') === 'all' ? 'all' : 'current',
  );
  const [recordIndex, setRecordIndex] = useState(initialRecordIndex);
  const [recordSource, setRecordSource] = useState(toRecordSource(demoRecords[initialRecordIndex]));
  const [pft, setPft] = useState(initialLesson?.mode === 'pft' ? (showInitialSolution ? initialLesson.solution : initialLesson.starter) : starterPft);
  const [fst, setFst] = useState(initialLesson?.mode === 'fst' ? (showInitialSolution ? initialLesson.solution : initialLesson.starter) : starterFst);
  const [tab, setTab] = useState<ResultTab>(initialLesson?.output === 'html' ? 'rendered' : 'output');
  const [currentLesson, setCurrentLesson] = useState<Lesson | undefined>(initialLesson);
  const [selectedPreset, setSelectedPreset] = useState<string | undefined>(initialLesson ? undefined : 'catalog-card');
  const [selection, setSelection] = useState<SourceSpan>();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [batchPage, setBatchPage] = useState(0);
  const [datasetMode, setDatasetMode] = useState<'demo' | 'imported'>('demo');
  const importInput = useRef<HTMLInputElement>(null);
  const marcImport = useMarcImport();
  const [complete, setComplete] = useState<Set<number>>(() => {
    try { return new Set(JSON.parse(localStorage.getItem('isis-studio-progress') ?? '[]') as number[]); }
    catch { return new Set(); }
  });

  const importedDataset = marcImport.state.dataset;
  const playgroundRecords = datasetMode === 'imported' && importedDataset ? importedDataset.records : demoRecords;
  const activeRecords = workspaceMode === 'learn' ? demoRecords : playgroundRecords;
  const parsedRecord = useMemo(() => parseRecordJson(recordSource), [recordSource]);
  const record = parsedRecord.record;
  const evaluationRecords = useMemo(
    () => activeRecords.map((item, index) => index === recordIndex && record ? record : item),
    [activeRecords, record, recordIndex],
  );
  const pftResult = useMemo(() => record ? evaluatePft(pft, record) : undefined, [pft, record]);
  const fstResult = useMemo(() => record ? evaluateFst(fst, record) : undefined, [fst, record]);
  const source = mode === 'pft' ? pft : fst;
  const diagnostics = mode === 'pft' ? pftResult?.diagnostics ?? [] : fstResult?.diagnostics ?? [];
  const batch = useBatchEvaluation(recordScope === 'all', mode, source, evaluationRecords, diagnostics.length > 0);
  const currentResult = mode === 'pft' ? pftResult?.output ?? '' : fstResult?.terms.map((term) => term.term).join('\n') ?? '';
  const lessonBatchResult = currentLesson ? batch.results.find((item) => item.mfn === currentLesson.recordMfn) : undefined;
  const activeResult = recordScope === 'current'
    ? currentResult
    : mode === 'pft'
      ? lessonBatchResult?.output ?? ''
      : lessonBatchResult?.terms?.map((term) => term.term).join('\n') ?? '';
  const htmlEnabled = mode === 'pft';
  const batchHtml = useMemo(() => batch.results
    .slice(batchPage * 20, (batchPage + 1) * 20)
    .map((result) => `<section class="batch-record" data-mfn="${result.mfn}">${result.output ?? ''}</section>`)
    .join('\n'), [batch.results, batchPage]);
  const htmlAnalysis = useMemo(() => analyzeHtml(
    recordScope === 'all' ? batchHtml : pftResult?.output ?? '',
    recordScope === 'current' ? pftResult?.segments ?? [] : [],
  ), [batchHtml, pftResult?.output, pftResult?.segments, recordScope]);
  const lessonHtmlAnalysis = useMemo(() => currentLesson?.output === 'html'
    ? analyzeHtml(activeResult, recordScope === 'current' ? pftResult?.segments ?? [] : [])
    : undefined, [activeResult, currentLesson?.output, pftResult?.segments, recordScope]);
  const completions = useMemo(() => buildCompletions(mode, record), [mode, record]);

  const lessonPassed = useMemo(() => {
    if (workspaceMode !== 'learn' || !currentLesson || currentLesson.mode !== mode || currentLesson.recordMfn !== record?.mfn || diagnostics.length) return false;
    if (recordScope === 'all' && !lessonBatchResult) return false;
    const attempted = source.trim() !== currentLesson.starter.trim();
    const htmlIsSafe = currentLesson.output !== 'html' || (lessonHtmlAnalysis
      && !lessonHtmlAnalysis.issues.some((issue) => issue.severity === 'error')
      && lessonHtmlAnalysis.removedCount === 0);
    return attempted && htmlIsSafe && currentLesson.expected.every((expected) => activeResult.includes(expected));
  }, [activeResult, currentLesson, diagnostics.length, lessonBatchResult, lessonHtmlAnalysis, mode, record?.mfn, recordScope, source, workspaceMode]);

  useEffect(() => setBatchPage(0), [mode, recordScope, source]);

  useEffect(() => {
    if (!importedDataset) return;
    setDatasetMode('imported');
    setWorkspaceMode('playground');
    setCurrentLesson(undefined);
    setSelectedPreset(undefined);
    setRecordIndex(0);
    setRecordSource(toRecordSource(importedDataset.records[0]));
  }, [importedDataset]);

  useEffect(() => {
    if (mode === 'fst' && ['rendered', 'html', 'validation'].includes(tab)) setTab('output');
  }, [mode, tab]);

  useEffect(() => {
    if (!lessonPassed || !currentLesson || complete.has(currentLesson.id)) return;
    const next = new Set(complete).add(currentLesson.id);
    setComplete(next);
    localStorage.setItem('isis-studio-progress', JSON.stringify([...next]));
  }, [complete, currentLesson, lessonPassed]);

  const chooseRecordFrom = (items: IsisRecord[], index: number) => {
    const nextIndex = Math.max(0, Math.min(index, items.length - 1));
    setRecordIndex(nextIndex);
    setRecordSource(toRecordSource(items[nextIndex]));
  };

  const chooseRecord = (index: number) => chooseRecordFrom(activeRecords, index);

  const switchWorkspace = (next: WorkspaceMode) => {
    setWorkspaceMode(next);
    const items = next === 'learn' ? demoRecords : playgroundRecords;
    const preferredMfn = next === 'learn' ? currentLesson?.recordMfn : undefined;
    const preferredIndex = preferredMfn === undefined ? 0 : items.findIndex((item) => item.mfn === preferredMfn);
    chooseRecordFrom(items, preferredIndex < 0 ? 0 : preferredIndex);
  };

  const switchDataset = (next: 'demo' | 'imported') => {
    setDatasetMode(next);
    setWorkspaceMode('playground');
    const items = next === 'imported' && importedDataset ? importedDataset.records : demoRecords;
    chooseRecordFrom(items, 0);
  };

  const clearImportedDataset = () => {
    marcImport.clear();
    setDatasetMode('demo');
    chooseRecordFrom(demoRecords, 0);
  };

  const loadLesson = (lesson: Lesson) => {
    setWorkspaceMode('learn');
    setCurrentLesson(lesson);
    setMode(lesson.mode);
    const index = demoRecords.findIndex((item) => item.mfn === lesson.recordMfn);
    chooseRecordFrom(demoRecords, index);
    if (lesson.mode === 'pft') setPft(lesson.starter);
    else setFst(lesson.starter);
    setTab(lesson.output === 'html' ? 'rendered' : 'output');
    setSidebarOpen(false);
  };

  const loadPreset = (preset: PlaygroundPreset) => {
    setWorkspaceMode('playground');
    setSelectedPreset(preset.id);
    setMode(preset.mode);
    const index = activeRecords.findIndex((item) => item.mfn === preset.recordMfn);
    chooseRecordFrom(activeRecords, index < 0 ? 0 : index);
    if (preset.mode === 'pft') setPft(preset.source);
    else setFst(preset.source);
    setTab('output');
    setSidebarOpen(false);
  };

  const insertQuick = (item: (typeof quickInserts)[number]) => {
    setMode(item.mode);
    setSelectedPreset(undefined);
    const current = item.mode === 'pft' ? pft : fst;
    const separator = current.trim() ? (item.mode === 'pft' ? ',\n' : '\n') : '';
    if (item.mode === 'pft') setPft(`${current}${separator}${item.source}`);
    else setFst(`${current}${separator}${item.source}`);
  };

  const reset = () => {
    const preset = playgroundPresets.find((item) => item.id === selectedPreset && item.mode === mode);
    if (workspaceMode === 'playground' && preset) {
      if (mode === 'pft') setPft(preset.source); else setFst(preset.source);
    } else if (workspaceMode === 'learn' && currentLesson?.mode === mode) {
      if (mode === 'pft') setPft(currentLesson.starter); else setFst(currentLesson.starter);
    } else if (mode === 'pft') setPft(starterPft); else setFst(starterFst);
  };

  return (
    <div className="app-shell">
      <header className="topbar">
        <div className="brand"><div className="brand-mark">AB</div><div><strong>ABCD/CISIS Language Studio</strong><span>CISIS PFT + FST workbench</span></div></div>
        <div className="workspace-switch" role="tablist" aria-label="Workspace mode">
          <button className={workspaceMode === 'learn' ? 'active' : ''} onClick={() => switchWorkspace('learn')}><BookOpen size={14} />Learn</button>
          <button className={workspaceMode === 'playground' ? 'active' : ''} onClick={() => switchWorkspace('playground')}><Beaker size={14} />Playground</button>
        </div>
        <div className="top-actions">
          <button className="mobile-lessons" onClick={() => setSidebarOpen(!sidebarOpen)}>{workspaceMode === 'learn' ? <BookOpen size={16} /> : <Beaker size={16} />}{workspaceMode === 'learn' ? 'Lessons' : 'Examples'}</button>
          <div className="record-navigator" aria-label="Record navigation">
            <button title="Previous record" disabled={recordIndex === 0} onClick={() => chooseRecord(recordIndex - 1)}><ChevronLeft size={14} /></button>
            <label><span>RECORD</span><input aria-label="Record position" type="number" min={1} max={activeRecords.length} value={recordIndex + 1} onChange={(event) => event.target.value && chooseRecord(Number(event.target.value) - 1)} /></label>
            <small>/ {activeRecords.length.toLocaleString()}</small>
            <button title="Next record" disabled={recordIndex + 1 >= activeRecords.length} onClick={() => chooseRecord(recordIndex + 1)}><ChevronRight size={14} /></button>
          </div>
          <div className="scope-switch" role="tablist" aria-label="Record scope">
            <button className={recordScope === 'current' ? 'active' : ''} onClick={() => setRecordScope('current')}>One</button>
            <button className={recordScope === 'all' ? 'active' : ''} onClick={() => setRecordScope('all')}><Files size={13} />All <span>{activeRecords.length.toLocaleString()}</span></button>
          </div>
          <div className="mode-switch" role="tablist" aria-label="Language mode">
            <button className={mode === 'pft' ? 'active' : ''} onClick={() => { setMode('pft'); if (workspaceMode === 'playground') setSelectedPreset(undefined); }}>PFT</button>
            <button className={mode === 'fst' ? 'active' : ''} onClick={() => { setMode('fst'); if (workspaceMode === 'playground') setSelectedPreset(undefined); }}>FST</button>
          </div>
        </div>
      </header>
      <div className="workspace">
        <div className={sidebarOpen ? 'sidebar-mobile open' : 'sidebar-mobile'}>
          {workspaceMode === 'learn'
            ? <LessonList current={currentLesson?.id} complete={complete} onSelect={loadLesson} />
            : <PlaygroundSidebar mode={mode} selected={selectedPreset} onSelect={loadPreset} onInsert={insertQuick} />}
        </div>
        {workspaceMode === 'learn'
          ? <LessonList current={currentLesson?.id} complete={complete} onSelect={loadLesson} />
          : <PlaygroundSidebar mode={mode} selected={selectedPreset} onSelect={loadPreset} onInsert={insertQuick} />}
        <main className="workbench">
          {workspaceMode === 'playground' && (
            <section className={`dataset-bar ${marcImport.state.status === 'error' ? 'error' : ''}`}>
              <div className="dataset-summary">
                <Database size={16} />
                <span><strong>{datasetMode === 'imported' && importedDataset ? importedDataset.name : 'Demo dataset'}</strong><small>{activeRecords.length.toLocaleString()} records{importedDataset && datasetMode === 'imported' ? ` / ${importedDataset.format.toUpperCase()}` : ' / bundled'}</small></span>
              </div>
              <div className="dataset-actions">
                {importedDataset && (
                  <label className="dataset-switch">
                    <span>DATASET</span>
                    <select aria-label="Active dataset" value={datasetMode} onChange={(event) => switchDataset(event.target.value as 'demo' | 'imported')}>
                      <option value="demo">Demo</option>
                      <option value="imported">Imported</option>
                    </select>
                    <ChevronDown size={13} />
                  </label>
                )}
                <button className="import-button" disabled={['reading', 'parsing'].includes(marcImport.state.status)} onClick={() => importInput.current?.click()}><Upload size={14} />Import MARC</button>
                <input
                  ref={importInput}
                  className="visually-hidden"
                  type="file"
                  accept=".xml,.marcxml,.mrc,.marc,.iso,.iso2709,application/xml,text/xml,application/marc"
                  onChange={(event) => {
                    const file = event.target.files?.[0];
                    if (file) void marcImport.importFile(file);
                    event.target.value = '';
                  }}
                  aria-label="MARC file"
                />
                {importedDataset && <button className="clear-dataset" title="Remove imported dataset" onClick={clearImportedDataset}><X size={14} /></button>}
              </div>
              {['reading', 'parsing'].includes(marcImport.state.status) && (
                <div className="import-status"><span style={{ width: `${marcImport.state.progress * 100}%` }} /><strong>{marcImport.state.status === 'reading' ? 'Reading file' : `Parsing ${Math.round(marcImport.state.progress * 100)}%`}</strong><button onClick={marcImport.cancel}>Cancel</button></div>
              )}
              {marcImport.state.error && <div className="import-message"><AlertCircle size={14} /><strong>{marcImport.state.error.code}</strong><span>{marcImport.state.error.message}</span></div>}
              {datasetMode === 'imported' && importedDataset && importedDataset.warnings.length > 0 && <div className="import-message warning"><AlertCircle size={14} /><strong>{importedDataset.warnings.length.toLocaleString()} warnings</strong><span>{importedDataset.warnings[0].message}</span></div>}
            </section>
          )}
          {workspaceMode === 'learn' && currentLesson && (
            <section className={`lesson-brief ${lessonPassed ? 'passed' : ''}`}>
              <div className="lesson-state">{lessonPassed ? <Check size={16} /> : <BookOpen size={16} />}</div>
              <div><span>LESSON {orderedLessons.indexOf(currentLesson) + 1} / {currentLesson.focus}</span><strong>{currentLesson.title}</strong><p>{currentLesson.brief}</p></div>
              <button className="solution-button" onClick={() => mode === 'pft' ? setPft(currentLesson.solution) : setFst(currentLesson.solution)}>{lessonPassed ? 'Review solution' : 'Show solution'}</button>
            </section>
          )}
          <div className="editor-column">
            <RecordInspector record={record} source={recordSource} onSourceChange={setRecordSource} />
            <section className="panel source-panel">
              <header className="panel-header">
                <div className="panel-title"><FileCode2 size={16} /><span>{mode.toUpperCase()} source</span><b>{workspaceMode === 'playground' ? `${languageProfile.shortName} playground` : `${languageProfile.id} / ${languageProfile.version}`}</b></div>
                <div className="editor-actions">
                  <button title="Reset source" onClick={reset}><RotateCcw size={15} /></button>
                  <button className="run-button" title="Run and show result" onClick={() => { setTab(currentLesson?.output === 'html' && mode === 'pft' ? 'rendered' : 'output'); setSelection(undefined); }}><Play size={14} />Run</button>
                </div>
              </header>
              <CodeEditor
                value={source}
                mode={mode}
                onChange={(value) => {
                  setSelectedPreset(undefined);
                  if (mode === 'pft') setPft(value); else setFst(value);
                }}
                diagnostics={diagnostics}
                selection={selection}
                onSelectionHandled={() => setSelection(undefined)}
                completions={completions}
              />
              <Diagnostics items={diagnostics} source={source} onSelect={setSelection} />
            </section>
          </div>
          <section className="panel result-panel">
            <header className="result-header">
              <div className="result-tabs" role="tablist">
                <button className={tab === 'output' ? 'active' : ''} onClick={() => setTab('output')}>{mode === 'pft' ? <TerminalSquare size={15} /> : <TableProperties size={15} />}{mode === 'pft' ? 'Output' : 'Terms'}</button>
                {htmlEnabled && <button className={tab === 'rendered' ? 'active' : ''} onClick={() => setTab('rendered')}><Eye size={15} />Rendered</button>}
                {htmlEnabled && <button className={tab === 'html' ? 'active' : ''} onClick={() => setTab('html')}><CodeXml size={15} />HTML</button>}
                {htmlEnabled && <button className={tab === 'validation' ? 'active' : ''} onClick={() => setTab('validation')}><ShieldCheck size={15} />Validation</button>}
                <button className={tab === 'trace' ? 'active' : ''} onClick={() => setTab('trace')}><ListTree size={15} />Trace{recordScope === 'all' ? ` ${record?.mfn ?? ''}` : ''}</button>
                <button className={tab === 'ast' ? 'active' : ''} onClick={() => setTab('ast')}><Braces size={15} />AST{recordScope === 'all' ? ` ${record?.mfn ?? ''}` : ''}</button>
              </div>
              <span className={`result-status ${diagnostics.length || batch.status === 'error' ? 'error' : ''}`}>
                {diagnostics.length ? 'Blocked' : recordScope === 'all' && batch.status === 'running' ? `${batch.processed}/${batch.total}` : recordScope === 'all' ? `${batch.total} records` : 'Evaluated'}
              </span>
            </header>
            <div className="result-body">
              {tab === 'output' && recordScope === 'all' && <BatchResults batch={batch} mode={mode} page={batchPage} onPage={setBatchPage} />}
              {tab === 'output' && recordScope === 'current' && mode === 'pft' && (
                <div className="output-view">{pftResult?.output ? <pre>{pftResult.output}</pre> : <div className="empty-state"><TerminalSquare size={22} />No output for this record.</div>}</div>
              )}
              {tab === 'output' && recordScope === 'current' && mode === 'fst' && (
                <div className="terms-view">
                  {fstResult?.terms.length ? <table><thead><tr><th>Target</th><th>Technique</th><th>Term</th><th>Row</th></tr></thead><tbody>{fstResult.terms.map((term, index) => <tr key={`${term.line}-${term.term}-${index}`}><td>{term.targetTag}</td><td>{term.technique}</td><td><code>{term.term}</code></td><td>{term.line}</td></tr>)}</tbody></table> : <div className="empty-state"><TableProperties size={22} />No index terms extracted.</div>}
                </div>
              )}
              {htmlEnabled && ['rendered', 'html', 'validation'].includes(tab) && (
                <HtmlResultView analysis={htmlAnalysis} tab={tab} batch={recordScope === 'all' ? batch : undefined} page={batchPage} onPage={setBatchPage} onSelect={setSelection} />
              )}
              {tab === 'trace' && (
                <div className="trace-view">
                  {(mode === 'pft' ? pftResult?.trace : fstResult?.traces.flatMap((item) => item.evaluation.trace.map((trace) => ({ ...trace, start: trace.start + item.row.expressionOffset, end: trace.end + item.row.expressionOffset }))))?.map((event, index) => (
                    <button className="trace-row" style={{ paddingLeft: `${18 + event.depth * 18}px` }} key={`${event.id}-${index}`} onClick={() => setSelection(event)}>
                      <span className={`trace-dot ${event.kind}`} />
                      <span><strong>{event.label}</strong><small>{event.detail}</small></span>
                      <code>{event.output === '\n' ? '\\n' : event.output}</code>
                    </button>
                  )) ?? null}
                  {!(mode === 'pft' ? pftResult?.trace.length : fstResult?.traces.length) && <div className="empty-state"><ListTree size={22} />Run valid source to inspect evaluation.</div>}
                </div>
              )}
              {tab === 'ast' && <pre className="ast-view">{JSON.stringify(mode === 'pft' ? pftResult?.ast : fstResult?.traces.map((item) => item.evaluation.ast), null, 2)}</pre>}
            </div>
            <footer className="result-footer"><CircleHelp size={14} /><span>{recordScope === 'all' ? `${batch.processed.toLocaleString()} processed / detail MFN ${record?.mfn ?? ''}` : `${languageProfile.name}: modes, selectors, functions, variables/control, HTML, FST 0-8.`}</span></footer>
          </section>
        </main>
      </div>
    </div>
  );
}

export { App };
