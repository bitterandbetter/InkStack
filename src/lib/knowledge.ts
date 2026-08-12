import { invoke } from './tauriRuntime';
import type { FileMetadata } from './fs';

export interface WorkspaceIndexState {
  workspaceRoot: string;
  schemaVersion: number;
  lastRebuildAt: number | null;
  status: string;
  errorMessage: string | null;
  documentCount: number;
  blockCount: number;
}

export interface KnowledgeBlockRecord {
  id: string;
  path: string;
  relativePath: string;
  blockType: string;
  text: string;
  raw: string;
  startLine: number;
  endLine: number;
  depth: number;
  parentHeadingId: string | null;
  headingPath: string[];
  language?: string | null;
  checked?: boolean | null;
}

export interface KnowledgeBlockSearchResult {
  id: string;
  path: string;
  relativePath: string;
  blockType: string;
  text: string;
  snippet: string | null;
  startLine: number;
  endLine: number;
  headingPath: string[];
  score: number;
}

export interface LinkReference {
  id: string;
  sourcePath: string;
  sourceRelativePath: string;
  sourceBlockId: string | null;
  kind: string;
  target: string;
  label: string | null;
  heading: string | null;
  resolvedPath: string | null;
  line: number;
}

export interface UnlinkedMention {
  id: string;
  path: string;
  relativePath: string;
  line: number;
  matchedText: string;
  snippet: string;
  headingPath: string[];
}

export interface TagSummary {
  id: string;
  path: string;
  relativePath: string;
  blockId: string | null;
  tag: string;
  line: number;
}

export interface DocumentKnowledge {
  path: string;
  relativePath: string;
  title: string | null;
  frontmatterJson: string | null;
  metadata: FileMetadata;
  contentHash?: string | null;
  indexedAt?: number | null;
  blocks: KnowledgeBlockRecord[];
  links: LinkReference[];
  tags: TagSummary[];
}

export interface IsolatedDocumentSummary {
  path: string;
  relativePath: string;
  title: string | null;
  blockCount: number;
  tagCount: number;
  modifiedAt: number;
}

export interface IsolatedDocumentSuggestion {
  source: IsolatedDocumentSummary;
  target: IsolatedDocumentSummary;
  reasons: string[];
  score: number;
}

export interface WorkspaceKnowledgeOverview {
  state: WorkspaceIndexState;
  linkCount: number;
  resolvedLinkCount: number;
  unresolvedLinkCount: number;
  tagCount: number;
  uniqueTagCount: number;
  isolatedDocumentCount: number;
  totalSize: number;
  newestModifiedAt: number | null;
  oldestIndexedAt: number | null;
  topConnectedDocuments: WorkspaceKnowledgeDocumentNode[];
  recentDocuments: WorkspaceKnowledgeDocumentNode[];
}

export interface WorkspaceKnowledgeGraph {
  nodes: WorkspaceKnowledgeDocumentNode[];
  edges: WorkspaceKnowledgeGraphEdge[];
}

export interface KnowledgeDocumentSearchResult {
  path: string;
  relativePath: string;
  title: string | null;
  aliases: string[];
  tags: string[];
  score: number;
  matchKind: string;
}

export interface WorkspaceKnowledgeGraphEdge {
  id: string;
  sourcePath: string;
  sourceRelativePath: string;
  targetPath: string | null;
  targetRelativePath: string | null;
  target: string;
  kind: string;
  line: number;
  resolved: boolean;
}

export interface WorkspaceKnowledgeDocumentNode {
  path: string;
  relativePath: string;
  title: string | null;
  incomingCount: number;
  outgoingCount: number;
  unresolvedCount: number;
  tagCount: number;
  tags: string[];
  blockCount: number;
  modifiedAt: number;
  indexedAt: number | null;
}

export interface SearchKnowledgeBlocksRequest {
  query: string;
  limit?: number;
  includeCurrentFile?: boolean;
  currentPath?: string | null;
}

export interface SearchKnowledgeDocumentsRequest {
  query: string;
  limit?: number;
}

export async function rebuildWorkspaceIndex(): Promise<WorkspaceIndexState> {
  return invoke<WorkspaceIndexState>('rebuild_workspace_index');
}

export async function refreshWorkspaceIndex(): Promise<WorkspaceIndexState> {
  return invoke<WorkspaceIndexState>('refresh_workspace_index');
}

export async function refreshWorkspaceIndexDocument(path: string): Promise<WorkspaceIndexState> {
  return invoke<WorkspaceIndexState>('refresh_workspace_index_document', {
    request: { path }
  });
}

export async function searchKnowledgeBlocks(
  request: SearchKnowledgeBlocksRequest
): Promise<KnowledgeBlockSearchResult[]> {
  return invoke<KnowledgeBlockSearchResult[]>('search_knowledge_blocks', {
    request: {
      query: request.query,
      limit: request.limit,
      includeCurrentFile: request.includeCurrentFile ?? false,
      currentPath: request.currentPath ?? null
    }
  });
}

export async function searchKnowledgeDocuments(
  request: SearchKnowledgeDocumentsRequest
): Promise<KnowledgeDocumentSearchResult[]> {
  return invoke<KnowledgeDocumentSearchResult[]>('search_knowledge_documents', {
    request: {
      query: request.query,
      limit: request.limit
    }
  });
}

export async function getDocumentKnowledge(path: string): Promise<DocumentKnowledge> {
  return invoke<DocumentKnowledge>('get_document_knowledge', {
    request: { path }
  });
}

export async function getBacklinks(path: string): Promise<LinkReference[]> {
  return invoke<LinkReference[]>('get_backlinks', {
    request: { path }
  });
}

export async function getUnlinkedMentions(path: string): Promise<UnlinkedMention[]> {
  return invoke<UnlinkedMention[]>('get_unlinked_mentions', {
    request: { path }
  });
}

export async function getWorkspaceTags(): Promise<TagSummary[]> {
  return invoke<TagSummary[]>('get_workspace_tags');
}

export async function getUnresolvedLinks(): Promise<LinkReference[]> {
  return invoke<LinkReference[]>('get_unresolved_links');
}

export async function getIsolatedDocuments(): Promise<IsolatedDocumentSummary[]> {
  return invoke<IsolatedDocumentSummary[]>('get_isolated_documents');
}

export async function getIsolatedDocumentSuggestions(): Promise<IsolatedDocumentSuggestion[]> {
  return invoke<IsolatedDocumentSuggestion[]>('get_isolated_document_suggestions');
}

export async function getWorkspaceKnowledgeOverview(): Promise<WorkspaceKnowledgeOverview> {
  return invoke<WorkspaceKnowledgeOverview>('get_workspace_knowledge_overview');
}

export async function getWorkspaceKnowledgeGraph(): Promise<WorkspaceKnowledgeGraph> {
  return invoke<WorkspaceKnowledgeGraph>('get_workspace_knowledge_graph');
}
