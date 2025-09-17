use tauri::{AppHandle, Runtime, State};

use crate::core::state::AppState;

#[tauri::command]
pub async fn start_server<R: Runtime>(
    _app_handle: AppHandle<R>,
    _state: State<'_, AppState>,
    _host: String,
    _port: u16,
    _prefix: String,
    _api_key: String,
    _trusted_hosts: Vec<String>,
    _proxy_timeout: u64,
) -> Result<bool, String> {
    // Server functionality has been removed due to hyper dependency removal
    // This is a placeholder that returns false to indicate server is not started
    log::warn!("Server functionality has been disabled");
    Ok(false)
}

#[tauri::command]
pub async fn stop_server(_state: State<'_, AppState>) -> Result<(), String> {
    // Server functionality has been removed
    log::warn!("Server functionality has been disabled");
    Ok(())
}

#[tauri::command]
pub async fn get_server_status(_state: State<'_, AppState>) -> Result<bool, String> {
    // Server functionality has been removed
    log::warn!("Server functionality has been disabled");
    Ok(false)
}