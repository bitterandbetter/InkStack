use std::{
    collections::BTreeSet,
    fs,
    path::{Path, PathBuf},
    process::Command,
};

use tauri::Manager;
use tauri_plugin_dialog::DialogExt;

use crate::models::{
    BuiltInCssThemeWriteRequest, CssThemeDocument, CssThemeSummary, ExportCssThemeRequest,
    SystemProfilerFontResponse,
};

#[tauri::command]
pub async fn import_css_theme(app: tauri::AppHandle) -> Result<Option<CssThemeDocument>, String> {
    let selected = app
        .dialog()
        .file()
        .set_title("导入 InkStack CSS 主题")
        .add_filter("CSS Theme", &["css"])
        .blocking_pick_file();

    let Some(path) = selected else {
        return Ok(None);
    };

    let source_path = PathBuf::from(path.to_string());
    let css = fs::read_to_string(&source_path).map_err(|error| error.to_string())?;
    validate_css_theme(&source_path, &css)?;

    let id = theme_id_from_name(
        source_path
            .file_stem()
            .and_then(|value| value.to_str())
            .unwrap_or("custom-theme"),
    );
    let name = theme_name_from_path(&source_path);
    let destination = imported_theme_path(&app, &id)?;

    if let Some(parent) = destination.parent() {
        fs::create_dir_all(parent).map_err(|error| error.to_string())?;
    }
    fs::write(&destination, &css).map_err(|error| error.to_string())?;

    Ok(Some(CssThemeDocument { id, name, css }))
}

#[tauri::command]
pub async fn list_imported_css_themes(
    app: tauri::AppHandle,
) -> Result<Vec<CssThemeSummary>, String> {
    let dir = imported_themes_dir(&app)?;
    if !dir.is_dir() {
        return Ok(Vec::new());
    }

    let mut themes = fs::read_dir(&dir)
        .map_err(|error| error.to_string())?
        .filter_map(|entry| entry.ok())
        .filter_map(|entry| {
            let path = entry.path();
            if path.extension().and_then(|value| value.to_str()) != Some("css") {
                return None;
            }
            let id = path.file_stem()?.to_str()?.to_string();
            Some(CssThemeSummary {
                id,
                name: theme_name_from_path(&path),
            })
        })
        .collect::<Vec<_>>();
    themes.sort_by(|left, right| left.name.to_lowercase().cmp(&right.name.to_lowercase()));
    Ok(themes)
}

#[tauri::command]
pub async fn read_imported_css_theme(
    app: tauri::AppHandle,
    id: String,
) -> Result<CssThemeDocument, String> {
    let id = theme_id_from_name(&id);
    let path = imported_theme_path(&app, &id)?;
    let css = fs::read_to_string(&path).map_err(|error| error.to_string())?;
    validate_css_theme(&path, &css)?;

    Ok(CssThemeDocument {
        id,
        name: theme_name_from_path(&path),
        css,
    })
}

#[tauri::command]
pub async fn delete_imported_css_theme(app: tauri::AppHandle, id: String) -> Result<(), String> {
    let id = theme_id_from_name(&id);
    let path = imported_theme_path(&app, &id)?;
    if path.exists() {
        fs::remove_file(path).map_err(|error| error.to_string())?;
    }
    Ok(())
}

#[tauri::command]
pub async fn export_css_theme(
    app: tauri::AppHandle,
    request: ExportCssThemeRequest,
) -> Result<Option<String>, String> {
    let suggested_name = sanitize_css_theme_file_name(&request.suggested_name);
    validate_css_theme(Path::new(&suggested_name), &request.css)?;

    let selected = app
        .dialog()
        .file()
        .set_title("导出 InkStack CSS 主题")
        .set_file_name(&suggested_name)
        .add_filter("CSS Theme", &["css"])
        .blocking_save_file();

    let Some(path) = selected else {
        return Ok(None);
    };

    let mut path = PathBuf::from(path.to_string());
    if path.extension().is_none() {
        path = path.with_extension("css");
    }
    validate_css_theme(&path, &request.css)?;
    tokio::fs::write(&path, request.css)
        .await
        .map_err(|error| error.to_string())?;

    Ok(Some(path.to_string_lossy().to_string()))
}

#[tauri::command]
pub async fn open_imported_css_themes_dir(app: tauri::AppHandle) -> Result<String, String> {
    let dir = imported_themes_dir(&app)?;
    fs::create_dir_all(&dir).map_err(|error| error.to_string())?;

    tauri_plugin_opener::open_path(&dir, None::<&str>).map_err(|error| error.to_string())?;

    Ok(dir.to_string_lossy().to_string())
}

#[tauri::command]
pub async fn write_built_in_css_theme_files(
    app: tauri::AppHandle,
    request: Vec<BuiltInCssThemeWriteRequest>,
) -> Result<String, String> {
    let built_in_dir = imported_themes_dir(&app)?.join("built-in");
    fs::create_dir_all(&built_in_dir).map_err(|error| error.to_string())?;

    for item in request {
        let id = theme_id_from_name(&item.id);
        let file_name = sanitize_css_theme_file_name(&format!("{id}.css"));
        let path = built_in_dir.join(file_name);
        validate_css_theme(&path, &item.css)?;
        fs::write(path, item.css).map_err(|error| error.to_string())?;
    }

    Ok(built_in_dir.to_string_lossy().to_string())
}

#[tauri::command]
pub async fn list_system_font_families() -> Result<Vec<String>, String> {
    let output = Command::new("system_profiler")
        .arg("SPFontsDataType")
        .arg("-json")
        .arg("-detailLevel")
        .arg("mini")
        .output()
        .map_err(|error| error.to_string())?;
    if !output.status.success() {
        return Err(String::from_utf8_lossy(&output.stderr).trim().to_string());
    }
    let parsed: SystemProfilerFontResponse =
        serde_json::from_slice(&output.stdout).map_err(|error| error.to_string())?;

    let mut families = BTreeSet::new();
    for font in parsed.fonts {
        for typeface in font.typefaces {
            let family = typeface.family.trim();
            if family.is_empty() || family.starts_with('.') {
                continue;
            }
            families.insert(family.to_string());
        }
    }

    Ok(families.into_iter().collect())
}

fn imported_themes_dir(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    app.path()
        .app_config_dir()
        .map(|path| path.join("themes"))
        .map_err(|error| error.to_string())
}

fn imported_theme_path(app: &tauri::AppHandle, id: &str) -> Result<PathBuf, String> {
    Ok(imported_themes_dir(app)?.join(format!("{id}.css")))
}

fn theme_name_from_path(path: &Path) -> String {
    path.file_stem()
        .and_then(|value| value.to_str())
        .map(|value| value.replace(['-', '_'], " "))
        .filter(|value| !value.trim().is_empty())
        .unwrap_or_else(|| "Imported Theme".to_string())
}

fn theme_id_from_name(name: &str) -> String {
    let id = name
        .trim()
        .to_lowercase()
        .chars()
        .map(|character| {
            if character.is_ascii_alphanumeric() {
                character
            } else {
                '-'
            }
        })
        .collect::<String>()
        .split('-')
        .filter(|part| !part.is_empty())
        .collect::<Vec<_>>()
        .join("-");

    if id.is_empty() {
        "custom-theme".to_string()
    } else {
        id
    }
}

fn sanitize_css_theme_file_name(value: &str) -> String {
    let name = value
        .trim()
        .chars()
        .map(|character| match character {
            '/' | '\\' | ':' | '*' | '?' | '"' | '<' | '>' | '|' => '-',
            character => character,
        })
        .collect::<String>();
    let name = name.trim_matches([' ', '.']);
    let fallback = "inkstack-theme.css".to_string();

    if name.is_empty() {
        return fallback;
    }

    let path = Path::new(name);
    let stem = path
        .file_stem()
        .and_then(|value| value.to_str())
        .filter(|value| !value.trim().is_empty())
        .unwrap_or("inkstack-theme");
    format!("{stem}.css")
}

fn validate_css_theme(path: &Path, css: &str) -> Result<(), String> {
    const MAX_THEME_BYTES: usize = 256 * 1024;

    if path.extension().and_then(|value| value.to_str()) != Some("css") {
        return Err("Only .css theme files can be imported".to_string());
    }
    if css.len() > MAX_THEME_BYTES {
        return Err("Theme CSS is too large".to_string());
    }
    let lowered = css.to_lowercase();
    if lowered.contains("@import") || lowered.contains("javascript:") {
        return Err("Theme CSS cannot include @import or JavaScript URLs".to_string());
    }
    if lowered.contains("http://") || lowered.contains("https://") {
        return Err("Theme CSS cannot reference remote resources".to_string());
    }
    if !css.contains("--color-")
        && !css.contains("--font-")
        && !css.contains("[data-inkstack-theme")
    {
        return Err("Theme CSS should define InkStack CSS variables".to_string());
    }

    Ok(())
}
