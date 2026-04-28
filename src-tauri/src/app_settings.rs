use std::{
    path::{Path, PathBuf},
    time::{SystemTime, UNIX_EPOCH},
};

use tauri::Manager;

use crate::models::{AppSettings, RecentEntryMeta};

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
pub async fn prune_missing_recent_entries(app: tauri::AppHandle) -> Result<AppSettings, String> {
    let mut settings = get_settings(app.clone()).await?;
    settings
        .recent_workspaces
        .retain(|path| Path::new(path).is_dir());
    settings
        .recent_workspace_entries
        .retain(|entry| Path::new(&entry.path).is_dir());
    settings
        .pinned_workspaces
        .retain(|path| Path::new(path).is_dir());
    settings
        .recent_files
        .retain(|path| Path::new(path).is_file() && is_markdown_path(Path::new(path)));
    settings
        .recent_file_entries
        .retain(|entry| Path::new(&entry.path).is_file() && is_markdown_path(Path::new(&entry.path)));
    settings
        .pinned_files
        .retain(|path| Path::new(path).is_file() && is_markdown_path(Path::new(path)));

    if settings
        .last_workspace
        .as_ref()
        .is_some_and(|path| !Path::new(path).is_dir())
    {
        settings.last_workspace = None;
    }

    if settings
        .last_file
        .as_ref()
        .is_some_and(|path| !Path::new(path).is_file() || !is_markdown_path(Path::new(path)))
    {
        settings.last_file = None;
    }

    update_settings(app, settings).await
}

pub async fn add_recent_workspace(app: &tauri::AppHandle, root: &Path) -> Result<(), String> {
    let mut settings = get_settings(app.clone()).await?;
    let root = root.to_string_lossy().to_string();
    settings
        .recent_workspaces
        .retain(|workspace| workspace != &root);
    settings.recent_workspaces.insert(0, root.clone());
    upsert_recent_entry(&mut settings.recent_workspace_entries, root.clone(), current_time_millis()?);
    settings.last_workspace = Some(root);
    update_settings(app.clone(), settings).await?;
    Ok(())
}

pub async fn add_recent_file(app: &tauri::AppHandle, path: &Path) -> Result<(), String> {
    let mut settings = get_settings(app.clone()).await?;
    let path = path.to_string_lossy().to_string();
    settings.recent_files.retain(|file| file != &path);
    settings.recent_files.insert(0, path.clone());
    upsert_recent_entry(&mut settings.recent_file_entries, path.clone(), current_time_millis()?);
    settings.last_file = Some(path);
    update_settings(app.clone(), settings).await?;
    Ok(())
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
    settings.recent_workspace_entries = normalize_recent_meta(
        settings.recent_workspace_entries,
        &settings.recent_workspaces,
        false,
        MAX_RECENT_ITEMS,
    );

    settings
        .pinned_workspaces
        .retain(|workspace| !workspace.trim().is_empty());
    settings.pinned_workspaces.dedup();
    settings.pinned_workspaces.truncate(MAX_RECENT_ITEMS);

    settings
        .recent_files
        .retain(|file| !file.trim().is_empty() && is_markdown_path(Path::new(file)));
    settings.recent_files.dedup();
    settings.recent_files.truncate(MAX_RECENT_ITEMS);
    settings.recent_file_entries = normalize_recent_meta(
        settings.recent_file_entries,
        &settings.recent_files,
        true,
        MAX_RECENT_ITEMS,
    );

    settings
        .pinned_files
        .retain(|file| !file.trim().is_empty() && is_markdown_path(Path::new(file)));
    settings.pinned_files.dedup();
    settings.pinned_files.truncate(MAX_RECENT_ITEMS);

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

fn normalize_recent_meta(
    entries: Vec<RecentEntryMeta>,
    legacy_paths: &[String],
    markdown_only: bool,
    max_items: usize,
) -> Vec<RecentEntryMeta> {
    let mut next = Vec::new();
    let mut seen = std::collections::HashSet::new();

    for entry in entries {
        let path = entry.path.trim().to_string();
        if !is_valid_recent_path(&path, markdown_only) || !seen.insert(path.clone()) {
            continue;
        }
        next.push(RecentEntryMeta {
            path,
            opened_at: entry.opened_at,
        });
    }

    let mut fallback_opened_at = fallback_recent_timestamp();
    for path in legacy_paths {
        let path = path.trim().to_string();
        if !is_valid_recent_path(&path, markdown_only) || !seen.insert(path.clone()) {
            continue;
        }
        next.push(RecentEntryMeta {
            path,
            opened_at: fallback_opened_at,
        });
        fallback_opened_at = fallback_opened_at.saturating_sub(1);
    }

    next.sort_by(|left, right| right.opened_at.cmp(&left.opened_at));
    next.truncate(max_items);
    next
}

fn upsert_recent_entry(entries: &mut Vec<RecentEntryMeta>, path: String, opened_at: u64) {
    entries.retain(|entry| entry.path != path);
    entries.insert(0, RecentEntryMeta { path, opened_at });
}

fn is_valid_recent_path(path: &str, markdown_only: bool) -> bool {
    if path.trim().is_empty() {
        return false;
    }
    !markdown_only || is_markdown_path(Path::new(path))
}

fn current_time_millis() -> Result<u64, String> {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|duration| duration.as_millis() as u64)
        .map_err(|error| error.to_string())
}

fn fallback_recent_timestamp() -> u64 {
    current_time_millis().unwrap_or(0).saturating_sub(1)
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

fn is_markdown_path(path: &Path) -> bool {
    path.extension()
        .and_then(|extension| extension.to_str())
        .map(|extension| {
            let extension = extension.to_lowercase();
            extension == "md" || extension == "markdown"
        })
        .unwrap_or(false)
}
