import {
  Bold,
  Code,
  Code2,
  Eye,
  EyeOff,
  FileUp,
  Heading1,
  Heading2,
  Heading3,
  Image,
  Italic,
  Link,
  List,
  ListChecks,
  ListOrdered,
  Minus,
  MoveUp,
  Quote,
  Strikethrough,
  Table2
} from 'lucide-react';
import { useEffect, useMemo, useState, type PointerEvent as ReactPointerEvent, type ReactNode } from 'react';
import type { MarkdownEditorCommand } from '../lib/appEvents';
import { getMarkdownCommandTitle } from '../lib/markdownCommands';
import type { MarkdownToolbarPrefs, MarkdownToolbarRow } from '../store';
import { cn } from '../lib/utils';

type ToolbarItemDefinition = {
  id: string;
  command?: MarkdownEditorCommand;
  title: (locale: 'zh' | 'en') => string;
  icon: ReactNode;
  shortLabel?: string;
};

const TOOLBAR_ITEMS: ToolbarItemDefinition[] = [
  { id: 'heading1', command: 'heading1', title: (l) => getMarkdownCommandTitle('heading1', l), icon: <Heading1 size={14} />, shortLabel: 'H1' },
  { id: 'heading2', command: 'heading2', title: (l) => getMarkdownCommandTitle('heading2', l), icon: <Heading2 size={14} />, shortLabel: 'H2' },
  { id: 'heading3', command: 'heading3', title: (l) => getMarkdownCommandTitle('heading3', l), icon: <Heading3 size={14} />, shortLabel: 'H3' },
  { id: 'bold', command: 'bold', title: (l) => getMarkdownCommandTitle('bold', l), icon: <Bold size={14} /> },
  { id: 'italic', command: 'italic', title: (l) => getMarkdownCommandTitle('italic', l), icon: <Italic size={14} /> },
  { id: 'strike', command: 'strike', title: (l) => getMarkdownCommandTitle('strike', l), icon: <Strikethrough size={14} /> },
  { id: 'inlineCode', command: 'inlineCode', title: (l) => getMarkdownCommandTitle('inlineCode', l), icon: <Code size={14} /> },
  { id: 'codeBlock', command: 'codeBlock', title: (l) => getMarkdownCommandTitle('codeBlock', l), icon: <Code2 size={14} /> },
  { id: 'quote', command: 'quote', title: (l) => getMarkdownCommandTitle('quote', l), icon: <Quote size={14} /> },
  { id: 'bulletList', command: 'bulletList', title: (l) => getMarkdownCommandTitle('bulletList', l), icon: <List size={14} /> },
  { id: 'orderedList', command: 'orderedList', title: (l) => getMarkdownCommandTitle('orderedList', l), icon: <ListOrdered size={14} /> },
  { id: 'taskList', command: 'taskList', title: (l) => getMarkdownCommandTitle('taskList', l), icon: <ListChecks size={14} /> },
  { id: 'link', command: 'link', title: (l) => getMarkdownCommandTitle('link', l), icon: <Link size={14} /> },
  { id: 'image', command: 'image', title: (l) => getMarkdownCommandTitle('image', l), icon: <Image size={14} /> },
  { id: 'attachment', command: 'attachment', title: (l) => getMarkdownCommandTitle('attachment', l), icon: <FileUp size={14} /> },
  { id: 'table', command: 'table', title: (l) => getMarkdownCommandTitle('table', l), icon: <Table2 size={14} /> },
  { id: 'formatTable', command: 'formatTable', title: (l) => getMarkdownCommandTitle('formatTable', l), icon: <Table2 size={14} />, shortLabel: 'FMT' },
  { id: 'insertTableRow', command: 'insertTableRow', title: (l) => getMarkdownCommandTitle('insertTableRow', l), icon: <ListOrdered size={14} />, shortLabel: '+R' },
  { id: 'insertTableColumn', command: 'insertTableColumn', title: (l) => getMarkdownCommandTitle('insertTableColumn', l), icon: <List size={14} />, shortLabel: '+C' },
  { id: 'divider', command: 'divider', title: (l) => getMarkdownCommandTitle('divider', l), icon: <Minus size={14} /> }
];

type DropIndicator = { row: MarkdownToolbarRow; targetId: string; side: 'before' | 'after' };

type MarkdownToolbarProps = {
  locale: 'zh' | 'en';
  toolbarPrefs: MarkdownToolbarPrefs;
  onToolbarPrefsChange: (prefs: MarkdownToolbarPrefs) => void;
  onAction: (action: MarkdownEditorCommand) => void;
};

export function MarkdownToolbar({
  locale,
  toolbarPrefs,
  onToolbarPrefsChange,
  onAction
}: MarkdownToolbarProps) {
  const [customizeOpen, setCustomizeOpen] = useState(false);
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [dropIndicator, setDropIndicator] = useState<DropIndicator | null>(null);

  useEffect(() => {
    const onToggle = () => setCustomizeOpen((open) => !open);
    window.addEventListener('inkstack:toggle-toolbar-customize', onToggle as EventListener);
    return () => window.removeEventListener('inkstack:toggle-toolbar-customize', onToggle as EventListener);
  }, []);

  const itemMap = useMemo(() => new Map(TOOLBAR_ITEMS.map((item) => [item.id, item])), []);
  const orderedItems = useMemo(
    () => toolbarPrefs.order.map((id) => itemMap.get(id)).filter(Boolean) as ToolbarItemDefinition[],
    [toolbarPrefs.order, itemMap]
  );

  const commonItems = orderedItems.filter((item) => toolbarPrefs.items[item.id]?.visible && toolbarPrefs.items[item.id]?.row === 'common');
  const moreItems = orderedItems.filter((item) => toolbarPrefs.items[item.id]?.visible && toolbarPrefs.items[item.id]?.row === 'more');
  const hasCommon = commonItems.length > 0;
  const hasMore = moreItems.length > 0;

  const updateItem = (id: string, patch: Partial<{ visible: boolean; row: MarkdownToolbarRow }>) => {
    const current = toolbarPrefs.items[id];
    if (!current) return;
    onToolbarPrefsChange({
      ...toolbarPrefs,
      items: {
        ...toolbarPrefs.items,
        [id]: {
          visible: patch.visible ?? current.visible,
          row: patch.row ?? current.row
        }
      }
    });
  };

  const applyDrop = (sourceId: string, indicator: DropIndicator) => {
    const nextOrder = [...toolbarPrefs.order];
    const fromIndex = nextOrder.indexOf(sourceId);
    const targetIndex = nextOrder.indexOf(indicator.targetId);
    if (fromIndex < 0 || targetIndex < 0 || sourceId === indicator.targetId) return;
    nextOrder.splice(fromIndex, 1);
    const anchor = nextOrder.indexOf(indicator.targetId);
    const insertIndex = indicator.side === 'before' ? anchor : anchor + 1;
    nextOrder.splice(Math.max(0, insertIndex), 0, sourceId);
    onToolbarPrefsChange({
      ...toolbarPrefs,
      order: nextOrder,
      items: {
        ...toolbarPrefs.items,
        [sourceId]: {
          ...toolbarPrefs.items[sourceId],
          row: indicator.row
        }
      }
    });
  };

  const setIndicatorFromPointer = (
    row: MarkdownToolbarRow,
    targetId: string,
    event: ReactPointerEvent<HTMLButtonElement>
  ) => {
    if (!draggingId) return;
    const rect = event.currentTarget.getBoundingClientRect();
    const side = event.clientX < rect.left + rect.width / 2 ? 'before' : 'after';
    setDropIndicator({ row, targetId, side });
  };

  return (
    <div className="absolute bottom-6 left-1/2 z-10 flex max-w-[calc(100%-2rem)] -translate-x-1/2 flex-col items-center gap-1.5">
      <div className="w-fit max-w-[calc(100vw-2rem)] rounded-2xl border border-border-subtle bg-bg-base/92 p-2 text-text-secondary shadow-xl backdrop-blur transition-opacity">
        {hasCommon && (
          <div className="toolbar-no-scrollbar flex flex-wrap justify-center gap-1 overflow-x-auto pb-1">
            {commonItems.map((item) => (
              <RenderToolbarItem
                key={item.id}
                locale={locale}
                item={item}
                onAction={onAction}
                dragging={draggingId === item.id}
                indicatorSide={dropIndicator && dropIndicator.row === 'common' && dropIndicator.targetId === item.id ? dropIndicator.side : null}
                onDragPointerDown={() => setDraggingId(item.id)}
                onDragPointerMove={(event) => setIndicatorFromPointer('common', item.id, event)}
                onDragPointerUp={() => {
                  if (draggingId && dropIndicator) applyDrop(draggingId, dropIndicator);
                  setDraggingId(null);
                  setDropIndicator(null);
                }}
                onDragPointerCancel={() => {
                  setDraggingId(null);
                  setDropIndicator(null);
                }}
              />
            ))}
          </div>
        )}

        {hasCommon && hasMore && <div className="my-1 h-px bg-border-subtle" />}

        {hasMore && (
          <div className="toolbar-no-scrollbar flex flex-wrap justify-center gap-1 overflow-x-auto">
            {moreItems.map((item) => (
              <RenderToolbarItem
                key={item.id}
                locale={locale}
                item={item}
                onAction={onAction}
                dragging={draggingId === item.id}
                indicatorSide={dropIndicator && dropIndicator.row === 'more' && dropIndicator.targetId === item.id ? dropIndicator.side : null}
                onDragPointerDown={() => setDraggingId(item.id)}
                onDragPointerMove={(event) => setIndicatorFromPointer('more', item.id, event)}
                onDragPointerUp={() => {
                  if (draggingId && dropIndicator) applyDrop(draggingId, dropIndicator);
                  setDraggingId(null);
                  setDropIndicator(null);
                }}
                onDragPointerCancel={() => {
                  setDraggingId(null);
                  setDropIndicator(null);
                }}
              />
            ))}
          </div>
        )}
      </div>

      {customizeOpen && (
        <div className="mt-2 rounded-lg border border-border-subtle bg-bg-panel p-2.5">
          <div className="mb-2 text-[11px] text-text-tertiary">
            {locale === 'zh' ? '可在工具栏直接拖动排序；这里仅控制显示与分组。' : 'Drag directly on toolbar to reorder; use this panel for visibility and row only.'}
          </div>
          <div className="max-h-52 space-y-1.5 overflow-y-auto pr-1">
            {orderedItems.map((item) => {
              const pref = toolbarPrefs.items[item.id];
              return (
                <div key={item.id} className="flex items-center justify-between rounded-md border border-border-subtle bg-bg-base px-2 py-1.5">
                  <div className="flex items-center gap-2">
                    <span className="text-[12px] text-text-primary">{item.title(locale)}</span>
                  </div>
                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => updateItem(item.id, { row: pref.row === 'common' ? 'more' : 'common' })}
                      className="rounded px-1.5 py-1 text-[10px] text-text-secondary hover:bg-bg-hover hover:text-text-primary"
                      title={locale === 'zh' ? '切换分组' : 'Switch row'}
                    >
                      <MoveUp size={12} />
                    </button>
                    <button
                      onClick={() => updateItem(item.id, { visible: !pref.visible })}
                      className="rounded px-1.5 py-1 text-[10px] text-text-secondary hover:bg-bg-hover hover:text-text-primary"
                      title={pref.visible ? (locale === 'zh' ? '隐藏' : 'Hide') : (locale === 'zh' ? '显示' : 'Show')}
                    >
                      {pref.visible ? <Eye size={12} /> : <EyeOff size={12} />}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

function RenderToolbarItem({
  locale,
  item,
  onAction,
  dragging,
  indicatorSide,
  onDragPointerDown,
  onDragPointerMove,
  onDragPointerUp,
  onDragPointerCancel
}: {
  locale: 'zh' | 'en';
  item: ToolbarItemDefinition;
  onAction: (action: MarkdownEditorCommand) => void;
  dragging?: boolean;
  indicatorSide?: 'before' | 'after' | null;
  onDragPointerDown?: () => void;
  onDragPointerMove?: (event: ReactPointerEvent<HTMLButtonElement>) => void;
  onDragPointerUp?: () => void;
  onDragPointerCancel?: () => void;
}) {
  if (!item.command) return null;
  return (
    <button
      onClick={() => onAction(item.command!)}
      onPointerDown={onDragPointerDown}
      onPointerMove={onDragPointerMove}
      onPointerUp={onDragPointerUp}
      onPointerCancel={onDragPointerCancel}
      className={cn(
        "relative flex h-7 min-w-7 shrink-0 cursor-grab items-center justify-center gap-1 rounded-full px-1.5 text-[11px] font-medium transition-colors hover:bg-bg-hover hover:text-text-primary active:cursor-grabbing",
        dragging && "bg-bg-hover",
        indicatorSide === 'before' && "before:absolute before:-left-1 before:top-1/2 before:h-4 before:w-[2px] before:-translate-y-1/2 before:rounded before:bg-accent",
        indicatorSide === 'after' && "after:absolute after:-right-1 after:top-1/2 after:h-4 after:w-[2px] after:-translate-y-1/2 after:rounded after:bg-accent"
      )}
      title={item.title(locale)}
    >
      {item.icon}
      {item.shortLabel && <span className="sr-only">{item.shortLabel}</span>}
    </button>
  );
}
