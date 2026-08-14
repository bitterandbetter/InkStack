import { invoke } from './tauriRuntime';

export interface FileNode {
  name: string;
  kind: 'file' | 'directory';
  path: string;
  isMarkdown: boolean;
  isText: boolean;
  fileKind: 'directory' | 'markdown' | 'code' | 'text' | 'unsupported';
  language: string | null;
  readOnly?: boolean;
  /** In-memory document that has not been assigned a disk path yet. */
  isUntitled?: boolean;
  isLoaded: boolean;
  isTruncated: boolean;
  children?: FileNode[];
}

export interface FileMetadata {
  modifiedAt: number;
  size: number;
}

type FileKind = 'markdown' | 'code' | 'text' | 'unsupported';

export interface ReadFileResult {
  path: string;
  content: string;
  metadata: FileMetadata;
  isMarkdown: boolean;
  fileKind: FileKind;
  language: string | null;
  readOnly: boolean;
}

export interface AppSettings {
  recentWorkspaces: string[];
  recentWorkspaceEntries: RecentEntryMeta[];
  recentFiles: string[];
  recentFileEntries: RecentEntryMeta[];
  pinnedWorkspaces: string[];
  pinnedFiles: string[];
  lastWorkspace: string | null;
  lastFile: string | null;
}

export interface RecentEntryMeta {
  path: string;
  openedAt: number;
}

export interface MarkdownSearchResult {
  name: string;
  path: string;
  relativePath: string;
  line: number | null;
  snippet: string | null;
  matchKind: 'file' | 'content';
}

interface TauriAppSettings {
  recent_workspaces?: string[];
  recent_workspace_entries?: TauriRecentEntryMeta[];
  recent_files?: string[];
  recent_file_entries?: TauriRecentEntryMeta[];
  pinned_workspaces?: string[];
  pinned_files?: string[];
  last_workspace?: string | null;
  last_file?: string | null;
}

interface TauriRecentEntryMeta {
  path: string;
  opened_at: number;
}

interface TauriFileEntry {
  name: string;
  path: string;
  is_dir: boolean;
  is_markdown: boolean;
  is_text: boolean;
  file_kind: string;
  language?: string | null;
  is_loaded: boolean;
  is_truncated: boolean;
  children: TauriFileEntry[];
}

interface TauriDirectoryScanResult {
  entries: TauriFileEntry[];
  truncated: boolean;
  limit: number;
}

interface TauriFileMetadata {
  modified_at: number;
  size: number;
}

interface TauriMarkdownDocument {
  path: string;
  content: string;
  metadata: TauriFileMetadata;
}

interface TauriTextDocument {
  path: string;
  content: string;
  metadata: TauriFileMetadata;
  is_markdown: boolean;
  file_kind: string;
  language?: string | null;
  read_only: boolean;
}

interface TauriSaveMarkdownResult {
  path: string;
  metadata: TauriFileMetadata;
}

interface TauriCreateWorkspaceEntryRequest {
  parent_path: string;
  name: string;
}

interface TauriRenameWorkspaceEntryRequest {
  path: string;
  new_name: string;
}

interface TauriMarkdownSearchResult {
  name: string;
  path: string;
  relative_path: string;
  line?: number | null;
  snippet?: string | null;
  match_kind: 'file' | 'content';
}

interface TauriMarkdownAsset {
  path: string;
}

interface TauriImportedMarkdownAsset {
  path: string;
  relative_src: string;
}

interface TauriPickedMarkdownAsset {
  source_path: string;
  path: string;
  relative_src: string;
  markdown_src: string;
  file_name: string;
  is_image: boolean;
}

function mapMetadata(metadata: TauriFileMetadata): FileMetadata {
  return {
    modifiedAt: metadata.modified_at,
    size: metadata.size
  };
}

function mapFileEntry(entry: TauriFileEntry): FileNode {
  const fileKind = normalizeFileKind(entry.file_kind);
  return {
    name: entry.name,
    kind: entry.is_dir ? 'directory' : 'file',
    path: entry.path,
    isMarkdown: entry.is_markdown,
    isText: entry.is_text,
    fileKind: entry.is_dir ? 'directory' : fileKind,
    language: entry.language ?? null,
    readOnly: !entry.is_markdown,
    isLoaded: entry.is_loaded,
    isTruncated: entry.is_truncated,
    children: entry.children?.map(mapFileEntry)
  };
}

function mapDocument(document: TauriMarkdownDocument): ReadFileResult {
  return {
    path: document.path,
    content: document.content,
    metadata: mapMetadata(document.metadata),
    isMarkdown: true,
    fileKind: 'markdown',
    language: 'markdown',
    readOnly: false
  };
}

function mapTextDocument(document: TauriTextDocument): ReadFileResult {
  return {
    path: document.path,
    content: document.content,
    metadata: mapMetadata(document.metadata),
    isMarkdown: document.is_markdown,
    fileKind: normalizeFileKind(document.file_kind),
    language: document.language ?? null,
    readOnly: document.read_only
  };
}

function normalizeFileKind(value: string): FileKind {
  if (value === 'markdown' || value === 'code' || value === 'text') {
    return value;
  }
  return 'unsupported';
}

function mapSettings(settings: TauriAppSettings): AppSettings {
  return {
    recentWorkspaces: settings.recent_workspaces ?? [],
    recentWorkspaceEntries: (settings.recent_workspace_entries ?? []).map(mapRecentEntryMeta),
    recentFiles: settings.recent_files ?? [],
    recentFileEntries: (settings.recent_file_entries ?? []).map(mapRecentEntryMeta),
    pinnedWorkspaces: settings.pinned_workspaces ?? [],
    pinnedFiles: settings.pinned_files ?? [],
    lastWorkspace: settings.last_workspace ?? null,
    lastFile: settings.last_file ?? null
  };
}

function unmapSettings(settings: AppSettings): TauriAppSettings {
  return {
    recent_workspaces: settings.recentWorkspaces,
    recent_workspace_entries: settings.recentWorkspaceEntries.map(unmapRecentEntryMeta),
    recent_files: settings.recentFiles,
    recent_file_entries: settings.recentFileEntries.map(unmapRecentEntryMeta),
    pinned_workspaces: settings.pinnedWorkspaces,
    pinned_files: settings.pinnedFiles,
    last_workspace: settings.lastWorkspace,
    last_file: settings.lastFile
  };
}

function mapRecentEntryMeta(entry: TauriRecentEntryMeta): RecentEntryMeta {
  return {
    path: entry.path,
    openedAt: entry.opened_at
  };
}

function unmapRecentEntryMeta(entry: RecentEntryMeta): TauriRecentEntryMeta {
  return {
    path: entry.path,
    opened_at: entry.openedAt
  };
}

export async function getSettings(): Promise<AppSettings> {
  return mapSettings(await invoke<TauriAppSettings>('get_settings'));
}

export async function updateSettings(settings: AppSettings): Promise<AppSettings> {
  return mapSettings(await invoke<TauriAppSettings>('update_settings', {
    settings: unmapSettings(settings)
  }));
}

export async function pruneMissingRecentEntries(): Promise<AppSettings> {
  return mapSettings(await invoke<TauriAppSettings>('prune_missing_recent_entries'));
}

export async function takeStartupMarkdownPaths(): Promise<string[]> {
  return invoke<string[]>('take_startup_markdown_paths');
}

export async function openDirectory(): Promise<string | null> {
  return invoke<string | null>('choose_workspace');
}

export async function openMarkdownFileDialog(): Promise<string | null> {
  return invoke<string | null>('choose_markdown_file');
}

export async function chooseMarkdownSavePath(suggestedName: string): Promise<string | null> {
  return invoke<string | null>('choose_markdown_save_path', { suggestedName });
}

export async function buildFileTree(rootPath: string): Promise<FileNode[]> {
  const result = await invoke<TauriDirectoryScanResult>('scan_directory', { path: rootPath });
  return result.entries.map(mapFileEntry);
}

export async function loadDirectoryChildren(path: string): Promise<FileNode[]> {
  const result = await invoke<TauriDirectoryScanResult>('scan_directory_children', { path });
  return result.entries.map(mapFileEntry);
}

export async function createWorkspaceMarkdownFile(parentPath: string, name: string): Promise<ReadFileResult> {
  return mapDocument(await invoke<TauriMarkdownDocument>('create_workspace_markdown_file', {
    request: {
      parent_path: parentPath,
      name
    } satisfies TauriCreateWorkspaceEntryRequest
  }));
}

export async function createWorkspaceFolder(parentPath: string, name: string): Promise<string> {
  return invoke<string>('create_workspace_folder', {
    request: {
      parent_path: parentPath,
      name
    } satisfies TauriCreateWorkspaceEntryRequest
  });
}

export async function renameWorkspaceEntry(path: string, newName: string): Promise<string> {
  return invoke<string>('rename_workspace_entry', {
    request: {
      path,
      new_name: newName
    } satisfies TauriRenameWorkspaceEntryRequest
  });
}

export async function deleteWorkspaceEntry(path: string): Promise<void> {
  await invoke('delete_workspace_entry', { path });
}

export async function searchMarkdownFiles(query: string): Promise<MarkdownSearchResult[]> {
  const results = await invoke<TauriMarkdownSearchResult[]>('search_markdown_files', { query });
  return results.map((result) => ({
    name: result.name,
    path: result.path,
    relativePath: result.relative_path,
    line: result.line ?? null,
    snippet: result.snippet ?? null,
    matchKind: result.match_kind
  }));
}

export async function searchTextFiles(query: string): Promise<MarkdownSearchResult[]> {
  const results = await invoke<TauriMarkdownSearchResult[]>('search_text_files', { query });
  return results.map((result) => ({
    name: result.name,
    path: result.path,
    relativePath: result.relative_path,
    line: result.line ?? null,
    snippet: result.snippet ?? null,
    matchKind: result.match_kind
  }));
}

export async function readMarkdownFile(path: string): Promise<ReadFileResult> {
  return mapDocument(await invoke<TauriMarkdownDocument>('read_markdown_file', { path }));
}

export async function openMarkdownFile(path: string): Promise<ReadFileResult> {
  return mapDocument(await invoke<TauriMarkdownDocument>('open_markdown_file', { path }));
}

export async function readTextFile(path: string): Promise<ReadFileResult> {
  return mapTextDocument(await invoke<TauriTextDocument>('read_text_file', { path }));
}

export async function openTextFile(path: string): Promise<ReadFileResult> {
  return mapTextDocument(await invoke<TauriTextDocument>('open_text_file', { path }));
}

export async function resolveMarkdownAsset(documentPath: string, assetSrc: string): Promise<string> {
  const result = await invoke<TauriMarkdownAsset>('resolve_markdown_asset', {
    documentPath,
    assetSrc
  });
  return result.path;
}

export async function importMarkdownAsset(
  documentPath: string,
  sourcePath: string,
  mode: 'assets' | 'embed' = 'assets'
): Promise<{ path: string; relativeSrc: string }> {
  const result = await invoke<TauriImportedMarkdownAsset>('import_markdown_asset', {
    request: {
      document_path: documentPath,
      source_path: sourcePath,
      kind: 'image',
      mode
    }
  });
  return {
    path: result.path,
    relativeSrc: result.relative_src
  };
}

export async function pickAndImportMarkdownAsset(
  documentPath: string,
  kind: 'image' | 'attachment',
  mode?: 'assets' | 'embed'
): Promise<{ sourcePath: string; path: string; relativeSrc: string; markdownSrc: string; fileName: string; isImage: boolean } | null> {
  const result = await invoke<TauriPickedMarkdownAsset | null>('pick_and_import_markdown_asset', {
    documentPath,
    kind,
    mode: mode ?? 'assets'
  });
  if (!result) return null;

  return {
    sourcePath: result.source_path,
    path: result.path,
    relativeSrc: result.relative_src,
    markdownSrc: result.markdown_src,
    fileName: result.file_name,
    isImage: result.is_image
  };
}

export async function writeFileContent(
  path: string,
  contents: string,
  expectedMetadata?: FileMetadata | null
): Promise<FileMetadata> {
  const result = await invoke<TauriSaveMarkdownResult>('save_markdown_file', {
    request: {
      path,
      content: contents,
      expected_modified_at: expectedMetadata?.modifiedAt ?? null,
      expected_size: expectedMetadata?.size ?? null
    }
  });

  return mapMetadata(result.metadata);
}

export async function writeFileContentAs(
  suggestedName: string,
  contents: string
): Promise<ReadFileResult | null> {
  const result = await invoke<TauriSaveMarkdownResult | null>('save_markdown_file_as', {
    request: {
      suggested_name: suggestedName,
      content: contents
    }
  });

  if (!result) return null;

  return {
    path: result.path,
    content: contents,
    metadata: mapMetadata(result.metadata),
    isMarkdown: true,
    fileKind: 'markdown',
    language: 'markdown',
    readOnly: false
  };
}

export async function getMarkdownFileMetadata(path: string): Promise<FileMetadata> {
  return mapMetadata(await invoke<TauriFileMetadata>('get_markdown_file_metadata', { path }));
}

export async function revealMarkdownFile(path: string): Promise<void> {
  await invoke('reveal_markdown_file', { path });
}

export async function showDesktopNotification(title: string, body: string): Promise<void> {
  await invoke('show_desktop_notification', { title, body });
}
