import { useState, useEffect } from 'react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { IconCode, IconLoader2, IconTool, IconX } from '@tabler/icons-react'
import { ToolWithServer } from '@/hooks/useMCPServers'
import { MCPTool } from '@/types/completion'
import { useTranslation } from '@/i18n/react-i18next-compat'
import { useServiceHub } from '@/hooks/useServiceHub'
import { toast } from 'sonner'

interface MCPServerToolsDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  serverName: string
}

interface ToolWithInputSchema extends Omit<ToolWithServer, 'input_schema'> {
  input_schema: any
  input_schema_formatted?: string
}

export function MCPServerToolsDialog({
  open,
  onOpenChange,
  serverName,
}: MCPServerToolsDialogProps) {
  const { t } = useTranslation()
  const serviceHub = useServiceHub()
  const [tools, setTools] = useState<ToolWithInputSchema[]>([])
  const [loading, setLoading] = useState(false)
  const [selectedTool, setSelectedTool] = useState<ToolWithInputSchema | null>(null)

  useEffect(() => {
    if (open && serverName) {
      fetchServerTools()
    } else {
      setTools([])
      setSelectedTool(null)
    }
  }, [open, serverName])

  const fetchServerTools = async () => {
    setLoading(true)
    try {
      const toolsData = await serviceHub.mcp().getTools(serverName)
      const formattedTools = toolsData.map(tool => ({
        ...tool,
        input_schema_formatted: JSON.stringify(tool.input_schema, null, 2)
      }))
      setTools(formattedTools)
    } catch (error) {
      toast.error(t('mcp-servers:fetchToolsError', { serverName }))
      console.error('Error fetching server tools:', error)
    } finally {
      setLoading(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[80vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <IconTool size={20} />
            {t('mcp-servers:toolsDialogTitle', { serverName })}
          </DialogTitle>
          <DialogDescription>
            {t('mcp-servers:toolsDialogDesc', { serverName })}
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 overflow-hidden flex gap-4">
          {/* Tools List */}
          <div className={`flex-1 ${selectedTool ? 'hidden md:block' : 'block'}`}>
            <div className="border rounded-lg h-full overflow-hidden flex flex-col">
              <div className="p-3 border-b bg-muted/50">
                <h3 className="font-medium text-sm">
                  {t('mcp-servers:toolsList')} ({tools.length})
                </h3>
              </div>

              {loading ? (
                <div className="flex-1 flex items-center justify-center">
                  <IconLoader2 className="animate-spin size-6 text-muted-foreground" />
                </div>
              ) : tools.length === 0 ? (
                <div className="flex-1 flex items-center justify-center text-muted-foreground text-sm">
                  {t('mcp-servers:noToolsFound')}
                </div>
              ) : (
                <div className="flex-1 overflow-y-auto">
                  {tools.map((tool, index) => (
                    <div
                      key={index}
                      className="p-3 border-b hover:bg-muted/50 cursor-pointer transition-colors"
                      onClick={() => setSelectedTool(tool)}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex-1 min-w-0">
                          <h4 className="font-medium text-sm mb-1">{tool.name}</h4>
                          {tool.description && (
                            <p className="text-xs text-muted-foreground line-clamp-2">
                              {tool.description}
                            </p>
                          )}
                        </div>
                        <IconCode size={16} className="text-muted-foreground flex-shrink-0" />
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Tool Details */}
          {selectedTool && (
            <div className={`flex-1 ${selectedTool ? 'block' : 'hidden md:block'}`}>
              <div className="border rounded-lg h-full overflow-hidden flex flex-col">
                <div className="p-3 border-b bg-muted/50 flex items-center justify-between">
                  <h3 className="font-medium text-sm flex items-center gap-2">
                    <IconCode size={16} />
                    {selectedTool.name}
                  </h3>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setSelectedTool(null)}
                    className="md:hidden"
                  >
                    <IconX size={16} />
                  </Button>
                </div>

                <div className="flex-1 overflow-y-auto p-4 space-y-4">
                  {selectedTool.description && (
                    <div>
                      <h4 className="font-medium text-sm mb-2">
                        {t('mcp-servers:toolDescription')}
                      </h4>
                      <p className="text-sm text-muted-foreground">
                        {selectedTool.description}
                      </p>
                    </div>
                  )}

                  <div>
                    <h4 className="font-medium text-sm mb-2">
                      {t('mcp-servers:toolInputSchema')}
                    </h4>
                    <pre className="text-xs bg-muted p-3 rounded-md overflow-x-auto">
                      <code>{selectedTool.input_schema_formatted}</code>
                    </pre>
                  </div>

                  <div>
                    <h4 className="font-medium text-sm mb-2">
                      {t('mcp-servers:toolServer')}
                    </h4>
                    <p className="text-sm text-muted-foreground font-mono">
                      {selectedTool.server}
                    </p>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>

        <div className="flex justify-between items-center pt-4 border-t">
          <div className="text-xs text-muted-foreground">
            {tools.length} {t('mcp-servers:toolsFound')}
          </div>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            {t('common:close')}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}