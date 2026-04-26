use chrono::Local;
use serde_json::Value;
use std::fs::{self, OpenOptions};
use std::io::{self, BufRead, Write};
use std::path::PathBuf;
use tauri::Manager;

fn log_dir(app: &tauri::AppHandle) -> PathBuf {
    app.path()
        .app_data_dir()
        .expect("app_data_dir unavailable")
        .join("logs")
}

#[tauri::command]
pub fn write_local_log(app: tauri::AppHandle, entry: Value) -> Result<(), String> {
    let dir = log_dir(&app);
    fs::create_dir_all(&dir).map_err(|e| e.to_string())?;

    let filename = format!("{}.jsonl", Local::now().format("%Y-%m-%d"));
    let path = dir.join(filename);

    let line = serde_json::to_string(&entry).map_err(|e| e.to_string())?;

    let mut file = OpenOptions::new()
        .create(true)
        .append(true)
        .open(&path)
        .map_err(|e| e.to_string())?;

    writeln!(file, "{}", line).map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub fn read_local_logs(app: tauri::AppHandle, date: String) -> Result<Vec<String>, String> {
    let dir = log_dir(&app);
    let path = dir.join(format!("{}.jsonl", date));

    if !path.exists() {
        return Ok(vec![]);
    }

    let file = fs::File::open(&path).map_err(|e| e.to_string())?;
    let reader = io::BufReader::new(file);
    let lines: Vec<String> = reader
        .lines()
        .filter_map(|l| l.ok())
        .filter(|l| !l.trim().is_empty())
        .collect();

    Ok(lines)
}
