use super::{ChatMessage, ChatRequest, ChatService};
use std::sync::Once;
use tauri::{Emitter, Runtime};

static CHAT_SERVICE_INIT: Once = Once::new();
static mut CHAT_SERVICE: Option<ChatService> = None;

fn get_chat_service() -> &'static ChatService {
    unsafe {
        CHAT_SERVICE_INIT.call_once(|| {
            CHAT_SERVICE = Some(ChatService::new());
        });
        CHAT_SERVICE.as_ref().unwrap()
    }
}

#[derive(serde::Deserialize)]
pub struct StreamChatRequest {
    pub prompt: String,
    pub provider: String,
    pub model: String,
    pub stream_id: Option<String>,
    pub chat_history: Option<Vec<ChatMessage>>,
}

/// Starts a streaming chat session using the Rig framework.
/// Emits events to the frontend via Tauri events.
#[tauri::command]
pub async fn stream_chat<R: Runtime>(
    app_handle: tauri::AppHandle<R>,
    request: StreamChatRequest,
) -> Result<String, String> {
    let chat_request = ChatRequest {
        prompt: request.prompt,
        provider: request.provider,
        model: request.model,
        stream_id: request.stream_id,
        chat_history: request.chat_history,
    };

    let event_name = "chat-stream";
    let app_handle_clone = app_handle.clone();

    let stream_id = tokio::task::spawn_blocking(move || {
        let chat_service = get_chat_service();

        // Use a blocking runtime for the non-Send future
        let rt = tokio::runtime::Runtime::new()
            .map_err(|e| format!("Failed to create runtime: {}", e))?;

        rt.block_on(async {
            chat_service
                .stream_chat(chat_request, move |event| {
                    let app_handle = app_handle_clone.clone();

                    // Emit the streaming event to the frontend
                    if let Err(e) = app_handle.emit(event_name, event) {
                        eprintln!("Failed to emit chat stream event: {}", e);
                    }
                })
                .await
        })
    })
    .await
    .map_err(|e| format!("Task failed: {}", e))?
    .map_err(|e| format!("Failed to stream chat: {}", e))?;

    Ok(stream_id)
}

/// Performs a non-streaming chat request using the Rig framework.
/// Returns the complete response once it's ready.
#[tauri::command]
pub async fn chat<R: Runtime>(
    _app_handle: tauri::AppHandle<R>,
    request: StreamChatRequest,
) -> Result<serde_json::Value, String> {
    let chat_request = ChatRequest {
        prompt: request.prompt,
        provider: request.provider,
        model: request.model,
        stream_id: request.stream_id,
        chat_history: request.chat_history,
    };

    let response = tokio::task::spawn_blocking(move || {
        let chat_service = get_chat_service();

        // Use a blocking runtime for the non-Send future
        let rt = tokio::runtime::Runtime::new()
            .map_err(|e| format!("Failed to create runtime: {}", e))?;

        rt.block_on(async { chat_service.chat_non_streaming(chat_request).await })
    })
    .await
    .map_err(|e| format!("Task failed: {}", e))?
    .map_err(|e| format!("Failed to chat: {}", e))?;

    Ok(serde_json::to_value(response).map_err(|e| e.to_string())?)
}

/// Cancels an ongoing chat stream by stream ID.
/// Note: This is a placeholder implementation since the rig library doesn't provide direct cancellation.
#[tauri::command]
pub async fn cancel_chat_stream<R: Runtime>(
    _app_handle: tauri::AppHandle<R>,
    stream_id: String,
) -> Result<(), String> {
    // This is a placeholder implementation
    // The rig library doesn't provide direct cancellation capabilities in this version
    // In a real implementation, you would need to track active streams and cancel them

    println!(
        "Cancel chat stream request received for stream_id: {}",
        stream_id
    );
    Ok(())
}
