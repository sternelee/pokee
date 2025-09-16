use std::collections::HashMap;
use std::sync::Arc;
use tauri::{AppHandle, Runtime, State};
use tokio::sync::Mutex;

use crate::core::server::proxy::{self, BackendSession};
use crate::core::state::AppState;

#[tauri::command]
pub async fn start_server<R: Runtime>(
    _app_handle: AppHandle<R>,
    state: State<'_, AppState>,
    host: String,
    port: u16,
    prefix: String,
    api_key: String,
    trusted_hosts: Vec<String>,
    proxy_timeout: u64,
) -> Result<bool, String> {
    let server_handle = state.server_handle.clone();
    // Create empty sessions map since we don't have llamacpp plugin anymore
    let sessions: Arc<Mutex<HashMap<i32, BackendSession>>> = Arc::new(Mutex::new(HashMap::new()));

    proxy::start_server(
        server_handle,
        sessions,
        host,
        port,
        prefix,
        api_key,
        vec![trusted_hosts],
        proxy_timeout,
    )
    .await
    .map_err(|e| e.to_string())?;
    Ok(true)
}

#[tauri::command]
pub async fn stop_server(state: State<'_, AppState>) -> Result<(), String> {
    let server_handle = state.server_handle.clone();

    proxy::stop_server(server_handle)
        .await
        .map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub async fn get_server_status(state: State<'_, AppState>) -> Result<bool, String> {
    let server_handle = state.server_handle.clone();

    Ok(proxy::is_server_running(server_handle).await)
}
