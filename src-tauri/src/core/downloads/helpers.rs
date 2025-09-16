use super::models::{DownloadEvent, DownloadItem, ProxyConfig, ProgressTracker};
use crate::core::app::commands::get_jan_data_folder_path;
use futures_util::StreamExt;
use jan_utils::normalize_path;
use reqwest::header::{HeaderMap, HeaderName, HeaderValue};
use std::collections::HashMap;
use std::path::Path;
use std::time::Duration;
use tauri::Emitter;
use tokio::fs::File;
use tokio::io::AsyncWriteExt;
use tokio_util::sync::CancellationToken;
use url::Url;

// ===== UTILITY FUNCTIONS =====

pub fn err_to_string<E: std::fmt::Display>(e: E) -> String {
    format!("Error: {}", e)
}


// ===== VALIDATION FUNCTIONS =====

/// Validates a downloaded file against expected hash and size
async fn validate_downloaded_file(
    item: &DownloadItem,
    save_path: &Path,
    app: &tauri::AppHandle,
    cancel_token: &CancellationToken,
) -> Result<(), String> {
    // Skip validation if no verification data is provided
    if item.sha256.is_none() && item.size.is_none() {
        log::debug!(
            "No validation data provided for {}, skipping validation",
            item.url
        );
        return Ok(());
    }

    // Extract model ID from save path for validation events
    // Path structure: models/{modelId}/model.gguf or models/{modelId}/mmproj.gguf
    let model_id = save_path
        .parent() // get parent directory (modelId folder)
        .and_then(|p| p.file_name())
        .and_then(|n| n.to_str())
        .unwrap_or("unknown");

    // Emit validation started event
    app.emit(
        "onModelValidationStarted",
        serde_json::json!({
            "modelId": model_id,
            "downloadType": "Model",
        }),
    )
    .unwrap();

    log::info!("Starting validation for model: {}", model_id);

    // Validate size if provided (fast check first)
    if let Some(expected_size) = &item.size {
        log::info!("Starting size verification for {}", item.url);

        match tokio::fs::metadata(save_path).await {
            Ok(metadata) => {
                let actual_size = metadata.len();

                if actual_size != *expected_size {
                    log::error!(
                        "Size verification failed for {}. Expected: {} bytes, Actual: {} bytes",
                        item.url,
                        expected_size,
                        actual_size
                    );
                    return Err(format!(
                        "Size verification failed. Expected {} bytes but got {} bytes.",
                        expected_size, actual_size
                    ));
                }

                log::info!(
                    "Size verification successful for {} ({} bytes)",
                    item.url,
                    actual_size
                );
            }
            Err(e) => {
                log::error!(
                    "Failed to get file metadata for {}: {}",
                    save_path.display(),
                    e
                );
                return Err(format!("Failed to verify file size: {}", e));
            }
        }
    }

    // Check for cancellation before expensive hash computation
    if cancel_token.is_cancelled() {
        log::info!("Validation cancelled for {}", item.url);
        return Err("Validation cancelled".to_string());
    }

    // Validate hash if provided (expensive check second)
    if let Some(expected_sha256) = &item.sha256 {
        log::info!("Starting Hash verification for {}", item.url);

        match jan_utils::crypto::compute_file_sha256_with_cancellation(save_path, cancel_token).await {
            Ok(computed_sha256) => {
                if computed_sha256 != *expected_sha256 {
                    log::error!(
                        "Hash verification failed for {}. Expected: {}, Computed: {}",
                        item.url,
                        expected_sha256,
                        computed_sha256
                    );

                    return Err(format!(
                        "Hash verification failed. The downloaded file is corrupted or has been tampered with."
                    ));
                }

                log::info!("Hash verification successful for {}", item.url);
            }
            Err(e) => {
                log::error!(
                    "Failed to compute SHA256 for {}: {}",
                    save_path.display(),
                    e
                );
                return Err(format!("Failed to verify file integrity: {}", e));
            }
        }
    }

    log::info!("All validations passed for {}", item.url);
    Ok(())
}

pub fn validate_proxy_config(config: &ProxyConfig) -> Result<(), String> {
    // Validate proxy URL format
    if let Err(e) = Url::parse(&config.url) {
        return Err(format!("Invalid proxy URL '{}': {}", config.url, e));
    }

    // Check if proxy URL has valid scheme
    let url = Url::parse(&config.url).unwrap(); // Safe to unwrap as we just validated it
    match url.scheme() {
        "http" | "https" | "socks4" | "socks5" => {}
        scheme => return Err(format!("Unsupported proxy scheme: {}", scheme)),
    }

    // Validate authentication credentials
    if config.username.is_some() && config.password.is_none() {
        return Err("Username provided without password".to_string());
    }

    if config.password.is_some() && config.username.is_none() {
        return Err("Password provided without username".to_string());
    }

    // Validate no_proxy entries
    if let Some(no_proxy) = &config.no_proxy {
        for entry in no_proxy {
            if entry.is_empty() {
                return Err("Empty no_proxy entry".to_string());
            }
            // Basic validation for wildcard patterns
            if entry.starts_with("*.") && entry.len() < 3 {
                return Err(format!("Invalid wildcard pattern: {}", entry));
            }
        }
    }

    // SSL verification settings are all optional booleans, no validation needed

    Ok(())
}

pub fn create_proxy_from_config(config: &ProxyConfig) -> Result<reqwest::Proxy, String> {
    // Validate the configuration first
    validate_proxy_config(config)?;

    let mut proxy = reqwest::Proxy::all(&config.url).map_err(err_to_string)?;

    // Add authentication if provided
    if let (Some(username), Some(password)) = (&config.username, &config.password) {
        proxy = proxy.basic_auth(username, password);
    }

    Ok(proxy)
}

pub fn should_bypass_proxy(url: &str, no_proxy: &[String]) -> bool {
    if no_proxy.is_empty() {
        return false;
    }

    // Parse the URL to get the host
    let parsed_url = match Url::parse(url) {
        Ok(u) => u,
        Err(_) => return false,
    };

    let host = match parsed_url.host_str() {
        Some(h) => h,
        None => return false,
    };

    // Check if host matches any no_proxy entry
    for entry in no_proxy {
        if entry == "*" {
            return true;
        }

        // Simple wildcard matching
        if entry.starts_with("*.") {
            let domain = &entry[2..];
            if host.ends_with(domain) {
                return true;
            }
        } else if host == entry {
            return true;
        }
    }

    false
}

pub fn _get_client_for_item(
    item: &DownloadItem,
    header_map: &HeaderMap,
) -> Result<reqwest::Client, String> {
    let mut client_builder = reqwest::Client::builder()
        .http2_keep_alive_timeout(Duration::from_secs(15))
        .default_headers(header_map.clone());

    // Add proxy configuration if provided
    if let Some(proxy_config) = &item.proxy {
        // Handle SSL verification settings
        if proxy_config.ignore_ssl.unwrap_or(false) {
            client_builder = client_builder.danger_accept_invalid_certs(true);
            log::info!("SSL certificate verification disabled for URL {}", item.url);
        }

        // Note: reqwest doesn't have fine-grained SSL verification controls
        // for verify_proxy_ssl, verify_proxy_host_ssl, verify_peer_ssl, verify_host_ssl
        // These settings are handled by the underlying TLS implementation

        // Check if this URL should bypass proxy
        let no_proxy = proxy_config.no_proxy.as_deref().unwrap_or(&[]);
        if !should_bypass_proxy(&item.url, no_proxy) {
            let proxy = create_proxy_from_config(proxy_config)?;
            client_builder = client_builder.proxy(proxy);
            log::info!("Using proxy {} for URL {}", proxy_config.url, item.url);
        } else {
            log::info!("Bypassing proxy for URL {}", item.url);
        }
    }

    client_builder.build().map_err(err_to_string)
}

pub fn _convert_headers(
    headers: &HashMap<String, String>,
) -> Result<HeaderMap, Box<dyn std::error::Error>> {
    let mut header_map = HeaderMap::new();
    for (k, v) in headers {
        let key = HeaderName::from_bytes(k.as_bytes())?;
        let value = HeaderValue::from_str(v)?;
        header_map.insert(key, value);
    }
    Ok(header_map)
}

pub async fn _get_file_size(
    client: &reqwest::Client,
    url: &str,
) -> Result<u64, Box<dyn std::error::Error>> {
    let resp = client.head(url).send().await?;
    if !resp.status().is_success() {
        return Err(format!("Failed to get file size: HTTP status {}", resp.status()).into());
    }
    // this is buggy, always return 0 for HEAD request
    // Ok(resp.content_length().unwrap_or(0))

    match resp.headers().get("content-length") {
        Some(value) => {
            let value_str = value.to_str()?;
            let value_u64: u64 = value_str.parse()?;
            Ok(value_u64)
        }
        None => Ok(0),
    }
}

// ===== MAIN DOWNLOAD FUNCTIONS =====

/// Downloads multiple files in parallel with individual progress tracking
pub async fn _download_files_internal(
    app: tauri::AppHandle,
    items: &[DownloadItem],
    headers: &HashMap<String, String>,
    task_id: &str,
    resume: bool,
    cancel_token: CancellationToken,
) -> Result<(), String> {
    log::info!("Start download task: {}", task_id);

    let header_map = _convert_headers(headers).map_err(err_to_string)?;

    // Calculate sizes for each file
    let mut file_sizes = HashMap::new();
    for item in items.iter() {
        let client = _get_client_for_item(item, &header_map).map_err(err_to_string)?;
        let size = _get_file_size(&client, &item.url)
            .await
            .map_err(err_to_string)?;
        file_sizes.insert(item.url.clone(), size);
    }

    let total_size: u64 = file_sizes.values().sum();
    log::info!("Total download size: {}", total_size);

    let evt_name = format!("download-{}", task_id);

    // Create progress tracker
    let progress_tracker = ProgressTracker::new(items, file_sizes.clone());

    // save file under Jan data folder
    let jan_data_folder = get_jan_data_folder_path(app.clone());

    // Collect download tasks for parallel execution
    let mut download_tasks = Vec::new();

    for (index, item) in items.iter().enumerate() {
        let save_path = jan_data_folder.join(&item.save_path);
        let save_path = normalize_path(&save_path);

        if !save_path.starts_with(&jan_data_folder) {
            return Err(format!(
                "Path {} is outside of Jan data folder {}",
                save_path.display(),
                jan_data_folder.display()
            ));
        }

        // Spawn download task for each file
        let item_clone = item.clone();
        let app_clone = app.clone();
        let header_map_clone = header_map.clone();
        let cancel_token_clone = cancel_token.clone();
        let evt_name_clone = evt_name.clone();
        let progress_tracker_clone = progress_tracker.clone();
        let file_id = format!("{}-{}", task_id, index);
        let file_size = file_sizes.get(&item.url).copied().unwrap_or(0);

        let task = tokio::spawn(async move {
            download_single_file(
                app_clone,
                &item_clone,
                &header_map_clone,
                &save_path,
                resume,
                cancel_token_clone,
                evt_name_clone,
                progress_tracker_clone,
                file_id,
                file_size,
            )
            .await
        });

        download_tasks.push(task);
    }

    // Wait for all downloads to complete
    let mut validation_tasks = Vec::new();
    for (task, item) in download_tasks.into_iter().zip(items.iter()) {
        let result = task.await.map_err(|e| format!("Task join error: {}", e))?;

        match result {
            Ok(downloaded_path) => {
                // Spawn validation task in parallel
                let item_clone = item.clone();
                let app_clone = app.clone();
                let path_clone = downloaded_path.clone();
                let cancel_token_clone = cancel_token.clone();
                let validation_task = tokio::spawn(async move {
                    validate_downloaded_file(&item_clone, &path_clone, &app_clone, &cancel_token_clone).await
                });
                validation_tasks.push((validation_task, downloaded_path, item.clone()));
            }
            Err(e) => return Err(e),
        }
    }

    // Wait for all validations to complete
    for (validation_task, save_path, _item) in validation_tasks {
        let validation_result = validation_task
            .await
            .map_err(|e| format!("Validation task join error: {}", e))?;

        if let Err(validation_error) = validation_result {
            // Clean up the file if validation fails
            let _ = tokio::fs::remove_file(&save_path).await;

            // Try to clean up the parent directory if it's empty
            if let Some(parent) = save_path.parent() {
                let _ = tokio::fs::remove_dir(parent).await;
            }

            return Err(validation_error);
        }
    }

    // Emit final progress
    let (transferred, total) = progress_tracker.get_total_progress().await;
    let final_evt = DownloadEvent { transferred, total };
    app.emit(&evt_name, final_evt).unwrap();
    Ok(())
}

/// Downloads a single file without blocking other downloads
async fn download_single_file(
    app: tauri::AppHandle,
    item: &DownloadItem,
    header_map: &HeaderMap,
    save_path: &std::path::Path,
    resume: bool,
    cancel_token: CancellationToken,
    evt_name: String,
    progress_tracker: ProgressTracker,
    file_id: String,
    _file_size: u64,
) -> Result<std::path::PathBuf, String> {
    // Create parent directories if they don't exist
    if let Some(parent) = save_path.parent() {
        if !parent.exists() {
            tokio::fs::create_dir_all(parent)
                .await
                .map_err(err_to_string)?;
        }
    }

    let current_extension = save_path.extension().unwrap_or_default().to_string_lossy();
    let append_extension = |ext: &str| {
        if current_extension.is_empty() {
            ext.to_string()
        } else {
            format!("{}.{}", current_extension, ext)
        }
    };
    let tmp_save_path = save_path.with_extension(append_extension("tmp"));
    let url_save_path = save_path.with_extension(append_extension("url"));

    let mut should_resume = resume
        && tmp_save_path.exists()
        && tokio::fs::read_to_string(&url_save_path)
            .await
            .map(|url| url == item.url) // check if we resume the same URL
            .unwrap_or(false);

    tokio::fs::write(&url_save_path, item.url.clone())
        .await
        .map_err(err_to_string)?;

    log::info!("Started downloading: {}", item.url);
    let client = _get_client_for_item(item, &header_map).map_err(err_to_string)?;
    let mut download_delta = 0u64;
    let mut initial_progress = 0u64;

    let resp = if should_resume {
        let downloaded_size = tmp_save_path.metadata().map_err(err_to_string)?.len();
        match _get_maybe_resume(&client, &item.url, downloaded_size).await {
            Ok(resp) => {
                log::info!(
                    "Resume download: {}, already downloaded {} bytes",
                    item.url,
                    downloaded_size
                );
                initial_progress = downloaded_size;

                // Initialize progress for resumed download
                progress_tracker
                    .update_progress(&file_id, downloaded_size)
                    .await;

                // Emit initial combined progress
                let (combined_transferred, combined_total) =
                    progress_tracker.get_total_progress().await;
                let evt = DownloadEvent {
                    transferred: combined_transferred,
                    total: combined_total,
                };
                app.emit(&evt_name, evt).unwrap();

                resp
            }
            Err(e) => {
                // fallback to normal download
                log::warn!("Failed to resume download: {}", e);
                should_resume = false;
                _get_maybe_resume(&client, &item.url, 0).await?
            }
        }
    } else {
        _get_maybe_resume(&client, &item.url, 0).await?
    };
    let mut stream = resp.bytes_stream();

    let file = if should_resume {
        // resume download, append to existing file
        tokio::fs::OpenOptions::new()
            .write(true)
            .append(true)
            .open(&tmp_save_path)
            .await
            .map_err(err_to_string)?
    } else {
        // start new download, create a new file
        File::create(&tmp_save_path).await.map_err(err_to_string)?
    };
    let mut writer = tokio::io::BufWriter::new(file);
    let mut total_transferred = initial_progress;

    // write chunk to file
    while let Some(chunk) = stream.next().await {
        if cancel_token.is_cancelled() {
            if !should_resume {
                tokio::fs::remove_dir_all(&save_path.parent().unwrap())
                    .await
                    .ok();
            }
            log::info!("Download cancelled: {}", item.url);
            return Err("Download cancelled".to_string());
        }

        let chunk = chunk.map_err(err_to_string)?;
        writer.write_all(&chunk).await.map_err(err_to_string)?;
        download_delta += chunk.len() as u64;
        total_transferred += chunk.len() as u64;

        // Update progress every 10 MB
        if download_delta >= 10 * 1024 * 1024 {
            // Update individual file progress
            progress_tracker
                .update_progress(&file_id, total_transferred)
                .await;

            // Emit combined progress event
            let (combined_transferred, combined_total) =
                progress_tracker.get_total_progress().await;
            let evt = DownloadEvent {
                transferred: combined_transferred,
                total: combined_total,
            };
            app.emit(&evt_name, evt).unwrap();

            download_delta = 0u64;
        }
    }

    writer.flush().await.map_err(err_to_string)?;

    // Final progress update for this file
    progress_tracker
        .update_progress(&file_id, total_transferred)
        .await;

    // Emit final combined progress
    let (combined_transferred, combined_total) = progress_tracker.get_total_progress().await;
    let evt = DownloadEvent {
        transferred: combined_transferred,
        total: combined_total,
    };
    app.emit(&evt_name, evt).unwrap();

    // rename tmp file to final file
    tokio::fs::rename(&tmp_save_path, &save_path)
        .await
        .map_err(err_to_string)?;
    tokio::fs::remove_file(&url_save_path)
        .await
        .map_err(err_to_string)?;

    log::info!("Finished downloading: {}", item.url);
    Ok(save_path.to_path_buf())
}

// ===== HTTP CLIENT HELPER FUNCTIONS =====

pub async fn _get_maybe_resume(
    client: &reqwest::Client,
    url: &str,
    start_bytes: u64,
) -> Result<reqwest::Response, String> {
    if start_bytes > 0 {
        let resp = client
            .get(url)
            .header("Range", format!("bytes={}-", start_bytes))
            .send()
            .await
            .map_err(err_to_string)?;
        if resp.status() != reqwest::StatusCode::PARTIAL_CONTENT {
            return Err(format!(
                "Failed to resume download: HTTP status {}, {}",
                resp.status(),
                resp.text().await.unwrap_or_default()
            ));
        }
        Ok(resp)
    } else {
        let resp = client.get(url).send().await.map_err(err_to_string)?;
        if !resp.status().is_success() {
            return Err(format!(
                "Failed to download: HTTP status {}, {}",
                resp.status(),
                resp.text().await.unwrap_or_default()
            ));
        }
        Ok(resp)
    }
}
