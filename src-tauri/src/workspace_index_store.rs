use std::{
    collections::{HashMap, HashSet},
    fs,
    path::{Path, PathBuf},
};

use rusqlite::{params, Connection, OptionalExtension};

use crate::{
    models::{
        DocumentKnowledge, FileMetadata, KnowledgeBlockRecord, KnowledgeBlockSearchResult,
        LinkReference, SearchKnowledgeBlocksRequest, TagSummary, WorkspaceIndexState,
    },
    workspace_index::{make_snippet, WorkspaceKnowledgeIndex},
};

const DB_DIR: &str = ".inkstack";
const DB_FILE: &str = "workspace-index.sqlite3";
const SCHEMA_VERSION: i64 = 2;

pub fn load_index(root: &Path) -> Result<WorkspaceKnowledgeIndex, String> {
    let db_path = database_path(root)?;
    if !db_path.exists() {
        return Err("Workspace index store does not exist".to_string());
    }

    let connection = open_connection(&db_path)?;
    ensure_schema(&connection)?;

    let workspace_root = meta_value(&connection, "workspace_root")?
        .ok_or_else(|| "Workspace index store is missing workspace_root".to_string())?;
    if workspace_root != root.to_string_lossy() {
        return Err("Workspace index store belongs to a different workspace".to_string());
    }

    let schema_version = meta_value(&connection, "schema_version")?
        .ok_or_else(|| "Workspace index store is missing schema_version".to_string())?
        .parse::<u32>()
        .map_err(|error| format!("Invalid workspace index schema_version: {error}"))?;
    if schema_version != SCHEMA_VERSION as u32 {
        return Err(format!(
            "Workspace index schema version mismatch: expected {SCHEMA_VERSION}, found {schema_version}"
        ));
    }

    let last_rebuild_at =
        meta_value(&connection, "last_rebuild_at")?.and_then(|value| value.parse::<u64>().ok());
    let mut documents = load_documents(&connection)?;
    load_blocks(&connection, &mut documents)?;
    load_links(&connection, &mut documents)?;
    load_tags(&connection, &mut documents)?;

    let block_count = documents
        .values()
        .map(|document| document.blocks.len())
        .sum();
    let state = WorkspaceIndexState {
        workspace_root,
        schema_version,
        last_rebuild_at,
        status: "ready".to_string(),
        error_message: None,
        document_count: documents.len(),
        block_count,
    };

    Ok(WorkspaceKnowledgeIndex { state, documents })
}

pub fn persist_index(root: &Path, index: &WorkspaceKnowledgeIndex) -> Result<(), String> {
    let db_path = database_path(root)?;
    let (mut connection, _) = open_or_rebuild_connection(&db_path)?;

    let transaction = connection
        .transaction()
        .map_err(|error| error.to_string())?;
    transaction
        .execute_batch(
            r#"
            DELETE FROM block_fts;
            DELETE FROM tags;
            DELETE FROM links;
            DELETE FROM blocks;
            DELETE FROM documents;
            DELETE FROM meta;
            "#,
        )
        .map_err(|error| error.to_string())?;

    transaction
        .execute(
            "INSERT INTO meta (key, value) VALUES ('workspace_root', ?1), ('schema_version', ?2), ('last_rebuild_at', ?3)",
            params![
                index.state.workspace_root,
                index.state.schema_version.to_string(),
                index.state.last_rebuild_at.map(|value| value.to_string()).unwrap_or_default()
            ],
        )
        .map_err(|error| error.to_string())?;

    {
        let mut insert_document = transaction
            .prepare(
                r#"
                INSERT INTO documents
                    (path, relative_path, title, frontmatter_json, modified_at, size, content_hash, indexed_at)
                VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)
                "#,
            )
            .map_err(|error| error.to_string())?;
        let mut insert_block = transaction
            .prepare(
                r#"
                INSERT INTO blocks
                    (id, path, relative_path, block_type, text, raw, start_line, end_line, depth,
                     parent_heading_id, heading_path_json, language, checked)
                VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13)
                "#,
            )
            .map_err(|error| error.to_string())?;
        let mut insert_block_fts = transaction
            .prepare(
                r#"
                INSERT INTO block_fts
                    (id, relative_path, block_type, text, raw, heading_path, tags)
                VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)
                "#,
            )
            .map_err(|error| error.to_string())?;
        let mut insert_link = transaction
            .prepare(
                r#"
                INSERT INTO links
                    (id, source_path, source_relative_path, source_block_id, kind, target, label,
                     heading, resolved_path, line)
                VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10)
                "#,
            )
            .map_err(|error| error.to_string())?;
        let mut insert_tag = transaction
            .prepare(
                r#"
                INSERT INTO tags (id, path, relative_path, block_id, tag, line)
                VALUES (?1, ?2, ?3, ?4, ?5, ?6)
                "#,
            )
            .map_err(|error| error.to_string())?;

        for document in index.documents.values() {
            insert_document
                .execute(params![
                    document.path,
                    document.relative_path,
                    document.title,
                    document.frontmatter_json,
                    document.metadata.modified_at as i64,
                    document.metadata.size as i64,
                    document.content_hash.as_deref(),
                    document.indexed_at.unwrap_or(document.metadata.modified_at) as i64,
                ])
                .map_err(|error| error.to_string())?;

            let tags_by_block = document
                .tags
                .iter()
                .filter_map(|tag| tag.block_id.as_ref().map(|block_id| (block_id, &tag.tag)))
                .fold(
                    HashMap::<&String, Vec<&String>>::new(),
                    |mut map, (block_id, tag)| {
                        map.entry(block_id).or_default().push(tag);
                        map
                    },
                );

            for block in &document.blocks {
                let heading_path_json = serde_json::to_string(&block.heading_path)
                    .map_err(|error| error.to_string())?;
                let checked = block.checked.map(i64::from);
                insert_block
                    .execute(params![
                        block.id,
                        block.path,
                        block.relative_path,
                        block.block_type,
                        block.text,
                        block.raw,
                        block.start_line as i64,
                        block.end_line as i64,
                        block.depth as i64,
                        block.parent_heading_id,
                        heading_path_json,
                        block.language,
                        checked,
                    ])
                    .map_err(|error| error.to_string())?;
                insert_block_fts
                    .execute(params![
                        block.id,
                        block.relative_path,
                        block.block_type,
                        block.text,
                        block.raw,
                        block.heading_path.join(" "),
                        tags_by_block
                            .get(&block.id)
                            .map(|tags| tags
                                .iter()
                                .map(|tag| format!("#{tag}"))
                                .collect::<Vec<_>>()
                                .join(" "))
                            .unwrap_or_default(),
                    ])
                    .map_err(|error| error.to_string())?;
            }

            for link in &document.links {
                insert_link
                    .execute(params![
                        link.id,
                        link.source_path,
                        link.source_relative_path,
                        link.source_block_id,
                        link.kind,
                        link.target,
                        link.label,
                        link.heading,
                        link.resolved_path,
                        link.line as i64,
                    ])
                    .map_err(|error| error.to_string())?;
            }

            for tag in &document.tags {
                insert_tag
                    .execute(params![
                        tag.id,
                        tag.path,
                        tag.relative_path,
                        tag.block_id,
                        tag.tag,
                        tag.line as i64,
                    ])
                    .map_err(|error| error.to_string())?;
            }
        }
    }

    transaction.commit().map_err(|error| error.to_string())
}

pub fn replace_document(
    root: &Path,
    path: &str,
    document: Option<&DocumentKnowledge>,
) -> Result<(), String> {
    let db_path = database_path(root)?;
    let (mut connection, rebuilt) = open_or_rebuild_connection(&db_path)?;
    if rebuilt {
        return Err("Workspace index store was rebuilt; full persist required".to_string());
    }

    let transaction = connection
        .transaction()
        .map_err(|error| error.to_string())?;
    transaction
        .execute(
            "DELETE FROM block_fts WHERE id IN (SELECT id FROM blocks WHERE path = ?1)",
            params![path],
        )
        .map_err(|error| error.to_string())?;
    transaction
        .execute("DELETE FROM tags WHERE path = ?1", params![path])
        .map_err(|error| error.to_string())?;
    transaction
        .execute("DELETE FROM links WHERE source_path = ?1", params![path])
        .map_err(|error| error.to_string())?;
    transaction
        .execute("DELETE FROM blocks WHERE path = ?1", params![path])
        .map_err(|error| error.to_string())?;
    transaction
        .execute("DELETE FROM documents WHERE path = ?1", params![path])
        .map_err(|error| error.to_string())?;
    transaction
        .execute(
            r#"
            INSERT OR REPLACE INTO meta (key, value)
            VALUES
                ('workspace_root', ?1),
                ('schema_version', ?2),
                ('last_rebuild_at', ?3)
            "#,
            params![
                root.to_string_lossy().to_string(),
                SCHEMA_VERSION.to_string(),
                current_time_millis().to_string(),
            ],
        )
        .map_err(|error| error.to_string())?;

    if let Some(document) = document {
        insert_document_records(&transaction, document)?;
    }

    transaction.commit().map_err(|error| error.to_string())
}

pub fn search_blocks(
    root: &Path,
    request: &SearchKnowledgeBlocksRequest,
) -> Result<Vec<KnowledgeBlockSearchResult>, String> {
    let query = request.query.trim();
    if query.is_empty() {
        return Ok(Vec::new());
    }

    let db_path = database_path(root)?;
    if !db_path.exists() {
        return Err("Workspace index store does not exist".to_string());
    }
    let (connection, rebuilt) = open_or_rebuild_connection(&db_path)?;
    if rebuilt {
        return Err("Workspace index store was rebuilt; using in-memory index".to_string());
    }

    let fts_query = make_fts_query(query);
    if fts_query.is_empty() {
        return Ok(Vec::new());
    }

    let mut statement = connection
        .prepare(
            r#"
            SELECT
                blocks.id,
                blocks.path,
                blocks.relative_path,
                blocks.block_type,
                blocks.text,
                blocks.start_line,
                blocks.end_line,
                blocks.heading_path_json,
                rank
            FROM block_fts
            JOIN blocks ON blocks.id = block_fts.id
            WHERE block_fts MATCH ?1
              AND (?2 OR blocks.path != ?3)
            ORDER BY rank, blocks.relative_path, blocks.start_line
            LIMIT ?4
            "#,
        )
        .map_err(|error| error.to_string())?;

    let include_current_file = request.include_current_file;
    let current_path = request.current_path.as_deref().unwrap_or_default();
    let limit = request.limit.clamp(1, 80) as i64;
    let mut rows = statement
        .query(params![
            fts_query,
            include_current_file,
            current_path,
            limit
        ])
        .map_err(|error| error.to_string())?;
    let mut results = Vec::new();
    let mut seen = HashSet::new();

    while let Some(row) = rows.next().map_err(|error| error.to_string())? {
        let id: String = row.get(0).map_err(|error| error.to_string())?;
        if !seen.insert(id.clone()) {
            continue;
        }
        let text: String = row.get(4).map_err(|error| error.to_string())?;
        let heading_path_json: String = row.get(7).map_err(|error| error.to_string())?;
        let rank: f64 = row.get(8).map_err(|error| error.to_string())?;
        results.push(KnowledgeBlockSearchResult {
            id,
            path: row.get(1).map_err(|error| error.to_string())?,
            relative_path: row.get(2).map_err(|error| error.to_string())?,
            block_type: row.get(3).map_err(|error| error.to_string())?,
            snippet: Some(make_snippet(&text, &query.to_lowercase())),
            text,
            start_line: row.get::<_, i64>(5).map_err(|error| error.to_string())? as usize,
            end_line: row.get::<_, i64>(6).map_err(|error| error.to_string())? as usize,
            heading_path: serde_json::from_str(&heading_path_json).unwrap_or_default(),
            score: fts_score(rank),
        });
    }

    Ok(results)
}

fn insert_document_records(
    transaction: &rusqlite::Transaction<'_>,
    document: &DocumentKnowledge,
) -> Result<(), String> {
    transaction
        .execute(
            r#"
            INSERT INTO documents
                (path, relative_path, title, frontmatter_json, modified_at, size, content_hash, indexed_at)
            VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)
            "#,
            params![
                document.path,
                document.relative_path,
                document.title,
                document.frontmatter_json,
                document.metadata.modified_at as i64,
                document.metadata.size as i64,
                document.content_hash.as_deref(),
                document.indexed_at.unwrap_or(document.metadata.modified_at) as i64,
            ],
        )
        .map_err(|error| error.to_string())?;

    let tags_by_block = document
        .tags
        .iter()
        .filter_map(|tag| tag.block_id.as_ref().map(|block_id| (block_id, &tag.tag)))
        .fold(
            HashMap::<&String, Vec<&String>>::new(),
            |mut map, (block_id, tag)| {
                map.entry(block_id).or_default().push(tag);
                map
            },
        );

    {
        let mut insert_block = transaction
            .prepare(
                r#"
                INSERT INTO blocks
                    (id, path, relative_path, block_type, text, raw, start_line, end_line, depth,
                     parent_heading_id, heading_path_json, language, checked)
                VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13)
                "#,
            )
            .map_err(|error| error.to_string())?;
        let mut insert_block_fts = transaction
            .prepare(
                r#"
                INSERT INTO block_fts
                    (id, relative_path, block_type, text, raw, heading_path, tags)
                VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)
                "#,
            )
            .map_err(|error| error.to_string())?;

        for block in &document.blocks {
            let heading_path_json =
                serde_json::to_string(&block.heading_path).map_err(|error| error.to_string())?;
            let checked = block.checked.map(i64::from);
            insert_block
                .execute(params![
                    block.id,
                    block.path,
                    block.relative_path,
                    block.block_type,
                    block.text,
                    block.raw,
                    block.start_line as i64,
                    block.end_line as i64,
                    block.depth as i64,
                    block.parent_heading_id,
                    heading_path_json,
                    block.language,
                    checked,
                ])
                .map_err(|error| error.to_string())?;
            insert_block_fts
                .execute(params![
                    block.id,
                    block.relative_path,
                    block.block_type,
                    block.text,
                    block.raw,
                    block.heading_path.join(" "),
                    tags_by_block
                        .get(&block.id)
                        .map(|tags| tags
                            .iter()
                            .map(|tag| format!("#{tag}"))
                            .collect::<Vec<_>>()
                            .join(" "))
                        .unwrap_or_default(),
                ])
                .map_err(|error| error.to_string())?;
        }
    }

    {
        let mut insert_link = transaction
            .prepare(
                r#"
                INSERT INTO links
                    (id, source_path, source_relative_path, source_block_id, kind, target, label,
                     heading, resolved_path, line)
                VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10)
                "#,
            )
            .map_err(|error| error.to_string())?;
        for link in &document.links {
            insert_link
                .execute(params![
                    link.id,
                    link.source_path,
                    link.source_relative_path,
                    link.source_block_id,
                    link.kind,
                    link.target,
                    link.label,
                    link.heading,
                    link.resolved_path,
                    link.line as i64,
                ])
                .map_err(|error| error.to_string())?;
        }
    }

    {
        let mut insert_tag = transaction
            .prepare(
                r#"
                INSERT INTO tags (id, path, relative_path, block_id, tag, line)
                VALUES (?1, ?2, ?3, ?4, ?5, ?6)
                "#,
            )
            .map_err(|error| error.to_string())?;
        for tag in &document.tags {
            insert_tag
                .execute(params![
                    tag.id,
                    tag.path,
                    tag.relative_path,
                    tag.block_id,
                    tag.tag,
                    tag.line as i64,
                ])
                .map_err(|error| error.to_string())?;
        }
    }

    Ok(())
}

fn load_documents(connection: &Connection) -> Result<HashMap<String, DocumentKnowledge>, String> {
    let mut statement = connection
        .prepare(
            r#"
            SELECT path, relative_path, title, frontmatter_json, modified_at, size, content_hash, indexed_at
            FROM documents
            ORDER BY relative_path
            "#,
        )
        .map_err(|error| error.to_string())?;
    let mut rows = statement.query([]).map_err(|error| error.to_string())?;
    let mut documents = HashMap::new();

    while let Some(row) = rows.next().map_err(|error| error.to_string())? {
        let path: String = row.get(0).map_err(|error| error.to_string())?;
        documents.insert(
            path.clone(),
            DocumentKnowledge {
                path,
                relative_path: row.get(1).map_err(|error| error.to_string())?,
                title: row.get(2).map_err(|error| error.to_string())?,
                frontmatter_json: row.get(3).map_err(|error| error.to_string())?,
                metadata: FileMetadata {
                    modified_at: row.get::<_, i64>(4).map_err(|error| error.to_string())? as u64,
                    size: row.get::<_, i64>(5).map_err(|error| error.to_string())? as u64,
                },
                content_hash: row.get(6).map_err(|error| error.to_string())?,
                indexed_at: row
                    .get::<_, Option<i64>>(7)
                    .map_err(|error| error.to_string())?
                    .map(|value| value as u64),
                blocks: Vec::new(),
                links: Vec::new(),
                tags: Vec::new(),
            },
        );
    }

    Ok(documents)
}

fn load_blocks(
    connection: &Connection,
    documents: &mut HashMap<String, DocumentKnowledge>,
) -> Result<(), String> {
    let mut statement = connection
        .prepare(
            r#"
            SELECT id, path, relative_path, block_type, text, raw, start_line, end_line, depth,
                   parent_heading_id, heading_path_json, language, checked
            FROM blocks
            ORDER BY relative_path, start_line, id
            "#,
        )
        .map_err(|error| error.to_string())?;
    let mut rows = statement.query([]).map_err(|error| error.to_string())?;

    while let Some(row) = rows.next().map_err(|error| error.to_string())? {
        let path: String = row.get(1).map_err(|error| error.to_string())?;
        let heading_path_json: String = row.get(10).map_err(|error| error.to_string())?;
        let checked = row
            .get::<_, Option<i64>>(12)
            .map_err(|error| error.to_string())?
            .map(|value| value != 0);
        let block = KnowledgeBlockRecord {
            id: row.get(0).map_err(|error| error.to_string())?,
            path: path.clone(),
            relative_path: row.get(2).map_err(|error| error.to_string())?,
            block_type: row.get(3).map_err(|error| error.to_string())?,
            text: row.get(4).map_err(|error| error.to_string())?,
            raw: row.get(5).map_err(|error| error.to_string())?,
            start_line: row.get::<_, i64>(6).map_err(|error| error.to_string())? as usize,
            end_line: row.get::<_, i64>(7).map_err(|error| error.to_string())? as usize,
            depth: row.get::<_, i64>(8).map_err(|error| error.to_string())? as usize,
            parent_heading_id: row.get(9).map_err(|error| error.to_string())?,
            heading_path: serde_json::from_str(&heading_path_json).unwrap_or_default(),
            language: row.get(11).map_err(|error| error.to_string())?,
            checked,
        };
        if let Some(document) = documents.get_mut(&path) {
            document.blocks.push(block);
        }
    }

    Ok(())
}

fn load_links(
    connection: &Connection,
    documents: &mut HashMap<String, DocumentKnowledge>,
) -> Result<(), String> {
    let mut statement = connection
        .prepare(
            r#"
            SELECT id, source_path, source_relative_path, source_block_id, kind, target, label,
                   heading, resolved_path, line
            FROM links
            ORDER BY source_relative_path, line, id
            "#,
        )
        .map_err(|error| error.to_string())?;
    let mut rows = statement.query([]).map_err(|error| error.to_string())?;

    while let Some(row) = rows.next().map_err(|error| error.to_string())? {
        let source_path: String = row.get(1).map_err(|error| error.to_string())?;
        let link = LinkReference {
            id: row.get(0).map_err(|error| error.to_string())?,
            source_path: source_path.clone(),
            source_relative_path: row.get(2).map_err(|error| error.to_string())?,
            source_block_id: row.get(3).map_err(|error| error.to_string())?,
            kind: row.get(4).map_err(|error| error.to_string())?,
            target: row.get(5).map_err(|error| error.to_string())?,
            label: row.get(6).map_err(|error| error.to_string())?,
            heading: row.get(7).map_err(|error| error.to_string())?,
            resolved_path: row.get(8).map_err(|error| error.to_string())?,
            line: row.get::<_, i64>(9).map_err(|error| error.to_string())? as usize,
        };
        if let Some(document) = documents.get_mut(&source_path) {
            document.links.push(link);
        }
    }

    Ok(())
}

fn load_tags(
    connection: &Connection,
    documents: &mut HashMap<String, DocumentKnowledge>,
) -> Result<(), String> {
    let mut statement = connection
        .prepare(
            r#"
            SELECT id, path, relative_path, block_id, tag, line
            FROM tags
            ORDER BY relative_path, line, tag, id
            "#,
        )
        .map_err(|error| error.to_string())?;
    let mut rows = statement.query([]).map_err(|error| error.to_string())?;

    while let Some(row) = rows.next().map_err(|error| error.to_string())? {
        let path: String = row.get(1).map_err(|error| error.to_string())?;
        let tag = TagSummary {
            id: row.get(0).map_err(|error| error.to_string())?,
            path: path.clone(),
            relative_path: row.get(2).map_err(|error| error.to_string())?,
            block_id: row.get(3).map_err(|error| error.to_string())?,
            tag: row.get(4).map_err(|error| error.to_string())?,
            line: row.get::<_, i64>(5).map_err(|error| error.to_string())? as usize,
        };
        if let Some(document) = documents.get_mut(&path) {
            document.tags.push(tag);
        }
    }

    Ok(())
}

fn database_path(root: &Path) -> Result<PathBuf, String> {
    let dir = root.join(DB_DIR);
    fs::create_dir_all(&dir).map_err(|error| error.to_string())?;
    Ok(dir.join(DB_FILE))
}

fn open_or_rebuild_connection(path: &Path) -> Result<(Connection, bool), String> {
    match open_connection(path).and_then(|connection| {
        ensure_schema(&connection)?;
        Ok(connection)
    }) {
        Ok(connection) => Ok((connection, false)),
        Err(first_error) => {
            remove_database_files(path).map_err(|remove_error| {
                format!(
                    "Failed to rebuild workspace index store after {first_error}: {remove_error}"
                )
            })?;
            let connection = open_connection(path).map_err(|open_error| {
                format!("Failed to reopen rebuilt workspace index store: {open_error}")
            })?;
            ensure_schema(&connection).map_err(|schema_error| {
                format!("Failed to initialize rebuilt workspace index store: {schema_error}")
            })?;
            Ok((connection, true))
        }
    }
}

fn open_connection(path: &Path) -> Result<Connection, String> {
    let connection = Connection::open(path).map_err(|error| error.to_string())?;
    connection
        .pragma_update(None, "journal_mode", "WAL")
        .map_err(|error| error.to_string())?;
    connection
        .pragma_update(None, "foreign_keys", "ON")
        .map_err(|error| error.to_string())?;
    Ok(connection)
}

fn ensure_schema(connection: &Connection) -> Result<(), String> {
    if table_exists(connection, "meta")? {
        let current_version = user_version(connection)?;
        migrate_schema(connection, current_version, SCHEMA_VERSION)?;
    } else {
        initialize_schema(connection)?;
    }

    verify_schema(connection)
}

fn initialize_schema(connection: &Connection) -> Result<(), String> {
    connection
        .execute_batch(
            r#"
            CREATE TABLE IF NOT EXISTS meta (
                key TEXT PRIMARY KEY,
                value TEXT NOT NULL
            );
            CREATE TABLE IF NOT EXISTS documents (
                path TEXT PRIMARY KEY,
                relative_path TEXT NOT NULL,
                title TEXT,
                frontmatter_json TEXT,
                modified_at INTEGER NOT NULL,
                size INTEGER NOT NULL,
                content_hash TEXT,
                indexed_at INTEGER
            );
            CREATE TABLE IF NOT EXISTS blocks (
                id TEXT PRIMARY KEY,
                path TEXT NOT NULL,
                relative_path TEXT NOT NULL,
                block_type TEXT NOT NULL,
                text TEXT NOT NULL,
                raw TEXT NOT NULL,
                start_line INTEGER NOT NULL,
                end_line INTEGER NOT NULL,
                depth INTEGER NOT NULL,
                parent_heading_id TEXT,
                heading_path_json TEXT NOT NULL,
                language TEXT,
                checked INTEGER,
                FOREIGN KEY(path) REFERENCES documents(path) ON DELETE CASCADE
            );
            CREATE TABLE IF NOT EXISTS links (
                id TEXT PRIMARY KEY,
                source_path TEXT NOT NULL,
                source_relative_path TEXT NOT NULL,
                source_block_id TEXT,
                kind TEXT NOT NULL,
                target TEXT NOT NULL,
                label TEXT,
                heading TEXT,
                resolved_path TEXT,
                line INTEGER NOT NULL
            );
            CREATE TABLE IF NOT EXISTS tags (
                id TEXT PRIMARY KEY,
                path TEXT NOT NULL,
                relative_path TEXT NOT NULL,
                block_id TEXT,
                tag TEXT NOT NULL,
                line INTEGER NOT NULL
            );
            CREATE VIRTUAL TABLE IF NOT EXISTS block_fts USING fts5(
                id UNINDEXED,
                relative_path,
                block_type,
                text,
                raw,
                heading_path,
                tags,
                tokenize = 'unicode61'
            );
            CREATE INDEX IF NOT EXISTS blocks_path_index ON blocks(path);
            CREATE INDEX IF NOT EXISTS tags_block_id_index ON tags(block_id);
            CREATE INDEX IF NOT EXISTS links_source_block_id_index ON links(source_block_id);
            "#,
        )
        .map_err(|error| error.to_string())?;
    connection
        .pragma_update(None, "user_version", SCHEMA_VERSION)
        .map_err(|error| error.to_string())?;
    Ok(())
}

fn migrate_schema(connection: &Connection, from: i64, to: i64) -> Result<(), String> {
    if from == to {
        return Ok(());
    }

    if from > to {
        return Err(format!(
            "Workspace index schema version is newer than this app supports: expected {to}, found {from}"
        ));
    }

    for current in from..to {
        match current {
            0 => {
                return Err(
                    "Workspace index schema version 0 cannot be migrated safely".to_string()
                );
            }
            1 => {
                migrate_schema_v1_to_v2(connection)?;
            }
            _ => {
                return Err(format!(
                    "Workspace index schema migration requires rebuild: {current} -> {}",
                    current + 1
                ));
            }
        }
    }

    connection
        .pragma_update(None, "user_version", to)
        .map_err(|error| error.to_string())?;
    connection
        .execute(
            "INSERT OR REPLACE INTO meta (key, value) VALUES ('schema_version', ?1)",
            params![to.to_string()],
        )
        .map_err(|error| error.to_string())?;
    Ok(())
}

fn verify_schema(connection: &Connection) -> Result<(), String> {
    let _: Option<String> = connection
        .query_row("SELECT id FROM block_fts LIMIT 1", [], |row| row.get(0))
        .optional()
        .map_err(|error| error.to_string())?;

    Ok(())
}

fn migrate_schema_v1_to_v2(connection: &Connection) -> Result<(), String> {
    if !column_exists(connection, "documents", "content_hash")? {
        connection
            .execute("ALTER TABLE documents ADD COLUMN content_hash TEXT", [])
            .map_err(|error| error.to_string())?;
    }
    if !column_exists(connection, "documents", "indexed_at")? {
        connection
            .execute("ALTER TABLE documents ADD COLUMN indexed_at INTEGER", [])
            .map_err(|error| error.to_string())?;
    }
    connection
        .execute(
            "UPDATE documents SET indexed_at = COALESCE(indexed_at, modified_at)",
            [],
        )
        .map_err(|error| error.to_string())?;
    Ok(())
}

fn column_exists(
    connection: &Connection,
    table_name: &str,
    column_name: &str,
) -> Result<bool, String> {
    let mut statement = connection
        .prepare(&format!("PRAGMA table_info({table_name})"))
        .map_err(|error| error.to_string())?;
    let mut rows = statement.query([]).map_err(|error| error.to_string())?;
    while let Some(row) = rows.next().map_err(|error| error.to_string())? {
        let name: String = row.get(1).map_err(|error| error.to_string())?;
        if name == column_name {
            return Ok(true);
        }
    }
    Ok(false)
}

fn table_exists(connection: &Connection, table_name: &str) -> Result<bool, String> {
    let exists: Option<i64> = connection
        .query_row(
            "SELECT 1 FROM sqlite_master WHERE name = ?1 LIMIT 1",
            params![table_name],
            |row| row.get(0),
        )
        .optional()
        .map_err(|error| error.to_string())?;
    Ok(exists.is_some())
}

fn user_version(connection: &Connection) -> Result<i64, String> {
    connection
        .pragma_query_value(None, "user_version", |row| row.get(0))
        .map_err(|error| error.to_string())
}

fn meta_value(connection: &Connection, key: &str) -> Result<Option<String>, String> {
    connection
        .query_row(
            "SELECT value FROM meta WHERE key = ?1",
            params![key],
            |row| row.get(0),
        )
        .optional()
        .map_err(|error| error.to_string())
}

fn remove_database_files(path: &Path) -> Result<(), String> {
    for database_file in database_files(path) {
        match fs::remove_file(&database_file) {
            Ok(()) => {}
            Err(error) if error.kind() == std::io::ErrorKind::NotFound => {}
            Err(error) => return Err(error.to_string()),
        }
    }
    Ok(())
}

fn database_files(path: &Path) -> Vec<PathBuf> {
    let mut files = vec![path.to_path_buf()];
    if let Some(file_name) = path.file_name().and_then(|value| value.to_str()) {
        files.push(path.with_file_name(format!("{file_name}-wal")));
        files.push(path.with_file_name(format!("{file_name}-shm")));
    }
    files
}

fn make_fts_query(query: &str) -> String {
    query
        .split_whitespace()
        .filter_map(|term| {
            let term = term.trim_matches(|character: char| {
                character.is_ascii_punctuation()
                    && character != '_'
                    && character != '-'
                    && character != '/'
            });
            (!term.is_empty()).then(|| format!("\"{}\"*", term.replace('"', "\"\"")))
        })
        .collect::<Vec<_>>()
        .join(" AND ")
}

fn fts_score(rank: f64) -> usize {
    if rank >= 0.0 {
        return 1;
    }
    ((rank.abs() * 1_000_000.0).round() as usize).max(1)
}

fn current_time_millis() -> u64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|duration| duration.as_millis() as u64)
        .unwrap_or(0)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn ensure_schema_initializes_version_one_store() {
        let connection = Connection::open_in_memory().unwrap();

        ensure_schema(&connection).unwrap();

        assert_eq!(user_version(&connection).unwrap(), SCHEMA_VERSION);
        assert!(table_exists(&connection, "meta").unwrap());
        assert!(table_exists(&connection, "documents").unwrap());
        assert!(table_exists(&connection, "block_fts").unwrap());
    }

    #[test]
    fn migrate_schema_accepts_current_version_without_changes() {
        let connection = Connection::open_in_memory().unwrap();
        initialize_schema(&connection).unwrap();

        migrate_schema(&connection, SCHEMA_VERSION, SCHEMA_VERSION).unwrap();

        assert_eq!(user_version(&connection).unwrap(), SCHEMA_VERSION);
    }

    #[test]
    fn migrate_schema_v1_to_v2_adds_document_columns_and_preserves_rows() {
        let connection = Connection::open_in_memory().unwrap();
        create_schema_version_one_store(&connection);

        migrate_schema(&connection, 1, SCHEMA_VERSION).unwrap();

        assert!(column_exists(&connection, "documents", "content_hash").unwrap());
        assert!(column_exists(&connection, "documents", "indexed_at").unwrap());
        assert_eq!(user_version(&connection).unwrap(), SCHEMA_VERSION);
        assert_eq!(
            meta_value(&connection, "schema_version")
                .unwrap()
                .as_deref(),
            Some("2")
        );

        let row = connection
            .query_row(
                r#"
                SELECT path, relative_path, title, frontmatter_json, modified_at, size, content_hash, indexed_at
                FROM documents
                WHERE path = ?1
                "#,
                params!["/workspace/notes/today.md"],
                |row| {
                    Ok((
                        row.get::<_, String>(0)?,
                        row.get::<_, String>(1)?,
                        row.get::<_, Option<String>>(2)?,
                        row.get::<_, Option<String>>(3)?,
                        row.get::<_, i64>(4)?,
                        row.get::<_, i64>(5)?,
                        row.get::<_, Option<String>>(6)?,
                        row.get::<_, Option<i64>>(7)?,
                    ))
                },
            )
            .unwrap();

        assert_eq!(row.0, "/workspace/notes/today.md");
        assert_eq!(row.1, "notes/today.md");
        assert_eq!(row.2.as_deref(), Some("Today"));
        assert_eq!(row.3.as_deref(), Some(r#"{"status":"draft"}"#));
        assert_eq!(row.4, 1_714_000_000);
        assert_eq!(row.5, 42);
        assert_eq!(row.6, None);
        assert_eq!(row.7, Some(1_714_000_000));
    }

    #[test]
    fn migrate_schema_rejects_future_versions_for_rebuild_path() {
        let connection = Connection::open_in_memory().unwrap();
        initialize_schema(&connection).unwrap();

        let error = migrate_schema(&connection, SCHEMA_VERSION + 1, SCHEMA_VERSION).unwrap_err();

        assert!(error.contains("newer than this app supports"));
    }

    #[test]
    fn load_documents_restores_content_hash_and_indexed_at() {
        let connection = Connection::open_in_memory().unwrap();
        initialize_schema(&connection).unwrap();
        connection
            .execute(
                r#"
                INSERT INTO documents
                    (path, relative_path, title, frontmatter_json, modified_at, size, content_hash, indexed_at)
                VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)
                "#,
                params![
                    "/workspace/notes/today.md",
                    "notes/today.md",
                    "Today",
                    r#"{"status":"draft"}"#,
                    1_714_000_000_i64,
                    42_i64,
                    "abc123",
                    1_714_000_100_i64,
                ],
            )
            .unwrap();

        let documents = load_documents(&connection).unwrap();
        let document = documents.get("/workspace/notes/today.md").unwrap();

        assert_eq!(document.content_hash.as_deref(), Some("abc123"));
        assert_eq!(document.indexed_at, Some(1_714_000_100));
    }

    fn create_schema_version_one_store(connection: &Connection) {
        connection
            .execute_batch(
                r#"
                CREATE TABLE meta (
                    key TEXT PRIMARY KEY,
                    value TEXT NOT NULL
                );
                CREATE TABLE documents (
                    path TEXT PRIMARY KEY,
                    relative_path TEXT NOT NULL,
                    title TEXT,
                    frontmatter_json TEXT,
                    modified_at INTEGER NOT NULL,
                    size INTEGER NOT NULL
                );
                INSERT INTO meta (key, value) VALUES ('schema_version', '1');
                INSERT INTO documents
                    (path, relative_path, title, frontmatter_json, modified_at, size)
                VALUES
                    ('/workspace/notes/today.md', 'notes/today.md', 'Today', '{"status":"draft"}', 1714000000, 42);
                PRAGMA user_version = 1;
                "#,
            )
            .unwrap();
    }
}
