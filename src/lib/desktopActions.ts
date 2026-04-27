import {
  buildFileTree,
  createWorkspaceFolder,
  createWorkspaceMarkdownFile,
  deleteWorkspaceEntry,
  FileNode,
  loadDirectoryChildren,
  openMarkdownFile,
  openTextFile,
  readMarkdownFile,
  readTextFile,
  revealMarkdownFile,
  renameWorkspaceEntry,
  writeFileContent,
  writeFileContentAs
} from './fs';
import { fileNameFromPath } from './path';
import { useStore } from '../store';

export async function ensureCanReplaceActiveDocument(): Promise<boolean> {
  const {
    activeFile,
    isDirty,
    locale,
    requestUnsavedChangeChoice,
    markSaveError
  } = useStore.getState();

  if (!activeFile || !isDirty) return true;

  const title = locale === 'zh' ? '当前文档尚未保存' : 'Unsaved Changes';
  const message = locale === 'zh'
    ? `“${activeFile.name}”还有未保存的修改。继续前要保存吗？`
    : `"${activeFile.name}" has unsaved changes. Save before continuing?`;
  const choice = await requestUnsavedChangeChoice(title, message);

  if (choice === 'cancel') return false;
  if (choice === 'discard') return true;

  await saveActiveFile();
  const latest = useStore.getState();
  if (latest.isDirty || latest.saveState === 'error') {
    markSaveError(latest.saveMessage || (locale === 'zh' ? '保存失败，已取消切换。' : 'Save failed; navigation cancelled.'));
    return false;
  }

  return true;
}

export async function openWorkspacePath(path: string, options: { skipUnsavedCheck?: boolean } = {}) {
  if (!options.skipUnsavedCheck && !(await ensureCanReplaceActiveDocument())) return false;

  const tree = await buildFileTree(path);
  const { setRootPath, setFileTree } = useStore.getState();
  setRootPath(path);
  setFileTree(tree);
  return true;
}

export async function refreshWorkspaceTree(path?: string | null) {
  const { rootPath, fileTree, setDirectoryChildren, setFileTree } = useStore.getState();
  const workspacePath = rootPath ?? path;
  if (!workspacePath) return false;

  const loadedDirectoryPaths = collectLoadedDirectoryPaths(fileTree);
  const tree = await buildFileTree(workspacePath);
  setFileTree(tree);

  for (const directoryPath of loadedDirectoryPaths) {
    try {
      const children = await loadDirectoryChildren(directoryPath);
      setDirectoryChildren(directoryPath, children);
    } catch (err) {
      console.warn('Failed to refresh loaded directory', directoryPath, err);
    }
  }

  return true;
}

export async function openMarkdownPath(path: string, line?: number | null, options: { skipUnsavedCheck?: boolean } = {}) {
  const current = useStore.getState().activeFile;
  const sameFile = Boolean(current?.path && current.path === path);
  if (!sameFile && !options.skipUnsavedCheck && !(await ensureCanReplaceActiveDocument())) return false;

  const document = await openMarkdownFile(path);
  const { setActiveFile, setPendingEditorLine, setViewMode } = useStore.getState();

  setActiveFile(
    {
      name: fileNameFromPath(document.path),
      kind: 'file',
      path: document.path,
      isMarkdown: true,
      isText: true,
      fileKind: 'markdown',
      language: 'markdown',
      readOnly: false,
      isLoaded: true,
      isTruncated: false
    },
    document.content,
    document.metadata
  );
  if (line && line > 0) {
    setPendingEditorLine(line);
    setViewMode('split');
  }
  return true;
}

export async function openTextPath(path: string, line?: number | null, options: { skipUnsavedCheck?: boolean } = {}) {
  const current = useStore.getState().activeFile;
  const sameFile = Boolean(current?.path && current.path === path);
  if (!sameFile && !options.skipUnsavedCheck && !(await ensureCanReplaceActiveDocument())) return false;

  const document = await openTextFile(path);
  const { setActiveFile, setPendingEditorLine, setViewMode } = useStore.getState();

  setActiveFile(
    {
      name: fileNameFromPath(document.path),
      kind: 'file',
      path: document.path,
      isMarkdown: document.isMarkdown,
      isText: true,
      fileKind: document.fileKind,
      language: document.language,
      readOnly: document.readOnly,
      isLoaded: true,
      isTruncated: false
    },
    document.content,
    document.metadata
  );
  if (line && line > 0) {
    setPendingEditorLine(line);
  }
  if (!document.isMarkdown) {
    setViewMode('edit');
  } else if (line && line > 0) {
    setViewMode('split');
  }
  return true;
}

export async function saveActiveFile(): Promise<boolean> {
  const {
    activeFile,
    activeFileContent,
    activeFileMetadata,
    isDirty,
    markSaving,
    markSaved,
    markSaveError,
    openSaveConflict
  } = useStore.getState();

  if (!activeFile || !isDirty) return true;
  if (activeFile.readOnly || !activeFile.isMarkdown) {
    markSaveError(activeFile.readOnly ? '当前文件以只读方式打开' : '当前只支持保存 Markdown 文件');
    return false;
  }
  if (!activeFile.path) {
    return saveActiveFileAs();
  }

  try {
    markSaving();
    const metadata = await writeFileContent(activeFile.path, activeFileContent, activeFileMetadata);
    markSaved(metadata);
    return true;
  } catch (err: any) {
    console.error('Save failed', err);
    const message = err?.message ?? '保存失败';
    markSaveError(message);
    if (isExternalModificationError(message)) {
      openSaveConflict({
        path: activeFile.path,
        fileName: activeFile.name,
        message
      });
    }
    return false;
  }
}

export async function saveActiveFileAs(): Promise<boolean> {
  const {
    activeFile,
    activeFileContent,
    markSaving,
    markSaved,
    markSaveError,
    setActiveFile
  } = useStore.getState();

  if (!activeFile) return true;

  try {
    markSaving();
    const document = await writeFileContentAs(activeFile.name || 'Untitled.md', activeFileContent);
    if (!document) {
      markSaveError('已取消保存');
      return false;
    }

    const file = {
      name: fileNameFromPath(document.path),
      kind: 'file' as const,
      path: document.path,
      isMarkdown: true,
      isText: true,
      fileKind: 'markdown' as const,
      language: 'markdown',
      readOnly: false,
      isLoaded: true,
      isTruncated: false
    };

    setActiveFile(file, document.content, document.metadata);
    markSaved(document.metadata);
    return true;
  } catch (err: any) {
    console.error('Save as failed', err);
    markSaveError(err?.message ?? '另存为失败');
    return false;
  }
}

export async function createUntitledMarkdownFile() {
  if (!(await ensureCanReplaceActiveDocument())) return false;
  useStore.getState().createUntitledFile();
  return true;
}

export async function createMarkdownFileInWorkspace(parentPath: string, name: string) {
  if (!(await ensureCanReplaceActiveDocument())) return false;

  const document = await createWorkspaceMarkdownFile(parentPath, name);
  await refreshWorkspaceTree();
  const { setActiveFile, setViewMode } = useStore.getState();
  setActiveFile(
    {
      name: fileNameFromPath(document.path),
      kind: 'file',
      path: document.path,
      isMarkdown: true,
      isText: true,
      fileKind: 'markdown',
      language: 'markdown',
      readOnly: false,
      isLoaded: true,
      isTruncated: false
    },
    document.content,
    document.metadata
  );
  setViewMode('split');
  return true;
}

export async function createFolderInWorkspace(parentPath: string, name: string) {
  await createWorkspaceFolder(parentPath, name);
  await refreshWorkspaceTree();
  return true;
}

export async function renameEntryInWorkspace(path: string, newName: string) {
  const { activeFile, setActiveFile } = useStore.getState();
  if (activeFile?.path === path && !(await ensureCanReplaceActiveDocument())) return false;

  const newPath = await renameWorkspaceEntry(path, newName);
  await refreshWorkspaceTree();

  if (activeFile?.path === path) {
    setActiveFile(
      {
        ...activeFile,
        name: fileNameFromPath(newPath),
        path: newPath
      },
      useStore.getState().activeFileContent,
      useStore.getState().activeFileMetadata
    );
  }

  return newPath;
}

export async function deleteEntryInWorkspace(path: string) {
  const { activeFile, clearActiveFile } = useStore.getState();
  if (activeFile?.path === path && !(await ensureCanReplaceActiveDocument())) return false;

  await deleteWorkspaceEntry(path);
  await refreshWorkspaceTree();

  if (activeFile?.path === path) {
    clearActiveFile();
  }

  return true;
}

export async function revealActiveFile() {
  const { activeFile, markSaveError } = useStore.getState();
  if (!activeFile?.path) return;

  try {
    await revealMarkdownFile(activeFile.path);
  } catch (err: any) {
    console.error('Reveal failed', err);
    markSaveError(err?.message ?? '无法在 Finder 中显示文件');
  }
}

export async function reloadActiveFileFromDisk(): Promise<boolean> {
  const { activeFile, setActiveFile, markSaveError, closeSaveConflict } = useStore.getState();
  if (!activeFile?.path) return false;

  try {
    const document = activeFile.isMarkdown
      ? await readMarkdownFile(activeFile.path)
      : await readTextFile(activeFile.path);
    setActiveFile(
      {
        ...activeFile,
        name: fileNameFromPath(document.path),
        path: document.path,
        isMarkdown: document.isMarkdown,
        isText: true,
        fileKind: document.fileKind,
        language: document.language,
        readOnly: document.readOnly,
        isLoaded: true,
        isTruncated: false
      },
      document.content,
      document.metadata
    );
    closeSaveConflict();
    return true;
  } catch (err: any) {
    console.error('Reload failed', err);
    markSaveError(err?.message ?? '重新加载失败');
    return false;
  }
}

function isExternalModificationError(message: string) {
  return message.includes('文件已在外部被修改')
    || message.toLowerCase().includes('externally modified');
}

function collectLoadedDirectoryPaths(nodes: FileNode[], limit = 80): string[] {
  const paths: string[] = [];

  const visit = (items: FileNode[]) => {
    for (const item of items) {
      if (paths.length >= limit) return;
      if (item.kind !== 'directory') continue;

      if (item.isLoaded) paths.push(item.path);
      if (item.children?.length) visit(item.children);
    }
  };

  visit(nodes);
  return paths;
}
