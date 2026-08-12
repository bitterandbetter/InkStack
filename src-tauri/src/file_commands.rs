use std::{
    fs,
    path::{Path, PathBuf},
    time::{SystemTime, UNIX_EPOCH},
};

use tauri_plugin_dialog::DialogExt;
use tauri_plugin_opener::OpenerExt;

use crate::app_settings::add_recent_file;
use crate::file_kinds::{
    classify_file_path, ensure_reasonable_text_file, is_markdown_path, is_supported_image_path,
};
use crate::models::{FileMetadata, MarkdownDocument, TextDocument};
use crate::AppState;

const MAX_READ_FILE_BYTES: u64 = 50 * 1024 * 1024;

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

pub(crate) async fn read_markdown_document(path: PathBuf) -> Result<MarkdownDocument, String> {
    let metadata = file_metadata(&path)?;
    if metadata.size > MAX_READ_FILE_BYTES {
        return Err(format!(
            "文件过大（{}MB），请使用其他编辑器打开。",
            metadata.size / (1024 * 1024)
        ));
    }
    let content = tokio::fs::read_to_string(&path)
        .await
        .map_err(|error| error.to_string())?;

    Ok(MarkdownDocument {
        path: path.to_string_lossy().to_string(),
        content,
        metadata,
    })
}

pub(crate) async fn read_text_document(path: PathBuf) -> Result<TextDocument, String> {
    ensure_reasonable_text_file(&path)?;
    let metadata = file_metadata(&path)?;
    if metadata.size > MAX_READ_FILE_BYTES {
        return Err(format!(
            "文件过大（{}MB），请使用其他编辑器打开。",
            metadata.size / (1024 * 1024)
        ));
    }
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

pub(crate) fn normalize_markdown_save_path(path: PathBuf) -> PathBuf {
    if is_markdown_path(&path) {
        return path;
    }

    path.with_extension("md")
}

pub(crate) fn sanitize_suggested_markdown_name(value: &str) -> String {
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

pub(crate) fn sanitize_asset_file_name(value: &str) -> Result<String, String> {
    let path = Path::new(value);
    let stem = path
        .file_stem()
        .and_then(|value| value.to_str())
        .unwrap_or("image")
        .chars()
        .map(|character| {
            if character.is_ascii_alphanumeric() || matches!(character, '-' | '_' | '.') {
                character
            } else {
                '-'
            }
        })
        .collect::<String>();
    let stem = stem.trim_matches(['-', '.', ' ']);
    let stem = if stem.is_empty() { "image" } else { stem };
    let extension = path
        .extension()
        .and_then(|value| value.to_str())
        .map(|value| value.to_lowercase())
        .ok_or_else(|| "Image file needs an extension".to_string())?;

    if !matches!(
        extension.as_str(),
        "png" | "jpg" | "jpeg" | "gif" | "webp" | "svg" | "bmp" | "avif"
    ) {
        return Err("Unsupported image extension".to_string());
    }

    Ok(format!("{stem}.{extension}"))
}

pub(crate) fn file_name_for_markdown(path: &Path) -> Result<String, String> {
    path.file_name()
        .and_then(|value| value.to_str())
        .map(|value| value.replace('\\', "/"))
        .ok_or_else(|| "Imported image has no file name".to_string())
}

pub(crate) fn unique_child_path(parent: &Path, name: &str) -> Result<PathBuf, String> {
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

pub(crate) fn resolve_readable_markdown_path(
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

pub(crate) fn resolve_markdown_asset_path(
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

pub(crate) fn file_metadata(path: &Path) -> Result<FileMetadata, String> {
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

pub(crate) fn temporary_save_path(path: &Path) -> Result<PathBuf, String> {
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
