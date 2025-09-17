use futures_util::StreamExt;
use serde::{Deserialize, Serialize};
pub mod commands;

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct ChatMessage {
    pub role: String,
    pub content: String,
    pub timestamp: Option<u64>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct ChatRequest {
    pub prompt: String,
    pub provider: String,
    pub model: String,
    pub stream_id: Option<String>,
    pub chat_history: Option<Vec<ChatMessage>>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct ChatStreamEvent {
    pub stream_id: String,
    pub content: String,
    pub event_type: String,
    pub is_final: bool,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct ChatResponse {
    pub stream_id: String,
    pub content: String,
    pub status: String,
}

pub struct ChatService {
    client: rig::client::builder::DynClientBuilder,
}

impl ChatService {
    pub fn new() -> Self {
        Self {
            client: rig::client::builder::DynClientBuilder::new(),
        }
    }

    fn convert_to_rig_chat_history(
        &self,
        history: &Option<Vec<ChatMessage>>,
    ) -> Vec<rig::completion::Message> {
        let mut messages = Vec::new();

        if let Some(history_messages) = history {
            for msg in history_messages {
                let rig_message = match msg.role.as_str() {
                    "user" => rig::completion::Message::user(msg.content.clone()),
                    "assistant" => rig::completion::Message::assistant(msg.content.clone()),
                    "system" => rig::completion::Message::user(msg.content.clone()), // system messages as user in rig
                    _ => rig::completion::Message::user(msg.content.clone()),        // fallback
                };
                messages.push(rig_message);
            }
        }

        messages
    }

    pub async fn stream_chat(
        &self,
        request: ChatRequest,
        emit_callback: impl Fn(ChatStreamEvent) + Send + 'static,
    ) -> Result<String, Box<dyn std::error::Error + Send + Sync>> {
        let stream_id = request
            .stream_id
            .unwrap_or_else(|| uuid::Uuid::new_v4().to_string());
        let callback = Box::new(emit_callback);

        let chat_history = self.convert_to_rig_chat_history(&request.chat_history);

        let mut stream = self
            .client
            .stream_chat(
                &request.provider,
                &request.model,
                request.prompt,
                chat_history,
            )
            .await?;

        // Send initial event
        callback(ChatStreamEvent {
            stream_id: stream_id.clone(),
            content: String::new(),
            event_type: "start".to_string(),
            is_final: false,
        });

        let mut full_content = String::new();

        while let Some(chunk) = stream.next().await {
            match chunk {
                Ok(rig::streaming::StreamedAssistantContent::Text(text)) => {
                    full_content.push_str(&text.text);
                    callback(ChatStreamEvent {
                        stream_id: stream_id.clone(),
                        content: text.text,
                        event_type: "text".to_string(),
                        is_final: false,
                    });
                }
                Ok(rig::streaming::StreamedAssistantContent::Reasoning(reasoning)) => {
                    let reasoning_text = reasoning.reasoning.join("");
                    callback(ChatStreamEvent {
                        stream_id: stream_id.clone(),
                        content: reasoning_text,
                        event_type: "reasoning".to_string(),
                        is_final: false,
                    });
                }
                Ok(rig::streaming::StreamedAssistantContent::ToolCall(tool_call)) => {
                    let tool_info = serde_json::to_string(&tool_call)
                        .unwrap_or_else(|_| "Unknown tool call".to_string());
                    callback(ChatStreamEvent {
                        stream_id: stream_id.clone(),
                        content: tool_info,
                        event_type: "tool_call".to_string(),
                        is_final: false,
                    });
                }
                Ok(rig::streaming::StreamedAssistantContent::Final(_)) => {
                    callback(ChatStreamEvent {
                        stream_id: stream_id.clone(),
                        content: String::new(),
                        event_type: "complete".to_string(),
                        is_final: true,
                    });
                    break;
                }
                Err(e) => {
                    callback(ChatStreamEvent {
                        stream_id: stream_id.clone(),
                        content: e.to_string(),
                        event_type: "error".to_string(),
                        is_final: true,
                    });
                    return Err(e.into());
                }
            }
        }

        Ok(stream_id)
    }

    pub async fn chat_non_streaming(
        &self,
        request: ChatRequest,
    ) -> Result<ChatResponse, Box<dyn std::error::Error + Send + Sync>> {
        let stream_id = request
            .stream_id
            .unwrap_or_else(|| uuid::Uuid::new_v4().to_string());

        let chat_history = self.convert_to_rig_chat_history(&request.chat_history);

        let mut stream = self
            .client
            .stream_chat(
                &request.provider,
                &request.model,
                request.prompt,
                chat_history,
            )
            .await?;

        let mut full_content = String::new();

        while let Some(chunk) = stream.next().await {
            match chunk {
                Ok(rig::streaming::StreamedAssistantContent::Text(text)) => {
                    full_content.push_str(&text.text);
                }
                Ok(rig::streaming::StreamedAssistantContent::Final(_)) => {
                    break;
                }
                Err(e) => {
                    return Err(e.into());
                }
                _ => {}
            }
        }

        Ok(ChatResponse {
            stream_id,
            content: full_content,
            status: "completed".to_string(),
        })
    }
}

impl Default for ChatService {
    fn default() -> Self {
        Self::new()
    }
}

impl ChatMessage {
    pub fn new_user(content: String) -> Self {
        Self {
            role: "user".to_string(),
            content,
            timestamp: Some(
                std::time::SystemTime::now()
                    .duration_since(std::time::UNIX_EPOCH)
                    .unwrap()
                    .as_secs(),
            ),
        }
    }

    pub fn new_assistant(content: String) -> Self {
        Self {
            role: "assistant".to_string(),
            content,
            timestamp: Some(
                std::time::SystemTime::now()
                    .duration_since(std::time::UNIX_EPOCH)
                    .unwrap()
                    .as_secs(),
            ),
        }
    }

    pub fn new_system(content: String) -> Self {
        Self {
            role: "system".to_string(),
            content,
            timestamp: Some(
                std::time::SystemTime::now()
                    .duration_since(std::time::UNIX_EPOCH)
                    .unwrap()
                    .as_secs(),
            ),
        }
    }
}
