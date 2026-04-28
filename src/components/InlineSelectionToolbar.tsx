import {
  MessageCirclePlus,
  Bot,
  Copy,
  FileText,
  Languages,
  Maximize2,
  Sparkles,
  Wand2
} from 'lucide-react';

type TransformAction = 'rewrite' | 'polish' | 'expand' | 'translate';
type InsightAction = 'ask' | 'summarize';

export function InlineSelectionToolbar({
  locale,
  canEditSelection,
  onCopy,
  onTransform,
  onInsight,
  onAddToChat
}: {
  locale: 'zh' | 'en';
  canEditSelection: boolean;
  onCopy: () => void;
  onTransform: (action: TransformAction) => void;
  onInsight: (action: InsightAction) => void;
  onAddToChat: () => void;
}) {
  return (
    <div
      data-selection-toolbar="true"
      onMouseDown={(event) => event.preventDefault()}
      className="absolute right-5 top-5 z-20 flex max-w-[calc(100%-2.5rem)] flex-wrap items-center gap-1 rounded-md border border-border-subtle bg-bg-base/95 px-1.5 py-1 text-text-secondary shadow-lg backdrop-blur"
    >
      <button onClick={onCopy} className="flex items-center gap-1 rounded px-2 py-1 text-[12px] hover:bg-bg-hover hover:text-text-primary" title={locale === 'zh' ? '复制选区' : 'Copy selection'}>
        <Copy size={13} />
        {locale === 'zh' ? '复制' : 'Copy'}
      </button>
      {canEditSelection && (
        <>
          <button onClick={() => onTransform('rewrite')} className="flex items-center gap-1 rounded px-2 py-1 text-[12px] text-accent hover:bg-bg-hover" title={locale === 'zh' ? 'AI 改写选区' : 'Rewrite selection'}>
            <Wand2 size={13} />
            {locale === 'zh' ? '改写' : 'Rewrite'}
          </button>
          <button onClick={() => onTransform('polish')} className="flex items-center gap-1 rounded px-2 py-1 text-[12px] text-accent hover:bg-bg-hover" title={locale === 'zh' ? 'AI 润色选区' : 'Polish selection'}>
            <Sparkles size={13} />
            {locale === 'zh' ? '润色' : 'Polish'}
          </button>
          <button onClick={() => onTransform('expand')} className="flex items-center gap-1 rounded px-2 py-1 text-[12px] text-accent hover:bg-bg-hover" title={locale === 'zh' ? 'AI 扩写选区' : 'Expand selection'}>
            <Maximize2 size={13} />
            {locale === 'zh' ? '扩写' : 'Expand'}
          </button>
          <button onClick={() => onTransform('translate')} className="flex items-center gap-1 rounded px-2 py-1 text-[12px] text-accent hover:bg-bg-hover" title={locale === 'zh' ? 'AI 翻译选区' : 'Translate selection'}>
            <Languages size={13} />
            {locale === 'zh' ? '翻译' : 'Translate'}
          </button>
        </>
      )}
      <button onClick={() => onInsight('summarize')} className="flex items-center gap-1 rounded px-2 py-1 text-[12px] hover:bg-bg-hover hover:text-text-primary" title={locale === 'zh' ? '总结选区' : 'Summarize selection'}>
        <FileText size={13} />
        {locale === 'zh' ? '总结' : 'Summary'}
      </button>
      <button onClick={() => onInsight('ask')} className="flex items-center gap-1 rounded px-2 py-1 text-[12px] hover:bg-bg-hover hover:text-text-primary" title={locale === 'zh' ? '向 AI 提问选区' : 'Ask about selection'}>
        <Bot size={13} />
        {locale === 'zh' ? '提问' : 'Ask'}
      </button>
      <button onClick={onAddToChat} className="flex items-center gap-1 rounded px-2 py-1 text-[12px] text-accent hover:bg-bg-hover" title={locale === 'zh' ? '添加到 AI 聊天输入' : 'Add to AI chat'}>
        <MessageCirclePlus size={13} />
        {locale === 'zh' ? '发到聊天' : 'To Chat'}
      </button>
    </div>
  );
}
