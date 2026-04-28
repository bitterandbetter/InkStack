use std::{fs, path::Path};

pub struct FileKind {
    pub is_text: bool,
    pub is_markdown: bool,
    pub file_kind: &'static str,
    pub language: Option<&'static str>,
}

pub fn classify_file_path(path: &Path) -> FileKind {
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

pub fn ensure_reasonable_text_file(path: &Path) -> Result<(), String> {
    if is_reasonable_text_file(path) {
        Ok(())
    } else {
        Err("File is too large to open as text".to_string())
    }
}

pub fn is_hidden(path: &Path) -> bool {
    path.file_name()
        .and_then(|name| name.to_str())
        .map(|name| name.starts_with('.'))
        .unwrap_or(false)
}

pub fn is_hidden_tree_entry(path: &Path) -> bool {
    if !is_hidden(path) {
        return false;
    }

    // Keep noisy hidden directories out, but allow project-significant text files
    // such as .gitignore, .env.example, and .npmrc to appear in the code tree.
    path.is_dir() || !classify_file_path(path).is_text
}

pub fn is_ignored_dir(path: &Path) -> bool {
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

pub fn is_markdown_path(path: &Path) -> bool {
    path.extension()
        .and_then(|extension| extension.to_str())
        .map(|extension| {
            let extension = extension.to_lowercase();
            extension == "md" || extension == "markdown"
        })
        .unwrap_or(false)
}

pub fn is_reasonable_text_file(path: &Path) -> bool {
    const MAX_TEXT_FILE_BYTES: u64 = 5 * 1024 * 1024;
    fs::metadata(path)
        .map(|metadata| metadata.len() <= MAX_TEXT_FILE_BYTES)
        .unwrap_or(false)
}

pub fn is_supported_image_path(path: &Path) -> bool {
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
