import type { KeyboardEvent, RefObject } from 'react';
import { ChevronDown, ChevronRight, MessageCirclePlus, MinusCircle, Plus, Search, Settings, Sparkles, X } from 'lucide-react';
import Markdown from 'react-markdown';
import type { AiConfig } from '../lib/ai';
import type { MarkdownSearchResult } from '../lib/fs';
import type { CodeBlockInfo } from '../lib/outline';
import { cn } from '../lib/utils';
import { AssistantCodeActions } from './CodeBlocksPanel';
import { CodeApplyDiffCard, RewriteDiffCard, type CodeApplyDraft, type RewriteDraft } from './aiDiff';
import type { ExtractedCodeBlock } from './aiCodeHelpers';
import type { AiSelectionAttachment, AiWorkspaceContext, Message } from './aiPanelTypes';
import { providerKindLabels } from './aiPanelHelpers';

export function AIPanelChatTab({
  locale,
  rootPath,
  activeFileName,
  activeFileHasContent,
  canReplaceCode,
  aiConfig,
  activePresetApiKeyEnv,
  messages,
  input,
  isTyping,
  contextDrawerOpen,
  includeActiveFileContext,
  contextQuery,
  isSearchingContext,
  selectedContexts,
  selectionAttachments,
  contextResults,
  selectedContextIds,
  contextMessage,
  codeBlocks,
  rewriteDraft,
  codeApplyDraft,
  messageScrollRef,
  endRef,
  settingsOpen,
  onToggleSettings,
  onInputChange,
  onSend,
  onToggleContextDrawer,
  onCancelAiRequest,
  onToggleActiveFileContext,
  onContextQueryChange,
  onRemoveWorkspaceContext,
  onAddWorkspaceContext,
  onRemoveSelectionAttachment,
  onClearSelectionAttachments,
  onInsertCodeBlock,
  onReplaceCodeBlock,
  onApplyRewrite,
  onDiscardRewrite,
  onRewriteChunkDecision,
  onRewriteAcceptAll,
  onRewriteRejectAll,
  onRewriteRegenerateChunk,
  onApplyCodeDraft,
  onDiscardCodeDraft
}: {
  locale: 'zh' | 'en';
  rootPath: string | null;
  activeFileName: string | null;
  activeFileHasContent: boolean;
  canReplaceCode: boolean;
  aiConfig: AiConfig;
  activePresetApiKeyEnv?: string;
  messages: Message[];
  input: string;
  isTyping: boolean;
  contextDrawerOpen: boolean;
  includeActiveFileContext: boolean;
  contextQuery: string;
  isSearchingContext: boolean;
  selectedContexts: AiWorkspaceContext[];
  selectionAttachments: AiSelectionAttachment[];
  contextResults: MarkdownSearchResult[];
  selectedContextIds: Set<string>;
  contextMessage: string;
  codeBlocks: CodeBlockInfo[];
  rewriteDraft: RewriteDraft | null;
  codeApplyDraft: CodeApplyDraft | null;
  messageScrollRef: RefObject<HTMLDivElement | null>;
  endRef: RefObject<HTMLDivElement | null>;
  settingsOpen: boolean;
  onToggleSettings: () => void;
  onInputChange: (value: string) => void;
  onSend: () => void;
  onToggleContextDrawer: () => void;
  onCancelAiRequest: () => void;
  onToggleActiveFileContext: (checked: boolean) => void;
  onContextQueryChange: (query: string) => void;
  onRemoveWorkspaceContext: (id: string) => void;
  onAddWorkspaceContext: (result: MarkdownSearchResult) => void;
  onRemoveSelectionAttachment: (id: string) => void;
  onClearSelectionAttachments: () => void;
  onInsertCodeBlock: (block: ExtractedCodeBlock) => void;
  onReplaceCodeBlock: (aiBlock: ExtractedCodeBlock, targetBlock: CodeBlockInfo) => void;
  onApplyRewrite: () => void;
  onDiscardRewrite: () => void;
  onRewriteChunkDecision: (chunkId: string, accepted: boolean) => void;
  onRewriteAcceptAll: () => void;
  onRewriteRejectAll: () => void;
  onRewriteRegenerateChunk: (chunkId: string) => void;
  onApplyCodeDraft: () => void;
  onDiscardCodeDraft: () => void;
}) {
  const contextAttachmentCount = selectionAttachments.length + selectedContexts.length + (includeActiveFileContext && activeFileHasContent ? 1 : 0);
  const estimatedTokens = Math.ceil((input.length + selectionAttachments.reduce((sum, item) => sum + item.text.length, 0)) / 4);
  const handleInputKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      onSend();
    }
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden p-4">
      <div className="mb-3 flex items-center justify-between rounded-md border border-border-subtle bg-bg-panel px-3 py-2 text-[11px] text-text-tertiary">
        <span className="truncate">{aiConfig.providerName} · {aiConfig.model || (locale === 'zh' ? '未设置模型' : 'No model')}</span>
        <button
          onClick={onToggleSettings}
          className="ml-2 shrink-0 text-accent hover:text-accent/80"
          title={locale === 'zh' ? '配置 AI' : 'Configure AI'}
        >
          <Settings size={13} />
        </button>
      </div>

      <div className="mb-3 rounded-md border border-border-subtle bg-bg-panel/70">
        <button
          type="button"
          onClick={onToggleContextDrawer}
          className="flex w-full items-center justify-between px-3 py-2 text-left text-[12px] text-text-secondary hover:bg-bg-hover/70"
        >
          <span>{locale === 'zh' ? '高级上下文' : 'Advanced Context'}</span>
          {contextDrawerOpen ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
        </button>
        {contextDrawerOpen && (
          <div className="space-y-2 border-t border-border-subtle p-2">
            <label className="mb-2 flex items-center gap-2 rounded border border-border-subtle bg-bg-base/60 px-2 py-1.5 text-[11px] text-text-secondary">
              <input
                type="checkbox"
                checked={includeActiveFileContext}
                disabled={!activeFileName || !activeFileHasContent}
                onChange={(event) => onToggleActiveFileContext(event.target.checked)}
                className="h-3.5 w-3.5 accent-[var(--color-accent)] disabled:opacity-40"
              />
              <span className="min-w-0 flex-1 truncate">
                {locale === 'zh'
                  ? (activeFileName ? `发送当前文件上下文：${activeFileName}` : '发送当前文件上下文')
                  : (activeFileName ? `Send active file context: ${activeFileName}` : 'Send active file context')}
              </span>
            </label>
            <div className="flex items-center gap-2">
              <Search size={13} className="shrink-0 text-text-tertiary" />
              <input
                value={contextQuery}
                onChange={(event) => onContextQueryChange(event.target.value)}
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
                        onClick={() => onRemoveWorkspaceContext(context.id)}
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
                          onClick={() => onAddWorkspaceContext(result)}
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
        )}
      </div>

      <div ref={messageScrollRef} className="flex min-h-0 flex-1 flex-col space-y-4 overflow-y-auto pr-1">
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
        {messages.map((message, index) => (
          <div key={index} className={cn("text-[13px] p-3", message.role === 'user' ? "bg-accent text-white rounded-lg rounded-tr-none self-end max-w-[85%]" : "bg-ai-bot text-text-primary rounded-lg rounded-tl-none self-start max-w-[90%]")}>
            <div className={cn("prose prose-sm max-w-none leading-snug", message.role === 'user' && "text-white prose-p:text-white prose-a:text-white dark:prose-invert")}>
              <Markdown>{message.content}</Markdown>
            </div>
            {message.role === 'assistant' && (
              <AssistantCodeActions
                content={message.content}
                locale={locale}
                documentBlocks={codeBlocks}
                canReplace={canReplaceCode}
                onInsert={onInsertCodeBlock}
                onReplace={onReplaceCodeBlock}
              />
            )}
          </div>
        ))}
        {isTyping && (
          <div className="self-start w-[78%] rounded-lg rounded-tl-none bg-ai-bot p-3 text-[13px] text-text-primary">
            <div className="flex items-center gap-2">
              <div className="inkstack-ai-typing flex gap-1">
                <span className="inline-block h-2 w-2 rounded-full bg-accent/60" style={{ animation: 'bounce 1.4s infinite ease-in-out; animation-delay: -0.32s' }} />
                <span className="inline-block h-2 w-2 rounded-full bg-accent/60" style={{ animation: 'bounce 1.4s infinite ease-in-out; animation-delay: -0.16s' }} />
                <span className="inline-block h-2 w-2 rounded-full bg-accent/60" style={{ animation: 'bounce 1.4s infinite ease-in-out' }} />
              </div>
              <span className="text-text-secondary">
                {locale === 'zh' ? 'AI 正在思考...' : 'AI is thinking...'}
              </span>
            </div>
            <button
              onClick={onCancelAiRequest}
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
            onApply={onApplyRewrite}
            onDiscard={onDiscardRewrite}
            onChunkDecision={onRewriteChunkDecision}
            onAcceptAll={onRewriteAcceptAll}
            onRejectAll={onRewriteRejectAll}
            onRegenerateChunk={onRewriteRegenerateChunk}
          />
        )}
        {codeApplyDraft && (
          <CodeApplyDiffCard
            draft={codeApplyDraft}
            locale={locale}
            onApply={onApplyCodeDraft}
            onDiscard={onDiscardCodeDraft}
          />
        )}
        <div ref={endRef} />
      </div>

      <div className="mt-4 flex flex-col space-y-2">
        {selectionAttachments.length > 0 && (
          <div className="rounded-md border border-border-subtle bg-bg-panel/70 p-2">
            <div className="mb-2 flex items-center justify-between">
              <div className="flex items-center gap-1 text-[11px] text-text-secondary">
                <MessageCirclePlus size={12} />
                <span>{locale === 'zh' ? '已添加到聊天的选中文本' : 'Selected text added to chat'}</span>
              </div>
              <button
                onClick={onClearSelectionAttachments}
                className="rounded px-2 py-1 text-[10px] text-text-tertiary hover:bg-bg-hover hover:text-text-primary"
              >
                {locale === 'zh' ? '清空' : 'Clear'}
              </button>
            </div>
            <div className="flex max-h-28 flex-col gap-1 overflow-y-auto">
              {selectionAttachments.map((item, index) => (
                <div key={item.id} className="flex items-start gap-2 rounded border border-border-subtle bg-bg-base px-2 py-1.5 text-[11px]">
                  <span className="shrink-0 text-text-tertiary">{index + 1}.</span>
                  <span className="min-w-0 flex-1 truncate text-text-secondary">
                    {(item.source === 'editor' ? (locale === 'zh' ? '编辑区' : 'Editor') : (locale === 'zh' ? '阅读区' : 'Preview'))}
                    {' · '}
                    {item.text.replace(/\s+/g, ' ').slice(0, 160)}
                  </span>
                  <button
                    onClick={() => onRemoveSelectionAttachment(item.id)}
                    className="shrink-0 rounded p-0.5 text-text-tertiary hover:bg-bg-hover hover:text-text-primary"
                    title={locale === 'zh' ? '移除' : 'Remove'}
                  >
                    <X size={11} />
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        <form onSubmit={(event) => { event.preventDefault(); onSend(); }} className="relative">
          <textarea
            value={input}
            onChange={(event) => onInputChange(event.target.value)}
            onKeyDown={handleInputKeyDown}
            placeholder={locale === 'zh' ? "询问 AI 或使用 /rewrite..." : "Ask AI or /rewrite..."}
            rows={3}
            className="w-full resize-none rounded-md border border-border-subtle bg-bg-panel px-3 py-2 pr-14 text-[13px] text-text-primary placeholder:text-text-tertiary focus:border-accent focus:outline-none"
          />
          <button
            type="submit"
            disabled={!input.trim() || isTyping}
            className="absolute bottom-2 right-2 rounded bg-bg-active px-1.5 py-0.5 text-[10px] text-text-tertiary transition-colors hover:text-text-primary disabled:opacity-50"
          >
            {locale === 'zh' ? '发送' : 'Send'}
          </button>
        </form>
        <div className="flex justify-between px-1 text-[11px] text-text-tertiary">
          <span>{locale === 'zh' ? `附件 ${contextAttachmentCount} · 预估 ${estimatedTokens} tokens` : `Attachments ${contextAttachmentCount} · ~${estimatedTokens} tokens`}</span>
          <span className="font-mono">{providerKindLabels[aiConfig.kind]}</span>
          <span>{activePresetApiKeyEnv ?? 'API KEY'}</span>
        </div>
      </div>
    </div>
  );
}
