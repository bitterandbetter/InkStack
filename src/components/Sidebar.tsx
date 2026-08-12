import { Braces, ChevronDown, ChevronRight, FileCode2, FileText, FolderOpen, Pencil, Plus, Trash2 } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { useStore } from "../store";
import { FileNode, loadDirectoryChildren } from "../lib/fs";
import {
  createFolderInWorkspace,
  createMarkdownFileInWorkspace,
  deleteEntryInWorkspace,
  openTextPath,
  renameEntryInWorkspace
} from "../lib/desktopActions";
import { cn } from "../lib/utils";
import { runAppCommand } from "../lib/appCommands";
import { Tooltip } from "./Tooltip";
import { useToast } from "./Toast";
import { useModalDialogs } from "./modalDialogs";

const SIDEBAR_WIDTH_KEY = 'inkstack.sidebar.width.v1';
const SIDEBAR_MIN_WIDTH = 180;
const SIDEBAR_MAX_WIDTH = 400;

type ContextMenuState = {
  node: FileNode | null;
  parentPath: string;
  x: number;
  y: number;
};

const FileTreeNode = ({
  node,
  depth = 0,
  onContextMenu
}: {
  node: FileNode;
  depth?: number;
  onContextMenu: (node: FileNode, event: React.MouseEvent) => void;
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const { activeFile, setDirectoryChildren } = useStore();
  const toast = useToast();

  const isSelected = activeFile?.path === node.path;

  const handleClick = async () => {
    if (node.isTruncated) return;

    if (node.kind === 'directory') {
      const nextOpen = !isOpen;
      setIsOpen(nextOpen);
      if (nextOpen && !node.isLoaded && !isLoading) {
        try {
          setIsLoading(true);
          const children = await loadDirectoryChildren(node.path);
          setDirectoryChildren(node.path, children);
        } catch (err) {
          console.error("Failed to load directory", err);
        } finally {
          setIsLoading(false);
        }
      }
    } else {
      try {
        await openTextPath(node.path);
      } catch (err) {
        console.error("Failed to read file", err);
        toast.error(err instanceof Error ? err.message : String(err));
      }
    }
  };

  return (
    <div className="select-none text-[13px]">
      <div 
        className={cn(
          "flex items-center space-x-2 py-1 pr-2 rounded cursor-pointer transition-colors",
          isSelected 
            ? "bg-bg-base shadow-sm border border-border-subtle font-medium text-text-primary" 
            : "text-text-secondary hover:bg-bg-hover border border-transparent"
        )}
        style={{ paddingLeft: `${depth * 12 + 8}px` }}
        onClick={handleClick}
        onContextMenu={(event) => onContextMenu(node, event)}
      >
        {node.kind === 'directory' ? (
          <span className="flex items-center">
            {isOpen ? <ChevronDown size={14} className="mr-1 opacity-50" /> : <ChevronRight size={14} className="mr-1 opacity-50" />}
            <FolderOpen size={14} className="mr-1.5 text-accent" />
            <span className={cn("truncate", node.isTruncated && "text-text-tertiary italic")}>
              {node.name}{isLoading ? '...' : ''}
            </span>
          </span>
        ) : (
          <span className="flex items-center pl-4 w-full">
            <FileIcon node={node} />
            <span className="truncate">{node.name}</span>
          </span>
        )}
      </div>
      
      {node.kind === 'directory' && isOpen && node.children && (
        <div className="flex flex-col mt-0.5 space-y-0.5">
          {node.children.map((child) => (
            <FileTreeNode key={child.path} node={child} depth={depth + 1} onContextMenu={onContextMenu} />
          ))}
        </div>
      )}
    </div>
  );
};

function FileIcon({ node }: { node: FileNode }) {
  if (node.isMarkdown) {
    return <span className="text-accent font-bold mr-2 opacity-80 text-sm">#</span>;
  }

  if (node.fileKind === 'code') {
    return <FileCode2 size={14} className="mr-2 text-accent opacity-80" />;
  }

  if (node.language === 'json' || node.language === 'yaml' || node.language === 'toml') {
    return <Braces size={14} className="mr-2 text-text-tertiary" />;
  }

  return <FileText size={14} className="mr-2 text-text-tertiary" />;
}

export function Sidebar() {
  const { rootPath, fileTree, sidebarOpen, locale } = useStore();
  const { prompt, confirmDialog, dialogElement } = useModalDialogs(locale);
  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null);
  const [sidebarWidth, setSidebarWidth] = useState(() => {
    const saved = localStorage.getItem(SIDEBAR_WIDTH_KEY);
    return saved ? Math.max(SIDEBAR_MIN_WIDTH, Math.min(SIDEBAR_MAX_WIDTH, Number(saved))) : 240;
  });
  const isDragging = useRef(false);
  const startX = useRef(0);
  const startWidth = useRef(0);

  const handleDragStart = useCallback((e: React.MouseEvent) => {
    isDragging.current = true;
    startX.current = e.clientX;
    startWidth.current = sidebarWidth;
    document.body.classList.add('inkstack-sidebar-resizing');

    const handleMouseMove = (moveEvent: MouseEvent) => {
      if (!isDragging.current) return;
      const delta = moveEvent.clientX - startX.current;
      const newWidth = Math.max(SIDEBAR_MIN_WIDTH, Math.min(SIDEBAR_MAX_WIDTH, startWidth.current + delta));
      setSidebarWidth(newWidth);
    };

    const handleMouseUp = () => {
      isDragging.current = false;
      document.body.classList.remove('inkstack-sidebar-resizing');
      localStorage.setItem(SIDEBAR_WIDTH_KEY, String(sidebarWidth));
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
  }, [sidebarWidth]);

  useEffect(() => {
    if (!contextMenu) return;
    const close = () => setContextMenu(null);
    window.addEventListener('click', close);
    window.addEventListener('keydown', close);
    window.addEventListener('blur', close);
    return () => {
      window.removeEventListener('click', close);
      window.removeEventListener('keydown', close);
      window.removeEventListener('blur', close);
    };
  }, [contextMenu]);

  if (!sidebarOpen) return null;

  const openContextMenu = (node: FileNode, event: React.MouseEvent) => {
    event.preventDefault();
    event.stopPropagation();
    setContextMenu({
      node,
      parentPath: node.kind === 'directory' ? node.path : parentPathFromFile(node.path),
      x: event.clientX,
      y: event.clientY
    });
  };

  const openRootContextMenu = (event: React.MouseEvent) => {
    if (!rootPath || event.target !== event.currentTarget) return;
    event.preventDefault();
    setContextMenu({
      node: null,
      parentPath: rootPath,
      x: event.clientX,
      y: event.clientY
    });
  };

  return (
    <div className="relative flex h-full shrink-0" style={{ width: sidebarWidth }}>
      <div className="flex-1 border-r border-border-subtle bg-bg-panel flex flex-col h-full overflow-hidden">
      <div className="p-4 flex items-center justify-between">
        <span className="text-[11px] font-bold text-text-tertiary uppercase tracking-wider">{locale === 'zh' ? '资源管理器' : 'Library'}</span>
        <div className="flex items-center gap-1">
          <Tooltip content={locale === 'zh' ? '打开本地目录 (⌘⇧O)' : 'Open Folder (⌘⇧O)'}>
            <button
              onClick={() => void runAppCommand('open-workspace')}
              className="rounded p-1 text-text-tertiary transition-colors hover:bg-bg-hover hover:text-text-primary"
            >
              <FolderOpen size={14} />
            </button>
          </Tooltip>
          <Tooltip content={locale === 'zh' ? '打开文件 (⌘O)' : 'Open File (⌘O)'}>
            <button
              onClick={() => void runAppCommand('open-file')}
              className="rounded p-1 text-text-tertiary transition-colors hover:bg-bg-hover hover:text-text-primary"
            >
              <FileText size={14} />
            </button>
          </Tooltip>
        </div>
      </div>
      <div className="flex-1 overflow-y-auto px-2 pb-4 space-y-0.5" onContextMenu={openRootContextMenu}>
        {rootPath ? (
          fileTree.length > 0 ? (
            fileTree.map(node => <FileTreeNode key={node.path} node={node} onContextMenu={openContextMenu} />)
          ) : (
            <div className="text-[13px] text-text-tertiary p-2 text-center mt-4">
              {locale === 'zh' ? '目录为空' : 'Empty Directory'}
            </div>
          )
        ) : (
          <div className="text-[13px] text-text-tertiary p-2 text-center mt-4">
            {locale === 'zh' ? '请点击顶部打开文件夹' : 'Open a folder from the header'}
          </div>
        )}
      </div>
      {contextMenu && (
        <WorkspaceContextMenu
          state={contextMenu}
          locale={locale}
          onClose={() => setContextMenu(null)}
          prompt={prompt}
          confirmDialog={confirmDialog}
        />
      )}
      {dialogElement}
      </div>
      <div
        role="separator"
        aria-orientation="vertical"
        onMouseDown={handleDragStart}
        className="absolute right-0 top-0 z-30 flex h-full w-2 -translate-x-1/2 cursor-col-resize items-center justify-center group"
      >
        <div className="h-8 w-[3px] rounded-full bg-border-subtle transition-all group-hover:bg-accent/50 group-hover:h-12" />
      </div>
    </div>
  );
}

function WorkspaceContextMenu({
  state,
  locale,
  onClose,
  prompt,
  confirmDialog
}: {
  state: ContextMenuState;
  locale: 'zh' | 'en';
  onClose: () => void;
  prompt: (title: string, initialValue?: string, message?: string) => Promise<string | null>;
  confirmDialog: (title: string, message?: string, danger?: boolean, confirmLabel?: string) => Promise<boolean>;
}) {
  const node = state.node;
  const parentPath = state.parentPath;

  const run = async (action: () => Promise<unknown>) => {
    onClose();
    try {
      await action();
    } catch (err) {
      console.error('Workspace action failed', err);
    }
  };

  const createFile = () => run(async () => {
    const name = await prompt(locale === 'zh' ? '新建 Markdown 文件名' : 'New Markdown file name', 'Untitled.md');
    if (!name) return;
    await createMarkdownFileInWorkspace(parentPath, name);
  });

  const createFolder = () => run(async () => {
    const name = await prompt(locale === 'zh' ? '新建文件夹名称' : 'New folder name', 'New Folder');
    if (!name) return;
    await createFolderInWorkspace(parentPath, name);
  });

  const rename = () => run(async () => {
    if (!node) return;
    const name = await prompt(locale === 'zh' ? '重命名' : 'Rename', node.name);
    if (!name || name === node.name) return;
    await renameEntryInWorkspace(node.path, name);
  });

  const remove = () => run(async () => {
    if (!node) return;
    const confirmed = await confirmDialog(
      locale === 'zh' ? '确认删除' : 'Confirm Delete',
      locale === 'zh'
        ? `确认删除“${node.name}”？空文件夹和文件会直接删除。`
        : `Delete "${node.name}"? Files and empty folders are deleted directly.`,
      true,
      locale === 'zh' ? '删除' : 'Delete'
    );
    if (!confirmed) return;
    await deleteEntryInWorkspace(node.path);
  });

  return (
    <div
      className="fixed z-50 min-w-44 overflow-hidden rounded-md border border-border-subtle bg-bg-base py-1 text-[13px] text-text-secondary shadow-xl"
      style={{ left: state.x, top: state.y }}
      onClick={(event) => event.stopPropagation()}
      onContextMenu={(event) => event.preventDefault()}
    >
      <ContextMenuButton icon={<Plus size={14} />} label={locale === 'zh' ? '新建 Markdown' : 'New Markdown'} onClick={createFile} />
      <ContextMenuButton icon={<FolderOpen size={14} />} label={locale === 'zh' ? '新建文件夹' : 'New Folder'} onClick={createFolder} />
      {node && (
        <>
          <div className="my-1 h-px bg-border-subtle" />
          <ContextMenuButton icon={<Pencil size={14} />} label={locale === 'zh' ? '重命名' : 'Rename'} onClick={rename} />
          <ContextMenuButton danger icon={<Trash2 size={14} />} label={locale === 'zh' ? '删除' : 'Delete'} onClick={remove} />
        </>
      )}
    </div>
  );
}

function ContextMenuButton({
  icon,
  label,
  onClick,
  danger = false
}: {
  icon: React.ReactNode;
  label: string;
  onClick: () => void;
  danger?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        'flex w-full items-center gap-2 px-3 py-1.5 text-left hover:bg-bg-hover hover:text-text-primary',
        danger && 'text-red-500 hover:text-red-600'
      )}
    >
      {icon}
      {label}
    </button>
  );
}

function parentPathFromFile(path: string) {
  const normalized = path.replace(/\/+$/, '');
  const index = normalized.lastIndexOf('/');
  return index > 0 ? normalized.slice(0, index) : normalized;
}
