use std::{fs, path::Path};

use base64::Engine;
use tauri_plugin_dialog::DialogExt;

use crate::file_commands::{
    file_name_for_markdown, resolve_markdown_asset_path, resolve_readable_markdown_path,
    sanitize_asset_file_name, unique_child_path,
};
use crate::file_kinds::is_supported_image_path;
use crate::models::{ImportMarkdownAssetRequest, ImportedMarkdownAsset, MarkdownAsset, PickedMarkdownAsset};
use crate::AppState;

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
pub async fn import_markdown_asset(
    request: ImportMarkdownAssetRequest,
    state: tauri::State<'_, AppState>,
) -> Result<ImportedMarkdownAsset, String> {
    let document_path = resolve_readable_markdown_path(&request.document_path, &state)?;
    let source_path =
        fs::canonicalize(Path::new(&request.source_path)).map_err(|error| error.to_string())?;
    let is_image = is_supported_image_path(&source_path);
    if !source_path.is_file() || (request.kind.as_deref() == Some("image") && !is_image) {
        return Err("Only local image files can be imported here".to_string());
    }

    if request.kind.as_deref() == Some("image") && request.mode.as_deref() == Some("embed") {
        return import_asset_file_as_data_url(&source_path).await;
    }

    import_asset_file(&document_path, &source_path).await
}

#[tauri::command]
pub async fn pick_and_import_markdown_asset(
    app: tauri::AppHandle,
    document_path: String,
    kind: String,
    mode: Option<String>,
    state: tauri::State<'_, AppState>,
) -> Result<Option<PickedMarkdownAsset>, String> {
    let document_path = resolve_readable_markdown_path(&document_path, &state)?;
    let mut dialog = app.dialog().file();
    dialog = if kind == "image" {
        dialog
            .set_title("选择图片")
            .add_filter("Images", &["png", "jpg", "jpeg", "gif", "webp", "svg", "bmp", "avif"])
    } else {
        dialog.set_title("选择附件")
    };

    let Some(selected) = dialog.blocking_pick_file() else {
        return Ok(None);
    };
    let selected_path = selected
        .as_path()
        .ok_or_else(|| "Selected file path is not available".to_string())?;
    let source_path = fs::canonicalize(selected_path).map_err(|error| error.to_string())?;
    if !source_path.is_file() {
        return Err("Only local files can be imported".to_string());
    }
    let is_image = is_supported_image_path(&source_path);
    if kind == "image" && !is_image {
        return Err("Only local image files can be imported here".to_string());
    }

    let picked_mode = mode.unwrap_or_else(|| "assets".to_string());
    let imported = if kind == "image" && picked_mode == "embed" {
        import_asset_file_as_data_url(&source_path).await?
    } else {
        import_asset_file(&document_path, &source_path).await?
    };
    let file_name = source_path
        .file_name()
        .and_then(|value| value.to_str())
        .ok_or_else(|| "File has no valid file name".to_string())?
        .to_string();

    let markdown_src = imported.relative_src.clone();
    Ok(Some(PickedMarkdownAsset {
        source_path: source_path.to_string_lossy().to_string(),
        path: imported.path,
        relative_src: imported.relative_src,
        markdown_src,
        file_name,
        is_image,
    }))
}

async fn import_asset_file(
    document_path: &Path,
    source_path: &Path,
) -> Result<ImportedMarkdownAsset, String> {
    let document_dir = document_path
        .parent()
        .ok_or_else(|| "Document has no parent directory".to_string())?;
    let assets_dir = document_dir.join("assets");
    tokio::fs::create_dir_all(&assets_dir)
        .await
        .map_err(|error| error.to_string())?;

    let file_name = source_path
        .file_name()
        .and_then(|value| value.to_str())
        .ok_or_else(|| "File has no valid file name".to_string())?;
    let safe_name = sanitize_asset_file_name(file_name)?;
    let target_path = unique_child_path(&assets_dir, &safe_name)?;
    tokio::fs::copy(source_path, &target_path)
        .await
        .map_err(|error| error.to_string())?;
    let target_path = fs::canonicalize(target_path).map_err(|error| error.to_string())?;

    Ok(ImportedMarkdownAsset {
        path: target_path.to_string_lossy().to_string(),
        relative_src: format!("assets/{}", file_name_for_markdown(&target_path)?),
    })
}

async fn import_asset_file_as_data_url(source_path: &Path) -> Result<ImportedMarkdownAsset, String> {
    let bytes = tokio::fs::read(source_path).await.map_err(|error| error.to_string())?;
    let extension = source_path
        .extension()
        .and_then(|value| value.to_str())
        .map(|value| value.to_lowercase())
        .ok_or_else(|| "Image file needs an extension".to_string())?;
    let mime = match extension.as_str() {
        "png" => "image/png",
        "jpg" | "jpeg" => "image/jpeg",
        "gif" => "image/gif",
        "webp" => "image/webp",
        "svg" => "image/svg+xml",
        "bmp" => "image/bmp",
        "avif" => "image/avif",
        _ => return Err("Unsupported image extension".to_string()),
    };
    let data_url = format!("data:{};base64,{}", mime, base64::engine::general_purpose::STANDARD.encode(bytes));

    Ok(ImportedMarkdownAsset {
        path: source_path.to_string_lossy().to_string(),
        relative_src: data_url,
    })
}
