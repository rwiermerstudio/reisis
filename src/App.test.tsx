import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { App } from './App';

function selectLesson(title: string) {
  fireEvent.change(screen.getAllByPlaceholderText('Find a lesson')[0], { target: { value: title } });
  fireEvent.click(screen.getAllByRole('button', { name: new RegExp(title, 'i') })[0]);
}

function openSidebarGroup(title: string) {
  fireEvent.click(screen.getAllByRole('button', { name: new RegExp(title, 'i') })[0]);
}

function loadBlankPft() {
  openSidebarGroup('Start from scratch');
  fireEvent.click(screen.getAllByRole('button', { name: /Blank PFT/ })[0]);
}

describe('studio workflow', () => {
  it('renders the executable workbench', () => {
    render(<App />);
    expect(screen.getByText('ABCD/CISIS Language Studio')).toBeInTheDocument();
    expect(screen.getByLabelText('PFT source editor')).toBeInTheDocument();
    expect(screen.getAllByText(/The name of the rose/).length).toBeGreaterThan(0);
  });

  it('switches to the FST terms view', () => {
    render(<App />);
    fireEvent.click(screen.getByRole('button', { name: 'FST' }));
    expect(screen.getByLabelText('FST source editor')).toBeInTheDocument();
    expect(screen.getAllByText('9780141187761').length).toBeGreaterThan(1);
  });

  it('loads a lesson into the editor', () => {
    render(<App />);
    fireEvent.click(screen.getAllByRole('button', { name: /Display a title/ })[0]);
    expect(screen.getByText('LESSON 1 / Field and subfield selectors')).toBeInTheDocument();
    expect(screen.getByLabelText('PFT source editor')).toHaveValue('v245');
  });

  it('loads a playground preset', () => {
    render(<App />);
    fireEvent.click(screen.getByRole('button', { name: 'Playground' }));
    fireEvent.click(screen.getAllByRole('button', { name: /Compact citation/ })[0]);
    expect((screen.getByLabelText('PFT source editor') as HTMLTextAreaElement).value).toContain('v100^a');
    expect(screen.getAllByText('PLAYGROUND').length).toBeGreaterThan(0);
  });

  it('inserts a quick playground construct', () => {
    render(<App />);
    fireEvent.click(screen.getByRole('button', { name: 'Playground' }));
    loadBlankPft();
    openSidebarGroup('Common snippets');
    fireEvent.click(screen.getAllByRole('button', { name: /Repeat group/ })[0]);
    expect(screen.getByLabelText('PFT source editor')).toHaveValue('(v650^a, /)');
  });

  it('accepts a record-aware code completion', () => {
    render(<App />);
    fireEvent.click(screen.getByRole('button', { name: 'Playground' }));
    loadBlankPft();
    const editor = screen.getByLabelText('PFT source editor');
    fireEvent.keyDown(editor, { code: 'Space', ctrlKey: true });
    expect(screen.getByRole('listbox', { name: 'Code completions' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('option', { name: /v245\^a/ }));
    expect(editor).toHaveValue('v245^a');
  });

  it('closes an in-progress comment without replacing its text', () => {
    render(<App />);
    fireEvent.click(screen.getByRole('button', { name: 'Playground' }));
    loadBlankPft();
    const editor = screen.getByLabelText('PFT source editor');
    fireEvent.change(editor, { target: { value: '/* explain this', selectionStart: 15 } });
    fireEvent.keyDown(editor, { code: 'Space', ctrlKey: true });
    fireEvent.click(screen.getByRole('option', { name: /Close comment/ }));
    expect(editor).toHaveValue('/* explain this */');
  });

  it('does not complete a comment that is already closed', () => {
    render(<App />);
    fireEvent.click(screen.getByRole('button', { name: 'Playground' }));
    loadBlankPft();
    const editor = screen.getByLabelText('PFT source editor');
    fireEvent.change(editor, { target: { value: '/* This is a comment', selectionStart: 20 } });
    fireEvent.keyDown(editor, { code: 'Space', ctrlKey: true });
    expect(screen.getByRole('option', { name: /Close comment/ })).toBeInTheDocument();

    fireEvent.change(editor, { target: { value: '/* This is a comment */', selectionStart: 23 } });
    fireEvent.keyDown(editor, { key: 'Enter', code: 'Enter' });

    expect(editor).toHaveValue('/* This is a comment */');
    expect(screen.queryByRole('listbox', { name: 'Code completions' })).not.toBeInTheDocument();
  });

  it('does not offer completions inside a completed comment', () => {
    render(<App />);
    fireEvent.click(screen.getByRole('button', { name: 'Playground' }));
    loadBlankPft();
    const editor = screen.getByLabelText('PFT source editor');
    fireEvent.change(editor, { target: { value: '/* This is a comment */', selectionStart: 23 } });
    fireEvent.keyDown(editor, { code: 'Space', ctrlKey: true });

    expect(screen.queryByRole('listbox', { name: 'Code completions' })).not.toBeInTheDocument();
  });

  it('keeps the playground visible for an incomplete variable assignment', () => {
    render(<App />);
    fireEvent.click(screen.getByRole('button', { name: 'Playground' }));
    loadBlankPft();
    fireEvent.change(screen.getByLabelText('PFT source editor'), { target: { value: 's0:=' } });
    expect(screen.getByText('PFT_ASSIGNMENT')).toBeInTheDocument();
    expect(screen.getByText('ABCD/CISIS Language Studio')).toBeInTheDocument();
  });

  it('runs the playground against all records', async () => {
    render(<App />);
    fireEvent.click(screen.getByRole('button', { name: 'Playground' }));
    fireEvent.click(screen.getByRole('button', { name: /All 10/ }));
    await waitFor(() => expect(screen.getByText('10 records')).toBeInTheDocument());
    expect(screen.getAllByText('MFN 1').length).toBeGreaterThan(2);
    expect(screen.getAllByText('MFN 10').length).toBeGreaterThan(1);
  });

  it('runs an exercise solution against all records', async () => {
    render(<App />);
    fireEvent.click(screen.getAllByRole('button', { name: /Display a title/ })[0]);
    fireEvent.click(screen.getByRole('button', { name: /All 10/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Show solution' }));
    await waitFor(() => expect(screen.getByText('10 records')).toBeInTheDocument());
    expect(screen.getAllByText('MFN 10').length).toBeGreaterThan(1);
  });

  it('renders and validates an HTML exercise solution', () => {
    render(<App />);
    selectLesson('Semantic heading');
    fireEvent.click(screen.getByRole('button', { name: 'Show solution' }));

    expect(screen.getByTitle('Sanitized HTML preview')).toHaveAttribute('sandbox', '');
    fireEvent.click(screen.getByRole('button', { name: 'HTML' }));
    expect(screen.getByText(/<h1>The name of the rose<\/h1>/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Validation' }));
    expect(screen.getByText('Valid HTML')).toBeInTheDocument();
    expect(screen.getByText('Nothing removed by the preview sanitizer')).toBeInTheDocument();
  });

  it('renders only the current result page in all-record HTML mode', async () => {
    render(<App />);
    selectLesson('Record card');
    fireEvent.click(screen.getByRole('button', { name: /All 10/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Show solution' }));

    await waitFor(() => expect(screen.getByText('10 records')).toBeInTheDocument());
    expect(screen.getByTitle('Sanitized HTML preview')).toBeInTheDocument();
    expect(screen.getByText('1 / 1')).toBeInTheDocument();
  });

  it('loads and runs a CISIS system-value lesson', () => {
    render(<App />);
    selectLesson('Master file number');
    fireEvent.click(screen.getByRole('button', { name: 'Show solution' }));
    expect(screen.getAllByText('Record 0006').length).toBeGreaterThan(0);
    expect(screen.getByLabelText('PFT source editor')).toHaveValue("'Record ',mfn(4)");
  });

  it('exposes the CISIS report in the playground', () => {
    render(<App />);
    fireEvent.click(screen.getByRole('button', { name: 'Playground' }));
    openSidebarGroup('Advanced examples');
    fireEvent.click(screen.getAllByRole('button', { name: /CISIS record report/ })[0]);
    expect((screen.getByLabelText('PFT source editor') as HTMLTextAreaElement).value).toContain('nocc(v650)');
    expect(screen.getAllByText('Record').length).toBeGreaterThan(0);
  });

  it('runs an expression-based lesson', () => {
    render(<App />);
    selectLesson('Numeric comparison');
    fireEvent.click(screen.getByRole('button', { name: 'Show solution' }));
    expect(screen.getAllByText('Published before 2000').length).toBeGreaterThan(0);
  });

  it('runs a prefixed FST technique lesson', () => {
    render(<App />);
    selectLesson('Prefix title words');
    fireEvent.click(screen.getByRole('button', { name: 'Show solution' }));
    expect(screen.getByText('TI_ROSE')).toBeInTheDocument();
    expect(screen.getByLabelText('FST source editor')).toHaveValue("20 8 '|TI_|',v245^a");
  });

  it('runs a mode transformation lesson', () => {
    render(<App />);
    selectLesson('Heading mode');
    fireEvent.click(screen.getByRole('button', { name: 'Show solution' }));
    expect(screen.getAllByText('Eco, Umberto, 1932-2016').length).toBeGreaterThan(0);
  });

  it('runs a bounded while lesson', () => {
    render(<App />);
    selectLesson('While loop');
    fireEvent.click(screen.getByRole('button', { name: 'Show solution' }));
    expect(screen.getAllByText('1,2,3').length).toBeGreaterThan(0);
  });
});
