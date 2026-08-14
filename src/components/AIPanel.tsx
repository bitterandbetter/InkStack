import { useState, useRef, useEffect, useMemo, type MouseEvent as ReactMouseEvent } from 'react';
import { Braces, ListTree, Sparkles, X } from 'lucide-react';
import { useStore } from '../store';
import {
  AiConfig,
  applyProviderPreset,
  getProviderPreset,
  getProviderModels,
  isAiAbortError,
  modifyTextWithAI,
  sanitizeAiError,
  streamAI,
  testAiModel
} from '../lib/ai';
import { CodeBlockInfo, codeFileToBlock, parseCodeBlocks, parseOutline, parseRawCodeOutline } from '../lib/outline';
import { contextDetail, requestEditableAiContext } from '../lib/aiContext';
import { listenAiPanelTab, listenAiSelection, type AiPanelTab } from '../lib/appEvents';
import {
  readTextFile,
  searchTextFiles,
  type MarkdownSearchResult
} from '../lib/fs';
import { openTextPath, openWorkspacePath } from '../lib/desktopActions';
import {
  codeAiConfirmTitle,
  codeAiPrompt,
  getCodeBlockContentRange,
  lineNumberAtOffset,
  type ExtractedCodeBlock
} from './aiCodeHelpers';
import type { AiSelectionAttachment, AiWorkspaceContext, Message } from './aiPanelTypes';
import {
  buildAcceptedRewriteText,
  buildLineDiff,
  buildRewriteDiff,
  buildSafeLineDiff,
  getDefaultAcceptedRewriteChunkIds,
  getFirstAcceptedRewriteLine,
  replaceProposedChunk,
  type CodeApplyDraft,
  type RewriteDraft
} from './aiDiff';
import { CodeBlocksPanel } from './CodeBlocksPanel';
import { AIPanelChatTab } from './AIPanelChatTab';
import { AIPanelSettingsTab } from './AIPanelSettingsTab';
import { AIPanelOutlineTab, renderOutlineIcon } from './AIPanelOutlineTab';
import { TabButton } from './AIPanelChrome';
import {
  AI_ACTIVE_CONTEXT_CHARS,
  AI_CONTEXT_DOCUMENT_CHARS,
  truncateContext
} from './aiPanelHelpers';

const AI_PANEL_WIDTH_STORAGE_KEY = 'inkstack.ai.panel.width.v1';
const AI_PANEL_MIN_WIDTH = 320;
const AI_PANEL_MAX_WIDTH = 760;

export function AIPanel() {
  const {
    aiPanelOpen,
    aiPanelTab,
    setAiPanelTab,
    toggleAiPanel,
    rootPath,
    activeFileContent,
    activeFile,
    currentEditorLine,
    locale,
    aiConfig,
    setAiConfig,
    setActiveFileContent,
    replaceActiveFileRange,
    setPendingEditorLine,
    setViewMode,
    editorSelection,
    editorAiPrompts,
    setEditorAiPrompts,
    aiContextPreferences,
    setAiContextPreferences,
    autoSaveEnabled
  } = useStore();
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const [draftConfig, setDraftConfig] = useState<AiConfig>(aiConfig);
  const [draftPrompts, setDraftPrompts] = useState(editorAiPrompts);
  const [draftContextPreferences, setDraftContextPreferences] = useState(aiContextPreferences);
  const [settingsSaved, setSettingsSaved] = useState(false);
  const [modelTest, setModelTest] = useState<string>('');
  const [isTestingModel, setIsTestingModel] = useState(false);
  const [rewriteDraft, setRewriteDraft] = useState<RewriteDraft | null>(null);
  const [codeApplyDraft, setCodeApplyDraft] = useState<CodeApplyDraft | null>(null);
  const [codeLanguageFilter, setCodeLanguageFilter] = useState('all');
  const [codeQuery, setCodeQuery] = useState('');
  const [collapsedCodeBlockIds, setCollapsedCodeBlockIds] = useState<string[]>([]);
  const [copiedCodeBlockId, setCopiedCodeBlockId] = useState<string | null>(null);
  const [copiedAllCodeBlocks, setCopiedAllCodeBlocks] = useState(false);
  const [contextQuery, setContextQuery] = useState('');
  const [contextResults, setContextResults] = useState<MarkdownSearchResult[]>([]);
  const [selectedContexts, setSelectedContexts] = useState<AiWorkspaceContext[]>([]);
  const [selectionAttachments, setSelectionAttachments] = useState<AiSelectionAttachment[]>([]);
  const [includeActiveFileContext, setIncludeActiveFileContext] = useState(false);
  const [contextDrawerOpen, setContextDrawerOpen] = useState(false);
  const [isSearchingContext, setIsSearchingContext] = useState(false);
  const [contextMessage, setContextMessage] = useState('');
  const [panelWidth, setPanelWidth] = useState(() => {
    const saved = Number(localStorage.getItem(AI_PANEL_WIDTH_STORAGE_KEY));
    if (!Number.isFinite(saved)) return 352;
    return Math.max(AI_PANEL_MIN_WIDTH, Math.min(AI_PANEL_MAX_WIDTH, saved));
  });
  const endRef = useRef<HTMLDivElement>(null);
  const messageScrollRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLElement>(null);
  const aiAbortRef = useRef<AbortController | null>(null);
  useEffect(() => {
    const scrollElement = messageScrollRef.current;
    if (scrollElement) {
      scrollElement.scrollTo({
        top: scrollElement.scrollHeight,
        behavior: 'smooth'
      });
    }
  }, [messages]);

  useEffect(() => {
    localStorage.setItem(AI_PANEL_WIDTH_STORAGE_KEY, String(panelWidth));
  }, [panelWidth]);

  useEffect(() => {
    setDraftConfig(aiConfig);
  }, [aiConfig]);

  useEffect(() => {
    setDraftPrompts(editorAiPrompts);
  }, [editorAiPrompts]);

  useEffect(() => {
    setDraftContextPreferences(aiContextPreferences);
  }, [aiContextPreferences]);

  useEffect(() => {
    if (!activeFile || !activeFileContent.trim()) {
      setIncludeActiveFileContext(false);
      return;
    }
    setIncludeActiveFileContext(aiContextPreferences.includeActiveFileByDefault);
  }, [activeFile?.path, activeFileContent, aiContextPreferences.includeActiveFileByDefault]);

  useEffect(() => listenAiPanelTab(setAiPanelTab), [setAiPanelTab]);

  useEffect(() => listenAiSelection((payload) => {
    const text = payload.text.trim();
    if (!text) return;
    setSelectionAttachments((current) => {
      const exists = current.find((item) => item.text === text);
      if (exists) return current;
      return [...current, {
        id: `sel-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        text: truncateContext(text, 8000),
        source: payload.source
      }];
    });
  }), []);

  useEffect(() => {
    let cancelled = false;
    const query = contextQuery.trim();
    if (query.length < 2 || !rootPath) {
      setContextResults([]);
      setIsSearchingContext(false);
      return;
    }

    setIsSearchingContext(true);
    const timer = window.setTimeout(() => {
      void searchTextFiles(query)
        .then((results) => {
          if (!cancelled) setContextResults(results.slice(0, 12));
        })
        .catch((error) => {
          console.error('AI context search failed', error);
          if (!cancelled) {
            setContextResults([]);
            setContextMessage(sanitizeAiError(error, locale));
          }
        })
        .finally(() => {
          if (!cancelled) setIsSearchingContext(false);
        });
    }, 180);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [contextQuery, rootPath, locale]);

  const codeBlocks = useMemo(() => {
    if (activeFile && !activeFile.isMarkdown) {
      return [codeFileToBlock(activeFileContent, activeFile.language || 'text')];
    }
    return parseCodeBlocks(activeFileContent);
  }, [activeFile, activeFileContent]);

  const outline = useMemo(() => {
    if (activeFile && !activeFile.isMarkdown) {
      return parseRawCodeOutline(activeFileContent, activeFile.language || 'text');
    }
    return parseOutline(activeFileContent);
  }, [activeFile, activeFileContent]);

  const codeLanguages = useMemo(() => Array.from(new Set(
    codeBlocks.map((block) => block.language || 'text')
  )).sort(), [codeBlocks]);

  const filteredCodeBlocks = useMemo(() => codeBlocks.filter((block) => {
    const languageMatches = codeLanguageFilter === 'all' || block.language === codeLanguageFilter;
    const query = codeQuery.trim().toLowerCase();
    const queryMatches = !query
      || block.code.toLowerCase().includes(query)
      || (block.language || 'text').toLowerCase().includes(query)
      || block.symbols.some((symbol) => symbol.text.toLowerCase().includes(query));
    return languageMatches && queryMatches;
  }), [codeBlocks, codeLanguageFilter, codeQuery]);

  const activePreset = getProviderPreset(aiConfig.providerId);
  const draftModels = getProviderModels(draftConfig.providerId);
  const selectedContextIds = useMemo(() => new Set(selectedContexts.map((context) => context.path)), [selectedContexts]);

  if (!aiPanelOpen) return null;

  const updateDraftConfig = (patch: Partial<AiConfig>) => {
    setDraftConfig((current) => ({ ...current, ...patch }));
    setSettingsSaved(false);
  };

  const handlePresetChange = (presetId: string) => {
    setDraftConfig((current) => applyProviderPreset(current, presetId));
    setSettingsSaved(false);
  };

  const handleSaveSettings = () => {
    setAiConfig(draftConfig);
    setEditorAiPrompts(draftPrompts);
    setAiContextPreferences(draftContextPreferences);
    setSettingsSaved(true);
  };

  const handleTestModel = async () => {
    if (isTestingModel) return;
    setIsTestingModel(true);
    setModelTest(locale === 'zh' ? '正在从 Tauri 后端测试所选模型...' : 'Testing selected model from the Tauri backend...');
    try {
      const result = await testAiModel(draftConfig);
      if (!result.ok) {
        setModelTest(`${locale === 'zh' ? '测试失败' : 'Test failed'}: ${sanitizeAiError(result.error ?? 'Unknown error', locale)}`);
        return;
      }

      const responseModel = result.responseModel || (locale === 'zh' ? '接口未返回模型字段' : 'No model field returned');
      const answer = result.answer || (locale === 'zh' ? '无自报内容' : 'No self-report');
      setModelTest(
        locale === 'zh'
          ? `请求模型：${result.requestedModel}\n接口返回：${responseModel}\n模型自报：${answer}`
          : `Requested: ${result.requestedModel}\nAPI returned: ${responseModel}\nSelf-report: ${answer}`
      );
    } catch (error: unknown) {
      setModelTest(`${locale === 'zh' ? '测试失败' : 'Test failed'}: ${sanitizeAiError(error, locale)}`);
    } finally {
      setIsTestingModel(false);
    }
  };

  const handleAddWorkspaceContext = async (result: MarkdownSearchResult) => {
    if (selectedContextIds.has(result.path)) return;
    if (selectedContexts.length >= aiContextPreferences.maxWorkspaceContexts) {
      setContextMessage(locale === 'zh'
        ? `最多添加 ${aiContextPreferences.maxWorkspaceContexts} 个上下文文档。`
        : `Add up to ${aiContextPreferences.maxWorkspaceContexts} context documents.`);
      return;
    }

    try {
      setContextMessage(locale === 'zh' ? '正在读取上下文文档...' : 'Reading context document...');
      const document = await readTextFile(result.path);
      setSelectedContexts((current) => [
        ...current,
        {
          id: result.path,
          name: result.name,
          path: result.path,
          relativePath: result.relativePath,
          line: result.line,
          snippet: result.snippet,
          content: truncateContext(document.content, AI_CONTEXT_DOCUMENT_CHARS)
        }
      ]);
      setContextMessage('');
    } catch (error) {
      setContextMessage(`${locale === 'zh' ? '读取上下文失败' : 'Failed to read context'}: ${sanitizeAiError(error, locale)}`);
    }
  };

  const handleRemoveWorkspaceContext = (id: string) => {
    setSelectedContexts((current) => current.filter((context) => context.id !== id));
  };

  const handleRemoveSelectionAttachment = (id: string) => {
    setSelectionAttachments((current) => current.filter((item) => item.id !== id));
  };


  const cancelAiRequest = () => {
    aiAbortRef.current?.abort();
    aiAbortRef.current = null;
    setIsTyping(false);
    setMessages((prev) => [...prev, {
      role: 'assistant',
      content: locale === 'zh' ? '已取消 AI 请求。' : 'AI request cancelled.'
    }]);
  };

  const runAiRequest = async (request: (signal: AbortSignal) => Promise<string>) => {
    aiAbortRef.current?.abort();
    const abortController = new AbortController();
    aiAbortRef.current = abortController;
    try {
      const result = await request(abortController.signal);
      if (abortController.signal.aborted) return null;
      return result;
    } catch (error: unknown) {
      if (isAiAbortError(error)) return null;
      return `${locale === 'zh' ? 'AI 请求失败' : 'AI request failed'}: ${sanitizeAiError(error, locale)}`;
    } finally {
      if (aiAbortRef.current === abortController) {
        aiAbortRef.current = null;
      }
    }
  };

  const runAiStreamRequest = async (
    request: (signal: AbortSignal, onDelta: (delta: string, fullText: string) => void) => Promise<string>,
    onDelta: (delta: string, fullText: string) => void
  ) => {
    aiAbortRef.current?.abort();
    const abortController = new AbortController();
    aiAbortRef.current = abortController;
    try {
      const result = await request(abortController.signal, onDelta);
      if (abortController.signal.aborted) return null;
      return result;
    } catch (error: unknown) {
      if (isAiAbortError(error)) return null;
      return `${locale === 'zh' ? 'AI 请求失败' : 'AI request failed'}: ${sanitizeAiError(error, locale)}`;
    } finally {
      if (aiAbortRef.current === abortController) {
        aiAbortRef.current = null;
      }
    }
  };

  const handleSend = async () => {
    const trimmedInput = input.trim();
    if (!trimmedInput || isTyping) return;
    
    if (input.startsWith('/rewrite ') || input.startsWith('/修改 ')) {
      const instruction = input.substring(input.indexOf(' ') + 1);
      const userMsg: Message = { role: 'user', content: input };
      setMessages(prev => [...prev, userMsg]);
      setInput('');
      setIsTyping(true);
      
      const hasSelection = Boolean(editorSelection?.text.trim());
      const original = hasSelection ? editorSelection!.text : activeFileContent;
      const documentSnapshot = activeFileContent;
      const startLine = hasSelection && editorSelection
        ? lineNumberAtOffset(activeFileContent, editorSelection.from)
        : 1;
      const contextResult = await requestEditableAiContext(
        locale === 'zh' ? '确认 AI 改写上下文' : 'Confirm AI rewrite context',
        locale === 'zh' ? `AI 将接收${hasSelection ? '当前选区' : '当前全文'}和改写指令。生成结果会先以 Diff 候选展示。` : `AI will receive the ${hasSelection ? 'current selection' : 'current document'} and rewrite instruction. The result will be shown as a diff draft first.`,
        [
          {
            label: hasSelection ? (locale === 'zh' ? '选区内容' : 'Selected text') : (locale === 'zh' ? '当前文档' : 'Current document'),
            detail: contextDetail(original),
            content: original,
            editable: true,
            removable: false
          },
          {
            label: locale === 'zh' ? '改写指令' : 'Rewrite instruction',
            detail: instruction,
            content: instruction,
            editable: true,
            removable: false
          }
        ]
      );
      if (!contextResult.confirmed) {
        setMessages(prev => [...prev, {
          role: 'assistant',
          content: locale === 'zh' ? '已取消本次 AI 改写，没有发送上下文。' : 'AI rewrite cancelled. No context was sent.'
        }]);
        setIsTyping(false);
        return;
      }
      const editedOriginal = contextResult.items[0]?.content ?? original;
      const editedInstruction = contextResult.items[1]?.content ?? instruction;
      const newText = await runAiRequest((signal) => modifyTextWithAI(aiConfig, editedOriginal, editedInstruction, signal));
      if (newText === null) {
        setIsTyping(false);
        return;
      }
      
      const failed = newText.startsWith('AI 请求失败') || newText.startsWith('AI request failed');
      if (!failed) {
        setRewriteDraft({
          instruction: editedInstruction,
          original: editedOriginal,
          proposed: newText,
          scope: hasSelection ? 'selection' : 'document',
          range: hasSelection ? { from: editorSelection!.from, to: editorSelection!.to } : null,
          startLine,
          documentSnapshot,
          acceptedChunkIds: getDefaultAcceptedRewriteChunkIds(editedOriginal, newText)
        });
      }

      const aiMsg: Message = {
        role: 'assistant',
        content: failed
          ? newText
          : locale === 'zh'
            ? `已生成${hasSelection ? '选区' : '全文'}改写候选，请在下方 Diff 卡片中审阅后决定是否应用。`
            : `Generated a ${hasSelection ? 'selection' : 'document'} rewrite draft. Review the diff card below before applying it.`
      };
      setMessages(prev => [...prev, aiMsg]);
      setIsTyping(false);
      return;
    }

    const userMsg: Message = { role: 'user', content: trimmedInput };
    setMessages(prev => [...prev, userMsg]);
    setInput('');
    setIsTyping(true);

    const activeContext = truncateContext(activeFileContent, AI_ACTIVE_CONTEXT_CHARS);
    const contextItems = [
      {
        label: locale === 'zh' ? '用户问题' : 'User message',
        detail: contextDetail(trimmedInput),
        content: trimmedInput
      },
      ...selectionAttachments.map((item, index) => ({
        label: locale === 'zh'
          ? `选中文本 ${index + 1}（${item.source === 'editor' ? '编辑区' : '阅读区'}）`
          : `Selection ${index + 1} (${item.source})`,
        detail: contextDetail(item.text),
        content: item.text
      })),
      ...(includeActiveFileContext && activeContext.trim() ? [{
        label: locale === 'zh' ? '当前文件上下文' : 'Active file context',
        detail: contextDetail(activeContext),
        content: activeContext
      }] : []),
      ...selectedContexts.map((context) => ({
        label: locale === 'zh' ? `工作区上下文：${context.relativePath}` : `Workspace context: ${context.relativePath}`,
        detail: contextDetail(context.content),
        content: context.content
      }))
    ];

    const editedQuestion = trimmedInput;
    const editedContext = contextItems.slice(1)
      .map((item) => [`# ${item.label}`, item.content].join('\n\n'))
      .join('\n\n')
      .trim();
    setSelectionAttachments([]);

    const assistantId = `assistant-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    setMessages((prev) => [...prev, {
      id: assistantId,
      role: 'assistant',
      content: locale === 'zh' ? '正在连接本地 AI 流...' : 'Connecting to local AI stream...'
    }]);

    const response = await runAiStreamRequest(
      (signal, onDelta) => streamAI(aiConfig, editedQuestion, editedContext || undefined, onDelta, signal),
      (_delta, fullText) => {
        setMessages((prev) => prev.map((message) => (
          message.id === assistantId
            ? { ...message, content: fullText || (locale === 'zh' ? '正在生成...' : 'Generating...') }
            : message
        )));
      }
    );
    if (response === null) {
      setIsTyping(false);
      return;
    }
    setMessages((prev) => prev.map((message) => (
      message.id === assistantId ? { ...message, content: response } : message
    )));
    setIsTyping(false);
  };

  const handleApplyRewrite = () => {
    if (!rewriteDraft) return;

    if (activeFileContent !== rewriteDraft.documentSnapshot) {
      setMessages((prev) => [
        ...prev,
        {
          role: 'assistant',
          content: locale === 'zh'
            ? '当前文档在 AI 生成后已经发生变化。为避免覆盖你的新编辑，本次改写没有应用。请重新选择内容并发起 /rewrite。'
            : 'The document changed after the AI draft was generated. To avoid overwriting your edits, the rewrite was not applied. Select the text again and run /rewrite.'
        }
      ]);
      setRewriteDraft(null);
      return;
    }

    const acceptedRewrite = buildAcceptedRewriteText(rewriteDraft.original, rewriteDraft.proposed, rewriteDraft.acceptedChunkIds);
    if (acceptedRewrite === rewriteDraft.original) {
      setRewriteDraft(null);
      setMessages((prev) => [
        ...prev,
        {
          role: 'assistant',
          content: locale === 'zh'
            ? '没有接受任何 AI 变更，正文保持不变。'
            : 'No AI changes were accepted. The document was left unchanged.'
        }
      ]);
      return;
    }

    if (rewriteDraft.scope === 'selection' && rewriteDraft.range) {
      replaceActiveFileRange(rewriteDraft.range.from, rewriteDraft.range.to, acceptedRewrite);
    } else {
      setActiveFileContent(acceptedRewrite);
    }
    const firstAcceptedLine = getFirstAcceptedRewriteLine(rewriteDraft.original, rewriteDraft.proposed, rewriteDraft.acceptedChunkIds);
    setPendingEditorLine(rewriteDraft.startLine + Math.max(firstAcceptedLine - 1, 0));
    setRewriteDraft(null);
    setMessages((prev) => [
      ...prev,
      {
        role: 'assistant',
        content: locale === 'zh'
          ? `${rewriteDraft.scope === 'selection' ? '选区' : '全文'}已应用已接受的 AI 变更，请检查后保存。`
          : `Accepted AI changes were applied to the ${rewriteDraft.scope === 'selection' ? 'selection' : 'document'}. Review and save when ready.`
      }
    ]);
  };

  const handleRewriteChunkDecision = (chunkId: string, accepted: boolean) => {
    setRewriteDraft((draft) => {
      if (!draft) return draft;
      const acceptedSet = new Set(draft.acceptedChunkIds);
      if (accepted) acceptedSet.add(chunkId);
      else acceptedSet.delete(chunkId);
      return { ...draft, acceptedChunkIds: Array.from(acceptedSet) };
    });
  };

  const handleRewriteAcceptAll = () => {
    setRewriteDraft((draft) => {
      if (!draft) return draft;
      return {
        ...draft,
        acceptedChunkIds: getDefaultAcceptedRewriteChunkIds(draft.original, draft.proposed)
      };
    });
  };

  const handleRewriteRejectAll = () => {
    setRewriteDraft((draft) => draft ? { ...draft, acceptedChunkIds: [] } : draft);
  };

  const handleRewriteRegenerateChunk = async (chunkId: string) => {
    if (!rewriteDraft || isTyping) return;
    const { chunks, summarized } = buildRewriteDiff(rewriteDraft.original, rewriteDraft.proposed);
    if (summarized) {
      setMessages((prev) => [...prev, {
        role: 'assistant',
        content: locale === 'zh' ? '大文档摘要 Diff 暂不支持单块重新生成。' : 'Summarized large diffs do not support chunk regeneration yet.'
      }]);
      return;
    }
    const chunk = chunks.find((item) => item.id === chunkId);
    if (!chunk) return;

    const originalChunk = chunk.lines
      .filter((line) => line.type === 'removed')
      .map((line) => line.text)
      .join('\n');
    const proposedChunk = chunk.lines
      .filter((line) => line.type === 'added')
      .map((line) => line.text)
      .join('\n');
    const chunkContext = originalChunk || proposedChunk;
    if (!chunkContext.trim()) return;

    setIsTyping(true);
    const prompt = locale === 'zh'
      ? `重新生成这个改写变更块。遵循原始改写指令：“${rewriteDraft.instruction}”。只输出替换后的文本，不要解释，不要添加 Markdown 代码围栏。`
      : `Regenerate this rewrite chunk. Follow the original rewrite instruction: "${rewriteDraft.instruction}". Output only the replacement text, with no explanation and no Markdown code fence.`;
    const regenerated = await runAiRequest((signal) => modifyTextWithAI(aiConfig, chunkContext, prompt, signal));
    setIsTyping(false);
    if (regenerated === null) return;

    setRewriteDraft((draft) => {
      if (!draft) return draft;
      const nextProposed = replaceProposedChunk(draft.original, draft.proposed, chunkId, regenerated);
      const nextAccepted = new Set(draft.acceptedChunkIds);
      nextAccepted.add(chunkId);
      return {
        ...draft,
        proposed: nextProposed,
        acceptedChunkIds: Array.from(nextAccepted)
      };
    });
    setMessages((prev) => [...prev, {
      role: 'assistant',
      content: locale === 'zh' ? `已重新生成 ${chunkId}，请在 Diff 中检查。` : `${chunkId} regenerated. Review it in the diff.`
    }]);
  };

  const handleCopyCodeBlock = async (block: CodeBlockInfo) => {
    try {
      await navigator.clipboard.writeText(block.code);
      setCopiedCodeBlockId(block.id);
      window.setTimeout(() => setCopiedCodeBlockId(null), 1800);
    } catch (error) {
      setMessages((prev) => [...prev, {
        role: 'assistant',
        content: `${locale === 'zh' ? '复制失败' : 'Copy failed'}: ${sanitizeAiError(error, locale)}`
      }]);
      setAiPanelTab('ai');
    }
  };

  const handleCopyAllCodeBlocks = async () => {
    if (filteredCodeBlocks.length === 0) return;
    const markdown = filteredCodeBlocks
      .map((block) => `\`\`\`${block.language || 'text'}\n${block.code.replace(/\n$/, '')}\n\`\`\``)
      .join('\n\n');
    try {
      await navigator.clipboard.writeText(markdown);
      setCopiedAllCodeBlocks(true);
      window.setTimeout(() => setCopiedAllCodeBlocks(false), 1800);
    } catch (error) {
      setMessages((prev) => [...prev, {
        role: 'assistant',
        content: `${locale === 'zh' ? '复制失败' : 'Copy failed'}: ${sanitizeAiError(error, locale)}`
      }]);
      setAiPanelTab('ai');
    }
  };

  const insertCodeBlockIntoDocument = (block: ExtractedCodeBlock) => {
    if (!activeFile?.isMarkdown || activeFile.readOnly) {
      setMessages((prev) => [...prev, {
        role: 'assistant',
        content: locale === 'zh' ? '当前没有可编辑 Markdown 文档，无法插入代码块。' : 'No editable Markdown document is active, so the code block was not inserted.'
      }]);
      return;
    }

    const insertion = `\n\n\`\`\`${block.language || 'text'}\n${block.code.replace(/\n$/, '')}\n\`\`\`\n`;
    setActiveFileContent(`${activeFileContent.replace(/\s*$/, '')}${insertion}`);
    setPendingEditorLine(activeFileContent.split('\n').length + 2);
    setMessages((prev) => [...prev, {
      role: 'assistant',
      content: locale === 'zh' ? '已将 AI 代码块插入当前 Markdown 文档末尾，请检查后保存。' : 'Inserted the AI code block at the end of the current Markdown document. Review and save when ready.'
    }]);
  };

  const prepareReplaceCodeBlock = (aiBlock: ExtractedCodeBlock, targetBlock: CodeBlockInfo) => {
    if (!activeFile?.isMarkdown || activeFile.readOnly) {
      setMessages((prev) => [...prev, {
        role: 'assistant',
        content: locale === 'zh' ? '当前没有可编辑 Markdown 文档，无法替换代码块。' : 'No editable Markdown document is active, so the code block was not replaced.'
      }]);
      return;
    }

    const range = getCodeBlockContentRange(activeFileContent, targetBlock);
    if (!range) {
      setMessages((prev) => [...prev, {
        role: 'assistant',
        content: locale === 'zh' ? '没有定位到目标代码块，请刷新文档后重试。' : 'Could not locate the target code block. Refresh the document and try again.'
      }]);
      return;
    }

    setCodeApplyDraft({
      aiBlock,
      targetBlock,
      original: targetBlock.code.replace(/\n$/, ''),
      proposed: aiBlock.code.replace(/\n$/, ''),
      range
    });
  };

  const applyCodeBlockDraft = () => {
    if (!codeApplyDraft) return;
    replaceActiveFileRange(codeApplyDraft.range.from, codeApplyDraft.range.to, codeApplyDraft.proposed);
    setPendingEditorLine(codeApplyDraft.targetBlock.codeStartLine);
    setCodeApplyDraft(null);
    setMessages((prev) => [...prev, {
      role: 'assistant',
      content: locale === 'zh' ? '已替换目标代码块内容，请检查后保存。' : 'Replaced the target code block content. Review and save when ready.'
    }]);
  };

  const handleCodeAiAction = async (block: CodeBlockInfo, action: 'explain' | 'refactor' | 'comment') => {
    if (isTyping) return;

    setAiPanelTab('ai');

    const prompt = codeAiPrompt(action, block.language || 'text', locale);
    const userMsg: Message = {
      role: 'user',
      content: `${prompt}\n\n\`\`\`${block.language}\n${block.code}\n\`\`\``
    };
    setMessages((prev) => [...prev, userMsg]);
    setIsTyping(true);

    const contextResult = await requestEditableAiContext(
      codeAiConfirmTitle(action, locale),
      locale === 'zh'
        ? 'AI 将只接收当前代码块和这条代码指令，结果会返回到 AI 对话，不会直接修改正文。'
        : 'AI will receive only this code block and instruction. The result appears in chat and will not modify the document.',
      [
        {
          label: `${block.language || 'text'} ${locale === 'zh' ? '代码块' : 'code block'}`,
          detail: contextDetail(block.code),
          content: block.code,
          editable: true,
          removable: false
        },
        {
          label: locale === 'zh' ? '解释指令' : 'Instruction',
          detail: prompt,
          content: prompt,
          editable: true,
          removable: false
        }
      ]
    );
    if (!contextResult.confirmed) {
      setMessages((prev) => [...prev, {
        role: 'assistant',
        content: locale === 'zh' ? '已取消代码请求，没有发送上下文。' : 'Code request cancelled. No context was sent.'
      }]);
      setIsTyping(false);
      return;
    }
    const editedCode = contextResult.items[0]?.content ?? block.code;
    const editedPrompt = contextResult.items[1]?.content ?? prompt;

    const assistantId = `assistant-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    setMessages((prev) => [...prev, {
      id: assistantId,
      role: 'assistant',
      content: locale === 'zh' ? '正在连接本地 AI 流...' : 'Connecting to local AI stream...'
    }]);

    const response = await runAiStreamRequest(
      (signal, onDelta) => streamAI(aiConfig, editedPrompt, editedCode, onDelta, signal),
      (_delta, fullText) => {
        setMessages((prev) => prev.map((message) => (
          message.id === assistantId
            ? { ...message, content: fullText || (locale === 'zh' ? '正在生成...' : 'Generating...') }
            : message
        )));
      }
    );
    if (response === null) {
      setIsTyping(false);
      return;
    }
    setMessages((prev) => prev.map((message) => (
      message.id === assistantId ? { ...message, content: response } : message
    )));
    setIsTyping(false);
  };

  const handleCodeDiff = (block: CodeBlockInfo, previousBlock: CodeBlockInfo | null) => {
    if (!previousBlock) return;
    const diff = buildLineDiff(previousBlock.code, block.code);
    const preview = diff
      .slice(0, 120)
      .map((line) => `${line.type === 'added' ? '+' : line.type === 'removed' ? '-' : ' '} ${line.text}`)
      .join('\n');
    const hidden = diff.length > 120
      ? `\n\n${locale === 'zh' ? `还有 ${diff.length - 120} 行未显示。` : `${diff.length - 120} more lines hidden.`}`
      : '';
    setMessages((prev) => [...prev, {
      role: 'assistant',
      content: locale === 'zh'
        ? `代码块 ${previousBlock.startLine}-${previousBlock.endLine} 与 ${block.startLine}-${block.endLine} 的差异：\n\n\`\`\`diff\n${preview || 'No textual differences'}\n\`\`\`${hidden}`
        : `Diff between code blocks ${previousBlock.startLine}-${previousBlock.endLine} and ${block.startLine}-${block.endLine}:\n\n\`\`\`diff\n${preview || 'No textual differences'}\n\`\`\`${hidden}`
    }]);
  };

  const handlePanelResizeStart = (event: ReactMouseEvent<HTMLDivElement>) => {
    event.preventDefault();
    const panel = panelRef.current;
    if (!panel) return;
    const rect = panel.getBoundingClientRect();

    const move = (moveEvent: MouseEvent) => {
      const next = rect.right - moveEvent.clientX;
      setPanelWidth(Math.max(AI_PANEL_MIN_WIDTH, Math.min(AI_PANEL_MAX_WIDTH, next)));
    };
    const up = () => {
      document.removeEventListener('mousemove', move);
      document.removeEventListener('mouseup', up);
      document.body.classList.remove('inkstack-ai-resizing');
    };

    document.addEventListener('mousemove', move);
    document.addEventListener('mouseup', up);
    document.body.classList.add('inkstack-ai-resizing');
  };

  return (
    <aside
      ref={panelRef}
      style={{ width: `${panelWidth}px` }}
      className="relative flex h-full min-h-0 shrink-0 flex-col overflow-hidden border-l border-border-subtle bg-bg-base"
    >
      <div
        role="separator"
        aria-orientation="vertical"
        onMouseDown={handlePanelResizeStart}
        className="inkstack-ai-panel-divider absolute left-0 top-0 z-30 flex h-full w-2 -translate-x-1/2 cursor-col-resize items-center justify-center"
      >
        <span className="h-10 w-[3px] rounded-full bg-border-subtle" />
      </div>
      <div className="flex border-b border-border-subtle">
        <TabButton
          active={aiPanelTab === 'ai' || aiPanelTab === 'settings'}
          icon={<Sparkles size={13} />}
          label={locale === 'zh' ? 'AI 助手' : 'AI'}
          onClick={() => setAiPanelTab('ai')}
        />
        <TabButton
          active={aiPanelTab === 'outline'}
          icon={<ListTree size={13} />}
          label={locale === 'zh' ? '大纲' : 'Outline'}
          onClick={() => setAiPanelTab('outline')}
        />
        <TabButton
          active={aiPanelTab === 'code'}
          icon={<Braces size={13} />}
          label={locale === 'zh' ? '代码' : 'Code'}
          onClick={() => setAiPanelTab('code')}
        />
        <button onClick={toggleAiPanel} className="w-10 flex items-center justify-center text-text-tertiary hover:bg-bg-hover hover:text-text-primary transition-colors">
          <X size={14} />
        </button>
      </div>

      {(aiPanelTab === 'ai' || aiPanelTab === 'settings') && <AIPanelChatTab
        locale={locale}
        rootPath={rootPath}
        activeFileName={activeFile?.name ?? null}
        activeFileHasContent={Boolean(activeFileContent.trim())}
        canReplaceCode={Boolean(activeFile?.isMarkdown && !activeFile.readOnly)}
        aiConfig={aiConfig}
        activePresetApiKeyEnv={activePreset?.apiKeyEnv}
        messages={messages}
        input={input}
        isTyping={isTyping}
        contextDrawerOpen={contextDrawerOpen}
        includeActiveFileContext={includeActiveFileContext}
        contextQuery={contextQuery}
        isSearchingContext={isSearchingContext}
        selectedContexts={selectedContexts}
        selectionAttachments={selectionAttachments}
        contextResults={contextResults}
        selectedContextIds={selectedContextIds}
        contextMessage={contextMessage}
        codeBlocks={codeBlocks}
        rewriteDraft={rewriteDraft}
        codeApplyDraft={codeApplyDraft}
        messageScrollRef={messageScrollRef}
        endRef={endRef}
        settingsOpen={aiPanelTab === 'settings'}
        onToggleSettings={() => setAiPanelTab(aiPanelTab === 'settings' ? 'ai' : 'settings')}
        onInputChange={setInput}
        onSend={() => void handleSend()}
        onToggleContextDrawer={() => setContextDrawerOpen((current) => !current)}
        onCancelAiRequest={cancelAiRequest}
        onToggleActiveFileContext={setIncludeActiveFileContext}
        onContextQueryChange={(query) => {
          setContextQuery(query);
          setContextMessage('');
        }}
        onRemoveWorkspaceContext={handleRemoveWorkspaceContext}
        onRemoveSelectionAttachment={handleRemoveSelectionAttachment}
        onClearSelectionAttachments={() => setSelectionAttachments([])}
        onAddWorkspaceContext={(result) => void handleAddWorkspaceContext(result)}
        onInsertCodeBlock={insertCodeBlockIntoDocument}
        onReplaceCodeBlock={prepareReplaceCodeBlock}
        onApplyRewrite={handleApplyRewrite}
        onDiscardRewrite={() => setRewriteDraft(null)}
        onRewriteChunkDecision={handleRewriteChunkDecision}
        onRewriteAcceptAll={handleRewriteAcceptAll}
        onRewriteRejectAll={handleRewriteRejectAll}
        onRewriteRegenerateChunk={(chunkId) => void handleRewriteRegenerateChunk(chunkId)}
        onApplyCodeDraft={applyCodeBlockDraft}
        onDiscardCodeDraft={() => setCodeApplyDraft(null)}
      />}

      {aiPanelTab === 'outline' && (
        <AIPanelOutlineTab
          locale={locale}
          activeFileIsCode={Boolean(activeFile && !activeFile.isMarkdown)}
          outline={outline}
          activeOutlineLine={currentEditorLine}
          onJump={(line) => {
            setPendingEditorLine(line);
            setViewMode('split');
          }}
        />
      )}

      {aiPanelTab === 'code' && (
        <CodeBlocksPanel
          blocks={filteredCodeBlocks}
          languages={codeLanguages}
          activeLanguage={codeLanguageFilter}
          query={codeQuery}
          collapsedBlockIds={collapsedCodeBlockIds}
          copiedCodeBlockId={copiedCodeBlockId}
          copiedAll={copiedAllCodeBlocks}
          locale={locale}
          onLanguageChange={setCodeLanguageFilter}
          onQueryChange={setCodeQuery}
          onToggleCollapse={(blockId) => setCollapsedCodeBlockIds((ids) => (
            ids.includes(blockId) ? ids.filter((id) => id !== blockId) : [...ids, blockId]
          ))}
          onJump={(line) => {
            setPendingEditorLine(line);
            setViewMode('split');
          }}
          onCopy={(block) => void handleCopyCodeBlock(block)}
          onCopyAll={() => void handleCopyAllCodeBlocks()}
          onExplain={(block) => void handleCodeAiAction(block, 'explain')}
          onRefactor={(block) => void handleCodeAiAction(block, 'refactor')}
          onComment={(block) => void handleCodeAiAction(block, 'comment')}
          onCompare={handleCodeDiff}
          renderOutlineIcon={renderOutlineIcon}
        />
      )}

      {aiPanelTab === 'settings' && (
        <div className="absolute right-3 top-14 z-40 h-[calc(100%-4rem)] w-[min(36rem,calc(100%-1.5rem))] overflow-hidden rounded-md border border-border-subtle bg-bg-base shadow-2xl">
          <AIPanelSettingsTab
            locale={locale}
            ai={{
              draftConfig,
              draftModels,
              draftPrompts,
              draftContextPreferences,
              activePreset,
              settingsSaved,
              isTestingModel,
              modelTest,
              onPresetChange: handlePresetChange,
              onConfigChange: updateDraftConfig,
              onModelChanged: () => setModelTest(''),
              onPromptsChange: (prompts) => {
                setDraftPrompts(prompts);
                setSettingsSaved(false);
              },
              onContextPreferencesChange: (preferences) => {
                setDraftContextPreferences(preferences);
                setSettingsSaved(false);
              },
              onSave: handleSaveSettings,
              onTestModel: handleTestModel
            }}
          />
        </div>
      )}
    </aside>
  );
}
