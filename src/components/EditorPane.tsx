import CodeMirror, { ReactCodeMirrorRef } from '@uiw/react-codemirror';
import { markdown, markdownLanguage } from '@codemirror/lang-markdown';
import { languages } from '@codemirror/language-data';
import { javascript } from '@codemirror/lang-javascript';
import { python } from '@codemirror/lang-python';
import { rust } from '@codemirror/lang-rust';
import { json } from '@codemirror/lang-json';
import { html } from '@codemirror/lang-html';
import { css } from '@codemirror/lang-css';
import { sql } from '@codemirror/lang-sql';
import { xml } from '@codemirror/lang-xml';
import { yaml } from '@codemirror/lang-yaml';
import type { Extension } from '@codemirror/state';
import { oneDark } from '@codemirror/theme-one-dark';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useStore } from '../store';
import { cn } from '../lib/utils';
import { EditorView } from '@codemirror/view';
import { Bot, Check, Copy, FileText, Languages, Maximize2, Sparkles, Undo2, Wand2, X, Bold, Italic, Code } from 'lucide-react';
import { askAI, modifyTextWithAI } from '../lib/ai';
import type { EditorAiPromptKey } from '../lib/aiPrompts';
import { EditorState } from '@codemirror/state';
import { confirmAiContext, contextDetail } from '../lib/aiContext';

type MarkdownAction = 'bold' | 'italic' | 'code';
type TransformAction = Extract<EditorAiPromptKey, 'rewrite' | 'polish' | 'expand' | 'translate'>;
type InsightAction = Extract<EditorAiPromptKey, 'ask' | 'summarize'>;
type DiffLine = {
  type: 'same' | 'added' | 'removed';
  text: string;
};

const markdownActions: Record<MarkdownAction, { marker: string; sample: string }> = {
  bold: { marker: '**', sample: 'bold text' },
  italic: { marker: '*', sample: 'italic text' },
  code: { marker: '`', sample: 'code' },
};

export function EditorPane() {
  const {
    activeFile,
    activeFileContent,
    setActiveFileContent,
    viewMode,
    isDarkMode,
    locale,
    toggleAiPanel,
    aiPanelOpen,
    pendingEditorLine,
    setPendingEditorLine,
    setCurrentEditorLine,
    setEditorSelection,
    editorSelection,
    aiConfig,
    editorAiPrompts
  } = useStore();
  const editorRef = useRef<ReactCodeMirrorRef>(null);
  const [inlineDraft, setInlineDraft] = useState<{
    from: number;
    to: number;
    original: string;
    proposed: string;
    sourcePath: string;
    action: TransformAction;
  } | null>(null);
  const [inlineAnswer, setInlineAnswer] = useState<{
    action: InsightAction;
    answer: string;
    selectionText: string;
    selectionTo: number;
  } | null>(null);
  const [insertDraft, setInsertDraft] = useState<{
    from: number;
    to: number;
    inserted: string;
    sourcePath: string;
  } | null>(null);
  const [inlineStatus, setInlineStatus] = useState<string>('');
  const isReadOnly = Boolean(activeFile?.readOnly || (activeFile && !activeFile.isMarkdown));
  const isMarkdownDocument = Boolean(activeFile?.isMarkdown);
  const languageExtension = useMemo(
    () => getEditorLanguageExtension(activeFile?.language || (isMarkdownDocument ? 'markdown' : 'text')),
    [activeFile?.language, isMarkdownDocument]
  );

  const onChange = useCallback((value: string) => {
    if (isReadOnly) return;
    setActiveFileContent(value);
  }, [isReadOnly, setActiveFileContent]);

  const selectionTracker = useMemo(() => EditorView.updateListener.of((update) => {
    if (!update.selectionSet && !update.docChanged) return;

    const selection = update.state.selection.main;
    setCurrentEditorLine(update.state.doc.lineAt(selection.head).number);
    if (selection.empty) {
      setEditorSelection(null);
      return;
    }

    setEditorSelection({
      from: selection.from,
      to: selection.to,
      text: update.state.sliceDoc(selection.from, selection.to)
    });
  }), [setCurrentEditorLine, setEditorSelection]);

  const clearInlineArtifacts = useCallback(() => {
    setInlineDraft(null);
    setInlineAnswer(null);
    setInsertDraft(null);
    setInlineStatus('');
  }, []);

  const applyMarkdownAction = useCallback((action: MarkdownAction) => {
    if (!isMarkdownDocument || isReadOnly) return;
    const view = editorRef.current?.view;
    if (!view) return;

    const { marker, sample } = markdownActions[action];
    const { state } = view;
    const selection = state.selection.main;
    const hasSelection = !selection.empty;
    const selectedText = hasSelection ? state.sliceDoc(selection.from, selection.to) : sample;
    const insertText = `${marker}${selectedText}${marker}`;
    const from = selection.from;
    const to = selection.to;
    const sampleFrom = from + marker.length;
    const sampleTo = sampleFrom + selectedText.length;

    view.dispatch({
      changes: { from, to, insert: insertText },
      selection: { anchor: sampleFrom, head: sampleTo },
      scrollIntoView: true,
    });
    view.focus();
  }, [isMarkdownDocument, isReadOnly]);

  const handleRewriteAction = async () => {
    if (!aiPanelOpen) toggleAiPanel();
  };

  const runInlineAiTransform = async (kind: TransformAction) => {
    const view = editorRef.current?.view;
    if (!view || !editorSelection?.text.trim() || inlineStatus) return;
    if (!isMarkdownDocument || isReadOnly) return;

    const prompt = editorAiPrompts[kind];
    const originalSelection = {
      from: editorSelection.from,
      to: editorSelection.to,
      text: editorSelection.text
    };
    setInlineAnswer(null);
    setInsertDraft(null);
    const confirmed = await confirmAiContext(
      locale === 'zh' ? '确认 AI 修改上下文' : 'Confirm AI edit context',
      locale === 'zh' ? 'AI 将只接收当前选区和对应指令，生成结果不会自动写入正文。' : 'AI will receive only the current selection and instruction. The result will not be applied automatically.',
      [
        {
          label: locale === 'zh' ? '选区内容' : 'Selected text',
          detail: contextDetail(originalSelection.text),
          content: originalSelection.text
        },
        {
          label: locale === 'zh' ? '指令' : 'Instruction',
          detail: prompt,
          content: prompt
        }
      ]
    );
    if (!confirmed) {
      setInlineStatus('');
      return;
    }
    setInlineStatus(getActionRunningText(kind, locale));

    try {
      const proposed = await modifyTextWithAI(aiConfig, originalSelection.text, prompt);
      setInlineDraft({
        from: originalSelection.from,
        to: originalSelection.to,
        original: originalSelection.text,
        proposed,
        sourcePath: activeFile.path,
        action: kind
      });
    } catch (error: any) {
      setInlineStatus(error?.message ?? String(error));
      window.setTimeout(() => setInlineStatus(''), 3000);
      return;
    }

    setInlineStatus('');
  };

  const askSelection = async (kind: InsightAction) => {
    if (!editorSelection?.text.trim() || inlineStatus) return;
    setInlineDraft(null);
    setInsertDraft(null);
    setInlineAnswer(null);
    const confirmed = await confirmAiContext(
      locale === 'zh' ? '确认 AI 阅读上下文' : 'Confirm AI reading context',
      locale === 'zh' ? 'AI 将只接收当前选区和选区指令。' : 'AI will receive only the selected text and selection instruction.',
      [
        {
          label: locale === 'zh' ? '选区内容' : 'Selected text',
          detail: contextDetail(editorSelection.text),
          content: editorSelection.text
        },
        {
          label: locale === 'zh' ? '指令' : 'Instruction',
          detail: editorAiPrompts[kind],
          content: editorAiPrompts[kind]
        }
      ]
    );
    if (!confirmed) return;
    setInlineStatus(getActionRunningText(kind, locale));
    try {
      const answer = await askAI(aiConfig, editorAiPrompts[kind], editorSelection.text);
      setInlineAnswer({
        action: kind,
        answer,
        selectionText: editorSelection.text,
        selectionTo: editorSelection.to
      });
      setInlineStatus('');
    } catch (error: any) {
      setInlineStatus(error?.message ?? String(error));
      window.setTimeout(() => setInlineStatus(''), 3000);
    }
  };

  const copySelection = async () => {
    if (!editorSelection?.text) return;
    await navigator.clipboard.writeText(editorSelection.text);
    setInlineStatus(locale === 'zh' ? '已复制选区' : 'Selection copied');
    window.setTimeout(() => setInlineStatus(''), 1800);
  };

  const copyInlineAnswer = async () => {
    if (!inlineAnswer?.answer) return;
    await navigator.clipboard.writeText(inlineAnswer.answer);
    setInlineStatus(locale === 'zh' ? 'AI 回答已复制' : 'AI answer copied');
    window.setTimeout(() => setInlineStatus(''), 1800);
  };

  const insertInlineAnswer = () => {
    const view = editorRef.current?.view;
    if (!view || !inlineAnswer) return;
    if (!isMarkdownDocument || isReadOnly) return;

    const from = Math.min(inlineAnswer.selectionTo, view.state.doc.length);
    const inserted = formatInlineAnswerForMarkdown(inlineAnswer.action, inlineAnswer.answer, locale);
    view.dispatch({
      changes: { from, to: from, insert: inserted },
      selection: { anchor: from, head: from + inserted.length },
      scrollIntoView: true
    });
    setInsertDraft({
      from,
      to: from + inserted.length,
      inserted,
      sourcePath: activeFile.path
    });
    setInlineAnswer(null);
    view.focus();
  };

  const applyInlineDraft = () => {
    const view = editorRef.current?.view;
    if (!view || !inlineDraft) return;
    if (!isMarkdownDocument || isReadOnly) return;
    if (inlineDraft.sourcePath !== activeFile.path) {
      setInlineDraft(null);
      return;
    }
    const currentSelectionText = view.state.sliceDoc(inlineDraft.from, inlineDraft.to);
    if (currentSelectionText !== inlineDraft.original) {
      setInlineStatus(locale === 'zh' ? '选区已继续变化，请重新发起 AI 修改' : 'Selection changed; run the AI action again');
      window.setTimeout(() => setInlineStatus(''), 2500);
      setInlineDraft(null);
      return;
    }

    view.dispatch({
      changes: { from: inlineDraft.from, to: inlineDraft.to, insert: inlineDraft.proposed },
      selection: { anchor: inlineDraft.from, head: inlineDraft.from + inlineDraft.proposed.length },
      scrollIntoView: true
    });
    setInlineDraft(null);
    view.focus();
  };

  const discardInlineDraft = () => {
    setInlineDraft(null);
    editorRef.current?.view?.focus();
  };

  const undoInsertDraft = () => {
    const view = editorRef.current?.view;
    if (!view || !insertDraft) return;
    if (insertDraft.sourcePath !== activeFile.path) {
      setInsertDraft(null);
      return;
    }

    const currentText = view.state.sliceDoc(insertDraft.from, insertDraft.to);
    if (currentText !== insertDraft.inserted) {
      setInlineStatus(locale === 'zh' ? '插入内容已继续变化，无法安全撤销' : 'Inserted text changed; cannot safely undo');
      window.setTimeout(() => setInlineStatus(''), 2500);
      setInsertDraft(null);
      return;
    }

    view.dispatch({
      changes: { from: insertDraft.from, to: insertDraft.to, insert: '' },
      selection: { anchor: insertDraft.from },
      scrollIntoView: true
    });
    setInsertDraft(null);
    view.focus();
  };

  useEffect(() => {
    const view = editorRef.current?.view;
    if (!view || !pendingEditorLine || pendingEditorLine < 1) return;

    const lineNumber = Math.min(pendingEditorLine, view.state.doc.lines);
    const line = view.state.doc.line(lineNumber);
    view.dispatch({
      selection: { anchor: line.from, head: line.to },
      effects: EditorView.scrollIntoView(line.from, { y: 'center' })
    });
    setCurrentEditorLine(lineNumber);
    view.focus();
    setPendingEditorLine(null);
  }, [activeFile?.path, activeFileContent, pendingEditorLine, setCurrentEditorLine, setPendingEditorLine]);

  useEffect(() => {
    clearInlineArtifacts();
  }, [activeFile?.path, clearInlineArtifacts]);

  useEffect(() => {
    if (!editorSelection?.text.trim()) {
      setInlineAnswer(null);
    }
  }, [editorSelection?.from, editorSelection?.to, editorSelection?.text]);

  if (!activeFile) {
    return (
      <div className={cn("flex-1 h-full flex flex-col items-center justify-center text-text-tertiary bg-bg-base", viewMode === 'read' && 'hidden')}>
        <div className="text-4xl mb-4 font-mono font-bold opacity-20 tracking-tighter">InkStack</div>
        <p className="text-[13px]">{locale === 'zh' ? '请在左侧选择 Markdown、代码或文本文件' : 'Select a Markdown, code, or text file to start'}</p>
      </div>
    );
  }

  // A custom theme base to merge with tailwind typography styles
  const lightTheme = EditorView.theme({
    "&": { backgroundColor: "transparent" },
    ".cm-content": { fontFamily: "var(--font-mono, monospace)" },
    ".cm-line": { padding: "0" },
  });

  return (
    <div className={cn("flex-1 h-full overflow-hidden flex flex-col bg-bg-base relative", viewMode === 'read' && 'hidden')}>
      <CodeMirror
        ref={editorRef}
        value={activeFileContent}
        onChange={onChange}
        theme={isDarkMode ? oneDark : 'light'}
        extensions={[
          languageExtension,
          EditorView.lineWrapping,
          lightTheme,
          EditorState.readOnly.of(isReadOnly),
          EditorView.editable.of(!isReadOnly),
          selectionTracker
        ]}
        className="h-full text-[14px] leading-relaxed editor-scroll"
        height="100%"
        basicSetup={{
          lineNumbers: true,
          foldGutter: true,
          highlightActiveLine: true,
          dropCursor: true,
          crosshairCursor: true,
        }}
      />

      {editorSelection?.text.trim() && !inlineDraft && !inlineAnswer && (
        <div className="absolute right-5 top-5 z-20 flex max-w-[calc(100%-2.5rem)] flex-wrap items-center gap-1 rounded-md border border-border-subtle bg-bg-base/95 px-1.5 py-1 shadow-lg backdrop-blur text-text-secondary">
          <button onClick={copySelection} className="flex items-center gap-1 rounded px-2 py-1 text-[12px] hover:bg-bg-hover hover:text-text-primary" title={locale === 'zh' ? '复制选区' : 'Copy selection'}>
            <Copy size={13} />
            {locale === 'zh' ? '复制' : 'Copy'}
          </button>
          {isMarkdownDocument && !isReadOnly && (
            <>
              <button onClick={() => void runInlineAiTransform('rewrite')} className="flex items-center gap-1 rounded px-2 py-1 text-[12px] text-accent hover:bg-bg-hover" title={locale === 'zh' ? 'AI 改写选区' : 'Rewrite selection'}>
                <Wand2 size={13} />
                {locale === 'zh' ? '改写' : 'Rewrite'}
              </button>
              <button onClick={() => void runInlineAiTransform('polish')} className="flex items-center gap-1 rounded px-2 py-1 text-[12px] text-accent hover:bg-bg-hover" title={locale === 'zh' ? 'AI 润色选区' : 'Polish selection'}>
                <Sparkles size={13} />
                {locale === 'zh' ? '润色' : 'Polish'}
              </button>
              <button onClick={() => void runInlineAiTransform('expand')} className="flex items-center gap-1 rounded px-2 py-1 text-[12px] text-accent hover:bg-bg-hover" title={locale === 'zh' ? 'AI 扩写选区' : 'Expand selection'}>
                <Maximize2 size={13} />
                {locale === 'zh' ? '扩写' : 'Expand'}
              </button>
              <button onClick={() => void runInlineAiTransform('translate')} className="flex items-center gap-1 rounded px-2 py-1 text-[12px] text-accent hover:bg-bg-hover" title={locale === 'zh' ? 'AI 翻译选区' : 'Translate selection'}>
                <Languages size={13} />
                {locale === 'zh' ? '翻译' : 'Translate'}
              </button>
            </>
          )}
          <button onClick={() => void askSelection('summarize')} className="flex items-center gap-1 rounded px-2 py-1 text-[12px] hover:bg-bg-hover hover:text-text-primary" title={locale === 'zh' ? '总结选区' : 'Summarize selection'}>
            <FileText size={13} />
            {locale === 'zh' ? '总结' : 'Summary'}
          </button>
          <button onClick={() => void askSelection('ask')} className="flex items-center gap-1 rounded px-2 py-1 text-[12px] hover:bg-bg-hover hover:text-text-primary" title={locale === 'zh' ? '向 AI 提问选区' : 'Ask about selection'}>
            <Bot size={13} />
            {locale === 'zh' ? '提问' : 'Ask'}
          </button>
        </div>
      )}

      {inlineDraft && (
        <InlineDraftCard
          draft={inlineDraft}
          locale={locale}
          onApply={applyInlineDraft}
          onDiscard={discardInlineDraft}
        />
      )}

      {insertDraft && !inlineDraft && (
        <div className="absolute right-5 top-5 z-20 flex items-center gap-1 rounded-md border border-border-subtle bg-bg-base/95 px-1.5 py-1 shadow-lg backdrop-blur">
          <button onClick={() => setInsertDraft(null)} className="flex items-center gap-1 rounded bg-accent px-2 py-1 text-[12px] font-medium text-white hover:bg-accent/90">
            <Check size={13} />
            {locale === 'zh' ? '保留插入' : 'Keep'}
          </button>
          <button onClick={undoInsertDraft} className="flex items-center gap-1 rounded border border-border-subtle bg-bg-panel px-2 py-1 text-[12px] font-medium text-text-secondary hover:bg-bg-hover hover:text-text-primary">
            <Undo2 size={13} />
            {locale === 'zh' ? '撤销插入' : 'Undo Insert'}
          </button>
        </div>
      )}

      {inlineAnswer && (
        <div className="absolute right-5 top-5 z-20 flex w-[min(28rem,calc(100%-2.5rem))] flex-col overflow-hidden rounded-md border border-border-subtle bg-bg-base shadow-xl">
          <div className="flex items-center justify-between border-b border-border-subtle px-3 py-2">
            <div className="flex min-w-0 items-center gap-2 text-[12px] font-medium text-text-primary">
              {inlineAnswer.action === 'summarize' ? <FileText size={14} className="text-accent" /> : <Bot size={14} className="text-accent" />}
              <span className="truncate">
                {inlineAnswer.action === 'summarize'
                  ? (locale === 'zh' ? 'AI 选区总结' : 'AI Selection Summary')
                  : (locale === 'zh' ? 'AI 选区回答' : 'AI Selection Answer')}
              </span>
            </div>
            <button onClick={() => setInlineAnswer(null)} className="rounded p-1 text-text-tertiary hover:bg-bg-hover hover:text-text-primary">
              <X size={13} />
            </button>
          </div>
          <div className="max-h-72 overflow-auto px-3 py-3 text-[13px] leading-relaxed text-text-secondary whitespace-pre-wrap">
            {inlineAnswer.answer}
          </div>
          <div className="flex flex-wrap gap-2 border-t border-border-subtle bg-bg-panel/60 px-3 py-2">
            <button onClick={copyInlineAnswer} className="flex items-center gap-1 rounded border border-border-subtle bg-bg-base px-2 py-1 text-[12px] text-text-secondary hover:bg-bg-hover hover:text-text-primary">
              <Copy size={13} />
              {locale === 'zh' ? '复制回答' : 'Copy'}
            </button>
            <button onClick={insertInlineAnswer} className="flex items-center gap-1 rounded bg-accent px-2 py-1 text-[12px] font-medium text-white hover:bg-accent/90">
              <Check size={13} />
              {locale === 'zh' ? '插入到选区后' : 'Insert Below'}
            </button>
          </div>
        </div>
      )}

      {inlineStatus && (
        <div className="absolute right-5 top-20 z-30 max-w-80 rounded-md border border-border-subtle bg-bg-base px-3 py-2 text-[12px] text-text-secondary shadow-lg">
          {inlineStatus}
        </div>
      )}
      
      {isReadOnly && (
        <div className="absolute bottom-6 left-1/2 z-10 -translate-x-1/2 rounded-full border border-border-subtle bg-bg-base/85 px-4 py-2 text-[12px] text-text-tertiary shadow-lg backdrop-blur">
          {locale === 'zh'
            ? `${activeFile.language || 'text'} · 只读代码查看`
            : `${activeFile.language || 'text'} · read-only code view`}
        </div>
      )}

      {/* Floating Action Toolbar */}
      {isMarkdownDocument && !isReadOnly && (
      <div className="absolute bottom-6 left-1/2 -translate-x-1/2 flex items-center bg-bg-base/80 backdrop-blur shadow-xl border border-border-subtle rounded-full px-5 py-2 space-x-5 text-text-secondary z-10 transition-opacity">
        <button
          onClick={() => applyMarkdownAction('bold')}
          className="hover:text-text-primary transition-colors"
          title="Bold"
        >
          <Bold size={16} />
        </button>
        <button
          onClick={() => applyMarkdownAction('italic')}
          className="hover:text-text-primary transition-colors"
          title="Italic"
        >
          <Italic size={16} />
        </button>
        <button
          onClick={() => applyMarkdownAction('code')}
          className="hover:text-text-primary border border-border-subtle rounded px-1.5 py-0.5 text-xs font-mono bg-bg-panel transition-colors"
          title="Code"
        >
          <Code size={14} />
        </button>
        <div className="w-px h-4 bg-border-subtle"></div>
        <button 
          onClick={handleRewriteAction}
          className="flex items-center space-x-1.5 text-accent hover:text-accent/80 transition-colors"
        >
          <Sparkles size={14} />
          <span className="text-[13px] font-medium">{locale === 'zh' ? 'AI 优化' : 'AI Suggest'}</span>
        </button>
      </div>
      )}
    </div>
  );
}

function getEditorLanguageExtension(language: string): Extension {
  const normalized = language.toLowerCase();
  if (normalized === 'markdown' || normalized === 'md' || normalized === 'mdx') {
    return markdown({ base: markdownLanguage, codeLanguages: languages });
  }
  if (['javascript', 'js', 'mjs', 'cjs', 'jsx'].includes(normalized)) {
    return javascript({ jsx: normalized === 'jsx' });
  }
  if (['typescript', 'ts', 'tsx'].includes(normalized)) {
    return javascript({ jsx: normalized === 'tsx', typescript: true });
  }
  if (normalized === 'python' || normalized === 'py') return python();
  if (normalized === 'rust' || normalized === 'rs') return rust();
  if (normalized === 'json' || normalized === 'jsonc') return json();
  if (normalized === 'html') return html();
  if (normalized === 'css' || normalized === 'scss' || normalized === 'sass') return css();
  if (normalized === 'sql') return sql();
  if (normalized === 'xml') return xml();
  if (normalized === 'yaml' || normalized === 'yml') return yaml();
  return [];
}

function getActionRunningText(action: EditorAiPromptKey, locale: 'zh' | 'en') {
  const zh: Record<EditorAiPromptKey, string> = {
    rewrite: 'AI 正在改写选区...',
    polish: 'AI 正在润色选区...',
    expand: 'AI 正在扩写选区...',
    translate: 'AI 正在翻译选区...',
    ask: 'AI 正在阅读选区...',
    summarize: 'AI 正在总结选区...'
  };
  const en: Record<EditorAiPromptKey, string> = {
    rewrite: 'AI is rewriting...',
    polish: 'AI is polishing...',
    expand: 'AI is expanding...',
    translate: 'AI is translating...',
    ask: 'AI is reading...',
    summarize: 'AI is summarizing...'
  };

  return locale === 'zh' ? zh[action] : en[action];
}

function formatInlineAnswerForMarkdown(action: InsightAction, answer: string, locale: 'zh' | 'en') {
  const title = action === 'summarize'
    ? (locale === 'zh' ? 'AI 总结' : 'AI Summary')
    : (locale === 'zh' ? 'AI 回答' : 'AI Answer');
  const body = answer
    .trim()
    .split('\n')
    .map((line) => `> ${line}`)
    .join('\n');

  return `\n\n> [!note] ${title}\n${body}\n`;
}

function InlineDraftCard({
  draft,
  locale,
  onApply,
  onDiscard
}: {
  draft: {
    original: string;
    proposed: string;
    action: TransformAction;
  };
  locale: 'zh' | 'en';
  onApply: () => void;
  onDiscard: () => void;
}) {
  const diff = useMemo(() => buildSafeLineDiff(draft.original, draft.proposed), [draft.original, draft.proposed]);
  const previewLines = diff.length > 80 ? diff.slice(0, 80) : diff;
  const changedLines = diff.filter((line) => line.type !== 'same').length;

  return (
    <div className="absolute right-5 top-5 z-20 flex w-[min(34rem,calc(100%-2.5rem))] flex-col overflow-hidden rounded-md border border-border-subtle bg-bg-base shadow-xl">
      <div className="flex items-center justify-between gap-3 border-b border-border-subtle px-3 py-2">
        <div className="min-w-0">
          <div className="flex items-center gap-2 text-[12px] font-medium text-text-primary">
            <Sparkles size={14} className="text-accent" />
            <span>{getDraftTitle(draft.action, locale)}</span>
          </div>
          <div className="mt-0.5 text-[11px] text-text-tertiary">
            {locale === 'zh' ? 'AI 尚未写入正文，请审阅后应用。' : 'AI has not changed the document yet. Review before applying.'}
          </div>
        </div>
        <span className="shrink-0 rounded border border-border-subtle px-1.5 py-0.5 text-[10px] text-text-tertiary">
          {changedLines} {locale === 'zh' ? '处变更' : 'changes'}
        </span>
      </div>

      <div className="max-h-80 overflow-auto bg-bg-panel font-mono text-[11px] leading-relaxed">
        {previewLines.map((line, index) => (
          <div
            key={`${line.type}-${index}`}
            className={cn(
              'grid grid-cols-[1.25rem_1fr] gap-2 px-2 py-0.5',
              line.type === 'added' && 'bg-green-500/10 text-green-700 dark:text-green-300',
              line.type === 'removed' && 'bg-red-500/10 text-red-700 dark:text-red-300',
              line.type === 'same' && 'text-text-tertiary'
            )}
          >
            <span className="select-none text-center">
              {line.type === 'added' ? '+' : line.type === 'removed' ? '-' : ' '}
            </span>
            <span className="whitespace-pre-wrap break-words">{line.text || ' '}</span>
          </div>
        ))}
        {diff.length > previewLines.length && (
          <div className="px-3 py-2 text-[11px] text-text-tertiary">
            {locale === 'zh' ? `还有 ${diff.length - previewLines.length} 行未显示` : `${diff.length - previewLines.length} more lines hidden`}
          </div>
        )}
      </div>

      <div className="flex flex-wrap gap-2 border-t border-border-subtle bg-bg-base px-3 py-2">
        <button onClick={onApply} className="flex items-center gap-1 rounded bg-accent px-2 py-1 text-[12px] font-medium text-white hover:bg-accent/90">
          <Check size={13} />
          {locale === 'zh' ? '应用到选区' : 'Apply to Selection'}
        </button>
        <button onClick={onDiscard} className="flex items-center gap-1 rounded border border-border-subtle bg-bg-panel px-2 py-1 text-[12px] font-medium text-text-secondary hover:bg-bg-hover hover:text-text-primary">
          <X size={13} />
          {locale === 'zh' ? '丢弃' : 'Discard'}
        </button>
      </div>
    </div>
  );
}

function getDraftTitle(action: TransformAction, locale: 'zh' | 'en') {
  const zh: Record<TransformAction, string> = {
    rewrite: 'AI 改写候选',
    polish: 'AI 润色候选',
    expand: 'AI 扩写候选',
    translate: 'AI 翻译候选'
  };
  const en: Record<TransformAction, string> = {
    rewrite: 'AI Rewrite Draft',
    polish: 'AI Polish Draft',
    expand: 'AI Expansion Draft',
    translate: 'AI Translation Draft'
  };

  return locale === 'zh' ? zh[action] : en[action];
}

function buildLineDiff(original: string, proposed: string): DiffLine[] {
  const originalLines = original.split('\n');
  const proposedLines = proposed.split('\n');
  const table = buildLcsTable(originalLines, proposedLines);
  const diff: DiffLine[] = [];

  let left = originalLines.length;
  let right = proposedLines.length;
  while (left > 0 || right > 0) {
    if (left > 0 && right > 0 && originalLines[left - 1] === proposedLines[right - 1]) {
      diff.push({ type: 'same', text: originalLines[left - 1] });
      left -= 1;
      right -= 1;
    } else if (right > 0 && (left === 0 || table[left][right - 1] >= table[left - 1][right])) {
      diff.push({ type: 'added', text: proposedLines[right - 1] });
      right -= 1;
    } else if (left > 0) {
      diff.push({ type: 'removed', text: originalLines[left - 1] });
      left -= 1;
    }
  }

  return diff.reverse();
}

function buildSafeLineDiff(original: string, proposed: string): DiffLine[] {
  const originalLines = original.split('\n');
  const proposedLines = proposed.split('\n');
  if (originalLines.length * proposedLines.length > 120_000) {
    return [
      { type: 'removed', text: `Original selection: ${originalLines.length} lines` },
      { type: 'added', text: `AI draft: ${proposedLines.length} lines` },
      { type: 'same', text: 'Diff is summarized because the selection is large.' }
    ];
  }

  return buildLineDiff(original, proposed);
}

function buildLcsTable(left: string[], right: string[]) {
  const table = Array.from({ length: left.length + 1 }, () => Array(right.length + 1).fill(0));
  for (let row = 1; row <= left.length; row += 1) {
    for (let column = 1; column <= right.length; column += 1) {
      table[row][column] = left[row - 1] === right[column - 1]
        ? table[row - 1][column - 1] + 1
        : Math.max(table[row - 1][column], table[row][column - 1]);
    }
  }

  return table;
}
