#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use std::fs;
use std::path::PathBuf;
use std::sync::Mutex;

use tauri::{AppHandle, Emitter, Manager, RunEvent, State};

/// Files macOS asked us to open (Finder double-click, "Open With", Dock drop)
/// that the frontend hasn't picked up yet.
#[derive(Default)]
struct PendingFiles(Mutex<Vec<String>>);

fn app_data_path(app: &AppHandle, name: &str) -> Result<PathBuf, String> {
    if name.contains('/') || name.contains("..") {
        return Err("invalid name".into());
    }
    let dir = app.path().app_data_dir().map_err(|e| e.to_string())?;
    fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    Ok(dir.join(name))
}

#[tauri::command]
fn read_text_file(path: String) -> Result<String, String> {
    fs::read_to_string(&path).map_err(|e| e.to_string())
}

#[tauri::command]
fn write_text_file(path: String, contents: String) -> Result<(), String> {
    fs::write(&path, contents).map_err(|e| e.to_string())
}

#[tauri::command]
fn write_binary_file(path: String, contents: Vec<u8>) -> Result<(), String> {
    fs::write(&path, contents).map_err(|e| e.to_string())
}

#[tauri::command]
fn load_app_data(app: AppHandle, name: String) -> Result<Option<String>, String> {
    let path = app_data_path(&app, &name)?;
    match fs::read_to_string(path) {
        Ok(text) => Ok(Some(text)),
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => Ok(None),
        Err(e) => Err(e.to_string()),
    }
}

#[tauri::command]
fn save_app_data(app: AppHandle, name: String, contents: String) -> Result<(), String> {
    let path = app_data_path(&app, &name)?;
    // Write to a temp file first so a crash mid-write can't corrupt the session.
    let tmp = path.with_extension("tmp");
    fs::write(&tmp, contents).map_err(|e| e.to_string())?;
    fs::rename(&tmp, &path).map_err(|e| e.to_string())
}

#[tauri::command]
fn take_pending_files(pending: State<PendingFiles>) -> Vec<String> {
    std::mem::take(&mut *pending.0.lock().unwrap())
}

fn main() {
    let app = tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        .manage(PendingFiles::default())
        .invoke_handler(tauri::generate_handler![
            read_text_file,
            write_text_file,
            write_binary_file,
            load_app_data,
            save_app_data,
            take_pending_files,
        ])
        .build(tauri::generate_context!())
        .expect("error while building Excalidraw");

    app.run(|handle, event| {
        #[cfg(target_os = "macos")]
        if let RunEvent::Opened { urls } = event {
            let paths = urls
                .into_iter()
                .filter_map(|url| url.to_file_path().ok())
                .map(|path| path.to_string_lossy().into_owned());
            handle.state::<PendingFiles>().0.lock().unwrap().extend(paths);
            let _ = handle.emit("open-files", ());
        }
        #[cfg(not(target_os = "macos"))]
        let _ = (handle, event);
    });
}
