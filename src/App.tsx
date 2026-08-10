import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import {
  AlertCircle,
  Beaker,
  BookOpen,
  Braces,
  Check,
  ChevronDown,
  ChevronRight,
  CircleHelp,
  Database,
  FileCode2,
  ListTree,
  Play,
  Plus,
  RotateCcw,
  Search,
  TableProperties,
  TerminalSquare,
} from 'lucide-react';
import { evaluateFst } from './core/fst';
import { evaluatePft } from './core/pft';
import { displayField, parseRecordJson } from './core/record';
import type { Diagnostic, IsisRecord, SourceSpan } from './core/types';
import { lessons, type Lesson, type LessonMode } from './data/lessons';
import { playgroundPresets, quickInserts, type PlaygroundPreset } from './data/playground';
import { records, starterFst, starterPft } from './data/records';

type ResultTab = 'output' | 'trace' | 'ast';
type WorkspaceMode = 'learn' | 'playground';

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
    ? /(\b(?:if|then|else|fi|p|a)\b|v\d+(?:\^[a-z0-9])?(?:\[\d+\])?|"[^"]*"|'[^']*'|\|[^|]*\||\/|[()])/gi
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
    else if (/^#/.test(value)) className = 'syntax-comment';
    else if (/^\d/.test(value)) className = mode === 'fst' ? 'syntax-number' : className;
    else if (/^(if|then|else|fi|p|a)$/i.test(value)) className = 'syntax-keyword';
    parts.push(<span className={className} key={`${index}-${value}`}>{value}</span>);
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

function CodeEditor({ value, mode, onChange, diagnostics, selection, onSelectionHandled, completions }: CodeEditorProps) {
  const textarea = useRef<HTMLTextAreaElement>(null);
  const backdrop = useRef<HTMLPreElement>(null);
  const [completionState, setCompletionState] = useState<{ start: number; end: number; items: CompletionItem[] }>();
  const [completionIndex, setCompletionIndex] = useState(0);

  const completionContext = (cursor: number, explicit = false, currentValue = value) => {
    let start = cursor;
    while (start > 0 && /[a-z0-9^\[\]]/i.test(currentValue[start - 1])) start--;
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
  const sections = [...new Set(lessons.map((lesson) => lesson.section))];
  const filtered = lessons.filter((lesson) => `${lesson.title} ${lesson.focus}`.toLowerCase().includes(query.toLowerCase()));
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
        {sections.map((section) => {
          const items = filtered.filter((lesson) => lesson.section === section);
          if (!items.length) return null;
          return <div className="lesson-section" key={section}>
            <h2>{section}</h2>
            {items.map((lesson) => (
              <button className={`lesson-row ${current === lesson.id ? 'active' : ''}`} key={lesson.id} onClick={() => onSelect(lesson)}>
                <span className={`lesson-number ${complete.has(lesson.id) ? 'done' : ''}`}>{complete.has(lesson.id) ? <Check size={13} /> : lesson.id}</span>
                <span><strong>{lesson.title}</strong><small>{lesson.focus}</small></span>
                <ChevronRight size={14} />
              </button>
            ))}
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
    add({ label: 'if absent', insert: 'if a(v700) then "No contributor" fi', detail: 'Absence condition', kind: 'snippet' });
    add({ label: 'repeat group', insert: '(v650^a, /)', detail: 'Repeat over occurrences', kind: 'snippet' });
    add({ label: 'p()', insert: 'p(v245)', detail: 'Value is present', kind: 'keyword' });
    add({ label: 'a()', insert: 'a(v245)', detail: 'Value is absent', kind: 'keyword' });
  } else {
    add({ label: 'exact term row', insert: '10 0 v20', detail: 'Technique 0', kind: 'row' });
    add({ label: 'word term row', insert: '20 4 v245^a', detail: 'Technique 4', kind: 'row' });
    add({ label: 'subject word row', insert: '40 4 (v650^a, /)', detail: 'Repeat then tokenize', kind: 'row' });
  }
  return items;
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
  return (
    <aside className="lesson-sidebar playground-sidebar">
      <div className="sidebar-heading playground-heading">
        <div><span className="eyebrow">PLAYGROUND</span><strong>LIVE</strong></div>
      </div>
      <div className="lesson-scroll">
        <div className="lesson-section">
          <h2>Examples</h2>
          {playgroundPresets.map((preset) => (
            <button className={`preset-row ${selected === preset.id ? 'active' : ''}`} key={preset.id} onClick={() => onSelect(preset)}>
              <span className={`preset-kind ${preset.mode}`}>{preset.mode.toUpperCase()}</span>
              <span><strong>{preset.title}</strong><small>{preset.description}</small></span>
              <ChevronRight size={14} />
            </button>
          ))}
        </div>
        <div className="lesson-section quick-section">
          <h2>Insert into {mode.toUpperCase()}</h2>
          {quickInserts.filter((item) => item.mode === mode).map((item) => (
            <button className="quick-row" key={`${item.mode}-${item.label}`} onClick={() => onInsert(item)}>
              <Plus size={13} />
              <span><strong>{item.label}</strong><small>{item.detail}</small></span>
            </button>
          ))}
        </div>
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
        <div className="panel-title"><Database size={16} /><span>Record</span>{record && <b>MFN {record.mfn}</b>}</div>
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
            <div className="field-row" key={`${tag}-${index}`}>
              <span className="tag">{tag}</span>
              <span className="occurrence">{index + 1}</span>
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

function App() {
  const [workspaceMode, setWorkspaceMode] = useState<WorkspaceMode>(() =>
    new URLSearchParams(window.location.search).get('workspace') === 'playground' ? 'playground' : 'learn',
  );
  const [mode, setMode] = useState<LessonMode>('pft');
  const [recordIndex, setRecordIndex] = useState(0);
  const [recordSource, setRecordSource] = useState(toRecordSource(records[0]));
  const [pft, setPft] = useState(starterPft);
  const [fst, setFst] = useState(starterFst);
  const [tab, setTab] = useState<ResultTab>('output');
  const [currentLesson, setCurrentLesson] = useState<Lesson>();
  const [selectedPreset, setSelectedPreset] = useState<string | undefined>('catalog-card');
  const [selection, setSelection] = useState<SourceSpan>();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [complete, setComplete] = useState<Set<number>>(() => {
    try { return new Set(JSON.parse(localStorage.getItem('isis-studio-progress') ?? '[]') as number[]); }
    catch { return new Set(); }
  });

  const parsedRecord = useMemo(() => parseRecordJson(recordSource), [recordSource]);
  const record = parsedRecord.record;
  const pftResult = useMemo(() => record ? evaluatePft(pft, record) : undefined, [pft, record]);
  const fstResult = useMemo(() => record ? evaluateFst(fst, record) : undefined, [fst, record]);
  const source = mode === 'pft' ? pft : fst;
  const diagnostics = mode === 'pft' ? pftResult?.diagnostics ?? [] : fstResult?.diagnostics ?? [];
  const activeResult = mode === 'pft' ? pftResult?.output ?? '' : fstResult?.terms.map((term) => term.term).join('\n') ?? '';
  const completions = useMemo(() => buildCompletions(mode, record), [mode, record]);

  const lessonPassed = useMemo(() => {
    if (workspaceMode !== 'learn' || !currentLesson || currentLesson.mode !== mode || currentLesson.recordMfn !== record?.mfn || diagnostics.length) return false;
    const attempted = source.trim() !== currentLesson.starter.trim();
    return attempted && currentLesson.expected.every((expected) => activeResult.includes(expected));
  }, [activeResult, currentLesson, diagnostics.length, mode, record?.mfn, source, workspaceMode]);

  useEffect(() => {
    if (!lessonPassed || !currentLesson || complete.has(currentLesson.id)) return;
    const next = new Set(complete).add(currentLesson.id);
    setComplete(next);
    localStorage.setItem('isis-studio-progress', JSON.stringify([...next]));
  }, [complete, currentLesson, lessonPassed]);

  const chooseRecord = (index: number) => {
    setRecordIndex(index);
    setRecordSource(toRecordSource(records[index]));
  };

  const loadLesson = (lesson: Lesson) => {
    setWorkspaceMode('learn');
    setCurrentLesson(lesson);
    setMode(lesson.mode);
    const index = records.findIndex((item) => item.mfn === lesson.recordMfn);
    chooseRecord(index);
    if (lesson.mode === 'pft') setPft(lesson.starter);
    else setFst(lesson.starter);
    setTab('output');
    setSidebarOpen(false);
  };

  const loadPreset = (preset: PlaygroundPreset) => {
    setWorkspaceMode('playground');
    setSelectedPreset(preset.id);
    setMode(preset.mode);
    const index = records.findIndex((item) => item.mfn === preset.recordMfn);
    chooseRecord(index);
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
        <div className="brand"><div className="brand-mark">IS</div><div><strong>ISIS Language Studio</strong><span>PFT + FST workbench</span></div></div>
        <div className="workspace-switch" role="tablist" aria-label="Workspace mode">
          <button className={workspaceMode === 'learn' ? 'active' : ''} onClick={() => setWorkspaceMode('learn')}><BookOpen size={14} />Learn</button>
          <button className={workspaceMode === 'playground' ? 'active' : ''} onClick={() => setWorkspaceMode('playground')}><Beaker size={14} />Playground</button>
        </div>
        <div className="top-actions">
          <button className="mobile-lessons" onClick={() => setSidebarOpen(!sidebarOpen)}>{workspaceMode === 'learn' ? <BookOpen size={16} /> : <Beaker size={16} />}{workspaceMode === 'learn' ? 'Lessons' : 'Examples'}</button>
          <label className="record-select"><span>RECORD</span><select value={recordIndex} onChange={(event) => chooseRecord(Number(event.target.value))}>{records.map((item, index) => <option key={item.mfn} value={index}>MFN {item.mfn}</option>)}</select><ChevronDown size={14} /></label>
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
          {workspaceMode === 'learn' && currentLesson && (
            <section className={`lesson-brief ${lessonPassed ? 'passed' : ''}`}>
              <div className="lesson-state">{lessonPassed ? <Check size={16} /> : <BookOpen size={16} />}</div>
              <div><span>LESSON {currentLesson.id} / {currentLesson.focus}</span><strong>{currentLesson.title}</strong><p>{currentLesson.brief}</p></div>
              <button className="solution-button" onClick={() => mode === 'pft' ? setPft(currentLesson.solution) : setFst(currentLesson.solution)}>{lessonPassed ? 'Review solution' : 'Show solution'}</button>
            </section>
          )}
          <div className="editor-column">
            <RecordInspector record={record} source={recordSource} onSourceChange={setRecordSource} />
            <section className="panel source-panel">
              <header className="panel-header">
                <div className="panel-title"><FileCode2 size={16} /><span>{mode.toUpperCase()} source</span><b>{workspaceMode === 'playground' ? 'playground' : 'cds-isis-core / milestone 1'}</b></div>
                <div className="editor-actions">
                  <button title="Reset source" onClick={reset}><RotateCcw size={15} /></button>
                  <button className="run-button" title="Run and show result" onClick={() => { setTab('output'); setSelection(undefined); }}><Play size={14} />Run</button>
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
                <button className={tab === 'trace' ? 'active' : ''} onClick={() => setTab('trace')}><ListTree size={15} />Trace</button>
                <button className={tab === 'ast' ? 'active' : ''} onClick={() => setTab('ast')}><Braces size={15} />AST</button>
              </div>
              <span className={`result-status ${diagnostics.length ? 'error' : ''}`}>{diagnostics.length ? 'Blocked' : 'Evaluated'}</span>
            </header>
            <div className="result-body">
              {tab === 'output' && mode === 'pft' && (
                <div className="output-view">{pftResult?.output ? <pre>{pftResult.output}</pre> : <div className="empty-state"><TerminalSquare size={22} />No output for this record.</div>}</div>
              )}
              {tab === 'output' && mode === 'fst' && (
                <div className="terms-view">
                  {fstResult?.terms.length ? <table><thead><tr><th>Target</th><th>Technique</th><th>Term</th><th>Row</th></tr></thead><tbody>{fstResult.terms.map((term, index) => <tr key={`${term.line}-${term.term}-${index}`}><td>{term.targetTag}</td><td>{term.technique}</td><td><code>{term.term}</code></td><td>{term.line}</td></tr>)}</tbody></table> : <div className="empty-state"><TableProperties size={22} />No index terms extracted.</div>}
                </div>
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
            <footer className="result-footer"><CircleHelp size={14} /><span>Supported: selectors, literals, /, groups, p()/a(), technique 0 and 4.</span></footer>
          </section>
        </main>
      </div>
    </div>
  );
}

export { App };
