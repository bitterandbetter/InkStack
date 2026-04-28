use std::{fs, path::Path};

use crate::file_kinds::{
    classify_file_path, is_hidden, is_hidden_tree_entry, is_ignored_dir, is_markdown_path,
    is_reasonable_text_file,
};
use crate::models::MarkdownSearchResult;
use crate::AppState;

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
