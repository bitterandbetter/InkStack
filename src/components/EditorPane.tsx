import CodeMirror, { type ReactCodeMirrorRef } from '@uiw/react-codemirror';
import type { Extension } from '@codemirror/state';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { useStore } from '../store';
import { cn } from '../lib/utils';
import { EditorView, keymap } from '@codemirror/view';
import { LanguageDescription } from '@codemirror/language';
import {
  Bot,
  Check,
  Copy,
  FileText,
  Heading1,
  Heading2,
  Heading3,
  Image,
  Italic,
  Languages,
  Link,
  List,
  ListChecks,
  ListOrdered,
  Maximize2,
  Minus,
  Quote,
  Sparkles,
  Strikethrough,
  Table2,
  Undo2,
  Wand2,
  X,
  Bold,
  Code,
  Code2,
  Search,
  ChevronDown,
  ChevronUp,
  Replace
} from 'lucide-react';
import { askAI, isAiAbortError, modifyTextWithAI, sanitizeAiError } from '../lib/ai';
import type { EditorAiPromptKey } from '../lib/aiPrompts';
import { EditorState } from '@codemirror/state';
import { confirmAiContext, contextDetail } from '../lib/aiContext';
import { listen } from '@tauri-apps/api/event';
import { importMarkdownAsset } from '../lib/fs';
import { listenEditorCommand } from '../lib/appEvents';

type MarkdownAction = import('../lib/appEvents').MarkdownEditorCommand;
type TransformAction = Extract<EditorAiPromptKey, 'rewrite' | 'polish' | 'expand' | 'translate'>;
type InsightAction = Extract<EditorAiPromptKey, 'ask' | 'summarize'>;
type DiffLine = {
  type: 'same' | 'added' | 'removed';
  text: string;
};
type FindMatch = { from: number; to: number };
type DragDropPayload = {
  paths?: string[];
  position?: { x: number; y: number };
};

const inlineMarkdownActions: Partial<Record<MarkdownAction, { open: string; close: string; sample: string }>> = {
  bold: { open: '**', close: '**', sample: 'bold text' },
  italic: { open: '*', close: '*', sample: 'italic text' },
  strike: { open: '~~', close: '~~', sample: 'strikethrough text' },
  inlineCode: { open: '`', close: '`', sample: 'code' },
};
const imageExtensionPattern = /\.(png|jpe?g|gif|webp|svg|bmp|avif)$/i;

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
  const inlineAbortRef = useRef<AbortController | null>(null);
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
  const [findOpen, setFindOpen] = useState(false);
  const [findQuery, setFindQuery] = useState('');
  const [replaceText, setReplaceText] = useState('');
  const [matchCase, setMatchCase] = useState(false);
  const [activeFindIndex, setActiveFindIndex] = useState(0);
  const isReadOnly = Boolean(activeFile?.readOnly || (activeFile && !activeFile.isMarkdown));
  const isMarkdownDocument = Boolean(activeFile?.isMarkdown);
  const editorLanguage = activeFile?.language || (isMarkdownDocument ? 'markdown' : 'text');
  const [languageExtension, setLanguageExtension] = useState<Extension>([]);
  const findMatches = useMemo(
    () => findDocumentMatches(activeFileContent, findQuery, matchCase),
    [activeFileContent, findQuery, matchCase]
  );
  const activeFindMatch = findMatches[activeFindIndex] ?? null;

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
    inlineAbortRef.current?.abort();
    inlineAbortRef.current = null;
    setInlineDraft(null);
    setInlineAnswer(null);
    setInsertDraft(null);
    setInlineStatus('');
  }, []);

  const applyMarkdownAction = useCallback((action: MarkdownAction) => {
    if (!isMarkdownDocument || isReadOnly) return;
    const view = editorRef.current?.view;
    if (!view) return;

    applyMarkdownEdit(view, action);
    view.focus();
  }, [isMarkdownDocument, isReadOnly]);

  const runMarkdownShortcut = useCallback((action: MarkdownAction) => {
    if (!isMarkdownDocument || isReadOnly) return false;
    const view = editorRef.current?.view;
    if (!view) return false;
    applyMarkdownEdit(view, action);
    return true;
  }, [isMarkdownDocument, isReadOnly]);

  const openFindPanel = useCallback(() => {
    setFindOpen(true);
    const view = editorRef.current?.view;
    const selection = view?.state.selection.main;
    if (view && selection && !selection.empty) {
      const selectedText = view.state.sliceDoc(selection.from, selection.to);
      if (selectedText && !selectedText.includes('\n')) {
        setFindQuery(selectedText);
      }
    }
    return true;
  }, []);

  const markdownKeymap = useMemo(() => keymap.of([
    { key: 'Mod-f', run: openFindPanel },
    { key: 'Mod-b', run: () => runMarkdownShortcut('bold') },
    { key: 'Mod-i', run: () => runMarkdownShortcut('italic') },
    { key: 'Mod-k', run: () => runMarkdownShortcut('link') },
    { key: 'Mod-1', run: () => runMarkdownShortcut('heading1') },
    { key: 'Mod-2', run: () => runMarkdownShortcut('heading2') },
    { key: 'Mod-3', run: () => runMarkdownShortcut('heading3') },
  ]), [openFindPanel, runMarkdownShortcut]);

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
    inlineAbortRef.current?.abort();
    const abortController = new AbortController();
    inlineAbortRef.current = abortController;
    setInlineStatus(getActionRunningText(kind, locale));

    try {
      const proposed = await modifyTextWithAI(aiConfig, originalSelection.text, prompt, abortController.signal);
      if (abortController.signal.aborted) return;
      setInlineDraft({
        from: originalSelection.from,
        to: originalSelection.to,
        original: originalSelection.text,
        proposed,
        sourcePath: activeFile.path,
        action: kind
      });
    } catch (error: any) {
      if (!isAiAbortError(error)) {
        setInlineStatus(sanitizeAiError(error, locale));
        window.setTimeout(() => setInlineStatus(''), 3000);
      }
      return;
    } finally {
      if (inlineAbortRef.current === abortController) {
        inlineAbortRef.current = null;
      }
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
    inlineAbortRef.current?.abort();
    const abortController = new AbortController();
    inlineAbortRef.current = abortController;
    setInlineStatus(getActionRunningText(kind, locale));
    try {
      const answer = await askAI(aiConfig, editorAiPrompts[kind], editorSelection.text, abortController.signal);
      if (abortController.signal.aborted) return;
      setInlineAnswer({
        action: kind,
        answer,
        selectionText: editorSelection.text,
        selectionTo: editorSelection.to
      });
      setInlineStatus('');
    } catch (error: any) {
      if (!isAiAbortError(error)) {
        setInlineStatus(sanitizeAiError(error, locale));
        window.setTimeout(() => setInlineStatus(''), 3000);
      }
    } finally {
      if (inlineAbortRef.current === abortController) {
        inlineAbortRef.current = null;
      }
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

  const jumpToFindMatch = useCallback((index: number) => {
    const view = editorRef.current?.view;
    if (!view || findMatches.length === 0) return;
    const normalizedIndex = normalizeMatchIndex(index, findMatches.length);
    const match = findMatches[normalizedIndex];
    setActiveFindIndex(normalizedIndex);
    view.dispatch({
      selection: { anchor: match.from, head: match.to },
      effects: EditorView.scrollIntoView(match.from, { y: 'center' })
    });
    view.focus();
  }, [findMatches]);

  const replaceCurrentMatch = useCallback(() => {
    const view = editorRef.current?.view;
    if (!view || isReadOnly || !isMarkdownDocument || !activeFindMatch) return;
    view.dispatch({
      changes: { from: activeFindMatch.from, to: activeFindMatch.to, insert: replaceText },
      selection: { anchor: activeFindMatch.from, head: activeFindMatch.from + replaceText.length },
      scrollIntoView: true
    });
    setActiveFindIndex((index) => Math.min(index, Math.max(0, findMatches.length - 2)));
    view.focus();
  }, [activeFindMatch, findMatches.length, isMarkdownDocument, isReadOnly, replaceText]);

  const replaceAllMatches = useCallback(() => {
    const view = editorRef.current?.view;
    if (!view || isReadOnly || !isMarkdownDocument || findMatches.length === 0) return;
    view.dispatch({
      changes: findMatches.map((match) => ({
        from: match.from,
        to: match.to,
        insert: replaceText
      })),
      scrollIntoView: true
    });
    setActiveFindIndex(0);
    view.focus();
  }, [findMatches, isMarkdownDocument, isReadOnly, replaceText]);

  const insertImportedImage = useCallback(async (sourcePath: string) => {
    const view = editorRef.current?.view;
    if (!view || !activeFile?.path || !isMarkdownDocument || isReadOnly) return;
    try {
      const asset = await importMarkdownAsset(activeFile.path, sourcePath);
      const selection = view.state.selection.main;
      const altText = fileNameWithoutExtension(sourcePath) || 'image';
      const markdown = `![${altText}](${asset.relativeSrc})`;
      view.dispatch({
        changes: { from: selection.from, to: selection.to, insert: markdown },
        selection: { anchor: selection.from, head: selection.from + markdown.length },
        scrollIntoView: true
      });
      setInlineStatus(locale === 'zh' ? `已导入图片：${asset.relativeSrc}` : `Image imported: ${asset.relativeSrc}`);
      window.setTimeout(() => setInlineStatus(''), 2200);
      view.focus();
    } catch (error: any) {
      setInlineStatus(error?.message ?? String(error));
      window.setTimeout(() => setInlineStatus(''), 3500);
    }
  }, [activeFile?.path, isMarkdownDocument, isReadOnly, locale]);

  useEffect(() => listenEditorCommand((command) => {
    if (command.type === 'find') {
      openFindPanel();
      return;
    }

    if (command.type === 'markdown') {
      applyMarkdownAction(command.action);
      return;
    }

    if (command.type === 'selection-ai') {
      if (command.action === 'ask' || command.action === 'summarize') {
        void askSelection(command.action);
        return;
      }
      void runInlineAiTransform(command.action);
    }
  }), [applyMarkdownAction, openFindPanel, runInlineAiTransform, askSelection]);

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
    let cancelled = false;
    setLanguageExtension([]);

    void getEditorLanguageExtension(editorLanguage)
      .then((extension) => {
        if (!cancelled) setLanguageExtension(extension);
      })
      .catch(() => {
        if (!cancelled) setLanguageExtension([]);
      });

    return () => {
      cancelled = true;
    };
  }, [editorLanguage]);

  useEffect(() => {
    if (!editorSelection?.text.trim()) {
      setInlineAnswer(null);
    }
  }, [editorSelection?.from, editorSelection?.to, editorSelection?.text]);

  useEffect(() => {
    if (activeFindIndex > Math.max(0, findMatches.length - 1)) {
      setActiveFindIndex(Math.max(0, findMatches.length - 1));
    }
  }, [activeFindIndex, findMatches.length]);

  useEffect(() => {
    if (activeFindMatch && findOpen) {
      const view = editorRef.current?.view;
      view?.dispatch({
        selection: { anchor: activeFindMatch.from, head: activeFindMatch.to },
        effects: EditorView.scrollIntoView(activeFindMatch.from, { y: 'center' })
      });
    }
  }, [activeFindMatch?.from, activeFindMatch?.to, findOpen]);

  useEffect(() => {
    let disposed = false;
    let dispose: (() => void) | null = null;
    void listen<DragDropPayload>('tauri://drag-drop', (event) => {
      const imagePath = event.payload.paths?.find((path) => imageExtensionPattern.test(path));
      if (!imagePath) return;
      void insertImportedImage(imagePath);
    }).then((nextDispose) => {
      if (disposed) nextDispose();
      else dispose = nextDispose;
    });

    return () => {
      disposed = true;
      dispose?.();
    };
  }, [insertImportedImage]);

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
        theme={isDarkMode ? 'dark' : 'light'}
        extensions={[
          languageExtension,
          EditorView.lineWrapping,
          lightTheme,
          EditorState.readOnly.of(isReadOnly),
          EditorView.editable.of(!isReadOnly),
          markdownKeymap,
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

      <button
        onClick={openFindPanel}
        className="absolute left-5 top-5 z-10 rounded-md border border-border-subtle bg-bg-base/85 p-2 text-text-tertiary shadow-sm backdrop-blur transition-colors hover:bg-bg-hover hover:text-text-primary"
        title={locale === 'zh' ? '查找 / 替换' : 'Find / Replace'}
      >
        <Search size={15} />
      </button>

      {findOpen && (
        <FindReplacePanel
          locale={locale}
          query={findQuery}
          replaceText={replaceText}
          matchCase={matchCase}
          matchCount={findMatches.length}
          activeIndex={findMatches.length ? activeFindIndex : -1}
          canReplace={isMarkdownDocument && !isReadOnly}
          onQueryChange={(value) => {
            setFindQuery(value);
            setActiveFindIndex(0);
          }}
          onReplaceTextChange={setReplaceText}
          onMatchCaseChange={(value) => {
            setMatchCase(value);
            setActiveFindIndex(0);
          }}
          onPrevious={() => jumpToFindMatch(activeFindIndex - 1)}
          onNext={() => jumpToFindMatch(activeFindIndex + 1)}
          onReplaceCurrent={replaceCurrentMatch}
          onReplaceAll={replaceAllMatches}
          onClose={() => setFindOpen(false)}
        />
      )}

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
        <div className="absolute right-5 top-20 z-30 flex max-w-96 items-center gap-2 rounded-md border border-border-subtle bg-bg-base px-3 py-2 text-[12px] text-text-secondary shadow-lg">
          <span className="min-w-0 flex-1">{inlineStatus}</span>
          {inlineAbortRef.current && (
            <button
              onClick={() => {
                inlineAbortRef.current?.abort();
                inlineAbortRef.current = null;
                setInlineStatus(locale === 'zh' ? '已取消 AI 请求。' : 'AI request cancelled.');
                window.setTimeout(() => setInlineStatus(''), 1600);
              }}
              className="shrink-0 rounded border border-border-subtle bg-bg-panel px-2 py-1 text-[11px] text-text-secondary hover:bg-bg-hover hover:text-text-primary"
            >
              {locale === 'zh' ? '取消' : 'Cancel'}
            </button>
          )}
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
        <div className="absolute bottom-6 left-1/2 z-10 flex max-w-[calc(100%-2rem)] -translate-x-1/2 items-center gap-1 overflow-x-auto rounded-full border border-border-subtle bg-bg-base/90 px-3 py-2 text-text-secondary shadow-xl backdrop-blur transition-opacity">
          <ToolbarButton icon={<Heading1 size={15} />} label="H1" title="Heading 1" onClick={() => applyMarkdownAction('heading1')} />
          <ToolbarButton icon={<Heading2 size={15} />} label="H2" title="Heading 2" onClick={() => applyMarkdownAction('heading2')} />
          <ToolbarButton icon={<Heading3 size={15} />} label="H3" title="Heading 3" onClick={() => applyMarkdownAction('heading3')} />
          <ToolbarDivider />
          <ToolbarButton icon={<Bold size={15} />} title="Bold" onClick={() => applyMarkdownAction('bold')} />
          <ToolbarButton icon={<Italic size={15} />} title="Italic" onClick={() => applyMarkdownAction('italic')} />
          <ToolbarButton icon={<Strikethrough size={15} />} title="Strikethrough" onClick={() => applyMarkdownAction('strike')} />
          <ToolbarButton icon={<Code size={15} />} title="Inline code" onClick={() => applyMarkdownAction('inlineCode')} />
          <ToolbarButton icon={<Code2 size={15} />} title="Code block" onClick={() => applyMarkdownAction('codeBlock')} />
          <ToolbarDivider />
          <ToolbarButton icon={<Quote size={15} />} title="Quote" onClick={() => applyMarkdownAction('quote')} />
          <ToolbarButton icon={<List size={15} />} title="Bulleted list" onClick={() => applyMarkdownAction('bulletList')} />
          <ToolbarButton icon={<ListOrdered size={15} />} title="Ordered list" onClick={() => applyMarkdownAction('orderedList')} />
          <ToolbarButton icon={<ListChecks size={15} />} title="Task list" onClick={() => applyMarkdownAction('taskList')} />
          <ToolbarDivider />
          <ToolbarButton icon={<Link size={15} />} title="Link" onClick={() => applyMarkdownAction('link')} />
          <ToolbarButton icon={<Image size={15} />} title="Image" onClick={() => applyMarkdownAction('image')} />
          <ToolbarButton icon={<Table2 size={15} />} title="Table" onClick={() => applyMarkdownAction('table')} />
          <ToolbarButton icon={<Table2 size={15} />} label="FMT" title="Format table" onClick={() => applyMarkdownAction('formatTable')} />
          <ToolbarButton icon={<ListOrdered size={15} />} label="+R" title="Insert table row below" onClick={() => applyMarkdownAction('insertTableRow')} />
          <ToolbarButton icon={<List size={15} />} label="+C" title="Insert table column right" onClick={() => applyMarkdownAction('insertTableColumn')} />
          <ToolbarButton icon={<Minus size={15} />} title="Divider" onClick={() => applyMarkdownAction('divider')} />
          <ToolbarDivider />
          <button
            onClick={handleRewriteAction}
            className="ml-1 flex shrink-0 items-center gap-1.5 rounded-full px-2 py-1 text-accent transition-colors hover:bg-bg-hover hover:text-accent/80"
            title={locale === 'zh' ? '打开 AI 面板' : 'Open AI panel'}
          >
            <Sparkles size={14} />
            <span className="whitespace-nowrap text-[13px] font-medium">{locale === 'zh' ? 'AI 优化' : 'AI Suggest'}</span>
          </button>
        </div>
      )}
    </div>
  );
}

const markdownCodeLanguages = [
  LanguageDescription.of({
    name: 'JavaScript',
    alias: ['js', 'jsx', 'mjs', 'cjs'],
    extensions: ['js', 'jsx', 'mjs', 'cjs'],
    load: async () => (await import('@codemirror/lang-javascript')).javascript({ jsx: true })
  }),
  LanguageDescription.of({
    name: 'TypeScript',
    alias: ['ts'],
    extensions: ['ts'],
    load: async () => (await import('@codemirror/lang-javascript')).javascript({ typescript: true })
  }),
  LanguageDescription.of({
    name: 'TSX',
    alias: ['tsx'],
    extensions: ['tsx'],
    load: async () => (await import('@codemirror/lang-javascript')).javascript({ jsx: true, typescript: true })
  }),
  LanguageDescription.of({
    name: 'Python',
    alias: ['py'],
    extensions: ['py'],
    load: async () => (await import('@codemirror/lang-python')).python()
  }),
  LanguageDescription.of({
    name: 'Rust',
    alias: ['rs'],
    extensions: ['rs'],
    load: async () => (await import('@codemirror/lang-rust')).rust()
  }),
  LanguageDescription.of({
    name: 'JSON',
    alias: ['jsonc'],
    extensions: ['json', 'jsonc'],
    load: async () => (await import('@codemirror/lang-json')).json()
  }),
  LanguageDescription.of({
    name: 'HTML',
    extensions: ['html', 'htm'],
    load: async () => (await import('@codemirror/lang-html')).html()
  }),
  LanguageDescription.of({
    name: 'CSS',
    alias: ['scss', 'sass'],
    extensions: ['css', 'scss', 'sass'],
    load: async () => (await import('@codemirror/lang-css')).css()
  }),
  LanguageDescription.of({
    name: 'SQL',
    extensions: ['sql'],
    load: async () => (await import('@codemirror/lang-sql')).sql()
  }),
  LanguageDescription.of({
    name: 'XML',
    extensions: ['xml'],
    load: async () => (await import('@codemirror/lang-xml')).xml()
  }),
  LanguageDescription.of({
    name: 'YAML',
    alias: ['yml'],
    extensions: ['yaml', 'yml'],
    load: async () => (await import('@codemirror/lang-yaml')).yaml()
  }),
];

async function getEditorLanguageExtension(language: string): Promise<Extension> {
  const normalized = language.toLowerCase();
  if (normalized === 'markdown' || normalized === 'md' || normalized === 'mdx') {
    const { markdown, markdownLanguage } = await import('@codemirror/lang-markdown');
    return markdown({ base: markdownLanguage, codeLanguages: markdownCodeLanguages });
  }
  if (['javascript', 'js', 'mjs', 'cjs', 'jsx'].includes(normalized)) {
    const { javascript } = await import('@codemirror/lang-javascript');
    return javascript({ jsx: normalized === 'jsx' });
  }
  if (['typescript', 'ts', 'tsx'].includes(normalized)) {
    const { javascript } = await import('@codemirror/lang-javascript');
    return javascript({ jsx: normalized === 'tsx', typescript: true });
  }
  if (normalized === 'python' || normalized === 'py') return (await import('@codemirror/lang-python')).python();
  if (normalized === 'rust' || normalized === 'rs') return (await import('@codemirror/lang-rust')).rust();
  if (normalized === 'json' || normalized === 'jsonc') return (await import('@codemirror/lang-json')).json();
  if (normalized === 'html') return (await import('@codemirror/lang-html')).html();
  if (normalized === 'css' || normalized === 'scss' || normalized === 'sass') return (await import('@codemirror/lang-css')).css();
  if (normalized === 'sql') return (await import('@codemirror/lang-sql')).sql();
  if (normalized === 'xml') return (await import('@codemirror/lang-xml')).xml();
  if (normalized === 'yaml' || normalized === 'yml') return (await import('@codemirror/lang-yaml')).yaml();
  return [];
}

function applyMarkdownEdit(view: EditorView, action: MarkdownAction) {
  const { state } = view;
  const selection = state.selection.main;

  if (action in inlineMarkdownActions) {
    applyInlineMarkdownEdit(view, action, selection.from, selection.to);
    return;
  }

  if (action === 'heading1' || action === 'heading2' || action === 'heading3') {
    const level = Number(action.replace('heading', ''));
    applyLinePrefixEdit(view, selection.from, selection.to, '#'.repeat(level), { replaceHeading: true });
    return;
  }

  if (action === 'quote') {
    applyLinePrefixEdit(view, selection.from, selection.to, '>');
    return;
  }

  if (action === 'bulletList') {
    applyLinePrefixEdit(view, selection.from, selection.to, '-');
    return;
  }

  if (action === 'orderedList') {
    applyOrderedListEdit(view, selection.from, selection.to);
    return;
  }

  if (action === 'taskList') {
    applyLinePrefixEdit(view, selection.from, selection.to, '- [ ]');
    return;
  }

  if (action === 'codeBlock') {
    applyBlockTemplateEdit(view, selection.from, selection.to, '```text\n', '\n```', 'code');
    return;
  }

  if (action === 'link') {
    applyLinkEdit(view, selection.from, selection.to);
    return;
  }

  if (action === 'image') {
    applyImageEdit(view, selection.from, selection.to);
    return;
  }

  if (action === 'table') {
    applyBlockTemplateEdit(
      view,
      selection.from,
      selection.to,
      '',
      '',
      '| Column A | Column B |\n| --- | --- |\n| Value | Value |\n'
    );
    return;
  }

  if (action === 'formatTable') {
    applyTableEdit(view, 'format');
    return;
  }

  if (action === 'insertTableRow') {
    applyTableEdit(view, 'insertRow');
    return;
  }

  if (action === 'insertTableColumn') {
    applyTableEdit(view, 'insertColumn');
    return;
  }

  if (action === 'pasteCsvTable') {
    void pasteDelimitedTable(view);
    return;
  }

  if (action === 'divider') {
    applyBlockTemplateEdit(view, selection.from, selection.to, '\n---\n', '', '');
  }
}

function applyInlineMarkdownEdit(view: EditorView, action: MarkdownAction, from: number, to: number) {
  const config = inlineMarkdownActions[action];
  if (!config) return;

  const selectedText = from === to ? config.sample : view.state.sliceDoc(from, to);
  const insertText = `${config.open}${selectedText}${config.close}`;
  const anchor = from + config.open.length;
  const head = anchor + selectedText.length;

  view.dispatch({
    changes: { from, to, insert: insertText },
    selection: { anchor, head },
    scrollIntoView: true,
  });
}

function applyLinePrefixEdit(
  view: EditorView,
  from: number,
  to: number,
  prefix: string,
  options: { replaceHeading?: boolean } = {}
) {
  const { doc } = view.state;
  const startLine = doc.lineAt(from);
  const endLine = doc.lineAt(Math.max(from, to - 1));
  const changes = [];

  for (let number = startLine.number; number <= endLine.number; number += 1) {
    const line = doc.line(number);
    const original = line.text;
    const withoutExistingHeading = options.replaceHeading
      ? original.replace(/^\s{0,3}#{1,6}\s+/, '')
      : original;
    const content = withoutExistingHeading.trim().length ? withoutExistingHeading : placeholderForPrefix(prefix);
    changes.push({
      from: line.from,
      to: line.to,
      insert: `${prefix} ${content}`
    });
  }

  view.dispatch({
    changes,
    selection: { anchor: changes[0].from + `${prefix} `.length, head: changes[changes.length - 1].from + changes[changes.length - 1].insert.length },
    scrollIntoView: true
  });
}

function applyOrderedListEdit(view: EditorView, from: number, to: number) {
  const { doc } = view.state;
  const startLine = doc.lineAt(from);
  const endLine = doc.lineAt(Math.max(from, to - 1));
  const changes = [];

  for (let number = startLine.number; number <= endLine.number; number += 1) {
    const line = doc.line(number);
    const index = number - startLine.number + 1;
    const content = line.text.trim().length ? line.text : 'List item';
    changes.push({
      from: line.from,
      to: line.to,
      insert: `${index}. ${content.replace(/^\s*\d+\.\s+/, '')}`
    });
  }

  view.dispatch({
    changes,
    selection: { anchor: changes[0].from + 3, head: changes[changes.length - 1].from + changes[changes.length - 1].insert.length },
    scrollIntoView: true
  });
}

function applyBlockTemplateEdit(
  view: EditorView,
  from: number,
  to: number,
  before: string,
  after: string,
  fallback: string
) {
  const selectedText = from === to ? fallback : view.state.sliceDoc(from, to);
  const insertText = `${before}${selectedText}${after}`;
  const anchor = from + before.length;
  const head = anchor + selectedText.length;

  view.dispatch({
    changes: { from, to, insert: insertText },
    selection: { anchor, head },
    scrollIntoView: true
  });
}

function applyLinkEdit(view: EditorView, from: number, to: number) {
  const selectedText = from === to ? 'link text' : view.state.sliceDoc(from, to);
  const insertText = `[${selectedText}](https://)`;
  const urlStart = from + selectedText.length + 3;

  view.dispatch({
    changes: { from, to, insert: insertText },
    selection: { anchor: urlStart, head: urlStart + 'https://'.length },
    scrollIntoView: true
  });
}

function applyImageEdit(view: EditorView, from: number, to: number) {
  const selectedText = from === to ? 'image alt' : view.state.sliceDoc(from, to);
  const insertText = `![${selectedText}](./assets/image.png)`;
  const pathStart = from + selectedText.length + 4;

  view.dispatch({
    changes: { from, to, insert: insertText },
    selection: { anchor: pathStart, head: pathStart + './assets/image.png'.length },
    scrollIntoView: true
  });
}

function applyTableEdit(view: EditorView, action: 'format' | 'insertRow' | 'insertColumn') {
  const table = findCurrentMarkdownTable(view);
  if (!table) return;

  const rows = table.lines.map(parseTableRow);
  const width = Math.max(1, ...rows.map((row) => row.length));
  const normalized = rows.map((row) => normalizeTableRow(row, width));
  const activeRowIndex = Math.max(0, Math.min(table.activeLineNumber - table.startLineNumber, normalized.length - 1));
  const activeColumnIndex = findActiveTableColumn(view, table.lines[activeRowIndex], normalized[activeRowIndex].length);

  if (action === 'insertRow') {
    const blank = Array.from({ length: width }, () => '');
    normalized.splice(activeRowIndex + 1, 0, blank);
  }

  if (action === 'insertColumn') {
    normalized.forEach((row, rowIndex) => {
      row.splice(activeColumnIndex + 1, 0, rowIndex === 0 ? 'Column' : '');
    });
  }

  const markdown = formatMarkdownTable(normalized);
  view.dispatch({
    changes: { from: table.from, to: table.to, insert: markdown },
    selection: { anchor: table.from, head: table.from + markdown.length },
    scrollIntoView: true
  });
  view.focus();
}

async function pasteDelimitedTable(view: EditorView) {
  const text = await navigator.clipboard.readText();
  const rows = parseDelimitedRows(text);
  if (rows.length === 0) return;

  const markdown = formatMarkdownTable(rows);
  const selection = view.state.selection.main;
  const prefix = selection.from > 0 && view.state.sliceDoc(selection.from - 1, selection.from) !== '\n' ? '\n\n' : '';
  const suffix = selection.to < view.state.doc.length && view.state.sliceDoc(selection.to, selection.to + 1) !== '\n' ? '\n\n' : '';
  view.dispatch({
    changes: { from: selection.from, to: selection.to, insert: `${prefix}${markdown}${suffix}` },
    selection: { anchor: selection.from + prefix.length, head: selection.from + prefix.length + markdown.length },
    scrollIntoView: true
  });
  view.focus();
}

function placeholderForPrefix(prefix: string) {
  if (prefix.startsWith('#')) return 'Heading';
  if (prefix === '>') return 'Quote';
  if (prefix === '- [ ]') return 'Task item';
  return 'List item';
}

function findCurrentMarkdownTable(view: EditorView) {
  const { doc, selection } = view.state;
  const activeLine = doc.lineAt(selection.main.head);
  if (!isTableRow(activeLine.text)) return null;

  let start = activeLine.number;
  while (start > 1 && isTableRow(doc.line(start - 1).text)) {
    start -= 1;
  }

  let end = activeLine.number;
  while (end < doc.lines && isTableRow(doc.line(end + 1).text)) {
    end += 1;
  }

  if (end - start < 1) return null;
  const startLine = doc.line(start);
  const endLine = doc.line(end);
  return {
    from: startLine.from,
    to: endLine.to,
    startLineNumber: start,
    activeLineNumber: activeLine.number,
    lines: Array.from({ length: end - start + 1 }, (_, index) => doc.line(start + index).text)
  };
}

function isTableRow(line: string) {
  const trimmed = line.trim();
  return trimmed.startsWith('|') && trimmed.endsWith('|') && trimmed.includes('|');
}

function parseTableRow(line: string) {
  const trimmed = line.trim();
  const withoutEdges = trimmed.replace(/^\|/, '').replace(/\|$/, '');
  return splitMarkdownTableRow(withoutEdges).map((cell) => {
    const normalized = cell.trim();
    return /^:?-{3,}:?$/.test(normalized) ? '---' : normalized;
  });
}

function splitMarkdownTableRow(row: string) {
  const cells: string[] = [];
  let current = '';
  let escaped = false;
  for (const char of row) {
    if (escaped) {
      current += char;
      escaped = false;
      continue;
    }
    if (char === '\\') {
      current += char;
      escaped = true;
      continue;
    }
    if (char === '|') {
      cells.push(current);
      current = '';
      continue;
    }
    current += char;
  }
  cells.push(current);
  return cells;
}

function normalizeTableRow(row: string[], width: number) {
  return Array.from({ length: width }, (_, index) => row[index] ?? '');
}

function findActiveTableColumn(view: EditorView, lineText: string, width: number) {
  const line = view.state.doc.lineAt(view.state.selection.main.head);
  const offset = view.state.selection.main.head - line.from;
  let column = 0;
  let escaped = false;
  for (let index = 0; index < Math.min(offset, lineText.length); index += 1) {
    const char = lineText[index];
    if (escaped) {
      escaped = false;
      continue;
    }
    if (char === '\\') {
      escaped = true;
      continue;
    }
    if (char === '|') {
      column += 1;
    }
  }
  return Math.min(Math.max(0, column - 1), Math.max(0, width - 1));
}

function formatMarkdownTable(rows: string[][]) {
  const width = Math.max(1, ...rows.map((row) => row.length));
  const normalized = rows.map((row) => normalizeTableRow(row, width));
  if (normalized.length === 0) return '';

  const header = normalized[0].map((cell, index) => {
    const value = cell && cell !== '---' ? cell : `Column ${index + 1}`;
    return value;
  });
  const body = normalized.slice(1).filter((row, index) => index !== 0 || !isDividerRow(row));
  const allRows = [header, ...body];
  const widths = Array.from({ length: width }, (_, column) => {
    const maxCell = Math.max(...allRows.map((row) => displayCell(row[column]).length), 3);
    return maxCell;
  });
  const divider = widths.map((size) => '-'.repeat(Math.max(3, size)));

  return [header, divider, ...body]
    .map((row) => `| ${row.map((cell, index) => displayCell(cell).padEnd(widths[index], ' ')).join(' | ')} |`)
    .join('\n');
}

function isDividerRow(row: string[]) {
  return row.every((cell) => /^:?-{3,}:?$/.test(cell.trim()));
}

function displayCell(value: string) {
  return value.trim().replace(/\n/g, '<br>').replace(/\|/g, '\\|');
}

function parseDelimitedRows(text: string) {
  const lines = text.trim().split(/\r?\n/).filter((line) => line.trim().length > 0);
  if (lines.length === 0) return [];
  const delimiter = text.includes('\t') ? '\t' : ',';
  return lines.map((line) => splitDelimitedLine(line, delimiter).map((cell) => cell.trim()));
}

function splitDelimitedLine(line: string, delimiter: string) {
  if (delimiter === '\t') return line.split('\t');

  const cells: string[] = [];
  let current = '';
  let inQuotes = false;
  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];
    const next = line[index + 1];
    if (char === '"' && inQuotes && next === '"') {
      current += '"';
      index += 1;
      continue;
    }
    if (char === '"') {
      inQuotes = !inQuotes;
      continue;
    }
    if (char === delimiter && !inQuotes) {
      cells.push(current);
      current = '';
      continue;
    }
    current += char;
  }
  cells.push(current);
  return cells;
}

function ToolbarButton({
  icon,
  label,
  title,
  onClick
}: {
  icon: ReactNode;
  label?: string;
  title: string;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className="flex h-7 min-w-7 shrink-0 items-center justify-center gap-1 rounded-full px-1.5 text-[11px] font-medium transition-colors hover:bg-bg-hover hover:text-text-primary"
      title={title}
    >
      {icon}
      {label && <span className="sr-only">{label}</span>}
    </button>
  );
}

function ToolbarDivider() {
  return <div className="mx-0.5 h-4 w-px shrink-0 bg-border-subtle" />;
}

function FindReplacePanel({
  locale,
  query,
  replaceText,
  matchCase,
  matchCount,
  activeIndex,
  canReplace,
  onQueryChange,
  onReplaceTextChange,
  onMatchCaseChange,
  onPrevious,
  onNext,
  onReplaceCurrent,
  onReplaceAll,
  onClose
}: {
  locale: 'zh' | 'en';
  query: string;
  replaceText: string;
  matchCase: boolean;
  matchCount: number;
  activeIndex: number;
  canReplace: boolean;
  onQueryChange: (value: string) => void;
  onReplaceTextChange: (value: string) => void;
  onMatchCaseChange: (value: boolean) => void;
  onPrevious: () => void;
  onNext: () => void;
  onReplaceCurrent: () => void;
  onReplaceAll: () => void;
  onClose: () => void;
}) {
  const matchLabel = !query
    ? (locale === 'zh' ? '输入关键词' : 'Type to find')
    : matchCount > 0
      ? `${activeIndex + 1}/${matchCount}`
      : (locale === 'zh' ? '无匹配' : 'No matches');

  return (
    <div className="absolute right-5 top-5 z-30 w-[min(30rem,calc(100%-2.5rem))] rounded-md border border-border-subtle bg-bg-base shadow-xl">
      <div className="flex items-center gap-2 border-b border-border-subtle px-3 py-2">
        <Search size={14} className="shrink-0 text-accent" />
        <input
          value={query}
          onChange={(event) => onQueryChange(event.target.value)}
          autoFocus
          placeholder={locale === 'zh' ? '查找当前文档' : 'Find in current document'}
          className="min-w-0 flex-1 bg-transparent text-[13px] text-text-primary outline-none placeholder:text-text-tertiary"
        />
        <span className="shrink-0 rounded border border-border-subtle px-1.5 py-0.5 text-[10px] text-text-tertiary">
          {matchLabel}
        </span>
        <button onClick={onPrevious} disabled={!matchCount} className="rounded p-1 text-text-tertiary hover:bg-bg-hover hover:text-text-primary disabled:opacity-40">
          <ChevronUp size={14} />
        </button>
        <button onClick={onNext} disabled={!matchCount} className="rounded p-1 text-text-tertiary hover:bg-bg-hover hover:text-text-primary disabled:opacity-40">
          <ChevronDown size={14} />
        </button>
        <button onClick={onClose} className="rounded p-1 text-text-tertiary hover:bg-bg-hover hover:text-text-primary">
          <X size={14} />
        </button>
      </div>

      <div className="space-y-2 px-3 py-3">
        <label className="flex items-center gap-2 text-[12px] text-text-secondary">
          <input
            type="checkbox"
            checked={matchCase}
            onChange={(event) => onMatchCaseChange(event.target.checked)}
            className="size-3 accent-[var(--color-accent)]"
          />
          {locale === 'zh' ? '区分大小写' : 'Match case'}
        </label>

        <div className="flex items-center gap-2">
          <Replace size={14} className="shrink-0 text-text-tertiary" />
          <input
            value={replaceText}
            onChange={(event) => onReplaceTextChange(event.target.value)}
            disabled={!canReplace}
            placeholder={canReplace ? (locale === 'zh' ? '替换为' : 'Replace with') : (locale === 'zh' ? '只读文件不可替换' : 'Read-only file')}
            className="min-w-0 flex-1 rounded-md border border-border-subtle bg-bg-panel px-2 py-1.5 text-[12px] text-text-primary outline-none placeholder:text-text-tertiary focus:border-accent disabled:opacity-50"
          />
          <button
            onClick={onReplaceCurrent}
            disabled={!canReplace || !matchCount}
            className="rounded-md border border-border-subtle bg-bg-panel px-2 py-1.5 text-[12px] font-medium text-text-secondary hover:bg-bg-hover hover:text-text-primary disabled:opacity-40"
          >
            {locale === 'zh' ? '替换' : 'Replace'}
          </button>
          <button
            onClick={onReplaceAll}
            disabled={!canReplace || !matchCount}
            className="rounded-md bg-accent px-2 py-1.5 text-[12px] font-medium text-white hover:bg-accent/90 disabled:opacity-40"
          >
            {locale === 'zh' ? '全部' : 'All'}
          </button>
        </div>
      </div>
    </div>
  );
}

function findDocumentMatches(content: string, query: string, matchCase: boolean): FindMatch[] {
  if (!query) return [];
  const haystack = matchCase ? content : content.toLowerCase();
  const needle = matchCase ? query : query.toLowerCase();
  if (!needle) return [];

  const matches: FindMatch[] = [];
  let from = 0;
  while (from <= haystack.length) {
    const index = haystack.indexOf(needle, from);
    if (index === -1) break;
    matches.push({ from: index, to: index + query.length });
    from = index + Math.max(needle.length, 1);
  }
  return matches;
}

function normalizeMatchIndex(index: number, length: number) {
  if (length <= 0) return 0;
  return ((index % length) + length) % length;
}

function fileNameWithoutExtension(path: string) {
  const name = path.split(/[\\/]/).pop() ?? '';
  return name.replace(/\.[^.]+$/, '').trim();
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
