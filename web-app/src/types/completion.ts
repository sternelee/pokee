/* stylelint-disable @typescript-eslint/no-explicit-any */
/**
 * MCP Tool schema
 * This schema defines the structure of an MCP tool.
 */
export type MCPTool = {
  name: string
  description: string
  inputSchema: Record<string, unknown>
  server: string
}

export type ChatCompletionMessageToolCall = {
  id: string
  function: ToolFunction
  type: 'function'
}
interface ToolFunction {
  name: string
  arguments: string // JSON 字符串，运行时如需对象可再 JSON.parse
}
