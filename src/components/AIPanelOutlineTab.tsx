import type { OutlineItem } from '../lib/outline';
import { cn } from '../lib/utils';
import { OutlineIcon } from './AIPanelChrome';

export function AIPanelOutlineTab({
  locale,
  activeFileIsCode,
  outline,
  activeOutlineLine,
  onJump
}: {
  locale: 'zh' | 'en';
  activeFileIsCode: boolean;
  outline: OutlineItem[];
  activeOutlineLine: number | null;
  onJump: (line: number) => void;
}) {
  return (
    <div className="min-h-0 flex-1 overflow-y-auto bg-bg-panel/30 p-4">
      {outline.length === 0 ? (
        <div className="text-[13px] text-text-tertiary text-center mt-10">
          {activeFileIsCode
            ? (locale === 'zh' ? '当前代码文件暂未识别到函数或类结构' : 'No functions or classes recognized in this code file')
            : (locale === 'zh' ? '文档中没有结构' : 'No structure in the document')}
        </div>
      ) : (
        <div className="space-y-1">
          {outline.map((item, index) => (
            <button
              key={index}
              onClick={() => onJump(item.line)}
              className={cn(
                "flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-[13px] transition-colors hover:bg-bg-hover hover:text-text-primary",
                item.type === 'heading' ? 'text-text-primary' : 'text-text-secondary',
                activeOutlineLine === item.line && 'bg-accent/10 text-accent ring-1 ring-accent/20'
              )}
              style={{ paddingLeft: `${(item.level - 1) * 12 + 8}px` }}
            >
              <OutlineIcon item={item} />
              <span className="min-w-0 flex-1 truncate">
                <span className={cn(item.type === 'symbol' && 'font-mono text-[12px]')}>{item.text}</span>
                {item.type === 'codeBlock' && (
                  <span className="ml-1 text-[10px] text-text-tertiary">
                    {item.line}-{item.endLine}
                  </span>
                )}
              </span>
              {item.type === 'symbol' && item.symbolKind && (
                <span className="shrink-0 rounded border border-border-subtle px-1 py-0.5 text-[9px] uppercase text-text-tertiary">
                  {item.symbolKind}
                </span>
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export function renderOutlineIcon(item: OutlineItem) {
  return <OutlineIcon item={item} />;
}
