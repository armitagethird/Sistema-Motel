mod commands;

use commands::{auth, db, logger, stone, sync};
use tauri::Manager;
use tauri_plugin_autostart::{ManagerExt, MacosLauncher};

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_process::init())
        .plugin(tauri_plugin_autostart::init(
            MacosLauncher::LaunchAgent,
            Some(vec![]),
        ))
        .setup(|app| {
            if let Ok(data_dir) = app.path().app_data_dir() {
                let _ = std::fs::create_dir_all(data_dir.join("logs"));
            }
            let autostart = app.autolaunch();
            if let Ok(false) = autostart.is_enabled() {
                let _ = autostart.enable();
            }
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            // DB (SQLite offline)
            db::db_get_suites,
            db::db_sync_suites,
            db::db_enqueue_operation,
            db::db_get_pending_operations,
            db::db_mark_synced,
            // Stone payments
            stone::stone_create_order,
            stone::stone_cancel_order,
            // Auth
            auth::auth_logout,
            auth::auth_notify_void,
            auth::auth_notify_overtime,
            auth::auth_notify_pernoite_close,
            // Sync
            sync::sync_all,
            // Logger
            logger::write_local_log,
            logger::read_local_logs,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
