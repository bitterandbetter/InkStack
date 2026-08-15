mod ai_commands;
mod ai_config;
mod ai_providers;
mod app_settings;
mod asset_commands;
mod file_commands;
mod file_kinds;
mod models;
mod notification_commands;
mod save_commands;
mod theme_commands;
mod workspace_commands;
mod workspace_index;
mod workspace_index_store;
mod workspace_search;

use std::{
    collections::{HashMap, HashSet},
    path::PathBuf,
    sync::{atomic::AtomicBool, Arc, Mutex},
};

use tauri::{
    menu::{MenuBuilder, MenuItemBuilder, SubmenuBuilder},
    Emitter, Manager, RunEvent,
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
    // Stage 2 knowledge index stays in memory for now and can be rebuilt from the workspace tree.
    workspace_index: Mutex<Option<workspace_index::WorkspaceKnowledgeIndex>>,
}

pub struct AiStreamControl {
    pub cancelled: Arc<AtomicBool>,
    pub pid: Option<u32>,
}

#[tauri::command]
fn quit_app(app: tauri::AppHandle) {
    app.exit(0);
}

#[tauri::command]
fn confirm_close_app(app: tauri::AppHandle) {
    app.exit(0);
}

#[tauri::command]
fn minimize_window(app: tauri::AppHandle) {
    if let Some(window) = app.get_webview_window("main") {
        let _ = window.minimize();
    }
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
                .separator()
                .item(
                    &MenuItemBuilder::with_id("quit-app", "退出 InkStack")
                        .accelerator("CmdOrCtrl+Q")
                        .build(app)?,
                )
                .build()?;
            let edit = SubmenuBuilder::new(app, "编辑")
                .undo()
                .redo()
                .separator()
                .cut()
                .copy()
                .paste()
                .select_all()
                .separator()
                .item(
                    &MenuItemBuilder::with_id("find", "查找...")
                        .accelerator("CmdOrCtrl+F")
                        .build(app)?,
                )
                .item(
                    &MenuItemBuilder::with_id("open-command-palette", "命令面板...")
                        .accelerator("CmdOrCtrl+K")
                        .build(app)?,
                )
                .build()?;
            let view = SubmenuBuilder::new(app, "视图")
                .item(
                    &MenuItemBuilder::with_id("view-edit", "编辑视图")
                        .accelerator("CmdOrCtrl+1")
                        .build(app)?,
                )
                .item(
                    &MenuItemBuilder::with_id("view-split", "分屏视图")
                        .accelerator("CmdOrCtrl+2")
                        .build(app)?,
                )
                .item(
                    &MenuItemBuilder::with_id("view-read", "阅读视图")
                        .accelerator("CmdOrCtrl+3")
                        .build(app)?,
                )
                .item(
                    &MenuItemBuilder::with_id("view-code", "代码视图")
                        .accelerator("CmdOrCtrl+4")
                        .build(app)?,
                )
                .item(
                    &MenuItemBuilder::with_id("view-wysiwyg", "所见即所得视图")
                        .accelerator("CmdOrCtrl+5")
                        .build(app)?,
                )
                .separator()
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
                .item(&MenuItemBuilder::with_id("theme-toggle", "切换浅色/深色").build(app)?)
                .build()?;
            let navigate = SubmenuBuilder::new(app, "导航")
                .item(&MenuItemBuilder::with_id("history-back", "后退").build(app)?)
                .item(&MenuItemBuilder::with_id("history-forward", "前进").build(app)?)
                .build()?;
            let window_menu = SubmenuBuilder::new(app, "窗口")
                .item(
                    &MenuItemBuilder::with_id("minimize-window", "最小化")
                        .accelerator("CmdOrCtrl+M")
                        .build(app)?,
                )
                .item(
                    &MenuItemBuilder::with_id("close-window", "关闭窗口")
                        .accelerator("CmdOrCtrl+W")
                        .build(app)?,
                )
                .build()?;
            let ai = SubmenuBuilder::new(app, "AI")
                .item(&MenuItemBuilder::with_id("ai-chat", "AI 对话").build(app)?)
                .item(&MenuItemBuilder::with_id("ai-outline", "智能大纲").build(app)?)
                .item(&MenuItemBuilder::with_id("ai-code", "代码助手").build(app)?)
                .separator()
                .item(&MenuItemBuilder::with_id("ai-settings", "AI 设置").build(app)?)
                .build()?;

            MenuBuilder::new(app)
                .item(&file)
                .item(&edit)
                .item(&view)
                .item(&navigate)
                .item(&window_menu)
                .item(&ai)
                .build()
        })
        .on_menu_event(|app, event| match event.id().as_ref() {
            "new-file"
            | "open-file"
            | "open-workspace"
            | "save"
            | "save-as"
            | "reveal-file"
            | "quit-app"
            | "find"
            | "open-command-palette"
            | "view-split"
            | "view-edit"
            | "view-read"
            | "view-code"
            | "view-wysiwyg"
            | "toggle-sidebar"
            | "toggle-ai"
            | "theme-toggle"
            | "history-back"
            | "history-forward"
            | "ai-chat"
            | "ai-outline"
            | "ai-code"
            | "ai-settings" => {
                let _ = app.emit("inkstack://menu", event.id().as_ref());
            }
            "close-window" => {
                if let Some(window) = app.get_webview_window("main") {
                    let _ = window.emit("close-confirmed", ());
                }
            }
            "minimize-window" => {
                if let Some(window) = app.get_webview_window("main") {
                    let _ = window.minimize();
                }
            }
            _ => {}
        })
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_single_instance::init(|app, argv, _cwd| {
            emit_markdown_paths(app, markdown_args_from_argv(&argv));
        }))
        .plugin(tauri_plugin_window_state::Builder::default().build())
        .setup(|app| {
            let paths = markdown_args_from_argv(&std::env::args().collect::<Vec<_>>());
            emit_markdown_paths(app.handle(), paths);

            // Handle window close event
            let app_handle = app.handle().clone();
            if let Some(window) = app.get_webview_window("main") {
                let app_handle_clone = app_handle.clone();
                window.on_window_event(move |event| {
                    if let tauri::WindowEvent::CloseRequested { api, .. } = event {
                        api.prevent_close();
                        let _ = app_handle_clone.emit("close-confirmed", ());
                    }
                });
            }

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            app_settings::get_settings,
            app_settings::update_settings,
            app_settings::prune_missing_recent_entries,
            quit_app,
            confirm_close_app,
            minimize_window,
            ai_commands::generate_ai_text,
            ai_commands::generate_ai_text_stream,
            ai_commands::cancel_ai_stream,
            ai_commands::test_ai_model,
            file_commands::take_startup_markdown_paths,
            file_commands::choose_markdown_file,
            file_commands::choose_markdown_save_path,
            theme_commands::import_css_theme,
            theme_commands::list_imported_css_themes,
            theme_commands::read_imported_css_theme,
            theme_commands::delete_imported_css_theme,
            theme_commands::export_css_theme,
            theme_commands::open_imported_css_themes_dir,
            theme_commands::write_built_in_css_theme_files,
            theme_commands::list_system_font_families,
            notification_commands::show_desktop_notification,
            workspace_commands::choose_workspace,
            workspace_commands::scan_directory,
            workspace_commands::scan_directory_children,
            workspace_commands::create_workspace_markdown_file,
            workspace_commands::create_workspace_folder,
            workspace_commands::rename_workspace_entry,
            workspace_commands::delete_workspace_entry,
            workspace_search::search_markdown_files,
            workspace_search::search_text_files,
            workspace_index::rebuild_workspace_index,
            workspace_index::refresh_workspace_index,
            workspace_index::refresh_workspace_index_document,
            workspace_index::search_knowledge_blocks,
            workspace_index::search_knowledge_documents,
            workspace_index::get_document_knowledge,
            workspace_index::get_backlinks,
            workspace_index::get_unlinked_mentions,
            workspace_index::get_workspace_tags,
            workspace_index::get_unresolved_links,
            workspace_index::get_isolated_documents,
            workspace_index::get_isolated_document_suggestions,
            workspace_index::get_workspace_knowledge_graph,
            workspace_index::get_workspace_knowledge_overview,
            file_commands::read_markdown_file,
            file_commands::read_text_file,
            asset_commands::resolve_markdown_asset,
            asset_commands::import_markdown_asset,
            asset_commands::pick_and_import_markdown_asset,
            file_commands::open_markdown_file,
            file_commands::open_text_file,
            save_commands::save_markdown_file,
            save_commands::save_markdown_file_as,
            save_commands::save_export_file,
            file_commands::get_markdown_file_metadata,
            file_commands::reveal_markdown_file
        ])
        .build(tauri::generate_context!())
        .expect("error while building InkStack")
        .run(|app, event| {
            #[cfg(any(target_os = "macos", target_os = "ios"))]
            if let RunEvent::Opened { urls } = event {
                emit_markdown_paths(app, markdown_paths_from_urls(urls));
            }
        });
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

#[cfg(any(target_os = "macos", target_os = "ios"))]
fn markdown_paths_from_urls(urls: Vec<tauri::Url>) -> Vec<String> {
    urls.into_iter()
        .filter_map(|url| url.to_file_path().ok())
        .filter_map(markdown_path)
        .collect()
}

fn markdown_path(path: PathBuf) -> Option<String> {
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
}

fn emit_markdown_paths(app: &tauri::AppHandle, paths: Vec<String>) {
    if paths.is_empty() {
        return;
    }

    if let Ok(mut startup_paths) = app.state::<AppState>().startup_markdown_paths.lock() {
        *startup_paths = paths.clone();
    }
    let _ = app.emit("inkstack://open-paths", paths);
    if let Some(window) = app.get_webview_window("main") {
        let _ = window.set_focus();
    }
}
