use std::{
    collections::{hash_map::DefaultHasher, HashMap, HashSet},
    fs,
    hash::{Hash, Hasher},
    path::{Path, PathBuf},
    time::{SystemTime, UNIX_EPOCH},
};

use crate::file_kinds::{is_hidden_tree_entry, is_ignored_dir, is_markdown_path};
use crate::models::{
    DocumentKnowledge, FileMetadata, GetDocumentKnowledgeRequest, IsolatedDocumentSuggestion,
    IsolatedDocumentSummary, KnowledgeBlockRecord, KnowledgeBlockSearchResult,
    KnowledgeDocumentSearchResult, LinkReference, SearchKnowledgeBlocksRequest,
    SearchKnowledgeDocumentsRequest, TagSummary, UnlinkedMention, WorkspaceIndexState,
    WorkspaceKnowledgeDocumentNode, WorkspaceKnowledgeGraph, WorkspaceKnowledgeGraphEdge,
    WorkspaceKnowledgeOverview,
};
use crate::workspace_index_store;
use crate::AppState;

const SCHEMA_VERSION: u32 = 2;
const MAX_INDEXED_FILES: usize = 2_000;
const MAX_FILE_BYTES: u64 = 2 * 1024 * 1024;
const MAX_BLOCK_TEXT: usize = 4_000;
const MAX_SUGGESTIONS_PER_SOURCE: usize = 5;

#[derive(Debug, Clone)]
pub struct WorkspaceKnowledgeIndex {
    pub state: WorkspaceIndexState,
    pub documents: HashMap<String, DocumentKnowledge>,
}

pub fn clear_workspace_index(state: &AppState) -> Result<(), String> {
    let mut guard = state
        .workspace_index
        .lock()
        .map_err(|_| "Workspace index state is unavailable".to_string())?;
    *guard = None;
    Ok(())
}

#[tauri::command]
pub async fn rebuild_workspace_index(
    state: tauri::State<'_, AppState>,
) -> Result<WorkspaceIndexState, String> {
    let root = workspace_root(&state)?;

    let index = tokio::task::spawn_blocking(move || {
        let index = build_workspace_index(&root)?;
        let _ = workspace_index_store::persist_index(&root, &index);
        Ok::<_, String>(index)
    })
    .await
    .map_err(|error| error.to_string())??;
    let next_state = index.state.clone();

    let mut guard = state
        .workspace_index
        .lock()
        .map_err(|_| "Workspace index state is unavailable".to_string())?;
    *guard = Some(index);

    Ok(next_state)
}

#[tauri::command]
pub async fn refresh_workspace_index(
    state: tauri::State<'_, AppState>,
) -> Result<WorkspaceIndexState, String> {
    rebuild_workspace_index(state).await
}

#[tauri::command]
pub async fn refresh_workspace_index_document(
    request: GetDocumentKnowledgeRequest,
    state: tauri::State<'_, AppState>,
) -> Result<WorkspaceIndexState, String> {
    let root = workspace_root(&state)?;
    let path = resolve_workspace_file_path(&request.path, &root)?;
    let root_key = root.to_string_lossy().to_string();
    let path_key = path.to_string_lossy().to_string();

    ensure_index_loaded(&state).await?;

    let update = tokio::task::spawn_blocking({
        let root = root.clone();
        let path = path.clone();
        move || {
            if path.is_file() && is_markdown_path(&path) && is_indexable_file(&path) {
                build_document_knowledge(&root, &path).map(Some)
            } else {
                Ok(None)
            }
        }
    })
    .await
    .map_err(|error| error.to_string())??;

    let store_updated = tokio::task::spawn_blocking({
        let root = root.clone();
        let path_key = path_key.clone();
        let update = update.clone();
        move || workspace_index_store::replace_document(&root, &path_key, update.as_ref())
    })
    .await
    .map(|result| result.is_ok())
    .unwrap_or(false);

    let next_state = {
        let mut guard = state
            .workspace_index
            .lock()
            .map_err(|_| "Workspace index state is unavailable".to_string())?;
        let index = guard.get_or_insert_with(|| WorkspaceKnowledgeIndex {
            state: WorkspaceIndexState {
                workspace_root: root_key.clone(),
                schema_version: SCHEMA_VERSION,
                last_rebuild_at: Some(now_millis()),
                status: "ready".to_string(),
                error_message: None,
                document_count: 0,
                block_count: 0,
            },
            documents: HashMap::new(),
        });

        if index.state.workspace_root != root_key {
            *index = WorkspaceKnowledgeIndex {
                state: WorkspaceIndexState {
                    workspace_root: root_key.clone(),
                    schema_version: SCHEMA_VERSION,
                    last_rebuild_at: Some(now_millis()),
                    status: "ready".to_string(),
                    error_message: None,
                    document_count: 0,
                    block_count: 0,
                },
                documents: HashMap::new(),
            };
        }

        if let Some(document) = update.clone() {
            index.documents.insert(document.path.clone(), document);
        } else {
            index.documents.remove(&path_key);
        }
        update_index_counts(index);
        index.state.last_rebuild_at = Some(now_millis());
        index.state.status = "ready".to_string();
        index.state.error_message = None;
        (index.state.clone(), (!store_updated).then(|| index.clone()))
    };

    if let Some(index_to_persist) = next_state.1 {
        let root = root.clone();
        let _ = tokio::task::spawn_blocking(move || {
            workspace_index_store::persist_index(&root, &index_to_persist)
        })
        .await
        .map_err(|error| error.to_string());
    }

    Ok(next_state.0)
}

#[tauri::command]
pub async fn search_knowledge_blocks(
    request: SearchKnowledgeBlocksRequest,
    state: tauri::State<'_, AppState>,
) -> Result<Vec<KnowledgeBlockSearchResult>, String> {
    ensure_index_loaded(&state).await?;
    let root = workspace_root(&state)?;
    if let Ok(results) = workspace_index_store::search_blocks(&root, &request) {
        return Ok(results);
    }
    let (results, index_to_persist) = {
        let guard = state
            .workspace_index
            .lock()
            .map_err(|_| "Workspace index state is unavailable".to_string())?;
        let index = guard
            .as_ref()
            .ok_or_else(|| "Workspace index is not loaded".to_string())?;
        (search_blocks(index, &request), index.clone())
    };
    let _ = tokio::task::spawn_blocking(move || {
        workspace_index_store::persist_index(&root, &index_to_persist)
    })
    .await
    .map_err(|error| error.to_string());
    Ok(results)
}

#[tauri::command]
pub async fn search_knowledge_documents(
    request: SearchKnowledgeDocumentsRequest,
    state: tauri::State<'_, AppState>,
) -> Result<Vec<KnowledgeDocumentSearchResult>, String> {
    ensure_index_loaded(&state).await?;
    let guard = state
        .workspace_index
        .lock()
        .map_err(|_| "Workspace index state is unavailable".to_string())?;
    let index = guard
        .as_ref()
        .ok_or_else(|| "Workspace index is not loaded".to_string())?;
    Ok(search_documents(index, &request))
}

#[tauri::command]
pub async fn get_document_knowledge(
    request: GetDocumentKnowledgeRequest,
    state: tauri::State<'_, AppState>,
) -> Result<DocumentKnowledge, String> {
    ensure_index_loaded(&state).await?;
    let root = workspace_root(&state)?;
    let path = canonicalize_workspace_file(&request.path, &root)?;
    let key = path.to_string_lossy().to_string();
    let guard = state
        .workspace_index
        .lock()
        .map_err(|_| "Workspace index state is unavailable".to_string())?;
    guard
        .as_ref()
        .and_then(|index| index.documents.get(&key).cloned())
        .ok_or_else(|| "Document is not indexed".to_string())
}

#[tauri::command]
pub async fn get_backlinks(
    request: GetDocumentKnowledgeRequest,
    state: tauri::State<'_, AppState>,
) -> Result<Vec<LinkReference>, String> {
    ensure_index_loaded(&state).await?;
    let root = workspace_root(&state)?;
    let path = canonicalize_workspace_file(&request.path, &root)?;
    let key = path.to_string_lossy().to_string();
    let guard = state
        .workspace_index
        .lock()
        .map_err(|_| "Workspace index state is unavailable".to_string())?;
    let index = guard
        .as_ref()
        .ok_or_else(|| "Workspace index is not loaded".to_string())?;
    let target = index
        .documents
        .get(&key)
        .ok_or_else(|| "Document is not indexed".to_string())?;
    Ok(find_backlinks(index, target))
}

#[tauri::command]
pub async fn get_unlinked_mentions(
    request: GetDocumentKnowledgeRequest,
    state: tauri::State<'_, AppState>,
) -> Result<Vec<UnlinkedMention>, String> {
    ensure_index_loaded(&state).await?;
    let root = workspace_root(&state)?;
    let path = canonicalize_workspace_file(&request.path, &root)?;
    let key = path.to_string_lossy().to_string();
    let guard = state
        .workspace_index
        .lock()
        .map_err(|_| "Workspace index state is unavailable".to_string())?;
    let index = guard
        .as_ref()
        .ok_or_else(|| "Workspace index is not loaded".to_string())?;
    let target = index
        .documents
        .get(&key)
        .ok_or_else(|| "Document is not indexed".to_string())?;
    Ok(find_unlinked_mentions(index, target))
}

#[tauri::command]
pub async fn get_workspace_tags(
    state: tauri::State<'_, AppState>,
) -> Result<Vec<TagSummary>, String> {
    ensure_index_loaded(&state).await?;
    let guard = state
        .workspace_index
        .lock()
        .map_err(|_| "Workspace index state is unavailable".to_string())?;
    let index = guard
        .as_ref()
        .ok_or_else(|| "Workspace index is not loaded".to_string())?;
    Ok(collect_workspace_tags(index))
}

#[tauri::command]
pub async fn get_unresolved_links(
    state: tauri::State<'_, AppState>,
) -> Result<Vec<LinkReference>, String> {
    ensure_index_loaded(&state).await?;
    let guard = state
        .workspace_index
        .lock()
        .map_err(|_| "Workspace index state is unavailable".to_string())?;
    let index = guard
        .as_ref()
        .ok_or_else(|| "Workspace index is not loaded".to_string())?;
    Ok(find_unresolved_links(index))
}

#[tauri::command]
pub async fn get_isolated_documents(
    state: tauri::State<'_, AppState>,
) -> Result<Vec<IsolatedDocumentSummary>, String> {
    ensure_index_loaded(&state).await?;
    let guard = state
        .workspace_index
        .lock()
        .map_err(|_| "Workspace index state is unavailable".to_string())?;
    let index = guard
        .as_ref()
        .ok_or_else(|| "Workspace index is not loaded".to_string())?;
    Ok(find_isolated_documents(index))
}

#[tauri::command]
pub async fn get_isolated_document_suggestions(
    state: tauri::State<'_, AppState>,
) -> Result<Vec<IsolatedDocumentSuggestion>, String> {
    ensure_index_loaded(&state).await?;
    let guard = state
        .workspace_index
        .lock()
        .map_err(|_| "Workspace index state is unavailable".to_string())?;
    let index = guard
        .as_ref()
        .ok_or_else(|| "Workspace index is not loaded".to_string())?;
    Ok(find_isolated_document_suggestions(index))
}

#[tauri::command]
pub async fn get_workspace_knowledge_overview(
    state: tauri::State<'_, AppState>,
) -> Result<WorkspaceKnowledgeOverview, String> {
    ensure_index_loaded(&state).await?;
    let guard = state
        .workspace_index
        .lock()
        .map_err(|_| "Workspace index state is unavailable".to_string())?;
    let index = guard
        .as_ref()
        .ok_or_else(|| "Workspace index is not loaded".to_string())?;
    Ok(build_workspace_knowledge_overview(index))
}

#[tauri::command]
pub async fn get_workspace_knowledge_graph(
    state: tauri::State<'_, AppState>,
) -> Result<WorkspaceKnowledgeGraph, String> {
    ensure_index_loaded(&state).await?;
    let guard = state
        .workspace_index
        .lock()
        .map_err(|_| "Workspace index state is unavailable".to_string())?;
    let index = guard
        .as_ref()
        .ok_or_else(|| "Workspace index is not loaded".to_string())?;
    Ok(build_workspace_knowledge_graph(index))
}

async fn ensure_index_loaded(state: &tauri::State<'_, AppState>) -> Result<(), String> {
    let root = workspace_root(state)?;
    let root_key = root.to_string_lossy().to_string();
    if state
        .workspace_index
        .lock()
        .map_err(|_| "Workspace index state is unavailable".to_string())?
        .as_ref()
        .map(|index| index.state.workspace_root == root_key)
        .unwrap_or(false)
    {
        return Ok(());
    }

    if let Ok(index) = tokio::task::spawn_blocking({
        let root = root.clone();
        move || workspace_index_store::load_index(&root)
    })
    .await
    .map_err(|error| error.to_string())?
    {
        let mut guard = state
            .workspace_index
            .lock()
            .map_err(|_| "Workspace index state is unavailable".to_string())?;
        *guard = Some(index);
        return Ok(());
    }

    rebuild_workspace_index(state.clone()).await?;
    Ok(())
}

fn build_workspace_index(root: &Path) -> Result<WorkspaceKnowledgeIndex, String> {
    let mut markdown_files = Vec::new();
    collect_markdown_files(root, &mut markdown_files)?;
    markdown_files.sort();
    markdown_files.truncate(MAX_INDEXED_FILES);

    let previous_documents = workspace_index_store::load_index(root)
        .map(|index| index.documents)
        .unwrap_or_default();
    let mut documents = HashMap::new();
    let mut block_count = 0usize;

    for path in markdown_files {
        if let Ok(document) = build_or_reuse_document_knowledge(root, &path, &previous_documents) {
            block_count += document.blocks.len();
            documents.insert(document.path.clone(), document);
        }
    }

    let state = WorkspaceIndexState {
        workspace_root: root.to_string_lossy().to_string(),
        schema_version: SCHEMA_VERSION,
        last_rebuild_at: Some(now_millis()),
        status: "ready".to_string(),
        error_message: None,
        document_count: documents.len(),
        block_count,
    };

    Ok(WorkspaceKnowledgeIndex { state, documents })
}

fn build_or_reuse_document_knowledge(
    root: &Path,
    path: &Path,
    previous_documents: &HashMap<String, DocumentKnowledge>,
) -> Result<DocumentKnowledge, String> {
    let metadata = fs::metadata(path).map_err(|error| error.to_string())?;
    if metadata.len() > MAX_FILE_BYTES {
        return Err("Markdown file is too large to index".to_string());
    }
    let key = path.to_string_lossy().to_string();
    if let Some(previous) = previous_documents.get(&key) {
        let modified_at = metadata_millis(&metadata);
        let size = metadata.len();
        if previous.metadata.modified_at == modified_at && previous.metadata.size == size {
            return Ok(previous.clone());
        }
        let content = fs::read_to_string(path).map_err(|error| error.to_string())?;
        let next_hash = hash_content(&content);
        if previous.content_hash.as_deref() == Some(next_hash.as_str()) {
            let mut reused = previous.clone();
            reused.metadata = FileMetadata { modified_at, size };
            reused.indexed_at = Some(now_millis());
            return Ok(reused);
        }
        return build_document_knowledge_from_content(root, path, metadata, content, next_hash);
    }

    build_document_knowledge_with_metadata(root, path, metadata)
}

fn update_index_counts(index: &mut WorkspaceKnowledgeIndex) {
    index.state.document_count = index.documents.len();
    index.state.block_count = index
        .documents
        .values()
        .map(|document| document.blocks.len())
        .sum();
}

fn build_workspace_knowledge_overview(
    index: &WorkspaceKnowledgeIndex,
) -> WorkspaceKnowledgeOverview {
    let backlinks_by_path = build_backlink_counts(index);
    let nodes = index
        .documents
        .values()
        .map(|document| {
            document_to_overview_node(
                document,
                *backlinks_by_path.get(&document.path).unwrap_or(&0),
            )
        })
        .collect::<Vec<_>>();
    let unresolved_links = find_unresolved_links(index);
    let isolated_document_count = nodes
        .iter()
        .filter(|node| {
            node.incoming_count == 0 && node.outgoing_count == 0 && node.unresolved_count == 0
        })
        .count();
    let tag_count = index
        .documents
        .values()
        .map(|document| document.tags.len())
        .sum();
    let unique_tag_count = index
        .documents
        .values()
        .flat_map(|document| document.tags.iter().map(|tag| tag.tag.clone()))
        .collect::<HashSet<_>>()
        .len();
    let link_count = index
        .documents
        .values()
        .map(|document| document.links.len())
        .sum();
    let total_size = index
        .documents
        .values()
        .map(|document| document.metadata.size)
        .sum();
    let newest_modified_at = index
        .documents
        .values()
        .map(|document| document.metadata.modified_at)
        .max();
    let oldest_indexed_at = index
        .documents
        .values()
        .filter_map(|document| document.indexed_at)
        .min();
    let resolved_link_count = index
        .documents
        .values()
        .flat_map(|document| document.links.iter())
        .filter(|link| link.resolved_path.is_some())
        .count();
    let mut top_connected_documents = nodes.clone();
    top_connected_documents.sort_by(|left, right| {
        let left_total = left.incoming_count + left.outgoing_count + left.unresolved_count;
        let right_total = right.incoming_count + right.outgoing_count + right.unresolved_count;
        right_total
            .cmp(&left_total)
            .then_with(|| right.block_count.cmp(&left.block_count))
            .then_with(|| left.relative_path.cmp(&right.relative_path))
    });
    top_connected_documents.truncate(12);

    let mut recent_documents = nodes;
    recent_documents.sort_by(|left, right| {
        right
            .modified_at
            .cmp(&left.modified_at)
            .then_with(|| left.relative_path.cmp(&right.relative_path))
    });
    recent_documents.truncate(12);

    WorkspaceKnowledgeOverview {
        state: index.state.clone(),
        link_count,
        resolved_link_count,
        unresolved_link_count: unresolved_links.len(),
        tag_count,
        unique_tag_count,
        isolated_document_count,
        total_size,
        newest_modified_at,
        oldest_indexed_at,
        top_connected_documents,
        recent_documents,
    }
}

fn build_workspace_knowledge_graph(index: &WorkspaceKnowledgeIndex) -> WorkspaceKnowledgeGraph {
    let backlinks_by_path = build_backlink_counts(index);
    let mut nodes = index
        .documents
        .values()
        .map(|document| {
            document_to_overview_node(
                document,
                *backlinks_by_path.get(&document.path).unwrap_or(&0),
            )
        })
        .collect::<Vec<_>>();
    nodes.sort_by(|left, right| left.relative_path.cmp(&right.relative_path));

    let mut edges = Vec::new();
    for document in index.documents.values() {
        for link in &document.links {
            if !is_document_link_candidate(link) {
                continue;
            }
            let target_document = link
                .resolved_path
                .as_ref()
                .and_then(|path| index.documents.get(path));
            edges.push(WorkspaceKnowledgeGraphEdge {
                id: link.id.clone(),
                source_path: document.path.clone(),
                source_relative_path: document.relative_path.clone(),
                target_path: target_document.map(|target| target.path.clone()),
                target_relative_path: target_document.map(|target| target.relative_path.clone()),
                target: link.target.clone(),
                kind: link.kind.clone(),
                line: link.line,
                resolved: target_document.is_some(),
            });
        }
    }
    edges.sort_by(|left, right| {
        left.source_relative_path
            .cmp(&right.source_relative_path)
            .then_with(|| left.line.cmp(&right.line))
            .then_with(|| left.target.cmp(&right.target))
    });

    WorkspaceKnowledgeGraph { nodes, edges }
}

fn build_backlink_counts(index: &WorkspaceKnowledgeIndex) -> HashMap<String, usize> {
    let mut counts = HashMap::new();
    for document in index.documents.values() {
        for link in &document.links {
            if let Some(resolved_path) = link.resolved_path.as_ref() {
                *counts.entry(resolved_path.clone()).or_insert(0) += 1;
            }
        }
    }
    counts
}

fn document_to_overview_node(
    document: &DocumentKnowledge,
    incoming_count: usize,
) -> WorkspaceKnowledgeDocumentNode {
    let unresolved_count = document
        .links
        .iter()
        .filter(|link| link.resolved_path.is_none())
        .count();
    let mut tags = document
        .tags
        .iter()
        .map(|tag| tag.tag.clone())
        .collect::<HashSet<_>>()
        .into_iter()
        .collect::<Vec<_>>();
    tags.sort();
    WorkspaceKnowledgeDocumentNode {
        path: document.path.clone(),
        relative_path: document.relative_path.clone(),
        title: document.title.clone(),
        incoming_count,
        outgoing_count: document.links.len().saturating_sub(unresolved_count),
        unresolved_count,
        tag_count: document.tags.len(),
        tags,
        block_count: document.blocks.len(),
        modified_at: document.metadata.modified_at,
        indexed_at: document.indexed_at,
    }
}

fn collect_markdown_files(current: &Path, files: &mut Vec<PathBuf>) -> Result<(), String> {
    if files.len() >= MAX_INDEXED_FILES {
        return Ok(());
    }

    let entries = fs::read_dir(current)
        .map_err(|error| error.to_string())?
        .map(|entry| entry.map_err(|error| error.to_string()))
        .collect::<Result<Vec<_>, String>>()?;

    for entry in entries {
        let path = entry.path();
        if is_hidden_tree_entry(&path) {
            continue;
        }

        if path.is_dir() {
            if !is_ignored_dir(&path) {
                collect_markdown_files(&path, files)?;
            }
            continue;
        }

        if is_markdown_path(&path) && is_indexable_file(&path) {
            files.push(fs::canonicalize(path).map_err(|error| error.to_string())?);
        }

        if files.len() >= MAX_INDEXED_FILES {
            break;
        }
    }

    Ok(())
}

fn build_document_knowledge(root: &Path, path: &Path) -> Result<DocumentKnowledge, String> {
    let metadata = fs::metadata(path).map_err(|error| error.to_string())?;
    if metadata.len() > MAX_FILE_BYTES {
        return Err("Markdown file is too large to index".to_string());
    }
    build_document_knowledge_with_metadata(root, path, metadata)
}

fn build_document_knowledge_with_metadata(
    root: &Path,
    path: &Path,
    metadata: fs::Metadata,
) -> Result<DocumentKnowledge, String> {
    let content = fs::read_to_string(path).map_err(|error| error.to_string())?;
    let content_hash = hash_content(&content);
    build_document_knowledge_from_content(root, path, metadata, content, content_hash)
}

fn build_document_knowledge_from_content(
    root: &Path,
    path: &Path,
    metadata: fs::Metadata,
    content: String,
    content_hash: String,
) -> Result<DocumentKnowledge, String> {
    let relative_path = path
        .strip_prefix(root)
        .unwrap_or(path)
        .to_string_lossy()
        .to_string();
    let frontmatter = parse_frontmatter(&content);
    let blocks = parse_blocks(path, &relative_path, &content);
    let links = blocks
        .iter()
        .flat_map(|block| {
            extract_links(
                path,
                &relative_path,
                Some(&block.id),
                &block.raw,
                block.start_line,
            )
        })
        .collect::<Vec<_>>();
    let mut tags = Vec::new();
    for block in &blocks {
        for tag in extract_tags(&block.raw) {
            tags.push(TagSummary {
                id: format!("tag:{}:{}:{}", relative_path, block.start_line, tag),
                path: path.to_string_lossy().to_string(),
                relative_path: relative_path.clone(),
                block_id: Some(block.id.clone()),
                tag,
                line: block.start_line,
            });
        }
    }

    let title = frontmatter
        .as_ref()
        .and_then(|items| items.get("title"))
        .and_then(frontmatter_value_to_string)
        .or_else(|| {
            blocks
                .iter()
                .find(|block| block.block_type == "heading")
                .map(|block| block.text.clone())
        });

    Ok(DocumentKnowledge {
        path: path.to_string_lossy().to_string(),
        relative_path,
        title,
        frontmatter_json: frontmatter.and_then(|items| serde_json::to_string(&items).ok()),
        metadata: FileMetadata {
            modified_at: metadata_millis(&metadata),
            size: metadata.len(),
        },
        content_hash: Some(content_hash),
        indexed_at: Some(now_millis()),
        blocks,
        links,
        tags,
    })
}

fn hash_content(content: &str) -> String {
    let mut hasher = DefaultHasher::new();
    content.hash(&mut hasher);
    format!("{:016x}", hasher.finish())
}

fn parse_blocks(path: &Path, relative_path: &str, content: &str) -> Vec<KnowledgeBlockRecord> {
    let lines = content.lines().collect::<Vec<_>>();
    let mut blocks = Vec::new();
    let mut heading_stack: Vec<(String, usize, String)> = Vec::new();
    let mut index = frontmatter_end_line(content).unwrap_or(0);

    while index < lines.len() {
        let line = lines[index];
        let line_number = index + 1;
        if line.trim().is_empty() {
            index += 1;
            continue;
        }

        if let Some((level, text)) = parse_heading(line) {
            while heading_stack
                .last()
                .map(|(_, existing, _)| *existing >= level)
                .unwrap_or(false)
            {
                heading_stack.pop();
            }
            let id = block_id("heading", line_number, &text);
            let block = make_block(
                path,
                relative_path,
                id.clone(),
                "heading",
                vec![line],
                line_number,
                line_number,
                &heading_stack,
                Some(text.clone()),
                None,
                None,
            );
            blocks.push(block);
            heading_stack.push((id, level, text));
            index += 1;
            continue;
        }

        if let Some((language, end_index)) = parse_code_block(&lines, index) {
            let raw_lines = lines[index..=end_index].to_vec();
            blocks.push(make_block(
                path,
                relative_path,
                block_id("code", line_number, &raw_lines.join("\n")),
                "code",
                raw_lines,
                line_number,
                end_index + 1,
                &heading_stack,
                None,
                Some(language),
                None,
            ));
            index = end_index + 1;
            continue;
        }

        if is_table_start(&lines, index) {
            let end_index = collect_while(&lines, index, |line| {
                line.contains('|') && !line.trim().is_empty()
            });
            let raw_lines = lines[index..end_index].to_vec();
            blocks.push(make_block(
                path,
                relative_path,
                block_id("table", line_number, &raw_lines.join("\n")),
                "table",
                raw_lines,
                line_number,
                end_index,
                &heading_stack,
                None,
                None,
                None,
            ));
            index = end_index;
            continue;
        }

        if let Some(checked) = parse_task(line) {
            let end_index = collect_list(&lines, index);
            let raw_lines = lines[index..end_index].to_vec();
            blocks.push(make_block(
                path,
                relative_path,
                block_id("task", line_number, &raw_lines.join("\n")),
                "task",
                raw_lines,
                line_number,
                end_index,
                &heading_stack,
                None,
                None,
                Some(checked),
            ));
            index = end_index;
            continue;
        }

        let block_type = if is_list_item(line) {
            "list"
        } else if is_blockquote(line) {
            "blockquote"
        } else if is_math_block(line) {
            "math"
        } else if is_image_only(line) {
            "image"
        } else {
            "paragraph"
        };
        let end_index = if block_type == "list" || block_type == "blockquote" {
            collect_related_lines(&lines, index, block_type)
        } else if block_type == "math" {
            collect_math_block(&lines, index)
        } else {
            collect_paragraph(&lines, index)
        };
        let raw_lines = lines[index..end_index].to_vec();
        blocks.push(make_block(
            path,
            relative_path,
            block_id(block_type, line_number, &raw_lines.join("\n")),
            block_type,
            raw_lines,
            line_number,
            end_index,
            &heading_stack,
            None,
            None,
            None,
        ));
        index = end_index;
    }

    blocks
}

#[allow(clippy::too_many_arguments)]
fn make_block(
    path: &Path,
    relative_path: &str,
    id: String,
    block_type: &str,
    raw_lines: Vec<&str>,
    start_line: usize,
    end_line: usize,
    heading_stack: &[(String, usize, String)],
    text_override: Option<String>,
    language: Option<String>,
    checked: Option<bool>,
) -> KnowledgeBlockRecord {
    let raw = raw_lines.join("\n");
    let text = text_override.unwrap_or_else(|| normalize_text(block_type, &raw));
    KnowledgeBlockRecord {
        id,
        path: path.to_string_lossy().to_string(),
        relative_path: relative_path.to_string(),
        block_type: block_type.to_string(),
        text: truncate_chars(&text, MAX_BLOCK_TEXT),
        raw,
        start_line,
        end_line,
        depth: if block_type == "heading" {
            parse_heading(raw_lines.first().copied().unwrap_or_default())
                .map(|(level, _)| level)
                .unwrap_or(1)
        } else {
            heading_stack.len()
        },
        parent_heading_id: heading_stack.last().map(|(id, _, _)| id.clone()),
        heading_path: heading_stack
            .iter()
            .map(|(_, _, text)| text.clone())
            .collect(),
        language,
        checked,
    }
}

fn search_blocks(
    index: &WorkspaceKnowledgeIndex,
    request: &SearchKnowledgeBlocksRequest,
) -> Vec<KnowledgeBlockSearchResult> {
    let query = request.query.trim().to_lowercase();
    if query.is_empty() {
        return Vec::new();
    }
    let terms = query.split_whitespace().collect::<Vec<_>>();
    let mut results = Vec::new();

    for document in index.documents.values() {
        for block in &document.blocks {
            if !request.include_current_file
                && request
                    .current_path
                    .as_ref()
                    .map(|current| current == &block.path)
                    .unwrap_or(false)
            {
                continue;
            }
            let haystack = format!(
                "{}\n{}\n{}",
                block.relative_path,
                block.heading_path.join(" "),
                block.text
            )
            .to_lowercase();
            let score = terms
                .iter()
                .map(|term| haystack.matches(term).count())
                .sum::<usize>();
            if score == 0 {
                continue;
            }
            if query.starts_with('#') && !block_has_tag(block, &query) {
                continue;
            }
            results.push(KnowledgeBlockSearchResult {
                id: block.id.clone(),
                path: block.path.clone(),
                relative_path: block.relative_path.clone(),
                block_type: block.block_type.clone(),
                text: block.text.clone(),
                snippet: Some(make_snippet(&block.text, &query)),
                start_line: block.start_line,
                end_line: block.end_line,
                heading_path: block.heading_path.clone(),
                score,
            });
        }
    }

    results.sort_by(|left, right| {
        right
            .score
            .cmp(&left.score)
            .then_with(|| left.relative_path.cmp(&right.relative_path))
            .then_with(|| left.start_line.cmp(&right.start_line))
    });
    results.truncate(request.limit.clamp(1, 80));
    results
}

fn search_documents(
    index: &WorkspaceKnowledgeIndex,
    request: &SearchKnowledgeDocumentsRequest,
) -> Vec<KnowledgeDocumentSearchResult> {
    let query = request.query.trim().to_lowercase();
    let terms = query.split_whitespace().collect::<Vec<_>>();
    let mut results = Vec::new();

    for document in index.documents.values() {
        let Some((score, match_kind)) = score_document_search(document, &query, &terms) else {
            continue;
        };
        results.push(KnowledgeDocumentSearchResult {
            path: document.path.clone(),
            relative_path: document.relative_path.clone(),
            title: document.title.clone(),
            aliases: visible_document_aliases(document),
            tags: sorted_document_tags(document),
            score,
            match_kind,
        });
    }

    results.sort_by(|left, right| {
        right
            .score
            .cmp(&left.score)
            .then_with(|| right.title.is_some().cmp(&left.title.is_some()))
            .then_with(|| left.relative_path.cmp(&right.relative_path))
    });
    results.truncate(request.limit.clamp(1, 80));
    results
}

fn score_document_search(
    document: &DocumentKnowledge,
    query: &str,
    terms: &[&str],
) -> Option<(usize, String)> {
    let title = document.title.as_deref().unwrap_or_default();
    let file_stem = Path::new(&document.relative_path)
        .file_stem()
        .and_then(|stem| stem.to_str())
        .unwrap_or_default();
    let aliases = visible_document_aliases(document);
    let tags = sorted_document_tags(document);

    if query.is_empty() {
        return Some((
            document.links.len() + document.tags.len() + usize::from(document.title.is_some()),
            "recent".to_string(),
        ));
    }

    let mut best_score = 0usize;
    let mut match_kind = String::new();
    bump_document_score(&mut best_score, &mut match_kind, title, query, terms, "title", 120);
    bump_document_score(
        &mut best_score,
        &mut match_kind,
        file_stem,
        query,
        terms,
        "path",
        100,
    );
    bump_document_score(
        &mut best_score,
        &mut match_kind,
        &document.relative_path,
        query,
        terms,
        "path",
        86,
    );
    for alias in aliases {
        bump_document_score(
            &mut best_score,
            &mut match_kind,
            &alias,
            query,
            terms,
            "alias",
            112,
        );
    }
    for tag in tags {
        bump_document_score(
            &mut best_score,
            &mut match_kind,
            &tag,
            query.trim_start_matches('#'),
            terms,
            "tag",
            76,
        );
    }

    (best_score > 0).then_some((best_score, match_kind))
}

fn bump_document_score(
    best_score: &mut usize,
    match_kind: &mut String,
    candidate: &str,
    query: &str,
    terms: &[&str],
    kind: &str,
    base: usize,
) {
    let candidate = candidate.trim();
    if candidate.is_empty() || query.is_empty() {
        return;
    }
    let normalized = candidate.to_lowercase();
    let score = if normalized == query {
        base + 40
    } else if normalized.starts_with(query) {
        base + 24
    } else if normalized.contains(query) {
        base
    } else if !terms.is_empty() && terms.iter().all(|term| normalized.contains(term)) {
        base.saturating_sub(12)
    } else {
        0
    };
    if score > *best_score {
        *best_score = score;
        *match_kind = kind.to_string();
    }
}

fn block_has_tag(block: &KnowledgeBlockRecord, query: &str) -> bool {
    let query = query.trim_start_matches('#');
    block
        .raw
        .split(|character: char| {
            character.is_whitespace()
                || matches!(character, ',' | ';' | '[' | ']' | '(' | ')' | '{' | '}')
        })
        .any(|token| {
            token
                .trim_matches(|character: char| {
                    matches!(character, '.' | ':' | '!' | '?' | '"' | '\'' | '`')
                })
                .strip_prefix('#')
                .map(|tag| tag.eq_ignore_ascii_case(query))
                .unwrap_or(false)
        })
}

fn find_backlinks(
    index: &WorkspaceKnowledgeIndex,
    target: &DocumentKnowledge,
) -> Vec<LinkReference> {
    let aliases = document_aliases(target);
    let mut backlinks = Vec::new();

    for document in index.documents.values() {
        if document.path == target.path {
            continue;
        }

        for link in &document.links {
            if link_points_to_document(link, document, target, &aliases) {
                let mut backlink = link.clone();
                backlink.resolved_path = Some(target.path.clone());
                backlinks.push(backlink);
            }
        }
    }

    backlinks.sort_by(|left, right| {
        left.source_relative_path
            .cmp(&right.source_relative_path)
            .then_with(|| left.line.cmp(&right.line))
    });
    backlinks
}

fn find_unlinked_mentions(
    index: &WorkspaceKnowledgeIndex,
    target: &DocumentKnowledge,
) -> Vec<UnlinkedMention> {
    let aliases = mention_aliases(target);
    if aliases.is_empty() {
        return Vec::new();
    }

    let linked_source_paths = find_backlinks(index, target)
        .into_iter()
        .map(|link| link.source_path)
        .collect::<HashSet<_>>();
    let mut mentions = Vec::new();

    for document in index.documents.values() {
        if document.path == target.path || linked_source_paths.contains(&document.path) {
            continue;
        }

        for block in &document.blocks {
            for (offset, line) in block.raw.lines().enumerate() {
                let Some(alias) = find_mention_alias(line, &aliases) else {
                    continue;
                };
                let line_number = block.start_line + offset;
                mentions.push(UnlinkedMention {
                    id: format!(
                        "mention:{}:{}:{}",
                        document.relative_path,
                        line_number,
                        normalize_link_key(&alias)
                    ),
                    path: document.path.clone(),
                    relative_path: document.relative_path.clone(),
                    line: line_number,
                    matched_text: alias,
                    snippet: truncate_chars(line.trim(), 240),
                    heading_path: block.heading_path.clone(),
                });
                break;
            }
        }
    }

    mentions.sort_by(|left, right| {
        left.relative_path
            .cmp(&right.relative_path)
            .then_with(|| left.line.cmp(&right.line))
            .then_with(|| left.matched_text.cmp(&right.matched_text))
    });
    mentions.truncate(80);
    mentions
}

fn mention_aliases(document: &DocumentKnowledge) -> Vec<String> {
    let mut aliases = Vec::new();
    if let Some(title) = &document.title {
        aliases.push(title.trim().to_string());
    }
    if let Some(file_name) = Path::new(&document.relative_path)
        .file_stem()
        .and_then(|name| name.to_str())
    {
        aliases.push(file_name.trim().to_string());
    }

    aliases.extend(frontmatter_aliases(document));
    aliases.retain(|alias| alias.chars().count() >= 2);
    aliases.sort_by_key(|right| std::cmp::Reverse(right.chars().count()));
    aliases.dedup_by(|left, right| left.eq_ignore_ascii_case(right));
    aliases
}

fn frontmatter_aliases(document: &DocumentKnowledge) -> Vec<String> {
    let Some(frontmatter_json) = &document.frontmatter_json else {
        return Vec::new();
    };
    let Ok(items) = serde_json::from_str::<HashMap<String, serde_json::Value>>(frontmatter_json)
    else {
        return Vec::new();
    };

    items
        .iter()
        .filter(|(key, _)| {
            let key = key.to_lowercase();
            key == "alias" || key == "aliases"
        })
        .flat_map(|(_, value)| frontmatter_value_to_strings(value))
        .collect()
}

fn find_mention_alias(line: &str, aliases: &[String]) -> Option<String> {
    let line_without_links = remove_link_markup(line);
    let normalized_line = line_without_links.to_lowercase();
    aliases.iter().find_map(|alias| {
        let normalized_alias = alias.to_lowercase();
        contains_mention(&normalized_line, &normalized_alias).then(|| alias.clone())
    })
}

fn remove_link_markup(line: &str) -> String {
    regex::Regex::new(r"!\[[^\]]*\]\([^)]+\)|\[[^\]]+\]\([^)]+\)|\[\[[^\]]+\]\]")
        .expect("valid link markup regex")
        .replace_all(line, " ")
        .to_string()
}

fn contains_mention(line: &str, alias: &str) -> bool {
    if alias
        .chars()
        .any(|character| !character.is_ascii_alphanumeric() && character != '_' && character != '-')
    {
        return line.contains(alias);
    }

    line.match_indices(alias)
        .any(|(index, _)| has_word_boundaries(line, index, index + alias.len()))
}

fn has_word_boundaries(value: &str, start: usize, end: usize) -> bool {
    let before = value[..start].chars().next_back();
    let after = value[end..].chars().next();
    !before.map(is_mention_word_char).unwrap_or(false)
        && !after.map(is_mention_word_char).unwrap_or(false)
}

fn is_mention_word_char(character: char) -> bool {
    character.is_ascii_alphanumeric() || character == '_' || character == '-'
}

fn collect_workspace_tags(index: &WorkspaceKnowledgeIndex) -> Vec<TagSummary> {
    let mut tags = index
        .documents
        .values()
        .flat_map(|document| document.tags.iter().cloned())
        .collect::<Vec<_>>();

    tags.sort_by(|left, right| {
        left.tag
            .cmp(&right.tag)
            .then_with(|| left.relative_path.cmp(&right.relative_path))
            .then_with(|| left.line.cmp(&right.line))
    });
    tags
}

fn find_unresolved_links(index: &WorkspaceKnowledgeIndex) -> Vec<LinkReference> {
    let mut unresolved = Vec::new();

    for document in index.documents.values() {
        for link in &document.links {
            if !is_document_link_candidate(link) {
                continue;
            }

            let resolves_to_document = index.documents.values().any(|target_document| {
                let aliases = document_aliases(target_document);
                link_points_to_document(link, document, target_document, &aliases)
            });

            if !resolves_to_document {
                let mut unresolved_link = link.clone();
                unresolved_link.resolved_path = None;
                unresolved.push(unresolved_link);
            }
        }
    }

    unresolved.sort_by(|left, right| {
        left.source_relative_path
            .cmp(&right.source_relative_path)
            .then_with(|| left.line.cmp(&right.line))
            .then_with(|| left.target.cmp(&right.target))
    });
    unresolved
}

fn find_isolated_documents(index: &WorkspaceKnowledgeIndex) -> Vec<IsolatedDocumentSummary> {
    let unresolved_links = find_unresolved_links(index);
    let mut isolated = index
        .documents
        .values()
        .filter(|document| {
            document.links.is_empty()
                && !unresolved_links
                    .iter()
                    .any(|link| link.source_path == document.path)
                && find_backlinks(index, document).is_empty()
        })
        .map(|document| IsolatedDocumentSummary {
            path: document.path.clone(),
            relative_path: document.relative_path.clone(),
            title: document.title.clone(),
            block_count: document.blocks.len(),
            tag_count: document.tags.len(),
            modified_at: document.metadata.modified_at,
        })
        .collect::<Vec<_>>();

    isolated.sort_by(|left, right| left.relative_path.cmp(&right.relative_path));
    isolated
}

fn find_isolated_document_suggestions(
    index: &WorkspaceKnowledgeIndex,
) -> Vec<IsolatedDocumentSuggestion> {
    let isolated = find_isolated_documents(index);
    let isolated_paths = isolated
        .iter()
        .map(|document| (document.path.as_str(), document.clone()))
        .collect::<HashMap<_, _>>();
    let mut suggestions = Vec::new();

    for source_summary in &isolated {
        let Some(source_document) = index.documents.get(&source_summary.path) else {
            continue;
        };
        let mut source_suggestions = index
            .documents
            .values()
            .filter(|target_document| target_document.path != source_document.path)
            .filter_map(|target_document| {
                score_document_suggestion(source_document, target_document).map(
                    |(score, reasons)| IsolatedDocumentSuggestion {
                        source: source_summary.clone(),
                        target: isolated_paths
                            .get(target_document.path.as_str())
                            .cloned()
                            .unwrap_or_else(|| summarize_document(target_document)),
                        reasons,
                        score,
                    },
                )
            })
            .collect::<Vec<_>>();

        source_suggestions.sort_by(|left, right| {
            right
                .score
                .cmp(&left.score)
                .then_with(|| left.target.relative_path.cmp(&right.target.relative_path))
        });
        source_suggestions.truncate(MAX_SUGGESTIONS_PER_SOURCE);
        suggestions.extend(source_suggestions);
    }

    suggestions.sort_by(|left, right| {
        left.source
            .relative_path
            .cmp(&right.source.relative_path)
            .then_with(|| right.score.cmp(&left.score))
            .then_with(|| left.target.relative_path.cmp(&right.target.relative_path))
    });
    suggestions
}

fn score_document_suggestion(
    source: &DocumentKnowledge,
    target: &DocumentKnowledge,
) -> Option<(usize, Vec<String>)> {
    let shared_tags = shared_values(&document_tags(source), &document_tags(target));
    let shared_path_tokens = shared_values(&path_tokens(source), &path_tokens(target));
    let shared_title_tokens = shared_values(&title_tokens(source), &title_tokens(target));

    let score =
        shared_tags.len() * 10 + shared_title_tokens.len() * 5 + shared_path_tokens.len() * 3;
    if score == 0 {
        return None;
    }

    let mut reasons = Vec::new();
    if !shared_tags.is_empty() {
        reasons.push(format!("shared tags: {}", shared_tags.join(", ")));
    }
    if !shared_path_tokens.is_empty() {
        reasons.push(format!(
            "path or filename overlap: {}",
            shared_path_tokens.join(", ")
        ));
    }
    if !shared_title_tokens.is_empty() {
        reasons.push(format!("title overlap: {}", shared_title_tokens.join(", ")));
    }

    Some((score, reasons))
}

fn summarize_document(document: &DocumentKnowledge) -> IsolatedDocumentSummary {
    IsolatedDocumentSummary {
        path: document.path.clone(),
        relative_path: document.relative_path.clone(),
        title: document.title.clone(),
        block_count: document.blocks.len(),
        tag_count: document.tags.len(),
        modified_at: document.metadata.modified_at,
    }
}

fn document_tags(document: &DocumentKnowledge) -> HashSet<String> {
    document
        .tags
        .iter()
        .map(|tag| tag.tag.to_lowercase())
        .collect()
}

fn visible_document_aliases(document: &DocumentKnowledge) -> Vec<String> {
    let mut aliases = Vec::new();
    if let Some(file_stem) = Path::new(&document.relative_path)
        .file_stem()
        .and_then(|stem| stem.to_str())
    {
        aliases.push(file_stem.trim().to_string());
    }
    if let Some(title) = &document.title {
        aliases.push(title.trim().to_string());
    }
    aliases.extend(frontmatter_aliases(document));
    aliases.retain(|alias| !alias.trim().is_empty());
    aliases.sort_by_key(|alias| alias.to_lowercase());
    aliases.dedup_by(|left, right| left.eq_ignore_ascii_case(right));
    aliases
}

fn sorted_document_tags(document: &DocumentKnowledge) -> Vec<String> {
    let mut tags = document
        .tags
        .iter()
        .map(|tag| tag.tag.clone())
        .collect::<HashSet<_>>()
        .into_iter()
        .collect::<Vec<_>>();
    tags.sort();
    tags
}

fn path_tokens(document: &DocumentKnowledge) -> HashSet<String> {
    let mut tokens = tokenize_suggestion_text(&strip_markdown_extension(&document.relative_path));
    if let Some(file_stem) = Path::new(&document.relative_path)
        .file_stem()
        .and_then(|stem| stem.to_str())
    {
        tokens.extend(tokenize_suggestion_text(file_stem));
    }
    tokens
}

fn title_tokens(document: &DocumentKnowledge) -> HashSet<String> {
    document
        .title
        .as_deref()
        .map(tokenize_suggestion_text)
        .unwrap_or_default()
}

fn tokenize_suggestion_text(value: &str) -> HashSet<String> {
    value
        .split(|character: char| !character.is_alphanumeric())
        .filter_map(|token| {
            let token = token.trim().to_lowercase();
            (token.chars().count() >= 2).then_some(token)
        })
        .collect()
}

fn shared_values(left: &HashSet<String>, right: &HashSet<String>) -> Vec<String> {
    let mut values = left.intersection(right).cloned().collect::<Vec<_>>();
    values.sort();
    values
}

fn is_document_link_candidate(link: &LinkReference) -> bool {
    let target = strip_link_fragment(&link.target);
    if target.trim().is_empty()
        || target.contains("://")
        || target.starts_with("mailto:")
        || target.starts_with("tel:")
    {
        return false;
    }

    if link.kind == "wiki" {
        return true;
    }

    if link.kind != "markdown" {
        return false;
    }

    Path::new(&target)
        .extension()
        .and_then(|extension| extension.to_str())
        .map(|extension| {
            let extension = extension.to_lowercase();
            extension == "md" || extension == "markdown"
        })
        .unwrap_or(true)
}

fn document_aliases(document: &DocumentKnowledge) -> Vec<String> {
    let mut aliases = vec![
        normalize_link_key(&document.relative_path),
        normalize_link_key(&strip_markdown_extension(&document.relative_path)),
    ];

    if let Some(file_name) = Path::new(&document.relative_path)
        .file_name()
        .and_then(|name| name.to_str())
    {
        aliases.push(normalize_link_key(file_name));
        aliases.push(normalize_link_key(&strip_markdown_extension(file_name)));
    }

    if let Some(title) = &document.title {
        aliases.push(normalize_link_key(title));
    }

    aliases.extend(
        frontmatter_aliases(document)
            .into_iter()
            .map(|alias| normalize_link_key(&alias)),
    );

    aliases.sort();
    aliases.dedup();
    aliases
}

fn link_points_to_document(
    link: &LinkReference,
    source_document: &DocumentKnowledge,
    target_document: &DocumentKnowledge,
    aliases: &[String],
) -> bool {
    let target = strip_link_fragment(&link.target);
    if target.trim().is_empty() {
        return false;
    }

    if link.kind == "wiki" {
        return aliases.contains(&normalize_link_key(&target));
    }

    if target.contains("://") || target.starts_with("mailto:") || target.starts_with("tel:") {
        return false;
    }

    if let Some(resolved) = resolve_relative_link(&source_document.relative_path, &target) {
        let normalized_target = normalize_link_key(&target_document.relative_path);
        let normalized_resolved = normalize_link_key(&resolved);
        return normalized_resolved == normalized_target
            || normalize_link_key(&strip_markdown_extension(&resolved))
                == normalize_link_key(&strip_markdown_extension(&target_document.relative_path));
    }

    aliases.contains(&normalize_link_key(&target))
}

fn resolve_relative_link(source_relative_path: &str, target: &str) -> Option<String> {
    let mut parts = source_relative_path
        .split('/')
        .filter(|part| !part.is_empty())
        .collect::<Vec<_>>();
    parts.pop();

    for part in target.split('/').filter(|part| !part.is_empty()) {
        if part == "." {
            continue;
        }
        if part == ".." {
            parts.pop();
            continue;
        }
        parts.push(part);
    }

    if parts.is_empty() {
        None
    } else {
        Some(parts.join("/"))
    }
}

fn strip_link_fragment(target: &str) -> String {
    target
        .split('#')
        .next()
        .unwrap_or(target)
        .trim()
        .trim_matches('<')
        .trim_matches('>')
        .to_string()
}

fn strip_markdown_extension(path: &str) -> String {
    path.strip_suffix(".markdown")
        .or_else(|| path.strip_suffix(".md"))
        .unwrap_or(path)
        .to_string()
}

fn normalize_link_key(value: &str) -> String {
    value
        .replace('\\', "/")
        .trim_start_matches("./")
        .trim_matches('/')
        .to_lowercase()
}

fn extract_links(
    path: &Path,
    relative_path: &str,
    source_block_id: Option<&str>,
    content: &str,
    start_line: usize,
) -> Vec<LinkReference> {
    let mut links = Vec::new();
    for (offset, line) in content.lines().enumerate() {
        let line_number = start_line + offset;
        for target in extract_markdown_targets(line) {
            links.push(LinkReference {
                id: format!("link:{}:{}:{}", relative_path, line_number, target.target),
                source_path: path.to_string_lossy().to_string(),
                source_relative_path: relative_path.to_string(),
                source_block_id: source_block_id.map(str::to_string),
                kind: target.kind,
                target: target.target,
                label: target.label,
                heading: target.heading,
                resolved_path: None,
                line: line_number,
            });
        }
    }
    links
}

struct LinkTarget {
    kind: String,
    target: String,
    label: Option<String>,
    heading: Option<String>,
}

fn extract_markdown_targets(line: &str) -> Vec<LinkTarget> {
    let mut targets = Vec::new();
    for capture in extract_inline_markdown_links(line) {
        targets.push(LinkTarget {
            kind: if capture.is_image {
                "image"
            } else {
                "markdown"
            }
            .to_string(),
            heading: heading_from_target(&capture.target),
            target: capture.target,
            label: Some(capture.label),
        });
    }
    for capture in regex::Regex::new(r"\[\[([^]|#]+)?(?:#([^]|]+))?(?:\|([^]]+))?\]\]")
        .expect("valid wiki link regex")
        .captures_iter(line)
    {
        let target = capture
            .get(1)
            .map(|value| value.as_str())
            .unwrap_or("")
            .trim();
        let heading = capture
            .get(2)
            .map(|value| value.as_str().trim().to_string());
        let alias = capture
            .get(3)
            .map(|value| value.as_str().trim().to_string());
        targets.push(LinkTarget {
            kind: "wiki".to_string(),
            target: target.to_string(),
            label: alias
                .or_else(|| heading.clone())
                .or_else(|| Some(target.to_string())),
            heading,
        });
    }
    for capture in regex::Regex::new(r"\[\^([^\]]+)\]")
        .expect("valid footnote regex")
        .captures_iter(line)
    {
        targets.push(LinkTarget {
            kind: "reference".to_string(),
            target: capture[1].to_string(),
            label: Some(capture[1].to_string()),
            heading: None,
        });
    }
    targets
}

struct InlineMarkdownLink {
    is_image: bool,
    label: String,
    target: String,
}

fn extract_inline_markdown_links(line: &str) -> Vec<InlineMarkdownLink> {
    let mut links = Vec::new();
    let mut index = 0;

    while let Some(open_offset) = line[index..].find('[') {
        let open = index + open_offset;
        let is_image = line[..open].ends_with('!');
        let label_start = open + '['.len_utf8();
        let Some(label_end) = find_unescaped_char(line, label_start, ']') else {
            break;
        };
        let after_label = label_end + ']'.len_utf8();

        if !line[after_label..].starts_with('(') {
            index = after_label;
            continue;
        }

        let target_start = after_label + '('.len_utf8();
        let Some(target_end) = find_link_target_end(line, target_start) else {
            break;
        };

        if let Some(target) = parse_inline_link_target(&line[target_start..target_end]) {
            links.push(InlineMarkdownLink {
                is_image,
                label: unescape_markdown_label(&line[label_start..label_end]),
                target,
            });
        }

        index = target_end + ')'.len_utf8();
    }

    links
}

fn find_unescaped_char(value: &str, start: usize, needle: char) -> Option<usize> {
    let mut escaped = false;
    for (offset, character) in value[start..].char_indices() {
        if escaped {
            escaped = false;
            continue;
        }
        if character == '\\' {
            escaped = true;
            continue;
        }
        if character == needle {
            return Some(start + offset);
        }
    }
    None
}

fn find_link_target_end(value: &str, start: usize) -> Option<usize> {
    let mut escaped = false;
    let mut in_angle = false;
    let mut quote = None;

    for (offset, character) in value[start..].char_indices() {
        if escaped {
            escaped = false;
            continue;
        }
        if character == '\\' {
            escaped = true;
            continue;
        }
        if let Some(quote_character) = quote {
            if character == quote_character {
                quote = None;
            }
            continue;
        }
        if in_angle {
            if character == '>' {
                in_angle = false;
            }
            continue;
        }
        match character {
            '<' => in_angle = true,
            '"' | '\'' => quote = Some(character),
            ')' => return Some(start + offset),
            _ => {}
        }
    }

    None
}

fn parse_inline_link_target(raw: &str) -> Option<String> {
    let raw = raw.trim();
    if raw.is_empty() {
        return None;
    }

    if let Some(stripped) = raw.strip_prefix('<') {
        let end = find_unescaped_char(stripped, 0, '>')?;
        let target = stripped[..end].trim();
        return (!target.is_empty()).then(|| target.to_string());
    }

    let target = strip_optional_link_title(raw).trim();
    (!target.is_empty()).then(|| target.to_string())
}

fn strip_optional_link_title(raw: &str) -> &str {
    let trimmed = raw.trim_end();
    if let Some(before_title) =
        strip_quoted_link_title(trimmed, '"').or_else(|| strip_quoted_link_title(trimmed, '\''))
    {
        return before_title;
    }
    trimmed
}

fn strip_quoted_link_title(raw: &str, quote: char) -> Option<&str> {
    if !raw.ends_with(quote) {
        return None;
    }

    let mut escaped = false;
    for (index, character) in raw[..raw.len() - quote.len_utf8()].char_indices().rev() {
        if escaped {
            escaped = false;
            continue;
        }
        if character == '\\' {
            escaped = true;
            continue;
        }
        if character == quote {
            let before_title = &raw[..index];
            if before_title
                .chars()
                .next_back()
                .map(char::is_whitespace)
                .unwrap_or(false)
            {
                return Some(before_title.trim_end());
            }
        }
    }

    None
}

fn unescape_markdown_label(value: &str) -> String {
    value.replace("\\]", "]").replace("\\[", "[")
}

fn parse_frontmatter(content: &str) -> Option<HashMap<String, serde_json::Value>> {
    let lines = content.lines().collect::<Vec<_>>();
    if lines.first().copied() != Some("---") {
        return None;
    }
    let end = lines.iter().enumerate().skip(1).find_map(|(index, line)| {
        if line.trim() == "---" {
            Some(index)
        } else {
            None
        }
    })?;
    let mut map = HashMap::new();
    let mut index = 1usize;
    while index < end {
        let line = lines[index];
        let Some((key, value)) = line.split_once(':') else {
            index += 1;
            continue;
        };
        let key = key.trim().to_string();
        let value = value.trim();
        if key.is_empty() {
            index += 1;
            continue;
        }

        if value.is_empty() {
            let mut values = Vec::new();
            index += 1;
            while index < end {
                let item = lines[index].trim();
                if !item.starts_with("- ") {
                    break;
                }
                let item = item.trim_start_matches("- ").trim();
                if !item.is_empty() {
                    values.push(serde_json::Value::String(unquote_frontmatter_value(item)));
                }
                index += 1;
            }
            if !values.is_empty() {
                map.insert(key, serde_json::Value::Array(values));
            }
            continue;
        }

        map.insert(key, parse_frontmatter_scalar(value));
        index += 1;
    }
    Some(map)
}

fn parse_frontmatter_scalar(value: &str) -> serde_json::Value {
    let value = value.trim();
    if value.starts_with('[') && value.ends_with(']') {
        let values = value
            .trim_start_matches('[')
            .trim_end_matches(']')
            .split(',')
            .filter_map(|item| {
                let item = unquote_frontmatter_value(item.trim());
                (!item.is_empty()).then(|| serde_json::Value::String(item))
            })
            .collect::<Vec<_>>();
        return serde_json::Value::Array(values);
    }
    serde_json::Value::String(unquote_frontmatter_value(value))
}

fn unquote_frontmatter_value(value: &str) -> String {
    value.trim().trim_matches(['"', '\'']).trim().to_string()
}

fn frontmatter_value_to_string(value: &serde_json::Value) -> Option<String> {
    value
        .as_str()
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .map(str::to_string)
}

fn frontmatter_value_to_strings(value: &serde_json::Value) -> Vec<String> {
    match value {
        serde_json::Value::String(value) => split_frontmatter_list_value(value),
        serde_json::Value::Array(values) => values
            .iter()
            .flat_map(frontmatter_value_to_strings)
            .collect(),
        _ => Vec::new(),
    }
}

fn split_frontmatter_list_value(value: &str) -> Vec<String> {
    let trimmed = value.trim();
    let inner = trimmed
        .strip_prefix('[')
        .and_then(|value| value.strip_suffix(']'))
        .unwrap_or(trimmed);
    inner
        .split(',')
        .map(unquote_frontmatter_value)
        .filter(|value| !value.is_empty())
        .collect()
}

fn extract_tags(content: &str) -> Vec<String> {
    let regex = regex::Regex::new(r"(^|[\s\(\[\{;:,.!?])#([\p{L}\p{N}_/-]{1,64})")
        .expect("valid tag regex");
    let mut tags = regex
        .captures_iter(&remove_inline_code_spans(content))
        .filter_map(|capture| {
            capture
                .get(2)
                .map(|value| value.as_str().trim_end_matches('/').to_string())
        })
        .filter(|tag| !tag.is_empty() && !tag.chars().all(|character| character.is_ascii_digit()))
        .collect::<Vec<_>>();
    tags.sort();
    tags.dedup();
    tags
}

fn remove_inline_code_spans(content: &str) -> String {
    let mut result = String::with_capacity(content.len());
    let mut in_code = false;

    for character in content.chars() {
        if character == '`' {
            in_code = !in_code;
            result.push(' ');
        } else if in_code {
            result.push(' ');
        } else {
            result.push(character);
        }
    }

    result
}

fn parse_heading(line: &str) -> Option<(usize, String)> {
    let capture = regex::Regex::new(r"^\s{0,3}(#{1,6})(?:[ \t]+|$)(.*)$")
        .expect("valid heading regex")
        .captures(line)?;
    Some((
        capture[1].len(),
        capture[2].trim().trim_end_matches('#').trim().to_string(),
    ))
}

fn parse_code_block(lines: &[&str], index: usize) -> Option<(String, usize)> {
    let line = lines[index];
    let capture = regex::Regex::new(r"^\s{0,3}(`{3,}|~{3,})(.*)$")
        .expect("valid fence regex")
        .captures(line)?;
    let marker = capture[1].chars().next()?;
    let length = capture[1].len();
    let language = capture[2]
        .trim()
        .split_whitespace()
        .next()
        .unwrap_or("text")
        .to_string();
    for (offset, candidate) in lines[index + 1..].iter().enumerate() {
        let close = candidate.trim_start();
        if close.starts_with(&marker.to_string().repeat(length)) {
            return Some((language, index + 1 + offset));
        }
    }
    Some((language, lines.len().saturating_sub(1)))
}

fn parse_task(line: &str) -> Option<bool> {
    let capture = regex::Regex::new(r"^\s{0,3}(?:[-+*]|\d+[.)])\s+\[([ xX])\]\s+")
        .expect("valid task regex")
        .captures(line)?;
    Some(capture[1].eq_ignore_ascii_case("x"))
}

fn is_list_item(line: &str) -> bool {
    regex::Regex::new(r"^\s{0,3}(?:[-+*]|\d+[.)])\s+\S")
        .expect("valid list regex")
        .is_match(line)
}

fn is_blockquote(line: &str) -> bool {
    line.trim_start().starts_with('>')
}

fn is_math_block(line: &str) -> bool {
    line.trim() == "$$"
}

fn is_image_only(line: &str) -> bool {
    regex::Regex::new(r"^!\[[^\]]*\]\([^)]+\)\s*$")
        .expect("valid image-only regex")
        .is_match(line.trim())
}

fn is_table_start(lines: &[&str], index: usize) -> bool {
    if index + 1 >= lines.len() || !lines[index].contains('|') {
        return false;
    }
    regex::Regex::new(r"^\s*\|?\s*:?-{3,}:?\s*(\|\s*:?-{3,}:?\s*)+\|?\s*$")
        .expect("valid table delimiter regex")
        .is_match(lines[index + 1])
}

fn collect_while(lines: &[&str], start: usize, predicate: impl Fn(&str) -> bool) -> usize {
    let mut index = start;
    while index < lines.len() && predicate(lines[index]) {
        index += 1;
    }
    index
}

fn collect_list(lines: &[&str], start: usize) -> usize {
    collect_while(lines, start, |line| {
        is_list_item(line) || line.starts_with("  ")
    })
}

fn collect_related_lines(lines: &[&str], start: usize, block_type: &str) -> usize {
    collect_while(lines, start, |line| {
        if block_type == "blockquote" {
            is_blockquote(line) || line.trim().is_empty()
        } else {
            is_list_item(line) || line.starts_with("  ")
        }
    })
}

fn collect_math_block(lines: &[&str], start: usize) -> usize {
    let mut index = start + 1;
    while index < lines.len() {
        if lines[index].trim() == "$$" {
            return index + 1;
        }
        index += 1;
    }
    lines.len()
}

fn collect_paragraph(lines: &[&str], start: usize) -> usize {
    let mut index = start;
    while index < lines.len() && !lines[index].trim().is_empty() {
        if index != start && starts_new_block(lines, index) {
            break;
        }
        index += 1;
    }
    index
}

fn starts_new_block(lines: &[&str], index: usize) -> bool {
    parse_heading(lines[index]).is_some()
        || parse_code_block(lines, index).is_some()
        || is_table_start(lines, index)
        || parse_task(lines[index]).is_some()
        || is_list_item(lines[index])
        || is_blockquote(lines[index])
        || is_math_block(lines[index])
}

fn normalize_text(block_type: &str, raw: &str) -> String {
    if block_type == "code" {
        let lines = raw.lines().collect::<Vec<_>>();
        return lines
            .get(1..lines.len().saturating_sub(1))
            .unwrap_or(&[])
            .join("\n")
            .trim()
            .to_string();
    }
    raw.lines()
        .map(|line| {
            line.trim_start()
                .trim_start_matches('>')
                .trim_start()
                .trim_start_matches("- [x] ")
                .trim_start_matches("- [X] ")
                .trim_start_matches("- [ ] ")
                .trim_start_matches("- ")
                .trim()
        })
        .collect::<Vec<_>>()
        .join("\n")
        .trim()
        .to_string()
}

pub(crate) fn make_snippet(text: &str, query: &str) -> String {
    let lowered = text.to_lowercase();
    let index = lowered.find(query).unwrap_or(0);
    let start = index.saturating_sub(80);
    let end = (index + query.len() + 160).min(text.len());
    truncate_chars(&text[start..end], 260)
}

fn heading_from_target(target: &str) -> Option<String> {
    target
        .split_once('#')
        .map(|(_, heading)| heading.to_string())
}

fn block_id(block_type: &str, line: usize, text: &str) -> String {
    format!("{block_type}-{line}-{}", stable_hash(text))
}

fn stable_hash(text: &str) -> String {
    let mut hash = 5381u64;
    for byte in text.bytes() {
        hash = ((hash << 5).wrapping_add(hash)) ^ u64::from(byte);
    }
    format!("{hash:x}")
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::{
        env,
        sync::atomic::{AtomicU64, Ordering},
        thread,
        time::Duration,
    };

    static TEST_WORKSPACE_COUNTER: AtomicU64 = AtomicU64::new(0);

    #[test]
    fn extracts_markdown_links_with_spaces_angles_and_titles() {
        let links = extract_markdown_targets(
            r#"[A](My Note.md) [B](<My Other Note.md>) [C](foo.md "title")"#,
        );
        let markdown_targets = links
            .iter()
            .filter(|link| link.kind == "markdown")
            .map(|link| link.target.as_str())
            .collect::<Vec<_>>();

        assert_eq!(
            markdown_targets,
            vec!["My Note.md", "My Other Note.md", "foo.md"]
        );
    }

    #[test]
    fn keeps_images_wiki_links_and_external_links_distinct() {
        let links = extract_markdown_targets(
            "![Diagram](asset image.png) [[Related Note#Insight|alias]] [site](https://example.com)",
        );

        assert!(links
            .iter()
            .any(|link| link.kind == "image" && link.target == "asset image.png"));
        assert!(links.iter().any(|link| {
            link.kind == "wiki"
                && link.target == "Related Note"
                && link.heading.as_deref() == Some("Insight")
                && link.label.as_deref() == Some("alias")
        }));
        assert!(links
            .iter()
            .any(|link| link.kind == "markdown" && link.target == "https://example.com"));
    }

    #[test]
    fn extracts_tags_after_common_punctuation_without_numeric_only_tags() {
        let tags = extract_tags("hello (#research/ai), [#inbox] #123 #ok_tag `#code`");

        assert_eq!(tags, vec!["inbox", "ok_tag", "research/ai"]);
    }

    #[test]
    fn parses_obsidian_frontmatter_aliases_for_links() {
        let frontmatter = parse_frontmatter(
            "---\ntitle: Alias Target\naliases:\n  - Index Brain\n  - Neural Map\nalias: [Quick Index, Fast Index]\n---\n# Body",
        )
        .unwrap();
        assert_eq!(
            frontmatter.get("title").and_then(frontmatter_value_to_string),
            Some("Alias Target".to_string())
        );

        let mut target = test_document(
            "/workspace/notes/alias-target.md",
            "notes/alias-target.md",
            Some("Alias Target"),
            &[],
        );
        target.frontmatter_json = Some(serde_json::to_string(&frontmatter).unwrap());

        let aliases = frontmatter_aliases(&target);
        assert!(aliases.iter().any(|alias| alias == "Index Brain"));
        assert!(aliases.iter().any(|alias| alias == "Neural Map"));
        assert!(aliases.iter().any(|alias| alias == "Quick Index"));
        assert!(document_aliases(&target).contains(&"index brain".to_string()));

        let source = test_document(
            "/workspace/source.md",
            "source.md",
            Some("Source"),
            &[],
        );
        let link = LinkReference {
            id: "link:source:1:Index Brain".to_string(),
            source_path: source.path.clone(),
            source_relative_path: source.relative_path.clone(),
            source_block_id: None,
            kind: "wiki".to_string(),
            target: "Index Brain".to_string(),
            label: Some("Index Brain".to_string()),
            heading: None,
            resolved_path: None,
            line: 1,
        };

        assert!(link_points_to_document(
            &link,
            &source,
            &target,
            &document_aliases(&target)
        ));
    }

    #[test]
    fn resolves_missing_workspace_file_without_escaping_root() {
        let root = PathBuf::from("/tmp/inkstack-workspace");

        assert_eq!(
            resolve_workspace_file_path("notes/missing.md", &root).unwrap(),
            PathBuf::from("/tmp/inkstack-workspace/notes/missing.md")
        );
        assert!(resolve_workspace_file_path("../outside.md", &root).is_err());
    }

    #[test]
    fn build_workspace_index_reuses_snapshot_when_metadata_is_unchanged() {
        let workspace = TestWorkspace::new();
        let root = workspace.root();
        let note_path = root.join("note.md");
        let content = "Stable\n\nsame content\n";
        fs::write(&note_path, content).unwrap();
        let note_path = fs::canonicalize(&note_path).unwrap();

        let mut previous = snapshot_document(root, &note_path, content);
        previous.indexed_at = Some(42);
        workspace_index_store::persist_index(root, &test_index_for_root(root, vec![previous]))
            .unwrap();

        let index = build_workspace_index(root).unwrap();
        let document = index
            .documents
            .get(&note_path.to_string_lossy().to_string())
            .unwrap();

        assert_eq!(document.indexed_at, Some(42));
    }

    #[test]
    fn build_workspace_index_reuses_blocks_when_mtime_changes_but_hash_and_size_match() {
        let workspace = TestWorkspace::new();
        let root = workspace.root();
        let note_path = root.join("note.md");
        let content = "Stable\n\nsame content\n";
        fs::write(&note_path, content).unwrap();
        let note_path = fs::canonicalize(&note_path).unwrap();

        let mut previous = snapshot_document(root, &note_path, content);
        let previous_metadata = previous.metadata.clone();
        previous.indexed_at = Some(42);
        previous.blocks[0].text = "snapshot-only block text".to_string();
        workspace_index_store::persist_index(root, &test_index_for_root(root, vec![previous]))
            .unwrap();

        wait_for_mtime_change(&note_path, content, previous_metadata.modified_at);

        let index = build_workspace_index(root).unwrap();
        let document = index
            .documents
            .get(&note_path.to_string_lossy().to_string())
            .unwrap();

        assert_eq!(document.metadata.size, previous_metadata.size);
        assert_ne!(document.metadata.modified_at, previous_metadata.modified_at);
        assert_eq!(document.blocks[0].text, "snapshot-only block text");
        assert_ne!(document.indexed_at, Some(42));
    }

    #[test]
    fn suggests_connections_for_isolated_documents_from_tags_paths_and_titles() {
        let source = test_document(
            "/workspace/projects/rust-index.md",
            "projects/rust-index.md",
            Some("Rust Index Notes"),
            &["rust", "indexing"],
        );
        let target = test_document(
            "/workspace/archive/rust-index-plan.md",
            "archive/rust-index-plan.md",
            Some("Rust Index Plan"),
            &["rust", "planning"],
        );
        let unrelated = test_document(
            "/workspace/cooking/soup.md",
            "cooking/soup.md",
            Some("Soup"),
            &["kitchen"],
        );
        let index = test_index(vec![source, target, unrelated]);

        let suggestions = find_isolated_document_suggestions(&index);
        let source_suggestions = suggestions
            .iter()
            .filter(|suggestion| suggestion.source.relative_path == "projects/rust-index.md")
            .collect::<Vec<_>>();

        assert_eq!(source_suggestions.len(), 1);
        assert_eq!(
            source_suggestions[0].target.relative_path,
            "archive/rust-index-plan.md"
        );
        assert_eq!(source_suggestions[0].score, 26);
        assert!(source_suggestions[0]
            .reasons
            .iter()
            .any(|reason| reason == "shared tags: rust"));
        assert!(source_suggestions[0]
            .reasons
            .iter()
            .any(|reason| reason == "path or filename overlap: index, rust"));
        assert!(source_suggestions[0]
            .reasons
            .iter()
            .any(|reason| reason == "title overlap: index, rust"));
    }

    #[test]
    fn finds_unlinked_mentions_and_skips_existing_backlinks() {
        let mut target = test_document(
            "/workspace/notes/neural-index.md",
            "notes/neural-index.md",
            Some("Neural Index"),
            &[],
        );
        target.frontmatter_json = Some(r#"{"aliases":"Index Brain"}"#.to_string());

        let mut mention_source = test_document(
            "/workspace/projects/research.md",
            "projects/research.md",
            Some("Research"),
            &[],
        );
        mention_source.blocks = vec![test_block(
            "/workspace/projects/research.md",
            "projects/research.md",
            "We should connect this to Neural Index soon.",
            3,
            &["Plan"],
        )];

        let mut linked_source = test_document(
            "/workspace/projects/linked.md",
            "projects/linked.md",
            None,
            &[],
        );
        linked_source.blocks = vec![test_block(
            "/workspace/projects/linked.md",
            "projects/linked.md",
            "Already linked to [[Neural Index]].",
            1,
            &[],
        )];
        linked_source.links = vec![LinkReference {
            id: "link:projects/linked.md:1:Neural Index".to_string(),
            source_path: linked_source.path.clone(),
            source_relative_path: linked_source.relative_path.clone(),
            source_block_id: None,
            kind: "wiki".to_string(),
            target: "Neural Index".to_string(),
            label: Some("Neural Index".to_string()),
            heading: None,
            resolved_path: None,
            line: 1,
        }];

        let index = test_index(vec![target.clone(), mention_source, linked_source]);
        let mentions = find_unlinked_mentions(&index, &target);

        assert_eq!(mentions.len(), 1);
        assert_eq!(mentions[0].relative_path, "projects/research.md");
        assert_eq!(mentions[0].line, 3);
        assert_eq!(mentions[0].matched_text, "Neural Index");
        assert_eq!(mentions[0].heading_path, vec!["Plan"]);
    }

    #[test]
    fn searches_documents_by_title_alias_path_and_tag() {
        let mut target = test_document(
            "/workspace/notes/semantic-index.md",
            "notes/semantic-index.md",
            Some("Semantic Index"),
            &["graph", "research"],
        );
        target.frontmatter_json = Some(r#"{"aliases":["Index Brain","Knowledge Map"]}"#.to_string());
        let other = test_document(
            "/workspace/archive/plain.md",
            "archive/plain.md",
            Some("Plain Note"),
            &["misc"],
        );
        let index = test_index(vec![target, other]);

        let alias_results = search_documents(
            &index,
            &SearchKnowledgeDocumentsRequest {
                query: "brain".to_string(),
                limit: 10,
            },
        );
        assert_eq!(alias_results[0].relative_path, "notes/semantic-index.md");
        assert_eq!(alias_results[0].match_kind, "alias");
        assert!(alias_results[0]
            .aliases
            .iter()
            .any(|alias| alias == "Index Brain"));

        let title_results = search_documents(
            &index,
            &SearchKnowledgeDocumentsRequest {
                query: "semantic".to_string(),
                limit: 10,
            },
        );
        assert_eq!(title_results[0].match_kind, "title");

        let tag_results = search_documents(
            &index,
            &SearchKnowledgeDocumentsRequest {
                query: "#research".to_string(),
                limit: 10,
            },
        );
        assert_eq!(tag_results[0].relative_path, "notes/semantic-index.md");
        assert_eq!(tag_results[0].match_kind, "tag");
    }

    #[test]
    fn builds_workspace_overview_counts_and_ranked_nodes() {
        let mut source = test_document(
            "/workspace/source.md",
            "source.md",
            Some("Source"),
            &["graph"],
        );
        let target = test_document(
            "/workspace/target.md",
            "target.md",
            Some("Target"),
            &["graph", "linked"],
        );
        let isolated = test_document(
            "/workspace/isolated.md",
            "isolated.md",
            Some("Isolated"),
            &[],
        );
        source.links.push(LinkReference {
            id: "link:source:1".to_string(),
            source_path: source.path.clone(),
            source_relative_path: source.relative_path.clone(),
            source_block_id: None,
            kind: "markdown".to_string(),
            target: "target.md".to_string(),
            label: Some("Target".to_string()),
            heading: None,
            resolved_path: Some(target.path.clone()),
            line: 1,
        });
        source.links.push(LinkReference {
            id: "link:source:2".to_string(),
            source_path: source.path.clone(),
            source_relative_path: source.relative_path.clone(),
            source_block_id: None,
            kind: "wiki".to_string(),
            target: "Missing".to_string(),
            label: None,
            heading: None,
            resolved_path: None,
            line: 2,
        });
        let index = test_index(vec![source, target, isolated]);

        let overview = build_workspace_knowledge_overview(&index);

        assert_eq!(overview.link_count, 2);
        assert_eq!(overview.resolved_link_count, 1);
        assert_eq!(overview.unresolved_link_count, 1);
        assert_eq!(overview.unique_tag_count, 2);
        assert_eq!(overview.isolated_document_count, 1);
        assert_eq!(overview.total_size, 3);
        assert_eq!(overview.newest_modified_at, Some(1));
        assert_eq!(overview.oldest_indexed_at, Some(1));
        assert_eq!(
            overview.top_connected_documents[0].relative_path,
            "source.md"
        );
        assert_eq!(
            overview
                .top_connected_documents
                .iter()
                .find(|node| node.relative_path == "target.md")
                .map(|node| node.incoming_count),
            Some(1)
        );
    }

    #[test]
    fn builds_workspace_graph_with_resolved_and_unresolved_edges() {
        let mut source = test_document("/workspace/source.md", "source.md", Some("Source"), &[]);
        let target = test_document("/workspace/target.md", "target.md", Some("Target"), &[]);
        source.links.push(LinkReference {
            id: "link:source:1".to_string(),
            source_path: source.path.clone(),
            source_relative_path: source.relative_path.clone(),
            source_block_id: None,
            kind: "markdown".to_string(),
            target: "target.md".to_string(),
            label: Some("Target".to_string()),
            heading: None,
            resolved_path: Some(target.path.clone()),
            line: 1,
        });
        source.links.push(LinkReference {
            id: "link:source:2".to_string(),
            source_path: source.path.clone(),
            source_relative_path: source.relative_path.clone(),
            source_block_id: None,
            kind: "wiki".to_string(),
            target: "Missing".to_string(),
            label: None,
            heading: None,
            resolved_path: None,
            line: 2,
        });
        let index = test_index(vec![source, target]);

        let graph = build_workspace_knowledge_graph(&index);

        assert_eq!(graph.nodes.len(), 2);
        assert_eq!(graph.edges.len(), 2);
        assert!(graph
            .nodes
            .iter()
            .any(|node| node.relative_path == "source.md" && node.tags.is_empty()));
        assert!(
            graph
                .edges
                .iter()
                .any(|edge| edge.resolved
                    && edge.target_relative_path.as_deref() == Some("target.md"))
        );
        assert!(graph
            .edges
            .iter()
            .any(|edge| !edge.resolved && edge.target == "Missing"));
    }

    #[test]
    fn reuses_unchanged_document_from_previous_index() {
        let root = temp_workspace("reuse-unchanged");
        let notes_dir = root.join("notes");
        fs::create_dir_all(&notes_dir).unwrap();
        let path = notes_dir.join("reused.md");
        fs::write(&path, "# Reused\n\nBody").unwrap();
        let metadata = fs::metadata(&path).unwrap();
        let mut previous = HashMap::new();
        let mut document = test_document(
            &path.to_string_lossy(),
            "notes/reused.md",
            Some("Reused"),
            &["cache"],
        );
        document.metadata = FileMetadata {
            modified_at: metadata_millis(&metadata),
            size: metadata.len(),
        };
        document.indexed_at = Some(123);
        previous.insert(document.path.clone(), document);

        let reused = build_or_reuse_document_knowledge(&root, &path, &previous).unwrap();

        assert_eq!(reused.indexed_at, Some(123));
        assert_eq!(reused.relative_path, "notes/reused.md");
        fs::remove_dir_all(&root).unwrap();
    }

    #[test]
    fn reuses_document_when_metadata_changed_but_content_hash_matches() {
        let root = temp_workspace("reuse-hash");
        let notes_dir = root.join("notes");
        fs::create_dir_all(&notes_dir).unwrap();
        let path = notes_dir.join("same-content.md");
        let content = "# Same Content\n\nBody";
        fs::write(&path, content).unwrap();
        let metadata = fs::metadata(&path).unwrap();
        let mut previous = HashMap::new();
        let mut document = test_document(
            &path.to_string_lossy(),
            "notes/same-content.md",
            Some("Same Content"),
            &["cache"],
        );
        document.metadata = FileMetadata {
            modified_at: metadata_millis(&metadata).saturating_sub(1),
            size: metadata.len(),
        };
        document.content_hash = Some(hash_content(content));
        document.indexed_at = Some(123);
        previous.insert(document.path.clone(), document);

        let reused = build_or_reuse_document_knowledge(&root, &path, &previous).unwrap();

        assert_eq!(reused.metadata.modified_at, metadata_millis(&metadata));
        assert_eq!(reused.metadata.size, metadata.len());
        assert!(reused.indexed_at.unwrap_or(0) >= reused.metadata.modified_at);
        assert_eq!(reused.relative_path, "notes/same-content.md");
        fs::remove_dir_all(&root).unwrap();
    }

    fn test_index(documents: Vec<DocumentKnowledge>) -> WorkspaceKnowledgeIndex {
        let block_count = documents
            .iter()
            .map(|document| document.blocks.len())
            .sum::<usize>();
        let documents = documents
            .into_iter()
            .map(|document| (document.path.clone(), document))
            .collect::<HashMap<_, _>>();
        WorkspaceKnowledgeIndex {
            state: WorkspaceIndexState {
                workspace_root: "/workspace".to_string(),
                schema_version: SCHEMA_VERSION,
                last_rebuild_at: Some(1),
                status: "ready".to_string(),
                error_message: None,
                document_count: documents.len(),
                block_count,
            },
            documents,
        }
    }

    fn test_document(
        path: &str,
        relative_path: &str,
        title: Option<&str>,
        tags: &[&str],
    ) -> DocumentKnowledge {
        DocumentKnowledge {
            path: path.to_string(),
            relative_path: relative_path.to_string(),
            title: title.map(str::to_string),
            frontmatter_json: None,
            metadata: FileMetadata {
                modified_at: 1,
                size: 1,
            },
            content_hash: Some("test-hash".to_string()),
            indexed_at: Some(1),
            blocks: Vec::new(),
            links: Vec::new(),
            tags: tags
                .iter()
                .map(|tag| TagSummary {
                    id: format!("tag:{relative_path}:1:{tag}"),
                    path: path.to_string(),
                    relative_path: relative_path.to_string(),
                    block_id: None,
                    tag: (*tag).to_string(),
                    line: 1,
                })
                .collect(),
        }
    }

    fn snapshot_document(root: &Path, path: &Path, content: &str) -> DocumentKnowledge {
        let metadata = fs::metadata(path).unwrap();
        let relative_path = path
            .strip_prefix(root)
            .unwrap()
            .to_string_lossy()
            .to_string();
        DocumentKnowledge {
            path: path.to_string_lossy().to_string(),
            relative_path: relative_path.clone(),
            title: None,
            frontmatter_json: None,
            metadata: FileMetadata {
                modified_at: metadata_millis(&metadata),
                size: metadata.len(),
            },
            content_hash: Some(hash_content(content)),
            indexed_at: Some(1),
            blocks: vec![KnowledgeBlockRecord {
                id: format!("{relative_path}:paragraph:1"),
                path: path.to_string_lossy().to_string(),
                relative_path,
                block_type: "paragraph".to_string(),
                text: content.trim().to_string(),
                raw: content.trim().to_string(),
                start_line: 1,
                end_line: 1,
                depth: 0,
                parent_heading_id: None,
                heading_path: Vec::new(),
                language: None,
                checked: None,
            }],
            links: Vec::new(),
            tags: Vec::new(),
        }
    }

    fn test_block(
        path: &str,
        relative_path: &str,
        raw: &str,
        start_line: usize,
        heading_path: &[&str],
    ) -> KnowledgeBlockRecord {
        KnowledgeBlockRecord {
            id: format!("{relative_path}:paragraph:{start_line}"),
            path: path.to_string(),
            relative_path: relative_path.to_string(),
            block_type: "paragraph".to_string(),
            text: raw.to_string(),
            raw: raw.to_string(),
            start_line,
            end_line: start_line,
            depth: 0,
            parent_heading_id: None,
            heading_path: heading_path
                .iter()
                .map(|value| (*value).to_string())
                .collect(),
            language: None,
            checked: None,
        }
    }

    fn test_index_for_root(
        root: &Path,
        documents: Vec<DocumentKnowledge>,
    ) -> WorkspaceKnowledgeIndex {
        let mut index = test_index(documents);
        index.state.workspace_root = root.to_string_lossy().to_string();
        index
    }

    fn wait_for_mtime_change(path: &Path, content: &str, previous_modified_at: u64) {
        for _ in 0..40 {
            thread::sleep(Duration::from_millis(25));
            fs::write(path, content).unwrap();
            let metadata = fs::metadata(path).unwrap();
            if metadata_millis(&metadata) != previous_modified_at {
                return;
            }
        }
        panic!("mtime did not change for {}", path.display());
    }

    struct TestWorkspace {
        root: PathBuf,
    }

    impl TestWorkspace {
        fn new() -> Self {
            let id = TEST_WORKSPACE_COUNTER.fetch_add(1, Ordering::Relaxed);
            let root = env::temp_dir().join(format!(
                "inkstack-workspace-index-test-{}-{}-{}",
                std::process::id(),
                now_millis(),
                id
            ));
            fs::create_dir_all(&root).unwrap();
            Self {
                root: fs::canonicalize(root).unwrap(),
            }
        }

        fn root(&self) -> &Path {
            &self.root
        }
    }

    impl Drop for TestWorkspace {
        fn drop(&mut self) {
            let _ = fs::remove_dir_all(&self.root);
        }
    }

    fn temp_workspace(name: &str) -> PathBuf {
        std::env::temp_dir().join(format!("inkstack-{name}-{}", now_millis()))
    }
}

fn truncate_chars(value: &str, max_chars: usize) -> String {
    value.chars().take(max_chars).collect()
}

fn frontmatter_end_line(content: &str) -> Option<usize> {
    let lines = content.lines().collect::<Vec<_>>();
    if lines.first().copied() != Some("---") {
        return None;
    }
    lines.iter().enumerate().skip(1).find_map(|(index, line)| {
        if line.trim() == "---" {
            Some(index + 1)
        } else {
            None
        }
    })
}

fn is_indexable_file(path: &Path) -> bool {
    fs::metadata(path)
        .map(|metadata| metadata.len() <= MAX_FILE_BYTES)
        .unwrap_or(false)
}

fn metadata_millis(metadata: &fs::Metadata) -> u64 {
    metadata
        .modified()
        .ok()
        .and_then(|time| time.duration_since(UNIX_EPOCH).ok())
        .map(|duration| duration.as_millis() as u64)
        .unwrap_or(0)
}

fn now_millis() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|duration| duration.as_millis() as u64)
        .unwrap_or(0)
}

fn workspace_root(state: &tauri::State<'_, AppState>) -> Result<PathBuf, String> {
    state
        .workspace_root
        .lock()
        .map_err(|_| "Workspace state is unavailable".to_string())?
        .clone()
        .ok_or_else(|| "Open a workspace first".to_string())
}

fn canonicalize_workspace_file(path: &str, root: &Path) -> Result<PathBuf, String> {
    let path = fs::canonicalize(Path::new(path)).map_err(|error| error.to_string())?;
    if !path.starts_with(root) {
        return Err("Document is outside the current workspace".to_string());
    }
    Ok(path)
}

fn resolve_workspace_file_path(path: &str, root: &Path) -> Result<PathBuf, String> {
    let raw = Path::new(path);
    if raw.exists() {
        return canonicalize_workspace_file(path, root);
    }

    let candidate = if raw.is_absolute() {
        raw.to_path_buf()
    } else {
        root.join(raw)
    };
    let normalized = normalize_path(&candidate);
    if !normalized.starts_with(root) {
        return Err("Document is outside the current workspace".to_string());
    }
    Ok(normalized)
}

fn normalize_path(path: &Path) -> PathBuf {
    let mut normalized = PathBuf::new();
    for component in path.components() {
        match component {
            std::path::Component::CurDir => {}
            std::path::Component::ParentDir => {
                normalized.pop();
            }
            _ => normalized.push(component.as_os_str()),
        }
    }
    normalized
}
