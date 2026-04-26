/// Triggers a full sync of pending offline operations to Supabase.
/// The actual sync logic runs on the frontend (Supabase JS SDK),
/// so this command is used to coordinate state.
#[tauri::command]
pub async fn sync_all() -> Result<(), String> {
    // Frontend handles Supabase sync; this command can be used
    // to coordinate with native OS resources if needed.
    Ok(())
}
