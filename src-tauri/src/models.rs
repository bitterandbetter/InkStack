use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AppSettings {
    #[serde(default)]
    pub recent_workspaces: Vec<String>,
    #[serde(default)]
    pub recent_files: Vec<String>,
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
            recent_files: Vec::new(),
            pinned_workspaces: Vec::new(),
            pinned_files: Vec::new(),
            last_workspace: None,
            last_file: None,
        }
    }
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

#[derive(Debug, Serialize)]
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

#[derive(Debug, Deserialize)]
pub struct ImportMarkdownAssetRequest {
    pub document_path: String,
    pub source_path: String,
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
pub struct CssThemeSummary {
    pub id: String,
    pub name: String,
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
