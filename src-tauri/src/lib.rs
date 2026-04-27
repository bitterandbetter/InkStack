mod commands;
mod models;

use std::{
    collections::{HashMap, HashSet},
    path::PathBuf,
    sync::{atomic::AtomicBool, Arc, Mutex},
};

use tauri::{
    menu::{MenuBuilder, MenuItemBuilder, SubmenuBuilder},
    Emitter, Manager,
};

#[derive(Default)]
pub struct AppState {
    // Workspace paths are the trust boundary for normal file-tree operations.
    workspace_root: Mutex<Option<PathBuf>>,
    // Keep the native watcher alive while a workspace is open.
    workspace_watcher: Mutex<Option<notify::RecommendedWatcher>>,
    // Files opened by dialog, drag-drop, or file association stay writable even outside a workspace.
    allowed_files: Mutex<HashSet<PathBuf>>,
    // Startup events can fire before the WebView listener is ready; the frontend drains this once.
    startup_markdown_paths: Mutex<Vec<String>>,
    // AI streams are keyed by a frontend request id so a cancel button can stop the curl process.
    ai_streams: Mutex<HashMap<String, AiStreamControl>>,
}

pub struct AiStreamControl {
    pub cancelled: Arc<AtomicBool>,
    pub pid: Option<u32>,
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .manage(AppState::default())
        .menu(|app| {
            let file = SubmenuBuilder::new(app, "文件")
                .item(
                    &MenuItemBuilder::with_id("open-file", "打开文件...")
                        .accelerator("CmdOrCtrl+O")
                        .build(app)?,
                )
                .item(
                    &MenuItemBuilder::with_id("open-workspace", "打开目录...")
                        .accelerator("CmdOrCtrl+Shift+O")
                        .build(app)?,
                )
                .separator()
                .item(
                    &MenuItemBuilder::with_id("new-file", "新建文档")
                        .accelerator("CmdOrCtrl+N")
                        .build(app)?,
                )
                .separator()
                .item(
                    &MenuItemBuilder::with_id("save", "保存")
                        .accelerator("CmdOrCtrl+S")
                        .build(app)?,
                )
                .item(
                    &MenuItemBuilder::with_id("save-as", "另存为...")
                        .accelerator("CmdOrCtrl+Shift+S")
                        .build(app)?,
                )
                .separator()
                .item(&MenuItemBuilder::with_id("reveal-file", "在 Finder 中显示").build(app)?)
                .build()?;
            let edit = SubmenuBuilder::new(app, "编辑")
                .undo()
                .redo()
                .separator()
                .cut()
                .copy()
                .paste()
                .select_all()
                .build()?;
            let view = SubmenuBuilder::new(app, "视图")
                .item(
                    &MenuItemBuilder::with_id("toggle-sidebar", "切换侧边栏")
                        .accelerator("CmdOrCtrl+\\")
                        .build(app)?,
                )
                .item(
                    &MenuItemBuilder::with_id("toggle-ai", "切换 AI 面板")
                        .accelerator("CmdOrCtrl+Shift+A")
                        .build(app)?,
                )
                .build()?;

            MenuBuilder::new(app)
                .item(&file)
                .item(&edit)
                .item(&view)
                .build()
        })
        .on_menu_event(|app, event| match event.id().as_ref() {
            "new-file" | "open-file" | "open-workspace" | "save" | "save-as" | "reveal-file"
            | "toggle-sidebar" | "toggle-ai" => {
                let _ = app.emit("inkstack://menu", event.id().as_ref());
            }
            _ => {}
        })
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_single_instance::init(|app, argv, _cwd| {
            let paths = markdown_args_from_argv(&argv);
            if !paths.is_empty() {
                let _ = app.emit("inkstack://open-paths", paths);
                if let Some(window) = app.get_webview_window("main") {
                    let _ = window.set_focus();
                }
            }
        }))
        .plugin(tauri_plugin_window_state::Builder::default().build())
        .setup(|app| {
            let paths = markdown_args_from_argv(&std::env::args().collect::<Vec<_>>());
            if !paths.is_empty() {
                if let Ok(mut startup_paths) = app.state::<AppState>().startup_markdown_paths.lock()
                {
                    *startup_paths = paths.clone();
                }
                let handle = app.handle().clone();
                tauri::async_runtime::spawn(async move {
                    let _ = handle.emit("inkstack://open-paths", paths);
                });
            }
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::get_settings,
            commands::update_settings,
            commands::prune_missing_recent_entries,
            commands::generate_ai_text,
            commands::generate_ai_text_stream,
            commands::cancel_ai_stream,
            commands::test_ai_model,
            commands::take_startup_markdown_paths,
            commands::choose_markdown_file,
            commands::choose_markdown_save_path,
            commands::import_css_theme,
            commands::list_imported_css_themes,
            commands::read_imported_css_theme,
            commands::delete_imported_css_theme,
            commands::export_css_theme,
            commands::choose_workspace,
            commands::scan_directory,
            commands::scan_directory_children,
            commands::create_workspace_markdown_file,
            commands::create_workspace_folder,
            commands::rename_workspace_entry,
            commands::delete_workspace_entry,
            commands::search_markdown_files,
            commands::search_text_files,
            commands::read_markdown_file,
            commands::read_text_file,
            commands::resolve_markdown_asset,
            commands::import_markdown_asset,
            commands::open_markdown_file,
            commands::open_text_file,
            commands::save_markdown_file,
            commands::save_markdown_file_as,
            commands::save_export_file,
            commands::get_markdown_file_metadata,
            commands::reveal_markdown_file
        ])
        .run(tauri::generate_context!())
        .expect("error while running InkStack");
}

fn markdown_args_from_argv(argv: &[String]) -> Vec<String> {
    argv.iter()
        .skip(1)
        .filter_map(|arg| {
            let path = PathBuf::from(arg);
            if path.is_file()
                && path
                    .extension()
                    .and_then(|extension| extension.to_str())
                    .map(|extension| {
                        let extension = extension.to_lowercase();
                        extension == "md" || extension == "markdown"
                    })
                    .unwrap_or(false)
            {
                return Some(path.to_string_lossy().to_string());
            }

            None
        })
        .collect()
}
