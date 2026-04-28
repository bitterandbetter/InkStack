use std::{fs, path::{Path, PathBuf}};

use tauri_plugin_dialog::DialogExt;

use crate::app_settings::add_recent_file;
use crate::file_commands::{
    file_metadata, normalize_markdown_save_path, resolve_readable_markdown_path,
    sanitize_suggested_markdown_name, temporary_save_path,
};
use crate::models::{
    SaveExportRequest, SaveMarkdownAsRequest, SaveMarkdownRequest, SaveMarkdownResult,
};
use crate::AppState;

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

    write_markdown_document(&path, request.content).await?;

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

async fn write_markdown_document(path: &Path, content: String) -> Result<(), String> {
    let tmp_path = temporary_save_path(path)?;
    tokio::fs::write(&tmp_path, content)
        .await
        .map_err(|error| error.to_string())?;
    tokio::fs::rename(&tmp_path, path)
        .await
        .map_err(|error| error.to_string())
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
