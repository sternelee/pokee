use super::{ChatMessage, ChatRequest, ChatService};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::env;
use std::sync::Once;
use tauri::{Emitter, Runtime};

/// Set environment variables for AI providers
#[tauri::command]
pub async fn set_provider_env_vars_cmd(
    provider: String,
    api_key: Option<String>,
    base_url: Option<String>,
) -> Result<(), String> {
    set_provider_env_vars(&provider, api_key.as_ref(), base_url.as_ref());
    Ok(())
}

static CHAT_SERVICE_INIT: Once = Once::new();
static mut CHAT_SERVICE: Option<ChatService> = None;

/// Set environment variables for the given provider
fn set_provider_env_vars(provider: &str, api_key: Option<&String>, base_url: Option<&String>) {
    // Set API key environment variable based on provider
    if let Some(key) = api_key {
        match provider {
            "openai" | "openai-compatible" => {
                env::set_var("OPENAI_API_KEY", key);
            }
            "anthropic" => {
                env::set_var("ANTHROPIC_API_KEY", key);
            }
            "openrouter" => {
                env::set_var("OPENROUTER_API_KEY", key);
            }
            _ => {
                // For unknown providers, try generic naming
                env::set_var(format!("{}_API_KEY", provider.to_uppercase()), key);
            }
        }
    }

    // Set base URL if provided
    if let Some(url) = base_url {
        match provider {
            "openai-compatible" => {
                env::set_var("OPENAI_BASE_URL", url);
            }
            "openrouter" => {
                env::set_var("OPENROUTER_BASE_URL", url);
            }
            _ => {
                // For other providers, set generic base URL env var
                env::set_var(format!("{}_BASE_URL", provider.to_uppercase()), url);
            }
        }
    }
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct CompletionTool {
    pub r#type: String,
    pub function: CompletionToolFunction,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct CompletionToolFunction {
    pub name: String,
    pub description: Option<String>,
    pub parameters: serde_json::Value,
    pub strict: Option<bool>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct CompletionMessage {
    pub role: String,
    pub content: Option<String>,
    pub tool_calls: Option<Vec<serde_json::Value>>,
    pub name: Option<String>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct CompletionRequest {
    pub messages: Vec<CompletionMessage>,
    pub model: String,
    pub tools: Option<Vec<CompletionTool>>,
    pub tool_choice: Option<String>,
    pub stream: Option<bool>,
    pub provider: String,
    pub api_key: Option<String>,
    pub base_url: Option<String>,
    pub parameters: Option<HashMap<String, serde_json::Value>>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct CompletionResponse {
    pub id: String,
    pub object: String,
    pub created: u64,
    pub model: String,
    pub choices: Vec<CompletionChoice>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct CompletionChoice {
    pub index: u32,
    pub message: CompletionMessage,
    pub finish_reason: Option<String>,
}

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

/// Enhanced completion command that matches the frontend sendCompletion API
/// This provides a unified interface for chat completions with full parameter support
#[tauri::command]
pub async fn send_completion<R: Runtime>(
    app_handle: tauri::AppHandle<R>,
    request: CompletionRequest,
) -> Result<serde_json::Value, String> {
    // Convert completion request to chat service format
    let chat_messages: Vec<ChatMessage> = request
        .messages
        .iter()
        .map(|msg| ChatMessage {
            role: msg.role.clone(),
            content: msg.content.clone().unwrap_or_default(),
            timestamp: None,
        })
        .collect();

    // Build the prompt from the last user message
    let prompt = request
        .messages
        .iter()
        .rev()
        .find(|msg| msg.role == "user")
        .and_then(|msg| msg.content.clone())
        .unwrap_or_default();

    let chat_request = ChatRequest {
        prompt,
        provider: request.provider.clone(),
        model: request.model.clone(),
        stream_id: None,
        chat_history: Some(chat_messages),
    };

    // Use streaming or non-streaming based on request
    if request.stream.unwrap_or(true) {
        let event_name = "completion-stream";
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
                            eprintln!("Failed to emit completion stream event: {}", e);
                        }
                    })
                    .await
            })
        })
        .await
        .map_err(|e| format!("Task failed: {}", e))?
        .map_err(|e| format!("Failed to stream completion: {}", e))?;

        Ok(serde_json::json!({
            "stream_id": stream_id,
            "status": "streaming"
        }))
    } else {
        let response = tokio::task::spawn_blocking(move || {
            let chat_service = get_chat_service();

            // Use a blocking runtime for the non-Send future
            let rt = tokio::runtime::Runtime::new()
                .map_err(|e| format!("Failed to create runtime: {}", e))?;

            rt.block_on(async { chat_service.chat_non_streaming(chat_request).await })
        })
        .await
        .map_err(|e| format!("Task failed: {}", e))?
        .map_err(|e| format!("Failed to complete: {}", e))?;

        // Convert to OpenAI-like completion response format
        let completion_response = CompletionResponse {
            id: response.stream_id.clone(),
            object: "chat.completion".to_string(),
            created: std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap()
                .as_secs(),
            model: request.model.clone(),
            choices: vec![CompletionChoice {
                index: 0,
                message: CompletionMessage {
                    role: "assistant".to_string(),
                    content: Some(response.content.clone()),
                    tool_calls: None,
                    name: None,
                },
                finish_reason: Some("stop".to_string()),
            }],
        };

        Ok(serde_json::to_value(completion_response).map_err(|e| e.to_string())?)
    }
}
