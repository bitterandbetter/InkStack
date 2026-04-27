import { useState, useRef, useEffect, useMemo } from 'react';
import type { ReactNode } from 'react';
import { Bot, Box, Braces, Check, Code2, Copy, FileCode2, Hash, X, Sparkles, ListTree, Settings } from 'lucide-react';
import Markdown from 'react-markdown';
import { useStore } from '../store';
import {
  AI_PROVIDER_PRESETS,
  AiConfig,
  AiProviderKind,
  applyProviderPreset,
  askAI,
  getProviderPreset,
  getProviderModels,
  modifyTextWithAI,
  testAiModel
} from '../lib/ai';
import { cn } from '../lib/utils';
import { CodeBlockInfo, OutlineItem, codeFileToBlock, parseCodeBlocks, parseOutline, parseRawCodeOutline } from '../lib/outline';
import { confirmAiContext, contextDetail } from '../lib/aiContext';

interface Message {
  role: 'user' | 'assistant';
  content: string;
}

type PanelTab = 'ai' | 'outline' | 'code' | 'settings';

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

const providerKindLabels: Record<AiProviderKind, string> = {
  openai: 'OpenAI',
  anthropic: 'Claude',
  gemini: 'Gemini'
};

export function AIPanel() {
  const {
    aiPanelOpen,
    toggleAiPanel,
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
    setEditorAiPrompts
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
  const endRef = useRef<HTMLDivElement>(null);

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

  const handleTestModel = async () => {
    if (isTestingModel) return;
    setIsTestingModel(true);
    setModelTest(locale === 'zh' ? '正在从 Tauri 后端测试所选模型...' : 'Testing selected model from the Tauri backend...');
    try {
      const result = await testAiModel(draftConfig);
      if (!result.ok) {
        setModelTest(`${locale === 'zh' ? '测试失败' : 'Test failed'}: ${result.error ?? 'Unknown error'}`);
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
      setModelTest(`${locale === 'zh' ? '测试失败' : 'Test failed'}: ${error?.message ?? String(error)}`);
    } finally {
      setIsTestingModel(false);
    }
  };

  const runAiRequest = async (request: () => Promise<string>) => {
    try {
      return await request();
    } catch (error: any) {
      return `${locale === 'zh' ? 'AI 请求失败' : 'AI request failed'}: ${error?.message ?? String(error)}`;
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
      const newText = await runAiRequest(() => modifyTextWithAI(aiConfig, original, instruction));
      
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

    const confirmed = await confirmAiContext(
      locale === 'zh' ? '确认 AI 对话上下文' : 'Confirm AI chat context',
      locale === 'zh' ? 'AI 将接收你的问题和当前活动文件内容作为上下文。' : 'AI will receive your message and the active file content as context.',
      [
        {
          label: locale === 'zh' ? '用户问题' : 'User message',
          detail: contextDetail(input),
          content: input
        },
        {
          label: locale === 'zh' ? '当前文件上下文' : 'Active file context',
          detail: contextDetail(activeFileContent),
          content: activeFileContent
        }
      ]
    );
    if (!confirmed) {
      setMessages(prev => [...prev, {
        role: 'assistant',
        content: locale === 'zh' ? '已取消本次 AI 对话，没有发送上下文。' : 'AI chat cancelled. No context was sent.'
      }]);
      setIsTyping(false);
      return;
    }

    const response = await runAiRequest(() => askAI(aiConfig, input, activeFileContent));
    const aiMsg: Message = { role: 'assistant', content: response };
    setMessages(prev => [...prev, aiMsg]);
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

  const handleExplainCodeBlock = async (block: CodeBlockInfo) => {
    if (isTyping) return;

    const prompt = locale === 'zh'
      ? `解释这个 ${block.language} 代码块的作用、主要结构和潜在注意点。`
      : `Explain what this ${block.language} code block does, its main structure, and any caveats.`;
    const userMsg: Message = {
      role: 'user',
      content: `${prompt}\n\n\`\`\`${block.language}\n${block.code}\n\`\`\``
    };
    setActiveTab('ai');
    setMessages((prev) => [...prev, userMsg]);
    setIsTyping(true);

    const confirmed = await confirmAiContext(
      locale === 'zh' ? '确认 AI 代码解释上下文' : 'Confirm AI code context',
      locale === 'zh' ? 'AI 将接收当前代码块和解释指令。' : 'AI will receive the current code block and explanation instruction.',
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
        content: locale === 'zh' ? '已取消代码解释，没有发送上下文。' : 'Code explanation cancelled. No context was sent.'
      }]);
      setIsTyping(false);
      return;
    }

    const response = await runAiRequest(() => askAI(aiConfig, prompt, block.code));
    setMessages((prev) => [...prev, { role: 'assistant', content: response }]);
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
              <div className="bg-ai-bot p-3 rounded-lg rounded-tl-none text-[13px] text-text-primary self-start animate-pulse w-[70%]">
                {locale === 'zh' ? 'AI 正在生成，最长等待约 60 秒...' : 'AI is generating, waiting up to about 60 seconds...'}
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
          onExplain={(block) => void handleExplainCodeBlock(block)}
        />
      )}

      {activeTab === 'settings' && (
        <div className="flex-1 overflow-y-auto p-4 space-y-4 bg-bg-panel/30">
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

function CodeBlocksPanel({
  blocks,
  languages,
  activeLanguage,
  copiedCodeBlockId,
  locale,
  onLanguageChange,
  onJump,
  onCopy,
  onExplain
}: {
  blocks: CodeBlockInfo[];
  languages: string[];
  activeLanguage: string;
  copiedCodeBlockId: string | null;
  locale: 'zh' | 'en';
  onLanguageChange: (language: string) => void;
  onJump: (line: number) => void;
  onCopy: (block: CodeBlockInfo) => void;
  onExplain: (block: CodeBlockInfo) => void;
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
