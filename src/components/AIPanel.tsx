import { useState, useRef, useEffect, useMemo } from 'react';
import type { ReactNode } from 'react';
import { Bot, Box, Braces, Check, Code2, Copy, FileCode2, Hash, X, Sparkles, ListTree, Settings, Download, Trash2, Search, Plus, MinusCircle, Pin, PinOff, FolderOpen, RefreshCw } from 'lucide-react';
import Markdown from 'react-markdown';
import { useStore } from '../store';
import {
  AI_PROVIDER_PRESETS,
  AiConfig,
  AiProviderKind,
  applyProviderPreset,
  getProviderPreset,
  getProviderModels,
  isAiAbortError,
  modifyTextWithAI,
  sanitizeAiError,
  streamAI,
  testAiModel
} from '../lib/ai';
import { cn } from '../lib/utils';
import { CodeBlockInfo, OutlineItem, codeFileToBlock, parseCodeBlocks, parseOutline, parseRawCodeOutline } from '../lib/outline';
import { confirmAiContext, contextDetail } from '../lib/aiContext';
import {
  BUILT_IN_THEME_CSS,
  BuiltInThemeId,
  allThemeOptions,
  deleteImportedTheme,
  exportThemeCss,
  importCssTheme,
  isImportedTheme,
  loadImportedThemes,
  readImportedThemeCss
} from '../lib/themes';
import { listenAiPanelTab, type AiPanelTab } from '../lib/appEvents';
import {
  getSettings,
  pruneMissingRecentEntries,
  readTextFile,
  searchTextFiles,
  updateSettings,
  type AppSettings,
  type MarkdownSearchResult
} from '../lib/fs';
import { fileNameFromPath } from '../lib/path';
import { openTextPath, openWorkspacePath } from '../lib/desktopActions';

interface Message {
  id?: string;
  role: 'user' | 'assistant';
  content: string;
}

type PanelTab = AiPanelTab;

interface RewriteDraft {
  instruction: string;
  original: string;
  proposed: string;
  scope: 'document' | 'selection';
  range: { from: number; to: number } | null;
  documentSnapshot: string;
}

type DiffLine = {
  type: 'same' | 'added' | 'removed';
  text: string;
};

interface AiWorkspaceContext {
  id: string;
  name: string;
  path: string;
  relativePath: string;
  line: number | null;
  snippet: string | null;
  content: string;
}

const providerKindLabels: Record<AiProviderKind, string> = {
  openai: 'OpenAI',
  anthropic: 'Claude',
  gemini: 'Gemini'
};

const AI_CONTEXT_DOCUMENT_LIMIT = 5;
const AI_ACTIVE_CONTEXT_CHARS = 12000;
const AI_CONTEXT_DOCUMENT_CHARS = 8000;

export function AIPanel() {
  const {
    aiPanelOpen,
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
    editorSelection,
    editorAiPrompts,
    setEditorAiPrompts,
    themeState,
    setActiveThemeId,
    setImportedThemes
  } = useStore();
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const [activeTab, setActiveTab] = useState<PanelTab>('ai');
  const [draftConfig, setDraftConfig] = useState<AiConfig>(aiConfig);
  const [draftPrompts, setDraftPrompts] = useState(editorAiPrompts);
  const [settingsSaved, setSettingsSaved] = useState(false);
  const [modelTest, setModelTest] = useState<string>('');
  const [isTestingModel, setIsTestingModel] = useState(false);
  const [rewriteDraft, setRewriteDraft] = useState<RewriteDraft | null>(null);
  const [codeLanguageFilter, setCodeLanguageFilter] = useState('all');
  const [copiedCodeBlockId, setCopiedCodeBlockId] = useState<string | null>(null);
  const [copiedAllCodeBlocks, setCopiedAllCodeBlocks] = useState(false);
  const [themeMessage, setThemeMessage] = useState('');
  const [contextQuery, setContextQuery] = useState('');
  const [contextResults, setContextResults] = useState<MarkdownSearchResult[]>([]);
  const [selectedContexts, setSelectedContexts] = useState<AiWorkspaceContext[]>([]);
  const [includeActiveFileContext, setIncludeActiveFileContext] = useState(false);
  const [isSearchingContext, setIsSearchingContext] = useState(false);
  const [contextMessage, setContextMessage] = useState('');
  const [recentSettings, setRecentSettings] = useState<AppSettings | null>(null);
  const [recentMessage, setRecentMessage] = useState('');
  const endRef = useRef<HTMLDivElement>(null);
  const aiAbortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    if (activeTab === 'ai') {
      endRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages, activeTab]);

  useEffect(() => {
    setDraftConfig(aiConfig);
  }, [aiConfig]);

  useEffect(() => {
    setDraftPrompts(editorAiPrompts);
  }, [editorAiPrompts]);

  useEffect(() => {
    void loadImportedThemes()
      .then(setImportedThemes)
      .catch((error) => console.error('Failed to load imported themes', error));
  }, [setImportedThemes]);

  useEffect(() => listenAiPanelTab(setActiveTab), []);

  useEffect(() => {
    if (activeTab !== 'settings') return;
    void getSettings()
      .then(setRecentSettings)
      .catch((error) => setRecentMessage(`${locale === 'zh' ? '读取最近项目失败' : 'Failed to load recent entries'}: ${sanitizeAiError(error, locale)}`));
  }, [activeTab, locale]);

  useEffect(() => {
    let cancelled = false;
    const query = contextQuery.trim();
    if (activeTab !== 'ai' || query.length < 2 || !rootPath) {
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
  }, [activeTab, contextQuery, rootPath, locale]);

  const outline = useMemo(() => {
    if (activeFile && !activeFile.isMarkdown) {
      return parseRawCodeOutline(activeFileContent, activeFile.language || 'text');
    }
    return parseOutline(activeFileContent);
  }, [activeFile, activeFileContent]);
  const codeBlocks = useMemo(() => {
    if (activeFile && !activeFile.isMarkdown) {
      return [codeFileToBlock(activeFileContent, activeFile.language || 'text')];
    }
    return parseCodeBlocks(activeFileContent);
  }, [activeFile, activeFileContent]);
  const codeLanguages = useMemo(() => {
    return Array.from(new Set(codeBlocks.map((block) => block.language || 'text'))).sort();
  }, [codeBlocks]);
  const filteredCodeBlocks = useMemo(() => {
    if (codeLanguageFilter === 'all') return codeBlocks;
    return codeBlocks.filter((block) => block.language === codeLanguageFilter);
  }, [codeBlocks, codeLanguageFilter]);
  const activeOutlineLine = useMemo(() => {
    if (!currentEditorLine || outline.length === 0) return null;
    const previousItems = outline
      .filter((item) => item.line <= currentEditorLine)
      .sort((left, right) => right.line - left.line);
    return previousItems[0]?.line ?? outline[0]?.line ?? null;
  }, [currentEditorLine, outline]);
  const activePreset = getProviderPreset(aiConfig.providerId);
  const draftModels = getProviderModels(draftConfig.providerId);
  const themeOptions = allThemeOptions(themeState.importedThemes);
  const activeTheme = themeOptions.find((theme) => theme.id === themeState.activeThemeId) ?? themeOptions[0];
  const activeThemeIsImported = isImportedTheme(themeState.activeThemeId, themeState.importedThemes);
  const selectedContextIds = useMemo(() => new Set(selectedContexts.map((context) => context.path)), [selectedContexts]);

  useEffect(() => {
    if (codeLanguageFilter !== 'all' && !codeLanguages.includes(codeLanguageFilter)) {
      setCodeLanguageFilter('all');
    }
  }, [codeLanguageFilter, codeLanguages]);

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
    setSettingsSaved(true);
  };

  const handleThemeChange = async (themeId: string) => {
    try {
      setThemeMessage('');
      if (themeId.startsWith('imported:')) {
        const css = await readImportedThemeCss(themeId);
        setActiveThemeId(themeId, css);
      } else {
        setActiveThemeId(themeId);
      }
    } catch (error: any) {
      console.error('Theme change failed', error);
      setThemeMessage(error?.message ?? String(error));
    }
  };

  const handleImportTheme = async () => {
    try {
      setThemeMessage('');
      const imported = await importCssTheme();
      if (!imported) return;
      const importedThemes = await loadImportedThemes();
      setImportedThemes(importedThemes);
      setActiveThemeId(imported.state.activeThemeId, imported.state.importedThemeCss);
      setThemeMessage(locale === 'zh' ? '主题已导入并应用' : 'Theme imported and applied');
    } catch (error: any) {
      console.error('Theme import failed', error);
      setThemeMessage(error?.message ?? String(error));
    }
  };

  const handleExportTheme = async () => {
    if (!activeTheme) return;
    try {
      setThemeMessage('');
      const css = activeTheme.kind === 'imported'
        ? await readImportedThemeCss(activeTheme.id)
        : BUILT_IN_THEME_CSS[activeTheme.id as BuiltInThemeId];
      const savedPath = await exportThemeCss(activeTheme, css);
      if (savedPath) {
        setThemeMessage(locale === 'zh' ? `主题已导出：${savedPath}` : `Theme exported: ${savedPath}`);
      }
    } catch (error: any) {
      console.error('Theme export failed', error);
      setThemeMessage(error?.message ?? String(error));
    }
  };

  const handleDeleteTheme = async () => {
    if (!activeThemeIsImported) return;
    const confirmed = window.confirm(
      locale === 'zh'
        ? '删除当前导入主题？此操作只会删除本机主题 CSS 文件，不会影响文档。'
        : 'Delete the current imported theme? This only removes the local theme CSS file.'
    );
    if (!confirmed) return;

    try {
      setThemeMessage('');
      await deleteImportedTheme(themeState.activeThemeId);
      const importedThemes = await loadImportedThemes();
      setImportedThemes(importedThemes);
      setActiveThemeId('light');
      setThemeMessage(locale === 'zh' ? '导入主题已删除，已回到默认浅色主题' : 'Imported theme deleted. Reverted to InkStack Light.');
    } catch (error: any) {
      console.error('Theme delete failed', error);
      setThemeMessage(error?.message ?? String(error));
    }
  };

  const persistRecentSettings = async (next: AppSettings, message: string) => {
    try {
      setRecentMessage('');
      const saved = await updateSettings(next);
      setRecentSettings(saved);
      setRecentMessage(message);
    } catch (error: any) {
      setRecentMessage(`${locale === 'zh' ? '更新最近项目失败' : 'Failed to update recent entries'}: ${sanitizeAiError(error, locale)}`);
    }
  };

  const togglePinnedRecent = async (kind: 'workspace' | 'file', path: string) => {
    if (!recentSettings) return;
    const pinnedKey = kind === 'workspace' ? 'pinnedWorkspaces' : 'pinnedFiles';
    const pinned = recentSettings[pinnedKey];
    const nextPinned = pinned.includes(path)
      ? pinned.filter((item) => item !== path)
      : [path, ...pinned.filter((item) => item !== path)];

    await persistRecentSettings(
      { ...recentSettings, [pinnedKey]: nextPinned },
      pinned.includes(path)
        ? (locale === 'zh' ? '已取消固定' : 'Unpinned')
        : (locale === 'zh' ? '已固定到顶部' : 'Pinned')
    );
  };

  const removeRecentEntry = async (kind: 'workspace' | 'file', path: string) => {
    if (!recentSettings) return;
    const next: AppSettings = kind === 'workspace'
      ? {
        ...recentSettings,
        recentWorkspaces: recentSettings.recentWorkspaces.filter((item) => item !== path),
        pinnedWorkspaces: recentSettings.pinnedWorkspaces.filter((item) => item !== path),
        lastWorkspace: recentSettings.lastWorkspace === path ? null : recentSettings.lastWorkspace
      }
      : {
        ...recentSettings,
        recentFiles: recentSettings.recentFiles.filter((item) => item !== path),
        pinnedFiles: recentSettings.pinnedFiles.filter((item) => item !== path),
        lastFile: recentSettings.lastFile === path ? null : recentSettings.lastFile
      };

    await persistRecentSettings(next, locale === 'zh' ? '已移除最近项目' : 'Recent entry removed');
  };

  const clearRecentEntries = async () => {
    if (!recentSettings) return;
    const confirmed = window.confirm(locale === 'zh' ? '清空所有最近文件和目录？固定项目也会移除。' : 'Clear all recent files and folders? Pinned entries will also be removed.');
    if (!confirmed) return;

    await persistRecentSettings(
      {
        ...recentSettings,
        recentWorkspaces: [],
        recentFiles: [],
        pinnedWorkspaces: [],
        pinnedFiles: [],
        lastWorkspace: null,
        lastFile: null
      },
      locale === 'zh' ? '最近项目已清空' : 'Recent entries cleared'
    );
  };

  const pruneRecentEntries = async () => {
    try {
      setRecentMessage('');
      const pruned = await pruneMissingRecentEntries();
      setRecentSettings(pruned);
      setRecentMessage(locale === 'zh' ? '已清理不存在的最近项目' : 'Missing recent entries removed');
    } catch (error: any) {
      setRecentMessage(`${locale === 'zh' ? '清理失败' : 'Cleanup failed'}: ${sanitizeAiError(error, locale)}`);
    }
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
    } catch (error: any) {
      setModelTest(`${locale === 'zh' ? '测试失败' : 'Test failed'}: ${sanitizeAiError(error, locale)}`);
    } finally {
      setIsTestingModel(false);
    }
  };

  const handleAddWorkspaceContext = async (result: MarkdownSearchResult) => {
    if (selectedContextIds.has(result.path)) return;
    if (selectedContexts.length >= AI_CONTEXT_DOCUMENT_LIMIT) {
      setContextMessage(locale === 'zh' ? `最多添加 ${AI_CONTEXT_DOCUMENT_LIMIT} 个上下文文档。` : `Add up to ${AI_CONTEXT_DOCUMENT_LIMIT} context documents.`);
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

  const buildChatContext = () => {
    const parts: string[] = [];

    if (includeActiveFileContext && activeFileContent.trim()) {
      const activeContext = truncateContext(activeFileContent, AI_ACTIVE_CONTEXT_CHARS);
      parts.push(
        [
          `# Active file${activeFile?.path ? `\npath: ${activeFile.path}` : ''}`,
          activeContext
        ].join('\n\n')
      );
    }

    if (selectedContexts.length > 0) {
      parts.push(
        '# Selected workspace documents',
        selectedContexts
          .map((context) => [
            `## ${context.relativePath}${context.line ? `:${context.line}` : ''}`,
            context.snippet ? `matched snippet: ${context.snippet}` : '',
            context.content
          ].filter(Boolean).join('\n'))
          .join('\n\n')
      );
    }

    return parts.join('\n\n').trim();
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
    } catch (error: any) {
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
    } catch (error: any) {
      if (isAiAbortError(error)) return null;
      return `${locale === 'zh' ? 'AI 请求失败' : 'AI request failed'}: ${sanitizeAiError(error, locale)}`;
    } finally {
      if (aiAbortRef.current === abortController) {
        aiAbortRef.current = null;
      }
    }
  };

  const handleSend = async () => {
    if (!input.trim() || isTyping) return;
    
    if (input.startsWith('/rewrite ') || input.startsWith('/修改 ')) {
      const instruction = input.substring(input.indexOf(' ') + 1);
      const userMsg: Message = { role: 'user', content: input };
      setMessages(prev => [...prev, userMsg]);
      setInput('');
      setIsTyping(true);
      
      const hasSelection = Boolean(editorSelection?.text.trim());
      const original = hasSelection ? editorSelection!.text : activeFileContent;
      const documentSnapshot = activeFileContent;
      const confirmed = await confirmAiContext(
        locale === 'zh' ? '确认 AI 改写上下文' : 'Confirm AI rewrite context',
        locale === 'zh' ? `AI 将接收${hasSelection ? '当前选区' : '当前全文'}和改写指令。生成结果会先以 Diff 候选展示。` : `AI will receive the ${hasSelection ? 'current selection' : 'current document'} and rewrite instruction. The result will be shown as a diff draft first.`,
        [
          {
            label: hasSelection ? (locale === 'zh' ? '选区内容' : 'Selected text') : (locale === 'zh' ? '当前文档' : 'Current document'),
            detail: contextDetail(original),
            content: original
          },
          {
            label: locale === 'zh' ? '改写指令' : 'Rewrite instruction',
            detail: instruction,
            content: instruction
          }
        ]
      );
      if (!confirmed) {
        setMessages(prev => [...prev, {
          role: 'assistant',
          content: locale === 'zh' ? '已取消本次 AI 改写，没有发送上下文。' : 'AI rewrite cancelled. No context was sent.'
        }]);
        setIsTyping(false);
        return;
      }
      const newText = await runAiRequest((signal) => modifyTextWithAI(aiConfig, original, instruction, signal));
      if (newText === null) {
        setIsTyping(false);
        return;
      }
      
      const failed = newText.startsWith('AI 请求失败') || newText.startsWith('AI request failed');
      if (!failed) {
        setRewriteDraft({
          instruction,
          original,
          proposed: newText,
          scope: hasSelection ? 'selection' : 'document',
          range: hasSelection ? { from: editorSelection!.from, to: editorSelection!.to } : null,
          documentSnapshot
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

    const userMsg: Message = { role: 'user', content: input };
    setMessages(prev => [...prev, userMsg]);
    setInput('');
    setIsTyping(true);

    const combinedContext = buildChatContext();
    const activeContext = truncateContext(activeFileContent, AI_ACTIVE_CONTEXT_CHARS);
    const contextItems = [
      {
        label: locale === 'zh' ? '用户问题' : 'User message',
        detail: contextDetail(input),
        content: input
      },
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

    const confirmed = await confirmAiContext(
      locale === 'zh' ? '确认 AI 对话上下文' : 'Confirm AI chat context',
      contextItems.length > 1
        ? (locale === 'zh' ? 'AI 将接收你的问题和你显式勾选的上下文。' : 'AI will receive your message and the contexts you explicitly selected.')
        : (locale === 'zh' ? 'AI 只会接收你的问题，不会发送当前文件或工作区文档。' : 'AI will receive only your message. No active file or workspace documents will be sent.'),
      contextItems
    );
    if (!confirmed) {
      setMessages(prev => [...prev, {
        role: 'assistant',
        content: locale === 'zh' ? '已取消本次 AI 对话，没有发送上下文。' : 'AI chat cancelled. No context was sent.'
      }]);
      setIsTyping(false);
      return;
    }

    const assistantId = `assistant-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    setMessages((prev) => [...prev, {
      id: assistantId,
      role: 'assistant',
      content: locale === 'zh' ? '正在连接本地 AI 流...' : 'Connecting to local AI stream...'
    }]);

    const response = await runAiStreamRequest(
      (signal, onDelta) => streamAI(aiConfig, input, combinedContext || undefined, onDelta, signal),
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

    if (rewriteDraft.scope === 'selection' && rewriteDraft.range) {
      replaceActiveFileRange(rewriteDraft.range.from, rewriteDraft.range.to, rewriteDraft.proposed);
    } else {
      setActiveFileContent(rewriteDraft.proposed);
    }
    setRewriteDraft(null);
    setMessages((prev) => [
      ...prev,
      {
        role: 'assistant',
        content: locale === 'zh'
          ? `${rewriteDraft.scope === 'selection' ? '选区' : '全文'}改写已应用，请检查后保存。`
          : `${rewriteDraft.scope === 'selection' ? 'Selection' : 'Document'} rewrite applied. Review and save when ready.`
      }
    ]);
  };

  const handleCopyCodeBlock = async (block: CodeBlockInfo) => {
    await navigator.clipboard.writeText(block.code);
    setCopiedCodeBlockId(block.id);
    window.setTimeout(() => setCopiedCodeBlockId(null), 1800);
  };

  const handleCopyAllCodeBlocks = async () => {
    if (filteredCodeBlocks.length === 0) return;
    const markdown = filteredCodeBlocks
      .map((block) => `\`\`\`${block.language || 'text'}\n${block.code.replace(/\n$/, '')}\n\`\`\``)
      .join('\n\n');
    await navigator.clipboard.writeText(markdown);
    setCopiedAllCodeBlocks(true);
    window.setTimeout(() => setCopiedAllCodeBlocks(false), 1800);
  };

  const handleCodeAiAction = async (block: CodeBlockInfo, action: 'explain' | 'refactor' | 'comment') => {
    if (isTyping) return;

    const prompt = codeAiPrompt(action, block.language || 'text', locale);
    const userMsg: Message = {
      role: 'user',
      content: `${prompt}\n\n\`\`\`${block.language}\n${block.code}\n\`\`\``
    };
    setActiveTab('ai');
    setMessages((prev) => [...prev, userMsg]);
    setIsTyping(true);

    const confirmed = await confirmAiContext(
      codeAiConfirmTitle(action, locale),
      locale === 'zh'
        ? 'AI 将只接收当前代码块和这条代码指令，结果会返回到 AI 对话，不会直接修改正文。'
        : 'AI will receive only this code block and instruction. The result appears in chat and will not modify the document.',
      [
        {
          label: `${block.language || 'text'} ${locale === 'zh' ? '代码块' : 'code block'}`,
          detail: contextDetail(block.code),
          content: block.code
        },
        {
          label: locale === 'zh' ? '解释指令' : 'Instruction',
          detail: prompt,
          content: prompt
        }
      ]
    );
    if (!confirmed) {
      setMessages((prev) => [...prev, {
        role: 'assistant',
        content: locale === 'zh' ? '已取消代码请求，没有发送上下文。' : 'Code request cancelled. No context was sent.'
      }]);
      setIsTyping(false);
      return;
    }

    const assistantId = `assistant-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    setMessages((prev) => [...prev, {
      id: assistantId,
      role: 'assistant',
      content: locale === 'zh' ? '正在连接本地 AI 流...' : 'Connecting to local AI stream...'
    }]);

    const response = await runAiStreamRequest(
      (signal, onDelta) => streamAI(aiConfig, prompt, block.code, onDelta, signal),
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

  return (
    <aside className="w-[22rem] min-w-80 border-l border-border-subtle bg-bg-base flex flex-col h-full shrink-0">
      <div className="flex border-b border-border-subtle">
        <TabButton
          active={activeTab === 'ai'}
          icon={<Sparkles size={13} />}
          label={locale === 'zh' ? 'AI 助手' : 'AI'}
          onClick={() => setActiveTab('ai')}
        />
        <TabButton
          active={activeTab === 'outline'}
          icon={<ListTree size={13} />}
          label={locale === 'zh' ? '大纲' : 'Outline'}
          onClick={() => setActiveTab('outline')}
        />
        <TabButton
          active={activeTab === 'code'}
          icon={<FileCode2 size={13} />}
          label={locale === 'zh' ? '代码' : 'Code'}
          onClick={() => setActiveTab('code')}
        />
        <TabButton
          active={activeTab === 'settings'}
          icon={<Settings size={13} />}
          label={locale === 'zh' ? '设置' : 'Config'}
          onClick={() => setActiveTab('settings')}
        />
        <button onClick={toggleAiPanel} className="w-10 flex items-center justify-center text-text-tertiary hover:bg-bg-hover hover:text-text-primary transition-colors">
          <X size={14} />
        </button>
      </div>
      
      {activeTab === 'ai' && (
        <div className="flex-1 p-4 overflow-hidden flex flex-col">
          <div className="mb-3 flex items-center justify-between rounded-md border border-border-subtle bg-bg-panel px-3 py-2 text-[11px] text-text-tertiary">
            <span className="truncate">{aiConfig.providerName} · {aiConfig.model || (locale === 'zh' ? '未设置模型' : 'No model')}</span>
            <button
              onClick={() => setActiveTab('settings')}
              className="ml-2 shrink-0 text-accent hover:text-accent/80"
              title={locale === 'zh' ? '配置 AI' : 'Configure AI'}
            >
              <Settings size={13} />
            </button>
          </div>

          <div className="mb-3 rounded-md border border-border-subtle bg-bg-panel/70 p-2">
            <label className="mb-2 flex items-center gap-2 rounded border border-border-subtle bg-bg-base/60 px-2 py-1.5 text-[11px] text-text-secondary">
              <input
                type="checkbox"
                checked={includeActiveFileContext}
                disabled={!activeFile || !activeFileContent.trim()}
                onChange={(event) => setIncludeActiveFileContext(event.target.checked)}
                className="h-3.5 w-3.5 accent-[var(--color-accent)] disabled:opacity-40"
              />
              <span className="min-w-0 flex-1 truncate">
                {locale === 'zh'
                  ? (activeFile ? `发送当前文件上下文：${activeFile.name}` : '发送当前文件上下文')
                  : (activeFile ? `Send active file context: ${activeFile.name}` : 'Send active file context')}
              </span>
            </label>
            <div className="flex items-center gap-2">
              <Search size={13} className="shrink-0 text-text-tertiary" />
              <input
                value={contextQuery}
                onChange={(event) => {
                  setContextQuery(event.target.value);
                  setContextMessage('');
                }}
                disabled={!rootPath}
                placeholder={rootPath
                  ? (locale === 'zh' ? '搜索工作区并添加 AI 上下文...' : 'Search workspace for AI context...')
                  : (locale === 'zh' ? '打开目录后可添加工作区上下文' : 'Open a workspace to add context')}
                className="min-w-0 flex-1 bg-transparent text-[12px] text-text-primary outline-none placeholder:text-text-tertiary disabled:cursor-not-allowed"
              />
              {isSearchingContext && (
                <span className="shrink-0 text-[10px] text-text-tertiary">
                  {locale === 'zh' ? '搜索中' : 'Searching'}
                </span>
              )}
            </div>

            {(selectedContexts.length > 0 || contextResults.length > 0 || contextMessage) && (
              <div className="mt-2 space-y-2">
                {selectedContexts.length > 0 && (
                  <div className="flex flex-wrap gap-1.5">
                    {selectedContexts.map((context) => (
                      <button
                        key={context.id}
                        onClick={() => handleRemoveWorkspaceContext(context.id)}
                        className="flex max-w-full items-center gap-1 rounded border border-accent/25 bg-accent/10 px-2 py-1 text-[10px] text-accent hover:bg-accent/15"
                        title={locale === 'zh' ? '移除上下文' : 'Remove context'}
                      >
                        <span className="truncate">{context.relativePath}{context.line ? `:${context.line}` : ''}</span>
                        <MinusCircle size={11} className="shrink-0" />
                      </button>
                    ))}
                  </div>
                )}

                {contextResults.length > 0 && (
                  <div className="max-h-32 overflow-y-auto rounded border border-border-subtle bg-bg-base">
                    {contextResults.map((result) => {
                      const id = `${result.path}:${result.line ?? 0}`;
                      const selected = selectedContextIds.has(result.path);
                      return (
                        <button
                          key={id}
                          onClick={() => void handleAddWorkspaceContext(result)}
                          disabled={selected}
                          className="flex w-full items-start gap-2 border-b border-border-subtle px-2 py-1.5 text-left last:border-b-0 hover:bg-bg-hover disabled:cursor-default disabled:opacity-55"
                        >
                          <Plus size={12} className="mt-0.5 shrink-0 text-accent" />
                          <span className="min-w-0 flex-1">
                            <span className="block truncate text-[11px] font-medium text-text-secondary">
                              {result.relativePath}{result.line ? `:${result.line}` : ''}
                            </span>
                            <span className="block truncate text-[10px] text-text-tertiary">
                              {selected
                                ? (locale === 'zh' ? '已添加' : 'Added')
                                : result.snippet || (locale === 'zh' ? '文件名匹配' : 'File name match')}
                            </span>
                          </span>
                        </button>
                      );
                    })}
                  </div>
                )}

                {contextMessage && (
                  <div className="rounded bg-bg-base px-2 py-1 text-[10px] text-text-tertiary">
                    {contextMessage}
                  </div>
                )}
              </div>
            )}
          </div>

          <div className="flex-1 overflow-y-auto space-y-4 pr-1 flex flex-col">
            {messages.length === 0 && (
              <div className="text-center text-[13px] text-text-tertiary mt-10 space-y-2">
                <Sparkles size={24} className="mx-auto mb-2 opacity-30 text-accent" />
                <p>{locale === 'zh' ? '本机环境变量配置完成后即可开始。' : 'Configure local environment variables to start.'}</p>
                <p className="text-[11px] opacity-70 mt-4">
                  {locale === 'zh' 
                    ? '提示：输入 "/rewrite 指令" 让 AI 重写当前文档。' 
                    : 'Tip: Type "/rewrite instruction" to let AI modify the active document.'}
                </p>
              </div>
            )}
            {messages.map((msg, i) => (
              <div key={i} className={cn("text-[13px] p-3", msg.role === 'user' ? "bg-accent text-white rounded-lg rounded-tr-none self-end max-w-[85%]" : "bg-ai-bot text-text-primary rounded-lg rounded-tl-none self-start max-w-[90%]")}>
                <div className={cn("prose prose-sm max-w-none leading-snug", msg.role === 'user' && "text-white prose-p:text-white prose-a:text-white dark:prose-invert")}>
                  <Markdown>{msg.content}</Markdown>
                </div>
              </div>
            ))}
            {isTyping && (
              <div className="self-start w-[78%] rounded-lg rounded-tl-none bg-ai-bot p-3 text-[13px] text-text-primary">
                <div className="animate-pulse">
                  {locale === 'zh' ? 'AI 正在生成，最长等待约 60 秒...' : 'AI is generating, waiting up to about 60 seconds...'}
                </div>
                <button
                  onClick={cancelAiRequest}
                  className="mt-2 rounded border border-border-subtle bg-bg-base px-2 py-1 text-[11px] text-text-secondary hover:bg-bg-hover hover:text-text-primary"
                >
                  {locale === 'zh' ? '取消生成' : 'Cancel'}
                </button>
              </div>
            )}
            {rewriteDraft && (
              <RewriteDiffCard
                draft={rewriteDraft}
                locale={locale}
                onApply={handleApplyRewrite}
                onDiscard={() => setRewriteDraft(null)}
              />
            )}
            <div ref={endRef} />
          </div>

          <div className="mt-4 flex flex-col space-y-2">
            <form onSubmit={(e) => { e.preventDefault(); handleSend(); }} className="relative">
              <input
                type="text"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder={locale === 'zh' ? "询问 AI 或使用 /rewrite..." : "Ask AI or /rewrite..."}
                className="w-full px-3 py-2 bg-bg-panel border border-border-subtle rounded-md text-[13px] focus:outline-none focus:border-accent text-text-primary placeholder:text-text-tertiary"
              />
              <button 
                type="submit" 
                disabled={!input.trim() || isTyping}
                className="absolute right-2 top-1.5 text-[10px] bg-bg-active px-1.5 py-0.5 rounded text-text-tertiary hover:text-text-primary transition-colors disabled:opacity-50"
              >
                Enter
              </button>
            </form>
            <div className="flex justify-between text-[11px] text-text-tertiary px-1 font-mono">
              <span>{providerKindLabels[aiConfig.kind]}</span>
              <span>{activePreset?.apiKeyEnv ?? 'API KEY'}</span>
            </div>
          </div>
        </div>
      )}

      {activeTab === 'outline' && (
        <div className="flex-1 overflow-y-auto p-4 bg-bg-panel/30">
          {outline.length === 0 ? (
            <div className="text-[13px] text-text-tertiary text-center mt-10">
              {activeFile && !activeFile.isMarkdown
                ? (locale === 'zh' ? '当前代码文件暂未识别到函数或类结构' : 'No functions or classes recognized in this code file')
                : (locale === 'zh' ? '文档中没有结构' : 'No structure in the document')}
            </div>
          ) : (
            <div className="space-y-1">
              {outline.map((o, i) => (
                <button
                  key={i} 
                  onClick={() => setPendingEditorLine(o.line)}
                  className={cn(
                    "flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-[13px] transition-colors hover:bg-bg-hover hover:text-text-primary",
                    o.type === 'heading' ? 'text-text-primary' : 'text-text-secondary',
                    activeOutlineLine === o.line && 'bg-accent/10 text-accent ring-1 ring-accent/20'
                  )}
                  style={{ paddingLeft: `${(o.level - 1) * 12 + 8}px` }}
                >
                  <OutlineIcon item={o} />
                  <span className="min-w-0 flex-1 truncate">
                    <span className={cn(o.type === 'symbol' && 'font-mono text-[12px]')}>{o.text}</span>
                    {o.type === 'codeBlock' && (
                      <span className="ml-1 text-[10px] text-text-tertiary">
                        {o.line}-{o.endLine}
                      </span>
                    )}
                  </span>
                  {o.type === 'symbol' && o.symbolKind && (
                    <span className="shrink-0 rounded border border-border-subtle px-1 py-0.5 text-[9px] uppercase text-text-tertiary">
                      {o.symbolKind}
                    </span>
                  )}
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {activeTab === 'code' && (
        <CodeBlocksPanel
          blocks={filteredCodeBlocks}
          languages={codeLanguages}
          activeLanguage={codeLanguageFilter}
          copiedCodeBlockId={copiedCodeBlockId}
          locale={locale}
          onLanguageChange={setCodeLanguageFilter}
          onJump={(line) => setPendingEditorLine(line)}
          onCopy={(block) => void handleCopyCodeBlock(block)}
          onCopyAll={() => void handleCopyAllCodeBlocks()}
          onExplain={(block) => void handleCodeAiAction(block, 'explain')}
          onRefactor={(block) => void handleCodeAiAction(block, 'refactor')}
          onComment={(block) => void handleCodeAiAction(block, 'comment')}
          copiedAll={copiedAllCodeBlocks}
        />
      )}

      {activeTab === 'settings' && (
        <div className="flex-1 overflow-y-auto p-4 space-y-4 bg-bg-panel/30">
          <div className="space-y-3 rounded-md border border-border-subtle bg-bg-base p-3">
            <div>
              <label className="text-[11px] font-bold uppercase tracking-wider text-text-tertiary">
                {locale === 'zh' ? '外观主题' : 'Theme'}
              </label>
              <select
                value={themeState.activeThemeId}
                onChange={(event) => void handleThemeChange(event.target.value)}
                className="mt-1 w-full rounded-md border border-border-subtle bg-bg-base px-3 py-2 text-[13px] text-text-primary focus:outline-none focus:border-accent"
              >
                {themeOptions.map((theme) => (
                  <option key={theme.id} value={theme.id}>
                    {theme.kind === 'imported' ? `${theme.name} · CSS` : theme.name}
                  </option>
                ))}
              </select>
            </div>
            <button
              onClick={() => void handleImportTheme()}
              className="w-full rounded-md border border-border-subtle bg-bg-panel px-3 py-2 text-[13px] font-medium text-text-secondary transition-colors hover:bg-bg-hover hover:text-text-primary"
            >
              {locale === 'zh' ? '导入 CSS 主题' : 'Import CSS Theme'}
            </button>
            <div className="grid grid-cols-2 gap-2">
              <button
                onClick={() => void handleExportTheme()}
                className="flex items-center justify-center gap-1.5 rounded-md border border-border-subtle bg-bg-panel px-3 py-2 text-[13px] font-medium text-text-secondary transition-colors hover:bg-bg-hover hover:text-text-primary"
              >
                <Download size={14} />
                {locale === 'zh' ? '导出当前主题' : 'Export Theme'}
              </button>
              <button
                onClick={() => void handleDeleteTheme()}
                disabled={!activeThemeIsImported}
                className="flex items-center justify-center gap-1.5 rounded-md border border-border-subtle bg-bg-panel px-3 py-2 text-[13px] font-medium text-text-secondary transition-colors hover:bg-bg-hover hover:text-red-500 disabled:cursor-not-allowed disabled:opacity-45"
              >
                <Trash2 size={14} />
                {locale === 'zh' ? '删除导入主题' : 'Delete Theme'}
              </button>
            </div>
            {themeMessage && (
              <div className="rounded bg-bg-panel px-2 py-1.5 text-[11px] text-text-tertiary">
                {themeMessage}
              </div>
            )}
          </div>

          <RecentEntriesPanel
            locale={locale}
            settings={recentSettings}
            message={recentMessage}
            onOpenWorkspace={(path) => void openWorkspacePath(path)}
            onOpenFile={(path) => void openTextPath(path)}
            onTogglePin={(kind, path) => void togglePinnedRecent(kind, path)}
            onRemove={(kind, path) => void removeRecentEntry(kind, path)}
            onClear={() => void clearRecentEntries()}
            onPrune={() => void pruneRecentEntries()}
          />

          <div className="space-y-1">
            <label className="text-[11px] font-bold uppercase tracking-wider text-text-tertiary">
              {locale === 'zh' ? 'AICodeMirror 接入' : 'AICodeMirror API'}
            </label>
            <select
              value={draftConfig.providerId}
              onChange={(event) => handlePresetChange(event.target.value)}
              className="w-full rounded-md border border-border-subtle bg-bg-base px-3 py-2 text-[13px] text-text-primary focus:outline-none focus:border-accent"
            >
              {AI_PROVIDER_PRESETS.map((preset) => (
                <option key={preset.id} value={preset.id}>{preset.name}</option>
              ))}
            </select>
          </div>

          <Field label={locale === 'zh' ? '模型名称' : 'Model'}>
            <select
              value={draftConfig.model}
              onChange={(event) => {
                updateDraftConfig({ model: event.target.value });
                setModelTest('');
              }}
              className="w-full rounded-md border border-border-subtle bg-bg-base px-3 py-2 text-[13px] text-text-primary focus:outline-none focus:border-accent"
            >
              {draftModels.map((model) => (
                <option key={model.id || 'env'} value={model.id}>
                  {model.note ? `${model.name} · ${model.note}` : model.name}
                </option>
              ))}
            </select>
          </Field>

          <Field label={locale === 'zh' ? '温度' : 'Temperature'}>
            <input
              value={draftConfig.temperature}
              onChange={(event) => updateDraftConfig({ temperature: Number(event.target.value) })}
              type="number"
              min={0}
              max={2}
              step={0.1}
              className="w-full rounded-md border border-border-subtle bg-bg-base px-3 py-2 text-[13px] text-text-primary focus:outline-none focus:border-accent"
            />
          </Field>

          <Field label={locale === 'zh' ? '编辑器 AI 指令' : 'Editor AI Prompts'}>
            <div className="space-y-2">
              <PromptTextarea
                label={locale === 'zh' ? '改写选区' : 'Rewrite Selection'}
                value={draftPrompts.rewrite}
                onChange={(value) => {
                  setDraftPrompts((current) => ({ ...current, rewrite: value }));
                  setSettingsSaved(false);
                }}
              />
              <PromptTextarea
                label={locale === 'zh' ? '润色选区' : 'Polish Selection'}
                value={draftPrompts.polish}
                onChange={(value) => {
                  setDraftPrompts((current) => ({ ...current, polish: value }));
                  setSettingsSaved(false);
                }}
              />
              <PromptTextarea
                label={locale === 'zh' ? '扩写选区' : 'Expand Selection'}
                value={draftPrompts.expand}
                onChange={(value) => {
                  setDraftPrompts((current) => ({ ...current, expand: value }));
                  setSettingsSaved(false);
                }}
              />
              <PromptTextarea
                label={locale === 'zh' ? '翻译选区' : 'Translate Selection'}
                value={draftPrompts.translate}
                onChange={(value) => {
                  setDraftPrompts((current) => ({ ...current, translate: value }));
                  setSettingsSaved(false);
                }}
              />
              <PromptTextarea
                label={locale === 'zh' ? '提问选区' : 'Ask About Selection'}
                value={draftPrompts.ask}
                onChange={(value) => {
                  setDraftPrompts((current) => ({ ...current, ask: value }));
                  setSettingsSaved(false);
                }}
              />
              <PromptTextarea
                label={locale === 'zh' ? '总结选区' : 'Summarize Selection'}
                value={draftPrompts.summarize}
                onChange={(value) => {
                  setDraftPrompts((current) => ({ ...current, summarize: value }));
                  setSettingsSaved(false);
                }}
              />
            </div>
          </Field>

          <button
            onClick={handleSaveSettings}
            className="w-full rounded-md bg-accent px-3 py-2 text-[13px] font-medium text-white hover:bg-accent/90 transition-colors"
          >
            {settingsSaved ? (locale === 'zh' ? '已保存' : 'Saved') : (locale === 'zh' ? '保存 AI 设置' : 'Save AI Settings')}
          </button>

          <button
            onClick={handleTestModel}
            disabled={isTestingModel}
            className="w-full rounded-md border border-border-subtle bg-bg-base px-3 py-2 text-[13px] font-medium text-text-secondary hover:bg-bg-hover hover:text-text-primary transition-colors disabled:opacity-60"
          >
            {isTestingModel ? (locale === 'zh' ? '正在测试模型...' : 'Testing model...') : (locale === 'zh' ? '测试所选模型' : 'Test Selected Model')}
          </button>

          {modelTest && (
            <pre className="whitespace-pre-wrap rounded-md border border-border-subtle bg-bg-base p-3 text-[11px] leading-relaxed text-text-secondary">
              {modelTest}
            </pre>
          )}

          <div className="rounded-md border border-border-subtle bg-bg-base p-3 text-[12px] leading-relaxed text-text-tertiary">
            <p>
              {locale === 'zh'
                ? 'AI 请求由 Tauri/Rust 后端发出。Base URL 和 API Key 只从本机环境变量读取，不在前端保存或传输。'
                : 'AI requests are sent by the Tauri/Rust backend. Base URLs and API keys are read only from local environment variables.'}
            </p>
            <p className="mt-2">
              {locale === 'zh'
                ? '模型清单以官方 API 文档可确认的文本生成模型为主；标注 AICodeMirror 的条目需要用测试按钮验证当前账号是否支持。'
                : 'The list prioritizes text-generation models confirmed by official API docs; AICodeMirror-marked entries should be verified with the test button.'}
            </p>
            <div className="mt-2 rounded bg-bg-panel px-2 py-1.5 font-mono text-[11px] text-text-secondary">
              {activePreset?.baseUrlLabel}: {activePreset?.apiKeyEnv}: {activePreset?.modelEnv}
            </div>
          </div>
        </div>
      )}
    </aside>
  );
}

function OutlineIcon({ item }: { item: OutlineItem }) {
  if (item.type === 'heading') return <Hash size={13} className="shrink-0 text-accent" />;
  if (item.type === 'codeBlock') return <FileCode2 size={13} className="shrink-0 text-text-tertiary" />;
  if (item.symbolKind === 'class' || item.symbolKind === 'interface') return <Box size={13} className="shrink-0 text-accent" />;
  if (item.symbolKind === 'struct' || item.symbolKind === 'enum' || item.symbolKind === 'type') return <Braces size={13} className="shrink-0 text-accent" />;
  if (item.symbolKind === 'selector' || item.symbolKind === 'key' || item.symbolKind === 'section') return <Braces size={13} className="shrink-0 text-text-tertiary" />;
  return <Code2 size={13} className="shrink-0 text-accent" />;
}

function truncateContext(content: string, limit: number) {
  if (content.length <= limit) return content;
  return `${content.slice(0, limit)}\n\n[InkStack: context truncated]`;
}

function codeAiPrompt(action: 'explain' | 'refactor' | 'comment', language: string, locale: 'zh' | 'en') {
  if (locale === 'zh') {
    if (action === 'refactor') {
      return `审查这个 ${language} 代码块，给出重构建议、潜在风险和更清晰的写法。不要直接改正文；如需给示例，请提供可复制的代码片段。`;
    }
    if (action === 'comment') {
      return `为这个 ${language} 代码块生成适度注释版本。保留原有行为，不要过度注释；先简述注释策略，再给出完整代码。`;
    }
    return `解释这个 ${language} 代码块的作用、主要结构、输入输出和潜在注意点。`;
  }

  if (action === 'refactor') {
    return `Review this ${language} code block and suggest refactors, risks, and clearer alternatives. Do not modify the document directly; include copyable snippets only when useful.`;
  }
  if (action === 'comment') {
    return `Generate a moderately commented version of this ${language} code block. Preserve behavior and avoid noisy comments; briefly explain the commenting strategy, then provide the full code.`;
  }
  return `Explain what this ${language} code block does, its structure, inputs/outputs, and any caveats.`;
}

function codeAiConfirmTitle(action: 'explain' | 'refactor' | 'comment', locale: 'zh' | 'en') {
  if (locale === 'zh') {
    if (action === 'refactor') return '确认 AI 代码重构上下文';
    if (action === 'comment') return '确认 AI 代码注释上下文';
    return '确认 AI 代码解释上下文';
  }

  if (action === 'refactor') return 'Confirm AI code refactor context';
  if (action === 'comment') return 'Confirm AI code comment context';
  return 'Confirm AI code explanation context';
}

function CodeBlocksPanel({
  blocks,
  languages,
  activeLanguage,
  copiedCodeBlockId,
  copiedAll,
  locale,
  onLanguageChange,
  onJump,
  onCopy,
  onCopyAll,
  onExplain,
  onRefactor,
  onComment
}: {
  blocks: CodeBlockInfo[];
  languages: string[];
  activeLanguage: string;
  copiedCodeBlockId: string | null;
  copiedAll: boolean;
  locale: 'zh' | 'en';
  onLanguageChange: (language: string) => void;
  onJump: (line: number) => void;
  onCopy: (block: CodeBlockInfo) => void;
  onCopyAll: () => void;
  onExplain: (block: CodeBlockInfo) => void;
  onRefactor: (block: CodeBlockInfo) => void;
  onComment: (block: CodeBlockInfo) => void;
}) {
  return (
    <div className="flex-1 overflow-y-auto bg-bg-panel/30 p-4">
      <div className="mb-3 flex items-center gap-2">
        <select
          value={activeLanguage}
          onChange={(event) => onLanguageChange(event.target.value)}
          className="min-w-0 flex-1 rounded-md border border-border-subtle bg-bg-base px-2 py-1.5 text-[12px] text-text-primary focus:outline-none focus:border-accent"
        >
          <option value="all">{locale === 'zh' ? '全部语言' : 'All languages'}</option>
          {languages.map((language) => (
            <option key={language} value={language}>{language}</option>
          ))}
        </select>
        <span className="shrink-0 rounded border border-border-subtle bg-bg-base px-2 py-1.5 text-[11px] text-text-tertiary">
          {blocks.length}
        </span>
        <button
          onClick={onCopyAll}
          disabled={blocks.length === 0}
          className="rounded-md border border-border-subtle bg-bg-base px-2 py-1.5 text-[11px] font-medium text-text-secondary hover:bg-bg-hover hover:text-text-primary disabled:opacity-45"
          title={locale === 'zh' ? '复制当前筛选下的全部代码块' : 'Copy all visible code blocks'}
        >
          {copiedAll ? (locale === 'zh' ? '已复制' : 'Copied') : (locale === 'zh' ? '复制全部' : 'Copy all')}
        </button>
      </div>

      {blocks.length === 0 ? (
        <div className="mt-10 text-center text-[13px] text-text-tertiary">
          {locale === 'zh' ? '文档中没有代码块' : 'No code blocks in this document'}
        </div>
      ) : (
        <div className="space-y-3">
          {blocks.map((block, index) => (
            <div key={block.id} className="overflow-hidden rounded-md border border-border-subtle bg-bg-base">
              <div className="flex items-center gap-2 border-b border-border-subtle px-3 py-2">
                <button
                  onClick={() => onJump(block.startLine)}
                  className="min-w-0 flex-1 text-left"
                  title={locale === 'zh' ? '跳转到代码块' : 'Jump to code block'}
                >
                  <span className="block truncate text-[12px] font-medium text-text-primary">
                    {index + 1}. {block.language || 'text'}
                  </span>
                  <span className="block text-[10px] text-text-tertiary">
                    {locale === 'zh' ? '行' : 'Lines'} {block.startLine}-{block.endLine}
                    {block.symbols.length > 0 ? ` · ${block.symbols.length} ${locale === 'zh' ? '个符号' : 'symbols'}` : ''}
                  </span>
                </button>
                <button
                  onClick={() => onCopy(block)}
                  className="rounded p-1.5 text-text-tertiary hover:bg-bg-hover hover:text-text-primary"
                  title={locale === 'zh' ? '复制代码块' : 'Copy code block'}
                >
                  {copiedCodeBlockId === block.id ? <Check size={14} className="text-green-500" /> : <Copy size={14} />}
                </button>
                <button
                  onClick={() => onExplain(block)}
                  className="rounded p-1.5 text-accent hover:bg-bg-hover"
                  title={locale === 'zh' ? '让 AI 解释代码块' : 'Ask AI to explain'}
                >
                  <Bot size={14} />
                </button>
              </div>

              <div className="flex flex-wrap gap-1 border-b border-border-subtle bg-bg-panel/30 px-3 py-2">
                <button
                  onClick={() => onExplain(block)}
                  className="rounded border border-border-subtle bg-bg-base px-2 py-1 text-[11px] text-text-secondary hover:bg-bg-hover hover:text-text-primary"
                >
                  {locale === 'zh' ? '解释' : 'Explain'}
                </button>
                <button
                  onClick={() => onRefactor(block)}
                  className="rounded border border-border-subtle bg-bg-base px-2 py-1 text-[11px] text-text-secondary hover:bg-bg-hover hover:text-text-primary"
                >
                  {locale === 'zh' ? '重构建议' : 'Refactor'}
                </button>
                <button
                  onClick={() => onComment(block)}
                  className="rounded border border-border-subtle bg-bg-base px-2 py-1 text-[11px] text-text-secondary hover:bg-bg-hover hover:text-text-primary"
                >
                  {locale === 'zh' ? '生成注释' : 'Comment'}
                </button>
              </div>

              {block.symbols.length > 0 && (
                <div className="border-b border-border-subtle bg-bg-panel/40 px-3 py-2">
                  <div className="space-y-1">
                    {block.symbols.slice(0, 8).map((symbol) => (
                      <button
                        key={`${symbol.line}-${symbol.text}`}
                        onClick={() => onJump(symbol.line)}
                        className="flex w-full items-center gap-2 rounded px-1.5 py-1 text-left text-[11px] text-text-secondary hover:bg-bg-hover hover:text-text-primary"
                      >
                        <OutlineIcon item={symbol} />
                        <span className="min-w-0 flex-1 truncate font-mono">{symbol.text}</span>
                        <span className="text-[10px] text-text-tertiary">{symbol.line}</span>
                      </button>
                    ))}
                    {block.symbols.length > 8 && (
                      <div className="px-1.5 pt-1 text-[10px] text-text-tertiary">
                        {locale === 'zh' ? `还有 ${block.symbols.length - 8} 个符号` : `${block.symbols.length - 8} more symbols`}
                      </div>
                    )}
                  </div>
                </div>
              )}

              <pre className="max-h-40 overflow-auto bg-[#1f1f24] px-3 py-2 text-[11px] leading-relaxed text-[#e5e7eb]">
                <code>{block.code || ' '}</code>
              </pre>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function RecentEntriesPanel({
  locale,
  settings,
  message,
  onOpenWorkspace,
  onOpenFile,
  onTogglePin,
  onRemove,
  onClear,
  onPrune
}: {
  locale: 'zh' | 'en';
  settings: AppSettings | null;
  message: string;
  onOpenWorkspace: (path: string) => void;
  onOpenFile: (path: string) => void;
  onTogglePin: (kind: 'workspace' | 'file', path: string) => void;
  onRemove: (kind: 'workspace' | 'file', path: string) => void;
  onClear: () => void;
  onPrune: () => void;
}) {
  const workspaces = mergeRecentEntries(settings?.pinnedWorkspaces ?? [], settings?.recentWorkspaces ?? []);
  const files = mergeRecentEntries(settings?.pinnedFiles ?? [], settings?.recentFiles ?? []);
  const empty = workspaces.length === 0 && files.length === 0;

  return (
    <div className="space-y-3 rounded-md border border-border-subtle bg-bg-base p-3">
      <div className="flex items-center justify-between gap-2">
        <div>
          <div className="text-[11px] font-bold uppercase tracking-wider text-text-tertiary">
            {locale === 'zh' ? '最近项目' : 'Recent Entries'}
          </div>
          <div className="mt-0.5 text-[11px] text-text-tertiary">
            {locale === 'zh' ? '固定常用目录或清理失效记录' : 'Pin frequent entries or remove stale paths'}
          </div>
        </div>
        <div className="flex shrink-0 gap-1">
          <button
            onClick={onPrune}
            className="rounded border border-border-subtle bg-bg-panel p-1.5 text-text-tertiary hover:bg-bg-hover hover:text-text-primary"
            title={locale === 'zh' ? '清理失效路径' : 'Prune missing paths'}
          >
            <RefreshCw size={13} />
          </button>
          <button
            onClick={onClear}
            disabled={empty}
            className="rounded border border-border-subtle bg-bg-panel p-1.5 text-text-tertiary hover:bg-bg-hover hover:text-red-500 disabled:cursor-not-allowed disabled:opacity-40"
            title={locale === 'zh' ? '清空最近项目' : 'Clear recent entries'}
          >
            <Trash2 size={13} />
          </button>
        </div>
      </div>

      {empty ? (
        <div className="rounded border border-dashed border-border-subtle bg-bg-panel/50 px-3 py-3 text-center text-[12px] text-text-tertiary">
          {settings
            ? (locale === 'zh' ? '暂无最近文件或目录' : 'No recent files or folders yet')
            : (locale === 'zh' ? '正在读取最近项目...' : 'Loading recent entries...')}
        </div>
      ) : (
        <div className="space-y-3">
          <RecentEntryGroup
            title={locale === 'zh' ? '目录' : 'Folders'}
            kind="workspace"
            entries={workspaces}
            locale={locale}
            onOpen={onOpenWorkspace}
            onTogglePin={(path) => onTogglePin('workspace', path)}
            onRemove={(path) => onRemove('workspace', path)}
          />
          <RecentEntryGroup
            title={locale === 'zh' ? '文件' : 'Files'}
            kind="file"
            entries={files}
            locale={locale}
            onOpen={onOpenFile}
            onTogglePin={(path) => onTogglePin('file', path)}
            onRemove={(path) => onRemove('file', path)}
          />
        </div>
      )}

      {message && (
        <div className="rounded bg-bg-panel px-2 py-1.5 text-[11px] text-text-tertiary">
          {message}
        </div>
      )}
    </div>
  );
}

function RecentEntryGroup({
  title,
  kind,
  entries,
  locale,
  onOpen,
  onTogglePin,
  onRemove
}: {
  title: string;
  kind: 'workspace' | 'file';
  entries: Array<{ path: string; pinned: boolean }>;
  locale: 'zh' | 'en';
  onOpen: (path: string) => void;
  onTogglePin: (path: string) => void;
  onRemove: (path: string) => void;
}) {
  if (entries.length === 0) return null;

  return (
    <div>
      <div className="mb-1 text-[11px] font-medium text-text-secondary">{title}</div>
      <div className="space-y-1">
        {entries.map((entry) => (
          <div key={`${kind}-${entry.path}`} className="flex items-center gap-1 rounded border border-border-subtle bg-bg-panel/60 px-2 py-1.5">
            {kind === 'workspace'
              ? <FolderOpen size={13} className="shrink-0 text-text-tertiary" />
              : <FileCode2 size={13} className="shrink-0 text-text-tertiary" />}
            <button
              onClick={() => onOpen(entry.path)}
              className="min-w-0 flex-1 text-left"
              title={entry.path}
            >
              <span className="block truncate text-[12px] text-text-primary">{fileNameFromPath(entry.path) || entry.path}</span>
              <span className="block truncate text-[10px] text-text-tertiary">{entry.path}</span>
            </button>
            <button
              onClick={() => onTogglePin(entry.path)}
              className="rounded p-1 text-text-tertiary hover:bg-bg-hover hover:text-accent"
              title={entry.pinned ? (locale === 'zh' ? '取消固定' : 'Unpin') : (locale === 'zh' ? '固定' : 'Pin')}
            >
              {entry.pinned ? <PinOff size={13} /> : <Pin size={13} />}
            </button>
            <button
              onClick={() => onRemove(entry.path)}
              className="rounded p-1 text-text-tertiary hover:bg-bg-hover hover:text-red-500"
              title={locale === 'zh' ? '移除记录' : 'Remove'}
            >
              <X size={13} />
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}

function mergeRecentEntries(pinned: string[], recent: string[]) {
  const seen = new Set<string>();
  const entries: Array<{ path: string; pinned: boolean }> = [];

  for (const path of pinned) {
    if (!path || seen.has(path)) continue;
    seen.add(path);
    entries.push({ path, pinned: true });
  }

  for (const path of recent) {
    if (!path || seen.has(path)) continue;
    seen.add(path);
    entries.push({ path, pinned: false });
  }

  return entries;
}

function TabButton({
  active,
  icon,
  label,
  onClick
}: {
  active: boolean;
  icon: ReactNode;
  label: string;
  onClick: () => void;
}) {
  return (
    <button 
      onClick={onClick}
      className={cn(
        "flex-1 py-3 text-[11px] font-bold uppercase tracking-wider flex items-center justify-center gap-1.5 transition-colors",
        active ? "border-b-2 border-accent text-accent" : "text-text-tertiary hover:text-text-primary hover:bg-bg-hover"
      )}
    >
      {icon}
      {label}
    </button>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="space-y-1">
      <label className="text-[11px] font-bold uppercase tracking-wider text-text-tertiary">{label}</label>
      {children}
    </div>
  );
}

function PromptTextarea({
  label,
  value,
  onChange
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <label className="block space-y-1">
      <span className="text-[11px] text-text-tertiary">{label}</span>
      <textarea
        value={value}
        onChange={(event) => onChange(event.target.value)}
        rows={3}
        className="w-full resize-none rounded-md border border-border-subtle bg-bg-base px-3 py-2 text-[12px] leading-relaxed text-text-primary focus:outline-none focus:border-accent"
      />
    </label>
  );
}

function RewriteDiffCard({
  draft,
  locale,
  onApply,
  onDiscard
}: {
  draft: RewriteDraft;
  locale: 'zh' | 'en';
  onApply: () => void;
  onDiscard: () => void;
}) {
  const diff = useMemo(() => buildSafeLineDiff(draft.original, draft.proposed), [draft.original, draft.proposed]);
  const changedLines = diff.filter((line) => line.type !== 'same').length;
  const previewLines = diff.length > 80 ? diff.slice(0, 80) : diff;

  return (
    <div className="self-start w-full rounded-md border border-border-subtle bg-bg-base p-3 text-[12px] text-text-secondary shadow-sm">
      <div className="mb-2 flex items-center justify-between gap-2">
        <div className="min-w-0">
          <div className="font-medium text-text-primary">{locale === 'zh' ? 'AI 改写候选' : 'AI Rewrite Draft'}</div>
          <div className="truncate text-[11px] text-text-tertiary">
            {draft.scope === 'selection'
              ? (locale === 'zh' ? '选区改写' : 'Selection rewrite')
              : (locale === 'zh' ? '全文改写' : 'Document rewrite')}
            {' · '}
            {draft.instruction}
          </div>
        </div>
        <span className="shrink-0 rounded border border-border-subtle px-1.5 py-0.5 text-[10px] text-text-tertiary">
          {changedLines} {locale === 'zh' ? '处变更' : 'changes'}
        </span>
      </div>

      <div className="max-h-72 overflow-auto rounded border border-border-subtle bg-bg-panel font-mono text-[11px] leading-relaxed">
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

      <div className="mt-3 flex gap-2">
        <button
          onClick={onApply}
          className="flex flex-1 items-center justify-center gap-1.5 rounded-md bg-accent px-3 py-2 text-[12px] font-medium text-white hover:bg-accent/90"
        >
          <Check size={13} />
          {locale === 'zh' ? '应用改写' : 'Apply Rewrite'}
        </button>
        <button
          onClick={onDiscard}
          className="flex flex-1 items-center justify-center gap-1.5 rounded-md border border-border-subtle bg-bg-panel px-3 py-2 text-[12px] font-medium text-text-secondary hover:bg-bg-hover hover:text-text-primary"
        >
          <X size={13} />
          {locale === 'zh' ? '丢弃' : 'Discard'}
        </button>
      </div>
    </div>
  );
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
      { type: 'removed', text: `Original document: ${originalLines.length} lines` },
      { type: 'added', text: `AI rewrite: ${proposedLines.length} lines` },
      { type: 'same', text: 'Diff is summarized because the document is large.' }
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
