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
  getMarkdownFileMetadata,
  revealMarkdownFile,
  renameWorkspaceEntry,
  showDesktopNotification,
  writeFileContent,
  writeFileContentAs
} from './fs';
import { fileNameFromPath } from './path';
import { getErrorMessage } from './utils';
import { invoke, isTauriRuntime } from './tauriRuntime';
import { useStore, type DocumentTab, type SaveFailureType, type SaveHistorySource } from '../store';

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

export async function ensureCanReplaceWorkspaceDocuments(): Promise<boolean> {
  const {
    locale,
    requestUnsavedChangeChoice,
    markSaveError
  } = useStore.getState();
  const dirtyTabs = getCurrentDocumentTabs().filter((tab) => tab.isDirty);

  if (dirtyTabs.length === 0) return true;
  if (dirtyTabs.length === 1) {
    const tab = dirtyTabs[0];
    const choice = await requestUnsavedChangeChoice(
      locale === 'zh' ? '文档尚未保存' : 'Unsaved Changes',
      locale === 'zh'
        ? `“${tab.file.name}”还有未保存的修改。继续前要保存吗？`
        : `"${tab.file.name}" has unsaved changes. Save before continuing?`
    );

    if (choice === 'cancel') return false;
    if (choice === 'discard') return true;

    return saveDirtyTabs([tab.id], locale, markSaveError);
  }

  const previewNames = dirtyTabs.slice(0, 4).map((tab) => tab.file.name).join('、');
  const remainingCount = dirtyTabs.length - 4;
  const choice = await requestUnsavedChangeChoice(
    locale === 'zh' ? '多个标签页尚未保存' : 'Multiple Unsaved Tabs',
    locale === 'zh'
      ? `${dirtyTabs.length} 个标签页还有未保存的修改：${previewNames}${remainingCount > 0 ? ` 等 ${dirtyTabs.length} 个` : ''}。继续前要全部保存吗？`
      : `${dirtyTabs.length} tabs have unsaved changes: ${previewNames}${remainingCount > 0 ? ` and ${remainingCount} more` : ''}. Save all before continuing?`
  );

  if (choice === 'cancel') return false;
  if (choice === 'discard') return true;

  return saveDirtyTabs(dirtyTabs.map((tab) => tab.id), locale, markSaveError);
}

export async function requestAppQuit(): Promise<boolean> {
  if (!(await ensureCanReplaceWorkspaceDocuments())) return false;
  if (!isTauriRuntime()) return false;

  await invoke('quit_app');
  return true;
}

export async function ensureCanModifyWorkspaceEntry(path: string): Promise<boolean> {
  const {
    locale,
    requestUnsavedChangeChoice,
    markSaveError
  } = useStore.getState();
  const dirtyTabs = getCurrentDocumentTabs().filter((tab) => (
    tab.isDirty && isSameOrChildPath(tab.file.path, path)
  ));

  if (dirtyTabs.length === 0) return true;

  const choice = await requestUnsavedChangeChoice(
    locale === 'zh' ? '相关标签页尚未保存' : 'Related Tabs Have Unsaved Changes',
    locale === 'zh'
      ? `${dirtyTabs.length} 个将受影响的标签页还有未保存修改。继续前要保存吗？`
      : `${dirtyTabs.length} affected tabs have unsaved changes. Save before continuing?`
  );

  if (choice === 'cancel') return false;
  if (choice === 'discard') return true;

  return saveDirtyTabs(dirtyTabs.map((tab) => tab.id), locale, markSaveError);
}


export async function openWorkspacePath(path: string, options: { skipUnsavedCheck?: boolean } = {}) {
  if (!options.skipUnsavedCheck && !(await ensureCanReplaceWorkspaceDocuments())) return false;

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
  const currentState = useStore.getState();
  const current = currentState.activeFile;
  const sameFile = Boolean(current?.path && current.path === path);
  if (!sameFile && !options.skipUnsavedCheck && !(await ensureCanReplaceActiveDocument())) return false;

  const documentTabs = getDocumentTabsFromState(currentState);
  const existingTab = documentTabs.find((tab) => tab.file.path === path);
  if (existingTab) {
    const { switchDocumentTab, setPendingEditorLine, setViewMode } = useStore.getState();
    switchDocumentTab(existingTab.id);
    if (line && line > 0) {
      setPendingEditorLine(line);
      setViewMode('split');
    }
    return true;
  }

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
  const currentState = useStore.getState();
  const current = currentState.activeFile;
  const sameFile = Boolean(current?.path && current.path === path);
  if (!sameFile && !options.skipUnsavedCheck && !(await ensureCanReplaceActiveDocument())) return false;

  const documentTabs = getDocumentTabsFromState(currentState);
  const existingTab = documentTabs.find((tab) => tab.file.path === path);
  if (existingTab) {
    const { switchDocumentTab, setPendingEditorLine, setViewMode } = useStore.getState();
    switchDocumentTab(existingTab.id);
    if (line && line > 0) setPendingEditorLine(line);
    if (!existingTab.file.isMarkdown) {
      setViewMode('edit');
    } else if ((line && line > 0) || currentState.viewMode === 'code') {
      setViewMode('split');
    }
    return true;
  }

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
  } else if ((line && line > 0) || currentState.viewMode === 'code') {
    setViewMode('split');
  }
  return true;
}

export async function saveActiveFile(source: SaveHistorySource = 'manual'): Promise<boolean> {
  const {
    activeFile,
    activeFileContent,
    activeFileMetadata,
    isDirty,
    markSaving,
    markSaved,
    markSaveError,
    openSaveConflict,
    recordSaveHistory
  } = useStore.getState();

  if (!activeFile || !isDirty) return true;
    if (activeFile.readOnly || !activeFile.isMarkdown) {
    const message = activeFile.readOnly ? '当前文件以只读方式打开' : '当前只支持保存 Markdown 文件';
    markSaveError(message);
    void notifySaveFailure(activeFile.name, message, source);
    recordSaveHistory({
      filePath: activeFile.path || activeFile.name,
      fileName: activeFile.name,
      source,
      success: false,
      failureType: activeFile.readOnly ? 'readonly' : 'unsupported',
      message
    });
    return false;
  }
  if (!activeFile.path) {
    return saveActiveFileAs();
  }

  try {
    markSaving();
    const metadata = await writeFileContent(activeFile.path, activeFileContent, activeFileMetadata);
    markSaved(metadata);
    recordSaveHistory({
      filePath: activeFile.path,
      fileName: activeFile.name,
      source,
      success: true,
      failureType: 'none',
      message: source === 'auto' ? '自动保存成功' : '保存成功'
    });
    return true;
  } catch (err: unknown) {
    console.error('Save failed', err);
    const message = getErrorMessage(err) || '保存失败';
    markSaveError(message);
    void notifySaveFailure(activeFile.name, message, source);
    recordSaveHistory({
      filePath: activeFile.path,
      fileName: activeFile.name,
      source,
      success: false,
      failureType: classifySaveFailure(message),
      message
    });
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

async function saveDirtyTabs(
  tabIds: string[],
  locale: 'zh' | 'en',
  markSaveError: (message: string) => void
) {
  const { activeTabId, switchDocumentTab } = useStore.getState();

  for (const tabId of tabIds) {
    const latest = useStore.getState();
    const tab = getCurrentDocumentTabs().find((item) => item.id === tabId);
    if (!tab || !tab.isDirty) continue;

    if (latest.activeTabId !== tabId) {
      switchDocumentTab(tabId);
    }

    const saved = await saveActiveFile('manual');
    const afterSave = useStore.getState();
    if (!saved || afterSave.saveState === 'error') {
      markSaveError(afterSave.saveMessage || (locale === 'zh' ? '保存失败，已取消后续操作。' : 'Save failed; action cancelled.'));
      return false;
    }
  }

  const finalState = useStore.getState();
  if (activeTabId && getDocumentTabsFromState(finalState).some((tab) => tab.id === activeTabId)) {
    finalState.switchDocumentTab(activeTabId);
  }
  return true;
}

export async function saveActiveFileAs(): Promise<boolean> {
  const {
    activeFile,
    activeFileContent,
    markSaving,
    markSaved,
    markSaveError,
    setActiveFile,
    closeDocumentTab,
    activeTabId,
    recordSaveHistory
  } = useStore.getState();

  if (!activeFile) return true;

  try {
    markSaving();
    const document = await writeFileContentAs(activeFile.name || 'Untitled.md', activeFileContent);
    if (!document) {
      markSaveError('已取消保存');
      recordSaveHistory({
        filePath: activeFile.path || activeFile.name,
        fileName: activeFile.name,
        source: 'save-as',
        success: false,
        failureType: 'cancelled',
        message: '已取消保存'
      });
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
    if (activeTabId && activeTabId !== document.path) {
      closeDocumentTab(activeTabId);
    }
    markSaved(document.metadata);
    recordSaveHistory({
      filePath: document.path,
      fileName: fileNameFromPath(document.path),
      source: 'save-as',
      success: true,
      failureType: 'none',
      message: '另存为成功'
    });
    return true;
  } catch (err: unknown) {
    console.error('Save as failed', err);
    const message = getErrorMessage(err) || '另存为失败';
    markSaveError(message);
    void notifySaveFailure(activeFile.name, message, 'save-as');
    recordSaveHistory({
      filePath: activeFile.path || activeFile.name,
      fileName: activeFile.name,
      source: 'save-as',
      success: false,
      failureType: classifySaveFailure(message),
      message
    });
    return false;
  }
}

export async function createUntitledMarkdownFile() {
  useStore.getState().createUntitledFile();
  return true;
}

export async function createMarkdownFileInWorkspace(parentPath: string, name: string) {
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
  const { updateDocumentTabPath } = useStore.getState();
  if (!(await ensureCanModifyWorkspaceEntry(path))) return false;

  const newPath = await renameWorkspaceEntry(path, newName);
  await refreshWorkspaceTree();
  updateDocumentTabPath(path, newPath, fileNameFromPath(newPath));

  return newPath;
}

export async function deleteEntryInWorkspace(path: string) {
  const { closeDocumentTabsByPath } = useStore.getState();
  if (!(await ensureCanModifyWorkspaceEntry(path))) return false;

  await deleteWorkspaceEntry(path);
  await refreshWorkspaceTree();
  closeDocumentTabsByPath(path);

  return true;
}

export async function revealActiveFile() {
  const { activeFile, markSaveError } = useStore.getState();
  if (!activeFile?.path) return;

  try {
    await revealMarkdownFile(activeFile.path);
  } catch (err: unknown) {
    console.error('Reveal failed', err);
    markSaveError(getErrorMessage(err) || '无法在 Finder 中显示文件');
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
  } catch (err: unknown) {
    console.error('Reload failed', err);
    markSaveError(getErrorMessage(err) || '重新加载失败');
    return false;
  }
}

export async function checkActiveFileExternalModification(): Promise<boolean> {
  const {
    activeFile,
    activeFileMetadata,
    isDirty,
    markSaveError,
    openSaveConflict
  } = useStore.getState();

  if (!activeFile?.path || !activeFile.isMarkdown || !activeFileMetadata) return false;

  try {
    const metadata = await getMarkdownFileMetadata(activeFile.path);
    if (
      metadata.modifiedAt === activeFileMetadata.modifiedAt
      && metadata.size === activeFileMetadata.size
    ) {
      return false;
    }

    if (!isDirty) {
      return reloadActiveFileFromDisk();
    }

    const message = '文件已在外部被修改';
    markSaveError(message);
    openSaveConflict({
      path: activeFile.path,
      fileName: activeFile.name,
      message
    });
    return true;
  } catch (err) {
    console.warn('Failed to check active file metadata', err);
    return false;
  }
}

function isExternalModificationError(message: string) {
  return message.includes('文件已在外部被修改')
    || message.toLowerCase().includes('externally modified');
}

function classifySaveFailure(message: string): SaveFailureType {
  const normalized = message.toLowerCase();
  if (isExternalModificationError(message) || normalized.includes('changed on disk') || message.includes('外部')) {
    return 'conflict';
  }
  if (
    normalized.includes('permission')
    || normalized.includes('denied')
    || normalized.includes('readonly')
    || normalized.includes('read-only')
    || message.includes('权限')
    || message.includes('只读')
  ) {
    return 'permission';
  }
  if (
    normalized.includes('not found')
    || normalized.includes('no such file')
    || normalized.includes('missing')
    || message.includes('不存在')
  ) {
    return 'missing';
  }
  if (normalized.includes('cancel') || message.includes('取消')) {
    return 'cancelled';
  }
  if (normalized.includes('unsupported') || normalized.includes('markdown') || message.includes('不支持')) {
    return 'unsupported';
  }
  return 'unknown';
}

async function notifySaveFailure(fileName: string, message: string, source: SaveHistorySource) {
  try {
    await showDesktopNotification(
      source === 'auto' ? 'InkStack 自动保存失败' : 'InkStack 保存失败',
      `${fileName}: ${message}`
    );
  } catch (error) {
    console.warn('Desktop notification failed', error);
  }
}

function isSameOrChildPath(candidatePath: string, parentPath: string) {
  if (!candidatePath || !parentPath) return false;
  const normalizedCandidate = candidatePath.replace(/\/+$/, '');
  const normalizedParent = parentPath.replace(/\/+$/, '');
  return normalizedCandidate === normalizedParent
    || normalizedCandidate.startsWith(`${normalizedParent}/`);
}

function getCurrentDocumentTabs(): DocumentTab[] {
  const state = useStore.getState();
  const documentTabs = getDocumentTabsFromState(state);
  if (!state.activeTabId || !state.activeFile) return documentTabs;

  const activeSnapshot: DocumentTab = {
    id: state.activeTabId,
    file: state.activeFile,
    content: state.activeFileContent,
    metadata: state.activeFileMetadata,
    isDirty: state.isDirty,
    saveState: state.saveState,
    saveMessage: state.saveMessage,
    currentEditorLine: state.currentEditorLine
  };
  const existing = documentTabs.findIndex((tab) => tab.id === state.activeTabId);
  if (existing === -1) return [activeSnapshot, ...documentTabs];

  return documentTabs.map((tab) => (tab.id === state.activeTabId ? activeSnapshot : tab));
}

function getDocumentTabsFromState(state: { documentTabs: DocumentTab[] }): DocumentTab[] {
  return Array.isArray(state.documentTabs) ? state.documentTabs : [];
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
