/* eslint-disable @typescript-eslint/no-explicit-any */
import {
  ContentType,
  ChatCompletionRole,
  ThreadMessage,
  MessageStatus,
  chatCompletion,
  chatCompletionChunk,
  EngineManager,
  ModelManager,
  Tool,
} from '@janhq/core'
import { invoke } from '@tauri-apps/api/core'
import { Event, listen } from '@tauri-apps/api/event'
import {
  ChatCompletionMessageParam,
  CompletionResponse,
  StreamCompletionResponse,
  ChatCompletionTool,
  CompletionResponseChunk,
} from 'token.js'
import { ulid } from 'ulidx'
import { MCPTool, ChatCompletionMessageToolCall } from '@/types/completion'
import { CompletionMessagesBuilder } from './messages'
import { getServiceHub } from '@/hooks/useServiceHub'
import { useAppState } from '@/hooks/useAppState'

export type ChatCompletionResponse =
  | chatCompletion
  | AsyncIterable<chatCompletionChunk>
  | StreamCompletionResponse
  | CompletionResponse

/**
 * Tauri-based completion function that uses the backend AI service
 * This replaces the direct TokenJS calls with Tauri backend calls
 */
export const sendTauriCompletion = async (
  thread: Thread,
  provider: ModelProvider,
  messages: ChatCompletionMessageParam[],
  abortController: AbortController,
  tools: MCPTool[] = [],
  stream: boolean = true,
  params: Record<string, object> = {}
): Promise<ChatCompletionResponse | undefined> => {
  if (!thread?.model?.id || !provider) return undefined

  try {
    // Convert frontend messages to Tauri completion request format
    const tauriMessages = messages.map((msg) => {
      // Handle different message types
      const content =
        typeof msg.content === 'string'
          ? msg.content
          : Array.isArray(msg.content)
            ? JSON.stringify(msg.content)
            : ''

      // Handle tool calls for assistant messages
      const toolCalls =
        'tool_calls' in msg && msg.tool_calls
          ? msg.tool_calls.map((toolCall: any) => ({
              id: toolCall.id,
              type: toolCall.type,
              function: toolCall.function,
            }))
          : undefined

      // Handle name for function messages
      const name = 'name' in msg ? msg.name : undefined

      return {
        role: msg.role,
        content,
        tool_calls: toolCalls,
        name,
      }
    })

    // Convert tools to Tauri format
    const tauriTools = tools.map((tool) => ({
      type: 'function',
      function: {
        name: tool.name,
        description: tool.description?.slice(0, 1024),
        parameters: tool.inputSchema,
        strict: false,
      },
    }))

    const completionRequest = {
      messages: tauriMessages,
      model: thread.model.id,
      tools: tauriTools.length > 0 ? tauriTools : undefined,
      tool_choice: tools.length > 0 ? 'auto' : undefined,
      stream,
      provider: provider.provider,
      api_key: provider.api_key,
      base_url: provider.base_url,
      parameters: params,
    }

    if (stream) {
      const eventName = 'completion-stream'
      const chunks: any[] = []
      let isComplete = false
      let unlisten: (() => void) | null = null

      try {
        // Set up event listener BEFORE invoking the completion
        unlisten = await listen(eventName, (event: Event<any>) => {
          const payload = event.payload
          console.log('Received streaming event:', payload)

          if (payload && payload.content && payload.event_type === 'text') {
            // Create a chunk similar to chatCompletionChunk
            const chunk = {
              id: Date.now().toString(),
              object: 'chat.completion.chunk',
              created: Math.floor(Date.now() / 1000),
              model: thread.model?.id || 'unknown',
              choices: [
                {
                  index: 0,
                  delta: { content: payload.content },
                  finish_reason: null,
                },
              ],
            }
            chunks.push(chunk)
          } else if (payload && (payload.status === 200 || payload.is_final === true)) {
            isComplete = true
          }
        })

        // Call the completion API
        const response = await invoke<{ request_id: number; status: string }>('send_completion', {
          request: completionRequest,
        })

        console.log('Completion response:', response)

        // Create a simpler async iterator that yields chunks as they arrive
        return {
          async *[Symbol.asyncIterator]() {
            let yieldedIndex = 0

            while (!isComplete || yieldedIndex < chunks.length) {
              // Check if aborted
              if (abortController.signal.aborted) {
                break
              }

              if (yieldedIndex < chunks.length) {
                yield chunks[yieldedIndex]
                yieldedIndex++
              } else if (!isComplete) {
                // Wait a bit for new chunks
                await new Promise((resolve) => setTimeout(resolve, 50))
              } else {
                // No more chunks and stream is complete
                break
              }
            }
          },
        } as AsyncIterable<chatCompletionChunk>
      } catch (error) {
        console.error('Streaming error:', error)
        throw error
      } finally {
        if (unlisten) unlisten()
      }
    } else {
      // Handle non-streaming completion
      const response = await invoke<CompletionResponse>('send_completion', {
        request: completionRequest,
      })
      return response
    }
  } catch (error) {
    console.error('Tauri completion error:', error)
    throw error
  }
}

/**
 * @fileoverview Helper functions for creating thread content.
 * These functions are used to create thread content objects
 * for different types of content, such as text and image.
 * The functions return objects that conform to the `ThreadContent` type.
 * @param content - The content of the thread
 * @returns
 */
export const newUserThreadContent = (
  threadId: string,
  content: string,
  attachments?: Array<{
    name: string
    type: string
    size: number
    base64: string
    dataUrl: string
  }>
): ThreadMessage => {
  const contentParts = [
    {
      type: ContentType.Text,
      text: {
        value: content,
        annotations: [],
      },
    },
  ]

  // Add attachments to content array
  if (attachments) {
    attachments.forEach((attachment) => {
      if (attachment.type.startsWith('image/')) {
        contentParts.push({
          type: ContentType.Image,
          image_url: {
            url: `data:${attachment.type};base64,${attachment.base64}`,
            detail: 'auto',
          },
        } as any)
      }
    })
  }

  return {
    type: 'text',
    role: ChatCompletionRole.User,
    content: contentParts,
    id: ulid(),
    object: 'thread.message',
    thread_id: threadId,
    status: MessageStatus.Ready,
    created_at: 0,
    completed_at: 0,
  }
}
/**
 * @fileoverview Helper functions for creating thread content.
 * These functions are used to create thread content objects
 * for different types of content, such as text and image.
 * The functions return objects that conform to the `ThreadContent` type.
 * @param content - The content of the thread
 * @returns
 */
export const newAssistantThreadContent = (
  threadId: string,
  content: string,
  metadata: Record<string, unknown> = {}
): ThreadMessage => ({
  type: 'text',
  role: ChatCompletionRole.Assistant,
  content: [
    {
      type: ContentType.Text,
      text: {
        value: content,
        annotations: [],
      },
    },
  ],
  id: ulid(),
  object: 'thread.message',
  thread_id: threadId,
  status: MessageStatus.Ready,
  created_at: 0,
  completed_at: 0,
  metadata,
})

/**
 * Empty thread content object.
 * @returns
 */
export const emptyThreadContent: ThreadMessage = {
  type: 'text',
  role: ChatCompletionRole.Assistant,
  id: ulid(),
  object: 'thread.message',
  thread_id: '',
  content: [],
  status: MessageStatus.Ready,
  created_at: 0,
  completed_at: 0,
}

/**
 * @fileoverview Helper function to send a completion request to the model provider.
 * This function now uses the Tauri backend AI service instead of direct API calls
 * @param thread
 * @param provider
 * @param messages
 * @returns
 */
export const sendCompletion = async (
  thread: Thread,
  provider: ModelProvider,
  messages: ChatCompletionMessageParam[],
  abortController: AbortController,
  tools: MCPTool[] = [],
  stream: boolean = true,
  params: Record<string, object> = {}
): Promise<ChatCompletionResponse | undefined> => {
  if (!thread?.model?.id || !provider) return undefined

  // Use the Tauri backend completion service
  return sendTauriCompletion(
    thread,
    provider,
    messages,
    abortController,
    tools,
    stream,
    params
  )
}

export const isCompletionResponse = (
  response: ChatCompletionResponse
): response is CompletionResponse | chatCompletion => {
  return 'choices' in response
}

/**
 * @fileoverview Helper function to stop a model.
 * This function unloads the model from the provider.
 * @param provider
 * @param model
 * @returns
 */
export const stopModel = async (
  provider: string,
  model: string
): Promise<void> => {
  const providerObj = EngineManager.instance().get(provider)
  const modelObj = ModelManager.instance().get(model)
  if (providerObj && modelObj) return providerObj?.unload(model).then(() => {})
}

/**
 * @fileoverview Helper function to normalize tools for the chat completion request.
 * This function converts the MCPTool objects to ChatCompletionTool objects.
 * @param tools
 * @returns
 */
export const normalizeTools = (
  tools: MCPTool[]
): ChatCompletionTool[] | Tool[] | undefined => {
  if (tools.length === 0) return undefined
  return tools.map((tool) => ({
    type: 'function',
    function: {
      name: tool.name,
      description: tool.description?.slice(0, 1024),
      parameters: tool.inputSchema,
      strict: false,
    },
  }))
}

/**
 * @fileoverview Helper function to extract tool calls from the completion response.
 * @param part
 * @param calls
 */
export const extractToolCall = (
  part: chatCompletionChunk | CompletionResponseChunk,
  currentCall: ChatCompletionMessageToolCall | null,
  calls: ChatCompletionMessageToolCall[]
) => {
  const deltaToolCalls = part.choices[0].delta.tool_calls
  // Handle the beginning of a new tool call
  if (deltaToolCalls?.[0]?.index !== undefined && deltaToolCalls[0]?.function) {
    const index = deltaToolCalls[0].index

    // Create new tool call if this is the first chunk for it
    if (!calls[index]) {
      calls[index] = {
        id: deltaToolCalls[0]?.id || ulid(),
        function: {
          name: deltaToolCalls[0]?.function?.name || '',
          arguments: deltaToolCalls[0]?.function?.arguments || '',
        },
        type: 'function',
      }
      currentCall = calls[index]
    } else {
      // Continuation of existing tool call
      currentCall = calls[index]

      // Append to function name or arguments if they exist in this chunk
      if (
        deltaToolCalls[0]?.function?.name &&
        currentCall!.function.name !== deltaToolCalls[0]?.function?.name
      ) {
        currentCall!.function.name += deltaToolCalls[0].function.name
      }

      if (deltaToolCalls[0]?.function?.arguments) {
        currentCall!.function.arguments += deltaToolCalls[0].function.arguments
      }
    }
  }
  return calls
}

/**
 * @fileoverview Helper function to process the completion response.
 * @param calls
 * @param builder
 * @param message
 * @param abortController
 * @param approvedTools
 * @param showModal
 * @param allowAllMCPPermissions
 */
export const postMessageProcessing = async (
  calls: ChatCompletionMessageToolCall[],
  builder: CompletionMessagesBuilder,
  message: ThreadMessage,
  abortController: AbortController,
  approvedTools: Record<string, string[]> = {},
  showModal?: (
    toolName: string,
    threadId: string,
    toolParameters?: object
  ) => Promise<boolean>,
  allowAllMCPPermissions: boolean = false
) => {
  // Handle completed tool calls
  if (calls.length) {
    for (const toolCall of calls) {
      if (abortController.signal.aborted) break
      const toolId = ulid()
      const toolCallsMetadata =
        message.metadata?.tool_calls &&
        Array.isArray(message.metadata?.tool_calls)
          ? message.metadata?.tool_calls
          : []
      message.metadata = {
        ...(message.metadata ?? {}),
        tool_calls: [
          ...toolCallsMetadata,
          {
            tool: {
              ...(toolCall as object),
              id: toolId,
            },
            response: undefined,
            state: 'pending',
          },
        ],
      }

      // Check if tool is approved or show modal for approval
      let toolParameters = {}
      if (toolCall.function.arguments.length) {
        try {
          console.log('Raw tool arguments:', toolCall.function.arguments)
          toolParameters = JSON.parse(toolCall.function.arguments)
          console.log('Parsed tool parameters:', toolParameters)
        } catch (error) {
          console.error('Failed to parse tool arguments:', error)
          console.error(
            'Raw arguments that failed:',
            toolCall.function.arguments
          )
        }
      }
      const approved =
        allowAllMCPPermissions ||
        approvedTools[message.thread_id]?.includes(toolCall.function.name) ||
        (showModal
          ? await showModal(
              toolCall.function.name,
              message.thread_id,
              toolParameters
            )
          : true)

      const { promise, cancel } = getServiceHub()
        .mcp()
        .callToolWithCancellation({
          toolName: toolCall.function.name,
          arguments: toolCall.function.arguments.length ? toolParameters : {},
        })

      useAppState.getState().setCancelToolCall(cancel)

      let result = approved
        ? await promise.catch((e) => {
            console.error('Tool call failed:', e)
            return {
              content: [
                {
                  type: 'text',
                  text: `Error calling tool ${toolCall.function.name}: ${e.message ?? e}`,
                },
              ],
              error: true,
            }
          })
        : {
            content: [
              {
                type: 'text',
                text: 'The user has chosen to disallow the tool call.',
              },
            ],
          }

      if (typeof result === 'string') {
        result = {
          content: [
            {
              type: 'text',
              text: result,
            },
          ],
        }
      }

      message.metadata = {
        ...(message.metadata ?? {}),
        tool_calls: [
          ...toolCallsMetadata,
          {
            tool: {
              ...toolCall,
              id: toolId,
            },
            response: result,
            state: 'ready',
          },
        ],
      }
      builder.addToolMessage(result.content[0]?.text ?? '', toolCall.id)
      // update message metadata
    }
    return message
  }
}
