import CodeMirror, { type ReactCodeMirrorRef } from '@uiw/react-codemirror';
import type { Extension } from '@codemirror/state';
import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { useStore } from '../store';
import { cn, getErrorMessage } from '../lib/utils';
import { EditorView, keymap } from '@codemirror/view';
import { highlightSelectionMatches } from '@codemirror/search';
import {
  Bot,
  Check,
  Copy,
  FileText,
  Undo2,
  X
} from 'lucide-react';
import { askAI, isAiAbortError, modifyTextWithAI, sanitizeAiError } from '../lib/ai';
import { EditorState } from '@codemirror/state';
import { contextDetail, requestEditableAiContext } from '../lib/aiContext';
import { importMarkdownAsset } from '../lib/fs';
import { emitAiPanelTab, emitAiSelection, listenEditorCommand } from '../lib/appEvents';
import { isTauriRuntime, listen } from '../lib/tauriRuntime';
import { MARKDOWN_COMMAND_SHORTCUTS } from '../lib/markdownCommands';
import { FindReplacePanel } from './FindReplacePanel';
import { InlineSelectionToolbar } from './InlineSelectionToolbar';
import { MarkdownToolbar } from './MarkdownToolbar';
import { findDocumentMatches, normalizeMatchIndex } from './editorFind';
import { getEditorLanguageExtension } from './editorLanguage';
import { applyMarkdownEdit, fileNameWithoutExtension, pickAndInsertAsset } from './markdownEditorActions';
import { InlineDraftCard, formatInlineAnswerForMarkdown, getActionRunningText } from './EditorInlineAi';
import type { MarkdownAction, TransformAction, InsightAction } from './editorPaneTypes';
import { createWysiwygExtension } from '../features/wysiwyg';

type DragDropPayload = {
  paths?: string[];
  position?: { x: number; y: number };
};

const imageExtensionPattern = /\.(png|jpe?g|gif|webp|svg|bmp|avif)$/i;

function shortcutToCodeMirrorKey(shortcut: string) {
  return shortcut.replace('Cmd/Ctrl', 'Mod');
}

export function EditorPane() {
  const {
    activeFile,
    activeFileContent,
    setActiveFileContent,
    viewMode,
    isDarkMode,
    locale,
    imageInsertMode,
    setImageInsertMode,
    markdownToolbarPrefs,
    setMarkdownToolbarPrefs,
    editorSettings,
    splitScrollSync,
    pendingEditorLine,
    setPendingEditorLine,
    setCurrentEditorLine,
    setEditorSelection,
    editorSelection,
    aiConfig,
    editorAiPrompts
  } = useStore();
  const editorRef = useRef<ReactCodeMirrorRef>(null);
  const syncingFromPreviewRef = useRef(false);
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
  const wysiwygExtension = useMemo<Extension>(
    () => viewMode === 'wysiwyg' && isMarkdownDocument
      ? createWysiwygExtension({ documentPath: activeFile?.path ?? '', locale, imageInsertMode })
      : [],
    [activeFile?.path, imageInsertMode, isMarkdownDocument, locale, viewMode]
  );
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

    if ((action === 'image' || action === 'attachment') && activeFile?.path) {
      void pickAndInsertAsset(view, action, activeFile.path, imageInsertMode, locale, setInlineStatus);
      view.focus();
      return;
    }

    applyMarkdownEdit(view, action);
    view.focus();
  }, [activeFile?.path, isMarkdownDocument, isReadOnly, locale]);

  const runMarkdownShortcut = useCallback((action: MarkdownAction) => {
    if (!isMarkdownDocument || isReadOnly) return false;
    const view = editorRef.current?.view;
    if (!view) return false;
    if (action === 'image' || action === 'attachment') {
      if (activeFile?.path) void pickAndInsertAsset(view, action, activeFile.path, imageInsertMode, locale, setInlineStatus);
      return true;
    }
    applyMarkdownEdit(view, action);
    return true;
  }, [activeFile?.path, imageInsertMode, isMarkdownDocument, isReadOnly, locale]);

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
    ...Object.entries(MARKDOWN_COMMAND_SHORTCUTS).map(([action, shortcut]) => ({
      key: shortcutToCodeMirrorKey(shortcut),
      run: () => runMarkdownShortcut(action as MarkdownAction)
    })),
  ]), [openFindPanel, runMarkdownShortcut]);

  const handleRewriteAction = async () => {
    if (!isMarkdownDocument || isReadOnly) {
      setInlineStatus(locale === 'zh' ? '当前文件不可直接 AI 优化' : 'This file cannot be edited with AI inline.');
      window.setTimeout(() => setInlineStatus(''), 2200);
      return;
    }

    if (!editorSelection?.text.trim()) {
      setInlineStatus(locale === 'zh' ? '请先选择一段文字，再使用 AI 优化。' : 'Select text first, then use AI Suggest.');
      window.setTimeout(() => setInlineStatus(''), 2200);
      return;
    }

    await runInlineAiTransform('polish');
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
    const contextResult = await requestEditableAiContext(
      locale === 'zh' ? '确认 AI 修改上下文' : 'Confirm AI edit context',
      locale === 'zh' ? 'AI 将只接收当前选区和对应指令，生成结果不会自动写入正文。' : 'AI will receive only the current selection and instruction. The result will not be applied automatically.',
      [
        {
          label: locale === 'zh' ? '选区内容' : 'Selected text',
          detail: contextDetail(originalSelection.text),
          content: originalSelection.text,
          editable: true,
          removable: false
        },
        {
          label: locale === 'zh' ? '指令' : 'Instruction',
          detail: prompt,
          content: prompt,
          editable: true,
          removable: false
        }
      ]
    );
    if (!contextResult.confirmed) {
      setInlineStatus('');
      return;
    }
    const editedSelection = contextResult.items[0]?.content ?? originalSelection.text;
    const editedPrompt = contextResult.items[1]?.content ?? prompt;
    inlineAbortRef.current?.abort();
    const abortController = new AbortController();
    inlineAbortRef.current = abortController;
    setInlineStatus(getActionRunningText(kind, locale));

    try {
      const proposed = await modifyTextWithAI(aiConfig, editedSelection, editedPrompt, abortController.signal);
      if (abortController.signal.aborted) return;
      setInlineDraft({
        from: originalSelection.from,
        to: originalSelection.to,
        original: originalSelection.text,
        proposed,
        sourcePath: activeFile.path,
        action: kind
      });
    } catch (error: unknown) {
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
    const contextResult = await requestEditableAiContext(
      locale === 'zh' ? '确认 AI 阅读上下文' : 'Confirm AI reading context',
      locale === 'zh' ? 'AI 将只接收当前选区和选区指令。' : 'AI will receive only the selected text and selection instruction.',
      [
        {
          label: locale === 'zh' ? '选区内容' : 'Selected text',
          detail: contextDetail(editorSelection.text),
          content: editorSelection.text,
          editable: true,
          removable: false
        },
        {
          label: locale === 'zh' ? '指令' : 'Instruction',
          detail: editorAiPrompts[kind],
          content: editorAiPrompts[kind],
          editable: true,
          removable: false
        }
      ]
    );
    if (!contextResult.confirmed) return;
    const editedSelection = contextResult.items[0]?.content ?? editorSelection.text;
    const editedPrompt = contextResult.items[1]?.content ?? editorAiPrompts[kind];
    inlineAbortRef.current?.abort();
    const abortController = new AbortController();
    inlineAbortRef.current = abortController;
    setInlineStatus(getActionRunningText(kind, locale));
    try {
      const answer = await askAI(aiConfig, editedPrompt, editedSelection, abortController.signal);
      if (abortController.signal.aborted) return;
      setInlineAnswer({
        action: kind,
        answer,
        selectionText: editedSelection,
        selectionTo: editorSelection.to
      });
      setInlineStatus('');
    } catch (error: unknown) {
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

  const addSelectionToAiChat = () => {
    const text = editorSelection?.text?.trim();
    if (!text) return;
    emitAiSelection({ text, source: 'editor' });
    emitAiPanelTab('ai');
    if (!useStore.getState().aiPanelOpen) {
      useStore.getState().toggleAiPanel();
    }
    setInlineStatus(locale === 'zh' ? '已添加到 AI 聊天输入。' : 'Added to AI chat input.');
    window.setTimeout(() => setInlineStatus(''), 1600);
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
      const asset = await importMarkdownAsset(activeFile.path, sourcePath, imageInsertMode);
      const selection = view.state.selection.main;
      const altText = fileNameWithoutExtension(sourcePath) || 'image';
      const markdown = `![${altText}](${asset.relativeSrc})`;
      view.dispatch({
        changes: { from: selection.from, to: selection.to, insert: markdown },
        selection: { anchor: selection.from, head: selection.from + markdown.length },
        scrollIntoView: true
      });
      setInlineStatus(locale === 'zh'
        ? `已插入图片（${imageInsertMode === 'embed' ? '内嵌' : 'assets'}）`
        : `Image inserted (${imageInsertMode === 'embed' ? 'embedded' : 'assets'})`);
      window.setTimeout(() => setInlineStatus(''), 2200);
      view.focus();
    } catch (error: unknown) {
      setInlineStatus(getErrorMessage(error));
      window.setTimeout(() => setInlineStatus(''), 3500);
    }
  }, [activeFile?.path, imageInsertMode, isMarkdownDocument, isReadOnly, locale]);

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
    if (!isTauriRuntime()) return;

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

  useEffect(() => {
    if (!splitScrollSync || viewMode !== 'split') return;
    const view = editorRef.current?.view;
    if (!view) return;
    const scroller = view.scrollDOM;
    if (!scroller) return;

    const onScroll = () => {
      if (syncingFromPreviewRef.current) {
        syncingFromPreviewRef.current = false;
        return;
      }
      const max = scroller.scrollHeight - scroller.clientHeight;
      const ratio = max > 0 ? scroller.scrollTop / max : 0;
      window.dispatchEvent(new CustomEvent('inkstack:split-scroll-sync', {
        detail: { source: 'editor', ratio }
      }));
    };

    scroller.addEventListener('scroll', onScroll, { passive: true });
    return () => scroller.removeEventListener('scroll', onScroll);
  }, [splitScrollSync, viewMode, activeFile?.path]);

  useEffect(() => {
    if (!splitScrollSync || viewMode !== 'split') return;
    const onSync = (event: Event) => {
      const detail = (event as CustomEvent<{ source: 'preview' | 'editor'; ratio: number }>).detail;
      if (!detail || detail.source !== 'preview') return;
      const view = editorRef.current?.view;
      const scroller = view?.scrollDOM;
      if (!scroller) return;
      const max = scroller.scrollHeight - scroller.clientHeight;
      syncingFromPreviewRef.current = true;
      scroller.scrollTop = Math.max(0, Math.min(max, detail.ratio * max));
    };
    window.addEventListener('inkstack:split-scroll-sync', onSync as EventListener);
    return () => window.removeEventListener('inkstack:split-scroll-sync', onSync as EventListener);
  }, [splitScrollSync, viewMode, activeFile?.path]);

  if (!activeFile) {
    return (
      <div className={cn("flex-1 h-full flex flex-col items-center justify-center text-text-tertiary bg-bg-base", (viewMode === 'read' || viewMode === 'code') && 'hidden')}>
        <div className="text-4xl mb-4 font-mono font-bold opacity-20 tracking-tighter">InkStack</div>
        <p className="text-[13px]">{locale === 'zh' ? '请在左侧选择 Markdown、代码或文本文件' : 'Select a Markdown, code, or text file to start'}</p>
      </div>
    );
  }

  // A custom theme base to merge with tailwind typography styles
  const lightTheme = EditorView.theme({
    "&": { backgroundColor: "transparent" },
    ".cm-content": {
      fontFamily: "var(--font-editor, var(--font-mono, monospace))",
      fontSize: "var(--inkstack-editor-font-size)",
      lineHeight: "var(--inkstack-editor-line-height)"
    },
    ".cm-line": { padding: "0" },
    ".cm-gutters": {
      backgroundColor: "transparent",
      borderRight: "none",
      paddingRight: "12px"
    },
    ".cm-gutter.cm-lineNumbers .cm-gutterElement": {
      paddingRight: "8px",
      color: "var(--color-text-tertiary)"
    },
    ".cm-scroller": {
      overflow: "auto",
      scrollbarWidth: "none",
      msOverflowStyle: "none"
    },
    ".cm-scroller::-webkit-scrollbar": {
      display: "none"
    }
  });
  const editorStyle = {
    '--inkstack-editor-width': `${editorSettings.width}px`,
    '--inkstack-editor-font-size': `${editorSettings.fontSize}px`,
    '--inkstack-editor-line-height': String(editorSettings.lineHeight)
  } as CSSProperties;

  return (
    <div
      style={editorStyle}
      className={cn(
        "inkstack-editor-surface flex-1 h-full overflow-hidden flex flex-col bg-bg-base relative",
        viewMode === 'wysiwyg' && 'inkstack-wysiwyg-surface',
        (viewMode === 'read' || viewMode === 'code') && 'hidden'
      )}
    >
      <CodeMirror
        ref={editorRef}
        value={activeFileContent}
        onChange={onChange}
        theme={isDarkMode ? 'dark' : 'light'}
        extensions={[
          languageExtension,
          wysiwygExtension,
          EditorView.lineWrapping,
          highlightSelectionMatches(),
          lightTheme,
          EditorState.readOnly.of(isReadOnly),
          EditorView.editable.of(!isReadOnly),
          markdownKeymap,
          selectionTracker
        ]}
        className="h-full editor-scroll"
        height="100%"
        basicSetup={{
          lineNumbers: viewMode !== 'wysiwyg',
          foldGutter: viewMode !== 'wysiwyg',
          highlightActiveLine: true,
          dropCursor: true,
          crosshairCursor: true,
        }}
      />

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
        <InlineSelectionToolbar
          locale={locale}
          canEditSelection={isMarkdownDocument && !isReadOnly}
          onCopy={copySelection}
          onTransform={(action) => void runInlineAiTransform(action)}
          onInsight={(action) => void askSelection(action)}
          onAddToChat={addSelectionToAiChat}
        />
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
        <MarkdownToolbar
          locale={locale}
          toolbarPrefs={markdownToolbarPrefs}
          onToolbarPrefsChange={setMarkdownToolbarPrefs}
          onAction={applyMarkdownAction}
        />
      )}
    </div>
  );
}
