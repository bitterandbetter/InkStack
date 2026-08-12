use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AppSettings {
    #[serde(default)]
    pub recent_workspaces: Vec<String>,
    #[serde(default)]
    pub recent_workspace_entries: Vec<RecentEntryMeta>,
    #[serde(default)]
    pub recent_files: Vec<String>,
    #[serde(default)]
    pub recent_file_entries: Vec<RecentEntryMeta>,
    #[serde(default)]
    pub pinned_workspaces: Vec<String>,
    #[serde(default)]
    pub pinned_files: Vec<String>,
    #[serde(default)]
    pub last_workspace: Option<String>,
    #[serde(default)]
    pub last_file: Option<String>,
}

impl Default for AppSettings {
    fn default() -> Self {
        Self {
            recent_workspaces: Vec::new(),
            recent_workspace_entries: Vec::new(),
            recent_files: Vec::new(),
            recent_file_entries: Vec::new(),
            pinned_workspaces: Vec::new(),
            pinned_files: Vec::new(),
            last_workspace: None,
            last_file: None,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RecentEntryMeta {
    pub path: String,
    pub opened_at: u64,
}

#[derive(Debug, Serialize)]
pub struct FileEntry {
    pub name: String,
    pub path: String,
    pub is_dir: bool,
    pub is_markdown: bool,
    pub is_text: bool,
    pub file_kind: String,
    pub language: Option<String>,
    pub is_loaded: bool,
    pub is_truncated: bool,
    pub children: Vec<FileEntry>,
}

#[derive(Debug, Serialize)]
pub struct DirectoryScanResult {
    pub entries: Vec<FileEntry>,
    pub truncated: bool,
    pub limit: usize,
}

#[derive(Debug, Serialize)]
pub struct MarkdownSearchResult {
    pub name: String,
    pub path: String,
    pub relative_path: String,
    pub line: Option<usize>,
    pub snippet: Option<String>,
    pub match_kind: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WorkspaceIndexState {
    pub workspace_root: String,
    pub schema_version: u32,
    pub last_rebuild_at: Option<u64>,
    pub status: String,
    pub error_message: Option<String>,
    pub document_count: usize,
    pub block_count: usize,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SearchKnowledgeBlocksRequest {
    pub query: String,
    #[serde(default = "default_search_limit")]
    pub limit: usize,
    #[serde(default)]
    pub include_current_file: bool,
    #[serde(default)]
    pub current_path: Option<String>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GetDocumentKnowledgeRequest {
    pub path: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct KnowledgeBlockRecord {
    pub id: String,
    pub path: String,
    pub relative_path: String,
    pub block_type: String,
    pub text: String,
    pub raw: String,
    pub start_line: usize,
    pub end_line: usize,
    pub depth: usize,
    pub parent_heading_id: Option<String>,
    pub heading_path: Vec<String>,
    pub language: Option<String>,
    pub checked: Option<bool>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct KnowledgeBlockSearchResult {
    pub id: String,
    pub path: String,
    pub relative_path: String,
    pub block_type: String,
    pub text: String,
    pub snippet: Option<String>,
    pub start_line: usize,
    pub end_line: usize,
    pub heading_path: Vec<String>,
    pub score: usize,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SearchKnowledgeDocumentsRequest {
    pub query: String,
    #[serde(default = "default_search_limit")]
    pub limit: usize,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct KnowledgeDocumentSearchResult {
    pub path: String,
    pub relative_path: String,
    pub title: Option<String>,
    pub aliases: Vec<String>,
    pub tags: Vec<String>,
    pub score: usize,
    pub match_kind: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LinkReference {
    pub id: String,
    pub source_path: String,
    pub source_relative_path: String,
    pub source_block_id: Option<String>,
    pub kind: String,
    pub target: String,
    pub label: Option<String>,
    pub heading: Option<String>,
    pub resolved_path: Option<String>,
    pub line: usize,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct UnlinkedMention {
    pub id: String,
    pub path: String,
    pub relative_path: String,
    pub line: usize,
    pub matched_text: String,
    pub snippet: String,
    pub heading_path: Vec<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TagSummary {
    pub id: String,
    pub path: String,
    pub relative_path: String,
    pub block_id: Option<String>,
    pub tag: String,
    pub line: usize,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DocumentKnowledge {
    pub path: String,
    pub relative_path: String,
    pub title: Option<String>,
    pub frontmatter_json: Option<String>,
    pub metadata: FileMetadata,
    pub content_hash: Option<String>,
    pub indexed_at: Option<u64>,
    pub blocks: Vec<KnowledgeBlockRecord>,
    pub links: Vec<LinkReference>,
    pub tags: Vec<TagSummary>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct IsolatedDocumentSummary {
    pub path: String,
    pub relative_path: String,
    pub title: Option<String>,
    pub block_count: usize,
    pub tag_count: usize,
    pub modified_at: u64,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct IsolatedDocumentSuggestion {
    pub source: IsolatedDocumentSummary,
    pub target: IsolatedDocumentSummary,
    pub reasons: Vec<String>,
    pub score: usize,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct WorkspaceKnowledgeOverview {
    pub state: WorkspaceIndexState,
    pub link_count: usize,
    pub resolved_link_count: usize,
    pub unresolved_link_count: usize,
    pub tag_count: usize,
    pub unique_tag_count: usize,
    pub isolated_document_count: usize,
    pub total_size: u64,
    pub newest_modified_at: Option<u64>,
    pub oldest_indexed_at: Option<u64>,
    pub top_connected_documents: Vec<WorkspaceKnowledgeDocumentNode>,
    pub recent_documents: Vec<WorkspaceKnowledgeDocumentNode>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct WorkspaceKnowledgeGraph {
    pub nodes: Vec<WorkspaceKnowledgeDocumentNode>,
    pub edges: Vec<WorkspaceKnowledgeGraphEdge>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct WorkspaceKnowledgeGraphEdge {
    pub id: String,
    pub source_path: String,
    pub source_relative_path: String,
    pub target_path: Option<String>,
    pub target_relative_path: Option<String>,
    pub target: String,
    pub kind: String,
    pub line: usize,
    pub resolved: bool,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct WorkspaceKnowledgeDocumentNode {
    pub path: String,
    pub relative_path: String,
    pub title: Option<String>,
    pub incoming_count: usize,
    pub outgoing_count: usize,
    pub unresolved_count: usize,
    pub tag_count: usize,
    pub tags: Vec<String>,
    pub block_count: usize,
    pub modified_at: u64,
    pub indexed_at: Option<u64>,
}

fn default_search_limit() -> usize {
    40
}

#[derive(Debug, Clone, Serialize)]
pub struct FileMetadata {
    pub modified_at: u64,
    pub size: u64,
}

#[derive(Debug, Serialize)]
pub struct MarkdownDocument {
    pub path: String,
    pub content: String,
    pub metadata: FileMetadata,
}

#[derive(Debug, Serialize)]
pub struct TextDocument {
    pub path: String,
    pub content: String,
    pub metadata: FileMetadata,
    pub is_markdown: bool,
    pub file_kind: String,
    pub language: Option<String>,
    pub read_only: bool,
}

#[derive(Debug, Serialize)]
pub struct MarkdownAsset {
    pub path: String,
}

#[derive(Debug, Serialize)]
pub struct ImportedMarkdownAsset {
    pub path: String,
    pub relative_src: String,
}

#[derive(Debug, Serialize)]
pub struct PickedMarkdownAsset {
    pub source_path: String,
    pub path: String,
    pub relative_src: String,
    pub markdown_src: String,
    pub file_name: String,
    pub is_image: bool,
}

#[derive(Debug, Deserialize)]
pub struct ImportMarkdownAssetRequest {
    pub document_path: String,
    pub source_path: String,
    #[serde(default)]
    pub kind: Option<String>,
    #[serde(default)]
    pub mode: Option<String>,
}

#[derive(Debug, Deserialize)]
pub struct SaveMarkdownRequest {
    pub path: String,
    pub content: String,
    pub expected_modified_at: Option<u64>,
    pub expected_size: Option<u64>,
}

#[derive(Debug, Deserialize)]
pub struct SaveMarkdownAsRequest {
    pub suggested_name: String,
    pub content: String,
}

#[derive(Debug, Deserialize)]
pub struct SaveExportRequest {
    pub suggested_name: String,
    pub contents: String,
    pub extension: String,
    pub kind: String,
}

#[derive(Debug, Deserialize)]
pub struct CreateWorkspaceEntryRequest {
    pub parent_path: String,
    pub name: String,
}

#[derive(Debug, Deserialize)]
pub struct RenameWorkspaceEntryRequest {
    pub path: String,
    pub new_name: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DeleteWorkspaceEntryResult {
    pub moved_to_trash: bool,
    pub fallback_deleted: bool,
}

#[derive(Debug, Serialize)]
pub struct CssThemeSummary {
    pub id: String,
    pub name: String,
}

#[derive(Debug, Deserialize)]
pub struct SystemProfilerFontResponse {
    #[serde(rename = "SPFontsDataType", default)]
    pub fonts: Vec<SystemProfilerFontItem>,
}

#[derive(Debug, Deserialize)]
pub struct SystemProfilerFontItem {
    #[serde(default)]
    pub typefaces: Vec<SystemProfilerTypeface>,
}

#[derive(Debug, Deserialize)]
pub struct SystemProfilerTypeface {
    #[serde(default)]
    pub family: String,
}

#[derive(Debug, Serialize)]
pub struct CssThemeDocument {
    pub id: String,
    pub name: String,
    pub css: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ExportCssThemeRequest {
    pub suggested_name: String,
    pub css: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BuiltInCssThemeWriteRequest {
    pub id: String,
    pub css: String,
}

#[derive(Debug, Serialize)]
pub struct SaveMarkdownResult {
    pub path: String,
    pub metadata: FileMetadata,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AiGenerateRequest {
    pub kind: String,
    pub model: String,
    pub temperature: f32,
    pub prompt: String,
    #[serde(default)]
    pub context: Option<String>,
    #[serde(default)]
    pub mode: Option<String>,
    #[serde(default)]
    pub base_url: Option<String>,
    #[serde(default)]
    pub api_key_env: Option<String>,
    #[serde(default)]
    pub model_env: Option<String>,
    #[serde(default)]
    pub base_url_env: Option<String>,
}

#[derive(Debug, Serialize)]
pub struct AiGenerateResult {
    pub text: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub model: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AiStreamStartPayload {
    pub request_id: String,
    pub provider: String,
    pub model: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AiStreamDeltaPayload {
    pub request_id: String,
    pub text: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AiStreamEndPayload {
    pub request_id: String,
    pub model: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AiStreamErrorPayload {
    pub request_id: String,
    pub error: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AiModelTestResult {
    pub ok: bool,
    pub provider: String,
    pub requested_model: String,
    pub response_model: Option<String>,
    pub answer: Option<String>,
    pub error: Option<String>,
}
