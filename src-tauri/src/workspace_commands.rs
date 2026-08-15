use std::{
    fs,
    path::{Path, PathBuf},
    process::Command,
};

use notify::{Config, EventKind, RecommendedWatcher, RecursiveMode, Watcher};
use serde::Serialize;
use tauri::Emitter;
use tauri_plugin_dialog::DialogExt;

use crate::app_settings::add_recent_workspace;
use crate::file_commands::{
    read_markdown_document, sanitize_suggested_markdown_name, unique_child_path,
};
use crate::file_kinds::{
    classify_file_path, is_hidden_tree_entry, is_ignored_dir, is_reasonable_text_file,
};
use crate::models::{
    CreateWorkspaceEntryRequest, DeleteWorkspaceEntryResult, DirectoryScanResult, FileEntry,
    MarkdownDocument, RenameWorkspaceEntryRequest,
};
use crate::workspace_index::clear_workspace_index;
use crate::AppState;

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct WorkspaceChangedPayload {
    root: String,
    paths: Vec<String>,
    full_refresh: bool,
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
    clear_workspace_index(&state)?;
    restart_workspace_watcher(&app, &state, &root)?;

    add_recent_workspace(&app, &root).await?;

    tokio::task::spawn_blocking(move || scan_dir(&root))
        .await
        .map_err(|error| error.to_string())?
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
) -> Result<DeleteWorkspaceEntryResult, String> {
    let path = resolve_workspace_entry_path(&path, &state)?;

    if move_to_trash(&path).is_ok() {
        return Ok(DeleteWorkspaceEntryResult {
            moved_to_trash: true,
            fallback_deleted: false,
        });
    }

    if path.is_dir() {
        tokio::fs::remove_dir_all(&path).await
    } else {
        tokio::fs::remove_file(&path).await
    }
    .map_err(|error| error.to_string())?;

    Ok(DeleteWorkspaceEntryResult {
        moved_to_trash: false,
        fallback_deleted: true,
    })
}

fn move_to_trash(path: &Path) -> Result<(), String> {
    #[cfg(target_os = "macos")]
    {
        let script = r#"on run argv
  tell application "Finder" to delete POSIX file (item 1 of argv)
end run"#;
        let status = Command::new("osascript")
            .arg("-e")
            .arg(script)
            .arg(path.to_string_lossy().to_string())
            .status()
            .map_err(|error| error.to_string())?;
        if status.success() {
            Ok(())
        } else {
            Err(format!("Failed to move entry to Trash: {status}"))
        }
    }

    #[cfg(not(target_os = "macos"))]
    {
        let _ = path;
        Err("Trash is not available on this platform".to_string())
    }
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

            let payload = WorkspaceChangedPayload {
                root: event_root.clone(),
                paths: event
                    .paths
                    .iter()
                    .map(|path| path.to_string_lossy().to_string())
                    .collect(),
                full_refresh: matches!(event.kind, EventKind::Any),
            };
            let _ = app_handle.emit("inkstack://workspace-changed", payload);
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

fn canonicalize_dir(path: &Path) -> Result<PathBuf, String> {
    let path = fs::canonicalize(path).map_err(|error| error.to_string())?;
    if !path.is_dir() {
        return Err("Path is not a directory".to_string());
    }

    Ok(path)
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

fn resolve_workspace_dir_path(
    path: &str,
    state: &tauri::State<'_, AppState>,
) -> Result<PathBuf, String> {
    let path = canonicalize_dir(Path::new(path))?;
    let root = workspace_root(state)?;

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
