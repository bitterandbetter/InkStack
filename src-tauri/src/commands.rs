use std::{
    fs,
    io::Write,
    path::{Path, PathBuf},
    process::{Command, Stdio},
    time::{SystemTime, UNIX_EPOCH},
};

use notify::{Config, EventKind, RecommendedWatcher, RecursiveMode, Watcher};
use tauri::Emitter;
use tauri::Manager;
use tauri_plugin_dialog::DialogExt;
use tauri_plugin_opener::OpenerExt;

use crate::models::{
    AiGenerateRequest, AiGenerateResult, AiModelTestResult, AppSettings,
    CreateWorkspaceEntryRequest, DirectoryScanResult, FileEntry, FileMetadata, MarkdownAsset,
    MarkdownDocument, MarkdownSearchResult, RenameWorkspaceEntryRequest, SaveExportRequest,
    SaveMarkdownAsRequest, SaveMarkdownRequest, SaveMarkdownResult, TextDocument,
};
use crate::AppState;

#[tauri::command]
pub async fn get_settings(app: tauri::AppHandle) -> Result<AppSettings, String> {
    let path = settings_path(&app)?;

    match tokio::fs::read_to_string(&path).await {
        Ok(content) => serde_json::from_str::<AppSettings>(&content)
            .map(normalize_settings)
            .or_else(|_| Ok(AppSettings::default())),
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => Ok(AppSettings::default()),
        Err(error) => Err(error.to_string()),
    }
}

#[tauri::command]
pub async fn update_settings(
    app: tauri::AppHandle,
    settings: AppSettings,
) -> Result<AppSettings, String> {
    let path = settings_path(&app)?;
    let settings = normalize_settings(settings);
    let content = serde_json::to_string_pretty(&settings).map_err(|error| error.to_string())?;
    let tmp_path = temporary_save_path(&path)?;

    if let Some(parent) = path.parent() {
        tokio::fs::create_dir_all(parent)
            .await
            .map_err(|error| error.to_string())?;
    }

    tokio::fs::write(&tmp_path, content)
        .await
        .map_err(|error| error.to_string())?;
    tokio::fs::rename(&tmp_path, &path)
        .await
        .map_err(|error| error.to_string())?;

    Ok(settings)
}

#[tauri::command]
pub async fn generate_ai_text(request: AiGenerateRequest) -> Result<AiGenerateResult, String> {
    let request = normalize_ai_request(request)?;

    match request.kind.as_str() {
        "openai" => request_openai_compatible(request)
            .await
            .map(|response| AiGenerateResult {
                text: response.text,
                model: None,
            }),
        "anthropic" => request_anthropic(request)
            .await
            .map(|response| AiGenerateResult {
                text: response.text,
                model: None,
            }),
        "gemini" => request_gemini(request)
            .await
            .map(|response| AiGenerateResult {
                text: response.text,
                model: None,
            }),
        _ => Err("Unsupported AI provider kind".to_string()),
    }
}

#[tauri::command]
pub async fn test_ai_model(request: AiGenerateRequest) -> Result<AiModelTestResult, String> {
    let mut request = normalize_ai_request(request)?;
    request.context = None;
    request.mode = Some("model_test".to_string());

    let provider = request.kind.clone();
    let requested_model = match request.kind.as_str() {
        "openai" => request_model_or_env(&request, "OPENAI_MODEL", "gpt-5.5"),
        "anthropic" => request_model_or_env(&request, "ANTHROPIC_MODEL", "claude-opus-4-7"),
        "gemini" => request_model_or_env(&request, "GEMINI_MODEL", "gemini-3.1-pro-preview"),
        _ => return Err("Unsupported AI provider kind".to_string()),
    };

    let result = match request.kind.as_str() {
        "openai" => request_openai_compatible(request).await,
        "anthropic" => request_anthropic(request).await,
        "gemini" => request_gemini(request).await,
        _ => unreachable!(),
    };

    Ok(match result {
        Ok(response) => AiModelTestResult {
            ok: true,
            provider,
            requested_model,
            response_model: response.model,
            answer: Some(response.text),
            error: None,
        },
        Err(error) => AiModelTestResult {
            ok: false,
            provider,
            requested_model,
            response_model: None,
            answer: None,
            error: Some(error),
        },
    })
}

#[tauri::command]
pub async fn take_startup_markdown_paths(
    state: tauri::State<'_, AppState>,
) -> Result<Vec<String>, String> {
    let mut paths = state
        .startup_markdown_paths
        .lock()
        .map_err(|_| "Startup path state is unavailable".to_string())?;
    Ok(std::mem::take(&mut *paths))
}

#[tauri::command]
pub async fn choose_workspace(app: tauri::AppHandle) -> Result<Option<String>, String> {
    let selected = app
        .dialog()
        .file()
        .set_title("打开 InkStack 工作区")
        .blocking_pick_folder();

    Ok(selected.map(|path| path.to_string()))
}

#[tauri::command]
pub async fn choose_markdown_file(app: tauri::AppHandle) -> Result<Option<String>, String> {
    let selected = app
        .dialog()
        .file()
        .set_title("打开文本或代码文件")
        .add_filter("Markdown", &["md", "markdown"])
        .add_filter(
            "Code & Text",
            &[
                "ts", "tsx", "js", "jsx", "mjs", "cjs", "py", "rs", "go", "java", "cs", "cpp", "c",
                "h", "hpp", "swift", "kt", "php", "rb", "lua", "sh", "zsh", "bash", "sql", "css",
                "scss", "html", "xml", "json", "yaml", "yml", "toml", "ini", "env", "txt", "log",
            ],
        )
        .blocking_pick_file();

    Ok(selected.map(|path| path.to_string()))
}

#[tauri::command]
pub async fn choose_markdown_save_path(
    app: tauri::AppHandle,
    suggested_name: String,
) -> Result<Option<String>, String> {
    let suggested_name = sanitize_suggested_markdown_name(&suggested_name);
    let selected = app
        .dialog()
        .file()
        .set_title("保存 Markdown 文件")
        .set_file_name(&suggested_name)
        .add_filter("Markdown", &["md", "markdown"])
        .blocking_save_file();

    Ok(selected.map(|path| path.to_string()))
}

#[tauri::command]
pub async fn scan_directory(
    path: String,
    app: tauri::AppHandle,
    state: tauri::State<'_, AppState>,
) -> Result<DirectoryScanResult, String> {
    let root = canonicalize_dir(Path::new(&path))?;
    {
        let mut workspace_root = state
            .workspace_root
            .lock()
            .map_err(|_| "Workspace state is unavailable".to_string())?;
        *workspace_root = Some(root.clone());
    }
    restart_workspace_watcher(&app, &state, &root)?;

    add_recent_workspace(&app, &root).await?;

    tokio::task::spawn_blocking(move || scan_dir(&root))
        .await
        .map_err(|error| error.to_string())?
}

fn restart_workspace_watcher(
    app: &tauri::AppHandle,
    state: &tauri::State<'_, AppState>,
    root: &Path,
) -> Result<(), String> {
    let event_root = root.to_string_lossy().to_string();
    let app_handle = app.clone();
    let mut watcher = RecommendedWatcher::new(
        move |result: notify::Result<notify::Event>| {
            let Ok(event) = result else {
                return;
            };
            if !is_workspace_tree_event(&event.kind) {
                return;
            }

            let _ = app_handle.emit("inkstack://workspace-changed", event_root.clone());
        },
        Config::default(),
    )
    .map_err(|error| error.to_string())?;

    watcher
        .watch(root, RecursiveMode::Recursive)
        .map_err(|error| error.to_string())?;

    let mut workspace_watcher = state
        .workspace_watcher
        .lock()
        .map_err(|_| "Workspace watcher state is unavailable".to_string())?;
    *workspace_watcher = Some(watcher);
    Ok(())
}

fn is_workspace_tree_event(kind: &EventKind) -> bool {
    matches!(
        kind,
        EventKind::Create(_) | EventKind::Remove(_) | EventKind::Modify(_) | EventKind::Any
    )
}

#[tauri::command]
pub async fn scan_directory_children(
    path: String,
    state: tauri::State<'_, AppState>,
) -> Result<DirectoryScanResult, String> {
    let path = resolve_workspace_dir_path(&path, &state)?;

    tokio::task::spawn_blocking(move || scan_dir(&path))
        .await
        .map_err(|error| error.to_string())?
}

#[tauri::command]
pub async fn create_workspace_markdown_file(
    request: CreateWorkspaceEntryRequest,
    state: tauri::State<'_, AppState>,
) -> Result<MarkdownDocument, String> {
    let parent = resolve_workspace_dir_path(&request.parent_path, &state)?;
    let path = unique_child_path(&parent, &sanitize_suggested_markdown_name(&request.name))?;

    tokio::fs::write(&path, "# Untitled\n")
        .await
        .map_err(|error| error.to_string())?;
    let path = fs::canonicalize(path).map_err(|error| error.to_string())?;
    read_markdown_document(path).await
}

#[tauri::command]
pub async fn create_workspace_folder(
    request: CreateWorkspaceEntryRequest,
    state: tauri::State<'_, AppState>,
) -> Result<String, String> {
    let parent = resolve_workspace_dir_path(&request.parent_path, &state)?;
    let folder_name = sanitize_child_name(&request.name, "New Folder")?;
    let path = unique_child_path(&parent, &folder_name)?;

    tokio::fs::create_dir(&path)
        .await
        .map_err(|error| error.to_string())?;
    let path = fs::canonicalize(path).map_err(|error| error.to_string())?;
    Ok(path.to_string_lossy().to_string())
}

#[tauri::command]
pub async fn rename_workspace_entry(
    request: RenameWorkspaceEntryRequest,
    state: tauri::State<'_, AppState>,
) -> Result<String, String> {
    let path = resolve_workspace_entry_path(&request.path, &state)?;
    let parent = path
        .parent()
        .ok_or_else(|| "Entry has no parent directory".to_string())?;
    let new_name = sanitize_child_name(&request.new_name, "Untitled")?;
    let target = parent.join(new_name);
    let target = ensure_workspace_child_path(&target, &state)?;

    if target.exists() {
        return Err("A file or folder with that name already exists".to_string());
    }

    tokio::fs::rename(&path, &target)
        .await
        .map_err(|error| error.to_string())?;
    let target = fs::canonicalize(target).map_err(|error| error.to_string())?;
    Ok(target.to_string_lossy().to_string())
}

#[tauri::command]
pub async fn delete_workspace_entry(
    path: String,
    state: tauri::State<'_, AppState>,
) -> Result<(), String> {
    let path = resolve_workspace_entry_path(&path, &state)?;

    if path.is_dir() {
        tokio::fs::remove_dir(&path).await.map_err(|error| {
            if error.kind() == std::io::ErrorKind::DirectoryNotEmpty {
                "Folder is not empty. Delete files inside it first.".to_string()
            } else {
                error.to_string()
            }
        })?;
    } else {
        tokio::fs::remove_file(&path)
            .await
            .map_err(|error| error.to_string())?;
    }

    Ok(())
}

#[tauri::command]
pub async fn search_markdown_files(
    query: String,
    state: tauri::State<'_, AppState>,
) -> Result<Vec<MarkdownSearchResult>, String> {
    let root = state
        .workspace_root
        .lock()
        .map_err(|_| "Workspace state is unavailable".to_string())?
        .clone()
        .ok_or_else(|| "Open a workspace first".to_string())?;
    let query = query.trim().to_lowercase();

    tokio::task::spawn_blocking(move || search_markdown_files_in_workspace(&root, &query))
        .await
        .map_err(|error| error.to_string())?
}

#[tauri::command]
pub async fn search_text_files(
    query: String,
    state: tauri::State<'_, AppState>,
) -> Result<Vec<MarkdownSearchResult>, String> {
    let root = state
        .workspace_root
        .lock()
        .map_err(|_| "Workspace state is unavailable".to_string())?
        .clone()
        .ok_or_else(|| "Open a workspace first".to_string())?;
    let query = query.trim().to_lowercase();

    tokio::task::spawn_blocking(move || search_text_files_in_workspace(&root, &query))
        .await
        .map_err(|error| error.to_string())?
}

#[tauri::command]
pub async fn read_markdown_file(
    path: String,
    state: tauri::State<'_, AppState>,
) -> Result<MarkdownDocument, String> {
    let path = resolve_readable_markdown_path(&path, &state)?;
    read_markdown_document(path).await
}

#[tauri::command]
pub async fn read_text_file(
    path: String,
    state: tauri::State<'_, AppState>,
) -> Result<TextDocument, String> {
    let path = resolve_readable_text_path(&path, &state)?;
    read_text_document(path).await
}

#[tauri::command]
pub async fn resolve_markdown_asset(
    document_path: String,
    asset_src: String,
    state: tauri::State<'_, AppState>,
) -> Result<MarkdownAsset, String> {
    let document_path = resolve_readable_markdown_path(&document_path, &state)?;
    let asset_path = resolve_markdown_asset_path(&document_path, &asset_src, &state)?;

    Ok(MarkdownAsset {
        path: asset_path.to_string_lossy().to_string(),
    })
}

#[tauri::command]
pub async fn open_markdown_file(
    path: String,
    app: tauri::AppHandle,
    state: tauri::State<'_, AppState>,
) -> Result<MarkdownDocument, String> {
    let path = canonicalize_markdown_file(Path::new(&path))?;
    {
        let mut allowed_files = state
            .allowed_files
            .lock()
            .map_err(|_| "Allowed file state is unavailable".to_string())?;
        allowed_files.insert(path.clone());
    }

    add_recent_file(&app, &path).await?;

    read_markdown_document(path).await
}

#[tauri::command]
pub async fn open_text_file(
    path: String,
    app: tauri::AppHandle,
    state: tauri::State<'_, AppState>,
) -> Result<TextDocument, String> {
    let path = canonicalize_text_file(Path::new(&path))?;
    {
        let mut allowed_files = state
            .allowed_files
            .lock()
            .map_err(|_| "Allowed file state is unavailable".to_string())?;
        allowed_files.insert(path.clone());
    }

    add_recent_file(&app, &path).await?;

    read_text_document(path).await
}

#[tauri::command]
pub async fn save_markdown_file(
    request: SaveMarkdownRequest,
    state: tauri::State<'_, AppState>,
) -> Result<SaveMarkdownResult, String> {
    let path = resolve_readable_markdown_path(&request.path, &state)?;
    let expected_modified_at = request
        .expected_modified_at
        .ok_or_else(|| "Cannot save without a file change baseline".to_string())?;
    let expected_size = request
        .expected_size
        .ok_or_else(|| "Cannot save without a file size baseline".to_string())?;
    let current = file_metadata(&path)?;

    if current.modified_at != expected_modified_at || current.size != expected_size {
        return Err("文件已在外部被修改，请重新加载后再保存。".to_string());
    }

    let tmp_path = temporary_save_path(&path)?;
    tokio::fs::write(&tmp_path, request.content)
        .await
        .map_err(|error| error.to_string())?;
    tokio::fs::rename(&tmp_path, &path)
        .await
        .map_err(|error| error.to_string())?;

    Ok(SaveMarkdownResult {
        path: path.to_string_lossy().to_string(),
        metadata: file_metadata(&path)?,
    })
}

#[tauri::command]
pub async fn save_markdown_file_as(
    app: tauri::AppHandle,
    request: SaveMarkdownAsRequest,
    state: tauri::State<'_, AppState>,
) -> Result<Option<SaveMarkdownResult>, String> {
    let suggested_name = sanitize_suggested_markdown_name(&request.suggested_name);
    let selected = app
        .dialog()
        .file()
        .set_title("另存为 Markdown 文件")
        .set_file_name(&suggested_name)
        .add_filter("Markdown", &["md", "markdown"])
        .blocking_save_file();

    let Some(path) = selected else {
        return Ok(None);
    };

    let path = normalize_markdown_save_path(PathBuf::from(path.to_string()));
    if let Some(parent) = path.parent() {
        if !parent.is_dir() {
            return Err("Save location does not exist".to_string());
        }
    }

    write_markdown_document(&path, request.content).await?;
    let path = fs::canonicalize(path).map_err(|error| error.to_string())?;
    {
        let mut allowed_files = state
            .allowed_files
            .lock()
            .map_err(|_| "Allowed file state is unavailable".to_string())?;
        allowed_files.insert(path.clone());
    }
    add_recent_file(&app, &path).await?;

    Ok(Some(SaveMarkdownResult {
        path: path.to_string_lossy().to_string(),
        metadata: file_metadata(&path)?,
    }))
}

#[tauri::command]
pub async fn save_export_file(
    app: tauri::AppHandle,
    request: SaveExportRequest,
) -> Result<Option<String>, String> {
    let extension = sanitize_export_extension(&request.extension)?;
    let suggested_name = sanitize_export_name(&request.suggested_name, &extension);
    let filter_name = match request.kind.as_str() {
        "svg" => "SVG Image",
        "png" => "PNG Image",
        _ => "Export",
    };
    let selected = app
        .dialog()
        .file()
        .set_title("导出文件")
        .set_file_name(&suggested_name)
        .add_filter(filter_name, &[extension.as_str()])
        .blocking_save_file();

    let Some(path) = selected else {
        return Ok(None);
    };

    let mut path = PathBuf::from(path.to_string());
    if path.extension().is_none() {
        path = path.with_extension(&extension);
    }

    let bytes = if request.kind == "png" {
        decode_base64_data_url(&request.contents)?
    } else {
        request.contents.into_bytes()
    };
    tokio::fs::write(&path, bytes)
        .await
        .map_err(|error| error.to_string())?;

    Ok(Some(path.to_string_lossy().to_string()))
}

#[tauri::command]
pub async fn get_markdown_file_metadata(
    path: String,
    state: tauri::State<'_, AppState>,
) -> Result<FileMetadata, String> {
    let path = resolve_readable_markdown_path(&path, &state)?;
    file_metadata(&path)
}

#[tauri::command]
pub async fn reveal_markdown_file(
    path: String,
    app: tauri::AppHandle,
    state: tauri::State<'_, AppState>,
) -> Result<(), String> {
    let path = resolve_readable_markdown_path(&path, &state)?;
    app.opener()
        .reveal_item_in_dir(path)
        .map_err(|error| error.to_string())
}

async fn read_markdown_document(path: PathBuf) -> Result<MarkdownDocument, String> {
    let metadata = file_metadata(&path)?;
    let content = tokio::fs::read_to_string(&path)
        .await
        .map_err(|error| error.to_string())?;

    Ok(MarkdownDocument {
        path: path.to_string_lossy().to_string(),
        content,
        metadata,
    })
}

async fn read_text_document(path: PathBuf) -> Result<TextDocument, String> {
    ensure_reasonable_text_file(&path)?;
    let metadata = file_metadata(&path)?;
    let content = tokio::fs::read_to_string(&path)
        .await
        .map_err(|error| error.to_string())?;
    let kind = classify_file_path(&path);

    Ok(TextDocument {
        path: path.to_string_lossy().to_string(),
        content,
        metadata,
        is_markdown: kind.is_markdown,
        file_kind: kind.file_kind.to_string(),
        language: kind.language.map(str::to_string),
        read_only: !kind.is_markdown,
    })
}

async fn write_markdown_document(path: &Path, content: String) -> Result<(), String> {
    let tmp_path = temporary_save_path(path)?;
    tokio::fs::write(&tmp_path, content)
        .await
        .map_err(|error| error.to_string())?;
    tokio::fs::rename(&tmp_path, path)
        .await
        .map_err(|error| error.to_string())
}

fn scan_dir(path: &Path) -> Result<DirectoryScanResult, String> {
    const MAX_ENTRIES_PER_DIR: usize = 500;

    let mut dir_entries = fs::read_dir(path)
        .map_err(|error| error.to_string())?
        .map(|entry| entry.map_err(|error| error.to_string()))
        .collect::<Result<Vec<_>, String>>()?
        .into_iter()
        .filter(|entry| {
            !is_hidden_tree_entry(entry.path().as_path()) && !is_ignored_dir(entry.path().as_path())
        })
        .collect::<Vec<_>>();
    let truncated = dir_entries.len() > MAX_ENTRIES_PER_DIR;
    dir_entries.truncate(MAX_ENTRIES_PER_DIR);

    let mut entries = dir_entries
        .into_iter()
        .filter_map(|entry| {
            let path = entry.path();
            let name = entry.file_name().to_string_lossy().to_string();

            if path.is_dir() {
                return Some(FileEntry {
                    name,
                    path: path.to_string_lossy().to_string(),
                    is_dir: true,
                    is_markdown: false,
                    is_text: false,
                    file_kind: "directory".to_string(),
                    language: None,
                    is_loaded: false,
                    is_truncated: false,
                    children: Vec::new(),
                });
            }

            let kind = classify_file_path(&path);
            if kind.is_text && is_reasonable_text_file(&path) {
                return Some(FileEntry {
                    name,
                    path: path.to_string_lossy().to_string(),
                    is_dir: false,
                    is_markdown: kind.is_markdown,
                    is_text: true,
                    file_kind: kind.file_kind.to_string(),
                    language: kind.language.map(str::to_string),
                    is_loaded: true,
                    is_truncated: false,
                    children: Vec::new(),
                });
            }

            None
        })
        .collect::<Vec<_>>();

    entries.sort_by(|left, right| match (left.is_dir, right.is_dir) {
        (true, false) => std::cmp::Ordering::Less,
        (false, true) => std::cmp::Ordering::Greater,
        _ => left.name.to_lowercase().cmp(&right.name.to_lowercase()),
    });

    Ok(DirectoryScanResult {
        entries,
        truncated,
        limit: MAX_ENTRIES_PER_DIR,
    })
}

fn search_markdown_files_in_workspace(
    root: &Path,
    query: &str,
) -> Result<Vec<MarkdownSearchResult>, String> {
    const MAX_RESULTS: usize = 80;
    const MAX_VISITED_DIRS: usize = 2_000;

    let mut results = Vec::new();
    let mut visited_dirs = 0usize;
    collect_markdown_files(root, root, query, &mut results, &mut visited_dirs)?;

    results.sort_by(|left, right| {
        (left.relative_path.to_lowercase(), left.line.unwrap_or(0))
            .cmp(&(right.relative_path.to_lowercase(), right.line.unwrap_or(0)))
    });
    results.truncate(MAX_RESULTS);

    if visited_dirs > MAX_VISITED_DIRS {
        results.truncate(MAX_RESULTS);
    }

    Ok(results)
}

fn search_text_files_in_workspace(
    root: &Path,
    query: &str,
) -> Result<Vec<MarkdownSearchResult>, String> {
    const MAX_RESULTS: usize = 120;

    let mut results = Vec::new();
    let mut visited_dirs = 0usize;
    collect_text_files(root, root, query, &mut results, &mut visited_dirs)?;

    results.sort_by(|left, right| {
        (left.relative_path.to_lowercase(), left.line.unwrap_or(0))
            .cmp(&(right.relative_path.to_lowercase(), right.line.unwrap_or(0)))
    });
    results.truncate(MAX_RESULTS);

    Ok(results)
}

fn collect_markdown_files(
    root: &Path,
    current: &Path,
    query: &str,
    results: &mut Vec<MarkdownSearchResult>,
    visited_dirs: &mut usize,
) -> Result<(), String> {
    const MAX_RESULTS: usize = 80;
    const MAX_VISITED_DIRS: usize = 2_000;

    if results.len() >= MAX_RESULTS || *visited_dirs >= MAX_VISITED_DIRS {
        return Ok(());
    }

    *visited_dirs += 1;
    let entries = fs::read_dir(current)
        .map_err(|error| error.to_string())?
        .map(|entry| entry.map_err(|error| error.to_string()))
        .collect::<Result<Vec<_>, String>>()?;

    for entry in entries {
        let path = entry.path();
        if is_hidden(&path) {
            continue;
        }

        if path.is_dir() {
            if !is_ignored_dir(&path) {
                collect_markdown_files(root, &path, query, results, visited_dirs)?;
            }
            continue;
        }

        if !is_markdown_path(&path) {
            continue;
        }

        let relative_path = path
            .strip_prefix(root)
            .unwrap_or(&path)
            .to_string_lossy()
            .to_string();
        let file_name_matches = query.is_empty() || relative_path.to_lowercase().contains(query);

        let name = path
            .file_name()
            .map(|name| name.to_string_lossy().to_string())
            .unwrap_or_else(|| relative_path.clone());
        if file_name_matches {
            results.push(MarkdownSearchResult {
                name: name.clone(),
                path: path.to_string_lossy().to_string(),
                relative_path: relative_path.clone(),
                line: None,
                snippet: None,
                match_kind: "file".to_string(),
            });
        }

        if !query.is_empty() {
            collect_content_matches(&path, &name, &relative_path, query, results);
        }

        if results.len() >= MAX_RESULTS {
            return Ok(());
        }
    }

    Ok(())
}

fn collect_text_files(
    root: &Path,
    current: &Path,
    query: &str,
    results: &mut Vec<MarkdownSearchResult>,
    visited_dirs: &mut usize,
) -> Result<(), String> {
    const MAX_RESULTS: usize = 120;
    const MAX_VISITED_DIRS: usize = 2_000;

    if results.len() >= MAX_RESULTS || *visited_dirs >= MAX_VISITED_DIRS {
        return Ok(());
    }

    *visited_dirs += 1;
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
                collect_text_files(root, &path, query, results, visited_dirs)?;
            }
            continue;
        }

        let kind = classify_file_path(&path);
        if !kind.is_text || !is_reasonable_text_file(&path) {
            continue;
        }

        let relative_path = path
            .strip_prefix(root)
            .unwrap_or(&path)
            .to_string_lossy()
            .to_string();
        let file_name_matches = query.is_empty() || relative_path.to_lowercase().contains(query);

        let name = path
            .file_name()
            .map(|name| name.to_string_lossy().to_string())
            .unwrap_or_else(|| relative_path.clone());
        if file_name_matches {
            results.push(MarkdownSearchResult {
                name: name.clone(),
                path: path.to_string_lossy().to_string(),
                relative_path: relative_path.clone(),
                line: None,
                snippet: None,
                match_kind: "file".to_string(),
            });
        }

        if !query.is_empty() {
            collect_content_matches(&path, &name, &relative_path, query, results);
        }

        if results.len() >= MAX_RESULTS {
            return Ok(());
        }
    }

    Ok(())
}

fn collect_content_matches(
    path: &Path,
    name: &str,
    relative_path: &str,
    query: &str,
    results: &mut Vec<MarkdownSearchResult>,
) {
    const MAX_RESULTS: usize = 80;
    const MAX_MATCHES_PER_FILE: usize = 3;
    const MAX_FILE_BYTES: u64 = 2 * 1024 * 1024;

    let Ok(metadata) = fs::metadata(path) else {
        return;
    };
    if metadata.len() > MAX_FILE_BYTES {
        return;
    }

    let Ok(content) = fs::read_to_string(path) else {
        return;
    };

    let mut matches_in_file = 0usize;
    for (index, line) in content.lines().enumerate() {
        if !line.to_lowercase().contains(query) {
            continue;
        }

        results.push(MarkdownSearchResult {
            name: name.to_string(),
            path: path.to_string_lossy().to_string(),
            relative_path: relative_path.to_string(),
            line: Some(index + 1),
            snippet: Some(make_search_snippet(line, query)),
            match_kind: "content".to_string(),
        });

        matches_in_file += 1;
        if matches_in_file >= MAX_MATCHES_PER_FILE || results.len() >= MAX_RESULTS {
            return;
        }
    }
}

fn make_search_snippet(line: &str, query: &str) -> String {
    const MAX_SNIPPET_CHARS: usize = 120;
    let compact = line.split_whitespace().collect::<Vec<_>>().join(" ");
    if compact.chars().count() <= MAX_SNIPPET_CHARS {
        return compact;
    }

    let lower = compact.to_lowercase();
    let match_start = lower.find(query).unwrap_or(0);
    let start = match_start.saturating_sub(40);
    let snippet = compact
        .chars()
        .skip(start)
        .take(MAX_SNIPPET_CHARS)
        .collect::<String>();

    if start > 0 {
        format!("...{snippet}")
    } else {
        snippet
    }
}

fn canonicalize_dir(path: &Path) -> Result<PathBuf, String> {
    let path = fs::canonicalize(path).map_err(|error| error.to_string())?;
    if !path.is_dir() {
        return Err("Path is not a directory".to_string());
    }

    Ok(path)
}

fn canonicalize_markdown_file(path: &Path) -> Result<PathBuf, String> {
    let path = fs::canonicalize(path).map_err(|error| error.to_string())?;
    if !path.is_file() || !is_markdown_path(&path) {
        return Err("Only Markdown files can be opened".to_string());
    }

    Ok(path)
}

fn canonicalize_text_file(path: &Path) -> Result<PathBuf, String> {
    let path = fs::canonicalize(path).map_err(|error| error.to_string())?;
    if !path.is_file() {
        return Err("Path is not a file".to_string());
    }

    ensure_reasonable_text_file(&path)?;
    if !classify_file_path(&path).is_text {
        return Err("Unsupported text or code file type".to_string());
    }

    Ok(path)
}

fn normalize_markdown_save_path(path: PathBuf) -> PathBuf {
    if is_markdown_path(&path) {
        return path;
    }

    path.with_extension("md")
}

fn sanitize_suggested_markdown_name(value: &str) -> String {
    let name = value
        .trim()
        .chars()
        .map(|character| match character {
            '/' | '\\' | ':' | '*' | '?' | '"' | '<' | '>' | '|' => '-',
            character => character,
        })
        .collect::<String>();
    let name = name.trim_matches([' ', '.']);

    if name.is_empty() {
        return "Untitled.md".to_string();
    }

    if is_markdown_path(Path::new(name)) {
        name.to_string()
    } else {
        format!("{name}.md")
    }
}

fn sanitize_child_name(value: &str, fallback: &str) -> Result<String, String> {
    let name = value.trim().trim_matches([' ', '.']);
    if name.is_empty() {
        return Ok(fallback.to_string());
    }

    if name == "." || name == ".." || name.contains('/') || name.contains('\\') {
        return Err("Invalid file or folder name".to_string());
    }

    let sanitized = name
        .chars()
        .map(|character| match character {
            ':' | '*' | '?' | '"' | '<' | '>' | '|' => '-',
            character => character,
        })
        .collect::<String>();
    let sanitized = sanitized.trim_matches([' ', '.']);

    if sanitized.is_empty() {
        Ok(fallback.to_string())
    } else {
        Ok(sanitized.to_string())
    }
}

fn unique_child_path(parent: &Path, name: &str) -> Result<PathBuf, String> {
    let candidate = parent.join(name);
    if !candidate.exists() {
        return Ok(candidate);
    }

    let name_path = Path::new(name);
    let stem = name_path
        .file_stem()
        .and_then(|value| value.to_str())
        .unwrap_or(name);
    let extension = name_path.extension().and_then(|value| value.to_str());

    for index in 2..=999 {
        let next_name = if let Some(extension) = extension {
            format!("{stem} {index}.{extension}")
        } else {
            format!("{stem} {index}")
        };
        let candidate = parent.join(next_name);
        if !candidate.exists() {
            return Ok(candidate);
        }
    }

    Err("Could not find an available name".to_string())
}

fn sanitize_export_extension(value: &str) -> Result<String, String> {
    let extension = value.trim().trim_start_matches('.').to_lowercase();
    if matches!(extension.as_str(), "svg" | "png") {
        Ok(extension)
    } else {
        Err("Unsupported export format".to_string())
    }
}

fn sanitize_export_name(value: &str, extension: &str) -> String {
    let name = value
        .trim()
        .chars()
        .map(|character| match character {
            '/' | '\\' | ':' | '*' | '?' | '"' | '<' | '>' | '|' => '-',
            character => character,
        })
        .collect::<String>();
    let name = name.trim_matches([' ', '.']);
    let fallback = format!("diagram.{extension}");

    if name.is_empty() {
        return fallback;
    }

    if Path::new(name)
        .extension()
        .and_then(|extension| extension.to_str())
        .is_some_and(|current| current.eq_ignore_ascii_case(extension))
    {
        name.to_string()
    } else {
        format!("{name}.{extension}")
    }
}

fn decode_base64_data_url(value: &str) -> Result<Vec<u8>, String> {
    let encoded = value
        .strip_prefix("data:image/png;base64,")
        .unwrap_or(value);
    base64_decode(encoded)
}

fn base64_decode(value: &str) -> Result<Vec<u8>, String> {
    let mut output = Vec::with_capacity(value.len() * 3 / 4);
    let mut buffer = 0u32;
    let mut bits = 0u8;

    for character in value.chars().filter(|character| !character.is_whitespace()) {
        if character == '=' {
            break;
        }

        let value = match character {
            'A'..='Z' => character as u8 - b'A',
            'a'..='z' => character as u8 - b'a' + 26,
            '0'..='9' => character as u8 - b'0' + 52,
            '+' => 62,
            '/' => 63,
            _ => return Err("Invalid base64 export data".to_string()),
        } as u32;

        buffer = (buffer << 6) | value;
        bits += 6;
        if bits >= 8 {
            bits -= 8;
            output.push(((buffer >> bits) & 0xff) as u8);
        }
    }

    Ok(output)
}

fn resolve_workspace_dir_path(
    path: &str,
    state: &tauri::State<'_, AppState>,
) -> Result<PathBuf, String> {
    let path = canonicalize_dir(Path::new(path))?;
    let root = state
        .workspace_root
        .lock()
        .map_err(|_| "Workspace state is unavailable".to_string())?
        .clone()
        .ok_or_else(|| "Open a workspace first".to_string())?;

    if !path.starts_with(root) {
        return Err("Directory is outside the current workspace".to_string());
    }

    Ok(path)
}

fn resolve_workspace_entry_path(
    path: &str,
    state: &tauri::State<'_, AppState>,
) -> Result<PathBuf, String> {
    let path = fs::canonicalize(Path::new(path)).map_err(|error| error.to_string())?;
    let root = workspace_root(state)?;

    if path == root {
        return Err("Cannot modify the workspace root".to_string());
    }
    if !path.starts_with(root) {
        return Err("Entry is outside the current workspace".to_string());
    }

    Ok(path)
}

fn ensure_workspace_child_path(
    path: &Path,
    state: &tauri::State<'_, AppState>,
) -> Result<PathBuf, String> {
    let parent = path
        .parent()
        .ok_or_else(|| "Entry has no parent directory".to_string())?;
    let parent = fs::canonicalize(parent).map_err(|error| error.to_string())?;
    let root = workspace_root(state)?;

    if parent == root || parent.starts_with(&root) {
        Ok(parent.join(
            path.file_name()
                .ok_or_else(|| "Invalid file or folder name".to_string())?,
        ))
    } else {
        Err("Entry is outside the current workspace".to_string())
    }
}

fn workspace_root(state: &tauri::State<'_, AppState>) -> Result<PathBuf, String> {
    state
        .workspace_root
        .lock()
        .map_err(|_| "Workspace state is unavailable".to_string())?
        .clone()
        .ok_or_else(|| "Open a workspace first".to_string())
}

fn resolve_readable_markdown_path(
    path: &str,
    state: &tauri::State<'_, AppState>,
) -> Result<PathBuf, String> {
    let path = canonicalize_markdown_file(Path::new(path))?;
    let workspace_root = state
        .workspace_root
        .lock()
        .map_err(|_| "Workspace state is unavailable".to_string())?
        .clone();
    let is_allowed_file = state
        .allowed_files
        .lock()
        .map_err(|_| "Allowed file state is unavailable".to_string())?
        .contains(&path);

    // A file is readable/writable only if it is inside the active workspace
    // or was explicitly granted by the user through a desktop open/save flow.
    if workspace_root
        .as_ref()
        .is_some_and(|root| path.starts_with(root))
        || is_allowed_file
    {
        return Ok(path);
    }

    Err("File is outside the current workspace".to_string())
}

fn resolve_readable_text_path(
    path: &str,
    state: &tauri::State<'_, AppState>,
) -> Result<PathBuf, String> {
    let path = canonicalize_text_file(Path::new(path))?;
    let workspace_root = state
        .workspace_root
        .lock()
        .map_err(|_| "Workspace state is unavailable".to_string())?
        .clone();
    let is_allowed_file = state
        .allowed_files
        .lock()
        .map_err(|_| "Allowed file state is unavailable".to_string())?
        .contains(&path);

    if workspace_root
        .as_ref()
        .is_some_and(|root| path.starts_with(root))
        || is_allowed_file
    {
        return Ok(path);
    }

    Err("File is outside the current workspace".to_string())
}

fn resolve_markdown_asset_path(
    document_path: &Path,
    asset_src: &str,
    state: &tauri::State<'_, AppState>,
) -> Result<PathBuf, String> {
    if asset_src.trim().is_empty()
        || asset_src.starts_with("http://")
        || asset_src.starts_with("https://")
        || asset_src.starts_with("data:")
        || asset_src.starts_with("blob:")
    {
        return Err("Asset source is not a local relative path".to_string());
    }

    let document_dir = document_path
        .parent()
        .ok_or_else(|| "Document has no parent directory".to_string())?;
    let candidate = document_dir.join(asset_src);
    let candidate = fs::canonicalize(candidate).map_err(|error| error.to_string())?;
    if !candidate.is_file() || !is_supported_image_path(&candidate) {
        return Err("Asset is not a supported image file".to_string());
    }

    let workspace_root = state
        .workspace_root
        .lock()
        .map_err(|_| "Workspace state is unavailable".to_string())?
        .clone();
    let is_allowed_file = state
        .allowed_files
        .lock()
        .map_err(|_| "Allowed file state is unavailable".to_string())?
        .contains(document_path);
    let document_parent = document_path.parent();

    if workspace_root
        .as_ref()
        .is_some_and(|root| candidate.starts_with(root))
        || (is_allowed_file && document_parent.is_some_and(|parent| candidate.starts_with(parent)))
    {
        return Ok(candidate);
    }

    Err("Asset is outside the current workspace".to_string())
}

fn is_markdown_path(path: &Path) -> bool {
    path.extension()
        .and_then(|extension| extension.to_str())
        .map(|extension| {
            let extension = extension.to_lowercase();
            extension == "md" || extension == "markdown"
        })
        .unwrap_or(false)
}

fn is_supported_image_path(path: &Path) -> bool {
    path.extension()
        .and_then(|extension| extension.to_str())
        .map(|extension| {
            matches!(
                extension.to_lowercase().as_str(),
                "png" | "jpg" | "jpeg" | "gif" | "webp" | "svg" | "bmp" | "avif"
            )
        })
        .unwrap_or(false)
}

struct FileKind {
    is_text: bool,
    is_markdown: bool,
    file_kind: &'static str,
    language: Option<&'static str>,
}

fn classify_file_path(path: &Path) -> FileKind {
    let is_markdown = is_markdown_path(path);
    if is_markdown {
        return FileKind {
            is_text: true,
            is_markdown: true,
            file_kind: "markdown",
            language: Some("markdown"),
        };
    }

    if let Some(language) = language_from_extension(path) {
        return FileKind {
            is_text: true,
            is_markdown: false,
            file_kind: if is_code_language(language) {
                "code"
            } else {
                "text"
            },
            language: Some(language),
        };
    }

    if let Some(language) = language_from_special_file_name(path) {
        return FileKind {
            is_text: true,
            is_markdown: false,
            file_kind: if is_code_language(language) {
                "code"
            } else {
                "text"
            },
            language: Some(language),
        };
    }

    FileKind {
        is_text: false,
        is_markdown: false,
        file_kind: "unsupported",
        language: None,
    }
}

fn language_from_extension(path: &Path) -> Option<&'static str> {
    let extension = path
        .extension()
        .and_then(|extension| extension.to_str())?
        .to_lowercase();

    Some(match extension.as_str() {
        "js" | "mjs" | "cjs" => "javascript",
        "jsx" => "jsx",
        "ts" => "typescript",
        "tsx" => "tsx",
        "py" => "python",
        "rs" => "rust",
        "go" => "go",
        "java" => "java",
        "cs" => "csharp",
        "c" | "h" => "c",
        "cpp" | "cc" | "cxx" | "hpp" | "hh" | "hxx" => "cpp",
        "swift" => "swift",
        "kt" | "kts" => "kotlin",
        "php" => "php",
        "rb" => "ruby",
        "lua" => "lua",
        "sh" | "bash" | "zsh" => "shell",
        "sql" => "sql",
        "css" => "css",
        "scss" | "sass" => "scss",
        "html" | "htm" => "html",
        "xml" => "xml",
        "json" | "jsonc" => "json",
        "yaml" | "yml" => "yaml",
        "toml" => "toml",
        "ini" | "conf" | "config" | "env" => "properties",
        "txt" | "log" => "text",
        "mdx" => "markdown",
        _ => return None,
    })
}

fn language_from_special_file_name(path: &Path) -> Option<&'static str> {
    let name = path.file_name().and_then(|name| name.to_str())?;
    Some(match name {
        "Dockerfile" | "Containerfile" => "dockerfile",
        "Makefile" | "GNUmakefile" => "makefile",
        ".gitignore" | ".gitattributes" | ".env" | ".env.example" | ".npmrc" | ".nvmrc" => "text",
        "package.json" | "tsconfig.json" | "vite.config.ts" | "tailwind.config.js" => {
            language_from_extension(path).unwrap_or("text")
        }
        _ => return None,
    })
}

fn is_code_language(language: &str) -> bool {
    !matches!(language, "text" | "properties")
}

fn is_reasonable_text_file(path: &Path) -> bool {
    const MAX_TEXT_FILE_BYTES: u64 = 5 * 1024 * 1024;
    fs::metadata(path)
        .map(|metadata| metadata.len() <= MAX_TEXT_FILE_BYTES)
        .unwrap_or(false)
}

fn ensure_reasonable_text_file(path: &Path) -> Result<(), String> {
    if is_reasonable_text_file(path) {
        Ok(())
    } else {
        Err("File is too large to open as text".to_string())
    }
}

fn is_hidden(path: &Path) -> bool {
    path.file_name()
        .and_then(|name| name.to_str())
        .map(|name| name.starts_with('.'))
        .unwrap_or(false)
}

fn is_hidden_tree_entry(path: &Path) -> bool {
    if !is_hidden(path) {
        return false;
    }

    // Keep noisy hidden directories out, but allow project-significant text files
    // such as .gitignore, .env.example, and .npmrc to appear in the code tree.
    path.is_dir() || !classify_file_path(path).is_text
}

fn is_ignored_dir(path: &Path) -> bool {
    if !path.is_dir() {
        return false;
    }

    path.file_name()
        .and_then(|name| name.to_str())
        .map(|name| {
            matches!(
                name,
                "node_modules" | "dist" | "build" | "coverage" | ".svelte-kit" | ".turbo" | ".vite"
            )
        })
        .unwrap_or(false)
}

fn file_metadata(path: &Path) -> Result<FileMetadata, String> {
    let metadata = fs::metadata(path).map_err(|error| error.to_string())?;
    let modified_at = metadata
        .modified()
        .map_err(|error| error.to_string())?
        .duration_since(UNIX_EPOCH)
        .map_err(|error| error.to_string())?
        .as_millis() as u64;

    Ok(FileMetadata {
        modified_at,
        size: metadata.len(),
    })
}

fn temporary_save_path(path: &Path) -> Result<PathBuf, String> {
    let parent = path
        .parent()
        .ok_or_else(|| "File has no parent directory".to_string())?;
    let file_name = path
        .file_name()
        .and_then(|name| name.to_str())
        .ok_or_else(|| "Invalid file name".to_string())?;
    let timestamp = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map_err(|error| error.to_string())?
        .as_nanos();

    Ok(parent.join(format!(
        ".{file_name}.{}.{}.inkstack-tmp",
        std::process::id(),
        timestamp
    )))
}

fn settings_path(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    app.path()
        .app_config_dir()
        .map(|path| path.join("settings.json"))
        .map_err(|error| error.to_string())
}

fn normalize_settings(mut settings: AppSettings) -> AppSettings {
    const MAX_RECENT_ITEMS: usize = 12;

    settings
        .recent_workspaces
        .retain(|workspace| !workspace.trim().is_empty());
    settings.recent_workspaces.dedup();
    settings.recent_workspaces.truncate(MAX_RECENT_ITEMS);

    settings
        .recent_files
        .retain(|file| !file.trim().is_empty() && is_markdown_path(Path::new(file)));
    settings.recent_files.dedup();
    settings.recent_files.truncate(MAX_RECENT_ITEMS);

    if settings
        .last_workspace
        .as_ref()
        .is_some_and(|workspace| workspace.trim().is_empty())
    {
        settings.last_workspace = None;
    }

    if settings
        .last_file
        .as_ref()
        .is_some_and(|file| file.trim().is_empty() || !is_markdown_path(Path::new(file)))
    {
        settings.last_file = None;
    }

    settings
}

async fn add_recent_workspace(app: &tauri::AppHandle, root: &Path) -> Result<(), String> {
    let mut settings = get_settings(app.clone()).await?;
    let root = root.to_string_lossy().to_string();
    settings
        .recent_workspaces
        .retain(|workspace| workspace != &root);
    settings.recent_workspaces.insert(0, root.clone());
    settings.last_workspace = Some(root);
    update_settings(app.clone(), settings).await?;
    Ok(())
}

async fn add_recent_file(app: &tauri::AppHandle, path: &Path) -> Result<(), String> {
    let mut settings = get_settings(app.clone()).await?;
    let path = path.to_string_lossy().to_string();
    settings.recent_files.retain(|file| file != &path);
    settings.recent_files.insert(0, path.clone());
    settings.last_file = Some(path);
    update_settings(app.clone(), settings).await?;
    Ok(())
}

fn normalize_ai_request(mut request: AiGenerateRequest) -> Result<AiGenerateRequest, String> {
    request.kind = request.kind.trim().to_string();
    request.model = request.model.trim().to_string();
    request.prompt = request.prompt.trim().to_string();

    if request.prompt.is_empty() {
        return Err("请输入 AI 指令。".to_string());
    }

    request.temperature = request.temperature.clamp(0.0, 2.0);
    Ok(request)
}

async fn request_openai_compatible(request: AiGenerateRequest) -> Result<AiGenerateResult, String> {
    let base_url = env_or_default(
        "OPENAI_BASE_URL",
        "https://api.aicodemirror.com/api/codex/backend-api/codex/v1",
    );
    let api_key = required_env("OPENAI_API_KEY")?;
    let model = request_model_or_env(&request, "OPENAI_MODEL", "gpt-5.5");
    let use_responses = openai_prefers_responses_api(&model);
    let url = if use_responses {
        format!("{}/responses", base_url.trim_end_matches('/'))
    } else {
        format!("{}/chat/completions", base_url.trim_end_matches('/'))
    };
    let body = build_openai_body(&request, &model, use_responses);
    let body = serde_json::to_string(&body).map_err(|error| error.to_string())?;

    let text = tokio::task::spawn_blocking(move || {
        post_json_with_curl(
            &url,
            vec![
                ("Content-Type".to_string(), "application/json".to_string()),
                ("Authorization".to_string(), format!("Bearer {api_key}")),
            ],
            &body,
        )
    })
    .await
    .map_err(|error| error.to_string())??;
    let data = serde_json::from_str::<serde_json::Value>(&text).unwrap_or(serde_json::Value::Null);

    if let Some(error) = data.get("error") {
        let message = error
            .get("message")
            .and_then(|message| message.as_str())
            .unwrap_or("AI 请求失败");
        return Err(format!("AI 请求失败：{message}"));
    }

    let content = if use_responses {
        extract_openai_responses_text(&data)
    } else {
        extract_openai_chat_text(&data)
    }
    .ok_or_else(|| "AI 返回为空。".to_string())?;

    Ok(AiGenerateResult {
        text: content.to_string(),
        model: data
            .get("model")
            .and_then(|model| model.as_str())
            .map(|model| model.to_string()),
    })
}

async fn request_anthropic(request: AiGenerateRequest) -> Result<AiGenerateResult, String> {
    let base_url = env_or_default(
        "ANTHROPIC_BASE_URL",
        "https://api.aicodemirror.com/api/claudecode",
    );
    let api_key = required_env("ANTHROPIC_API_KEY")?;
    let model = request_model_or_env(&request, "ANTHROPIC_MODEL", "claude-opus-4-7");
    let url = format!("{}/messages", base_url.trim_end_matches('/'));
    let body = serde_json::json!({
        "model": model,
        "system": build_ai_system_prompt(),
        "messages": [
            {
                "role": "user",
                "content": build_ai_user_prompt(&request)
            }
        ],
        "max_tokens": 1024,
        "temperature": request.temperature
    });
    let body = serde_json::to_string(&body).map_err(|error| error.to_string())?;

    let text = tokio::task::spawn_blocking(move || {
        post_json_with_curl(
            &url,
            vec![
                ("Content-Type".to_string(), "application/json".to_string()),
                ("x-api-key".to_string(), api_key),
                ("anthropic-version".to_string(), "2023-06-01".to_string()),
            ],
            &body,
        )
    })
    .await
    .map_err(|error| error.to_string())??;
    let data = serde_json::from_str::<serde_json::Value>(&text).unwrap_or(serde_json::Value::Null);

    if let Some(error) = data.get("error") {
        let message = error
            .get("message")
            .and_then(|message| message.as_str())
            .unwrap_or("AI 请求失败");
        return Err(format!("AI 请求失败：{message}"));
    }

    let content = data
        .get("content")
        .and_then(|content| content.as_array())
        .map(|parts| {
            parts
                .iter()
                .filter_map(|part| part.get("text").and_then(|text| text.as_str()))
                .collect::<String>()
        })
        .map(|content| content.trim().to_string())
        .filter(|content| !content.is_empty())
        .ok_or_else(|| "Claude 返回为空。".to_string())?;

    Ok(AiGenerateResult {
        text: content,
        model: data
            .get("model")
            .and_then(|model| model.as_str())
            .map(|model| model.to_string()),
    })
}

async fn request_gemini(request: AiGenerateRequest) -> Result<AiGenerateResult, String> {
    let base_url = env_or_default("GEMINI_BASE_URL", "https://api.aicodemirror.com/api/gemini");
    let api_key = required_env("GEMINI_API_KEY")?;
    let model = request_model_or_env(&request, "GEMINI_MODEL", "gemini-3.1-pro-preview");
    let url = format!(
        "{}/v1beta/models/{}:generateContent",
        base_url.trim_end_matches('/'),
        model
    );
    let body = serde_json::json!({
        "systemInstruction": {
            "parts": [{ "text": build_ai_system_prompt() }]
        },
        "contents": [
            {
                "parts": [{ "text": build_ai_user_prompt(&request) }]
            }
        ],
        "generationConfig": {
            "temperature": request.temperature,
            "maxOutputTokens": 1024
        }
    });
    let body = serde_json::to_string(&body).map_err(|error| error.to_string())?;

    let text = tokio::task::spawn_blocking(move || {
        post_json_with_curl(
            &url,
            vec![
                ("Content-Type".to_string(), "application/json".to_string()),
                ("x-goog-api-key".to_string(), api_key),
            ],
            &body,
        )
    })
    .await
    .map_err(|error| error.to_string())??;
    let data = serde_json::from_str::<serde_json::Value>(&text).unwrap_or(serde_json::Value::Null);

    if let Some(error) = data.get("error") {
        let message = error
            .get("message")
            .and_then(|message| message.as_str())
            .unwrap_or("AI 请求失败");
        return Err(format!("AI 请求失败：{message}"));
    }

    let content = data
        .get("candidates")
        .and_then(|candidates| candidates.get(0))
        .and_then(|candidate| candidate.get("content"))
        .and_then(|content| content.get("parts"))
        .and_then(|parts| parts.as_array())
        .map(|parts| {
            parts
                .iter()
                .filter_map(|part| part.get("text").and_then(|text| text.as_str()))
                .collect::<String>()
        })
        .map(|content| content.trim().to_string())
        .filter(|content| !content.is_empty())
        .ok_or_else(|| "Gemini 返回为空。".to_string())?;

    Ok(AiGenerateResult {
        text: content,
        model: data
            .get("modelVersion")
            .or_else(|| data.get("model"))
            .and_then(|model| model.as_str())
            .map(|model| model.to_string()),
    })
}

fn post_json_with_curl(
    url: &str,
    headers: Vec<(String, String)>,
    body: &str,
) -> Result<String, String> {
    let mut command = Command::new("curl");
    command
        .arg("-sS")
        .arg("--fail-with-body")
        .arg("--connect-timeout")
        .arg("15")
        .arg("--max-time")
        .arg("60")
        .arg("--http1.1")
        .arg("-X")
        .arg("POST")
        .arg(url);

    for (name, value) in headers {
        command.arg("-H").arg(format!("{name}: {value}"));
    }

    let mut child = command
        .arg("--data-binary")
        .arg("@-")
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .map_err(|error| format!("无法启动 curl：{error}"))?;

    if let Some(stdin) = child.stdin.as_mut() {
        stdin
            .write_all(body.as_bytes())
            .map_err(|error| format!("写入 AI 请求失败：{error}"))?;
    }

    let output = child
        .wait_with_output()
        .map_err(|error| format!("AI 请求等待失败：{error}"))?;
    let stdout = String::from_utf8_lossy(&output.stdout).to_string();

    if output.status.success() {
        return Ok(stdout);
    }

    let stderr = String::from_utf8_lossy(&output.stderr);
    let message = if stdout.trim().is_empty() {
        stderr.trim().to_string()
    } else {
        stdout.trim().to_string()
    };
    Err(format!("AI 请求失败：{message}"))
}

fn build_ai_messages(request: &AiGenerateRequest) -> Vec<serde_json::Value> {
    vec![
        serde_json::json!({
            "role": "system",
            "content": build_ai_system_prompt()
        }),
        serde_json::json!({
            "role": "user",
            "content": build_ai_user_prompt(request)
        }),
    ]
}

fn build_openai_body(
    request: &AiGenerateRequest,
    model: &str,
    use_responses: bool,
) -> serde_json::Value {
    if use_responses {
        let mut body = serde_json::json!({
            "model": model,
            "instructions": build_ai_system_prompt(),
            "input": build_ai_user_prompt(request),
            "max_output_tokens": 1024,
            "stream": false
        });
        if supports_temperature(model) {
            body["temperature"] = serde_json::json!(request.temperature);
        }
        return body;
    }

    let mut body = serde_json::json!({
        "model": model,
        "messages": build_ai_messages(request),
        "max_tokens": 1024,
        "stream": false
    });
    if supports_temperature(model) {
        body["temperature"] = serde_json::json!(request.temperature);
    }
    body
}

fn extract_openai_chat_text(data: &serde_json::Value) -> Option<String> {
    data.get("choices")
        .and_then(|choices| choices.get(0))
        .and_then(|choice| choice.get("message"))
        .and_then(|message| message.get("content"))
        .and_then(|content| content.as_str())
        .map(str::trim)
        .filter(|content| !content.is_empty())
        .map(|content| content.to_string())
}

fn extract_openai_responses_text(data: &serde_json::Value) -> Option<String> {
    if let Some(text) = data
        .get("output_text")
        .and_then(|content| content.as_str())
        .map(str::trim)
        .filter(|content| !content.is_empty())
    {
        return Some(text.to_string());
    }

    let content = data
        .get("output")
        .and_then(|output| output.as_array())
        .into_iter()
        .flatten()
        .flat_map(|item| {
            item.get("content")
                .and_then(|content| content.as_array())
                .into_iter()
                .flatten()
        })
        .filter_map(|part| {
            part.get("text")
                .or_else(|| part.get("output_text"))
                .and_then(|text| text.as_str())
        })
        .collect::<String>()
        .trim()
        .to_string();

    if content.is_empty() {
        None
    } else {
        Some(content)
    }
}

fn openai_prefers_responses_api(model: &str) -> bool {
    model == "gpt-5.4-pro"
}

fn supports_temperature(model: &str) -> bool {
    let model = model.trim();
    !(model.starts_with("gpt-5") || model.starts_with('o'))
}

fn build_ai_system_prompt() -> String {
    "You are InkStack AI, a careful Markdown writing assistant. Keep answers concise, practical, and preserve Markdown semantics.".to_string()
}

fn env_or_default(name: &str, default_value: &str) -> String {
    std::env::var(name).unwrap_or_else(|_| default_value.to_string())
}

fn required_env(name: &str) -> Result<String, String> {
    std::env::var(name)
        .map(|value| value.trim().to_string())
        .ok()
        .filter(|value| !value.is_empty())
        .ok_or_else(|| format!("本机环境变量 {name} 未配置。"))
}

fn request_model_or_env(
    request: &AiGenerateRequest,
    env_name: &str,
    default_model: &str,
) -> String {
    if !request.model.trim().is_empty() {
        return request.model.trim().to_string();
    }

    env_or_default(env_name, default_model)
}

fn build_ai_user_prompt(request: &AiGenerateRequest) -> String {
    const MAX_CONTEXT_CHARS: usize = 5000;
    let context = request.context.as_deref().unwrap_or("").trim();
    let trimmed_context = context.chars().take(MAX_CONTEXT_CHARS).collect::<String>();
    let mode = request.mode.as_deref().unwrap_or("chat");

    if mode == "rewrite" {
        return [
            format!("Instruction: {}", request.prompt),
            String::new(),
            "Apply the instruction to the Markdown below.".to_string(),
            "Only output the modified Markdown. Do not explain your changes.".to_string(),
            String::new(),
            trimmed_context,
        ]
        .join("\n");
    }

    if trimmed_context.is_empty() {
        return request.prompt.clone();
    }

    [
        "Current Markdown context:".to_string(),
        trimmed_context,
        String::new(),
        format!("User question: {}", request.prompt),
    ]
    .join("\n")
}
