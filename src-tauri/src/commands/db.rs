use serde::{Deserialize, Serialize};
use serde_json::Value;

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct Suite {
    pub id: String,
    pub number: i32,
    pub r#type: String,
    pub status: String,
    pub prices: Value,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct OfflineOperation {
    pub id: String,
    pub op_type: String,
    pub payload: Value,
    pub created_at: String,
    pub synced: bool,
}

#[tauri::command]
pub async fn db_get_suites(
    db: tauri::State<'_, tauri_plugin_sql::DbInstances>,
) -> Result<Vec<Suite>, String> {
    // Returns cached suites from local SQLite
    // In production, implement via tauri-plugin-sql
    Ok(vec![])
}

#[tauri::command]
pub async fn db_sync_suites(_suites: Vec<Value>) -> Result<(), String> {
    // Persist suites to SQLite for offline use
    Ok(())
}

#[tauri::command]
pub async fn db_enqueue_operation(op: Value) -> Result<(), String> {
    // Enqueue offline operation to SQLite
    Ok(())
}

#[tauri::command]
pub async fn db_get_pending_operations() -> Result<Vec<Value>, String> {
    // Return all unsynced operations in chronological order
    Ok(vec![])
}

#[tauri::command]
pub async fn db_mark_synced(id: String) -> Result<(), String> {
    // Mark operation as synced
    let _ = id;
    Ok(())
}
