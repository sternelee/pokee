import { useState, useEffect } from 'react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import {
  IconPlus,
  IconTrash,
  IconGripVertical,
  IconCodeDots,
} from '@tabler/icons-react'
import { MCPServerConfig } from '@/hooks/useMCPServers'
import { useTranslation } from '@/i18n/react-i18next-compat'
import {
  DndContext,
  closestCenter,
  useSensor,
  useSensors,
  PointerSensor,
  KeyboardSensor,
} from '@dnd-kit/core'
import {
  SortableContext,
  verticalListSortingStrategy,
  arrayMove,
  useSortable,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { cn } from '@/lib/utils'
import CodeEditor from '@uiw/react-textarea-code-editor'
import '@uiw/react-textarea-code-editor/dist.css'

// Sortable argument item component
function SortableArgItem({
  id,
  value,
  onChange,
  onRemove,
  canRemove,
  placeholder,
}: {
  id: number
  value: string
  onChange: (value: string) => void
  onRemove: () => void
  canRemove: boolean
  placeholder: string
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id })

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  }

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={cn(
        'flex items-center gap-2 mb-2',
        isDragging ? 'z-10' : 'z-0'
      )}
    >
      <div
        {...attributes}
        {...listeners}
        className="size-6 cursor-move flex items-center justify-center rounded hover:bg-main-view-fg/10 transition-all duration-200 ease-in-out"
      >
        <IconGripVertical size={18} className="text-main-view-fg/60" />
      </div>
      <Input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="flex-1"
      />
      {canRemove && (
        <div
          className="size-6 cursor-pointer flex items-center justify-center rounded hover:bg-main-view-fg/10 transition-all duration-200 ease-in-out"
          onClick={onRemove}
        >
          <IconTrash size={18} className="text-destructive" />
        </div>
      )}
    </div>
  )
}

interface AddEditMCPServerProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  editingKey: string | null
  initialData?: MCPServerConfig
  onSave: (name: string, config: MCPServerConfig) => void
}

export default function AddEditMCPServer({
  open,
  onOpenChange,
  editingKey,
  initialData,
  onSave,
}: AddEditMCPServerProps) {
  const { t } = useTranslation()
  const [serverName, setServerName] = useState('')
  const [command, setCommand] = useState('')
  const [args, setArgs] = useState<string[]>([''])
  const [envKeys, setEnvKeys] = useState<string[]>([''])
  const [envValues, setEnvValues] = useState<string[]>([''])
  const [transportType, setTransportType] = useState<'stdio' | 'http' | 'sse'>(
    'stdio'
  )
  const [url, setUrl] = useState('')
  const [headerKeys, setHeaderKeys] = useState<string[]>([''])
  const [headerValues, setHeaderValues] = useState<string[]>([''])
  const [timeout, setTimeout] = useState('')
  const [isToggled, setIsToggled] = useState(false)
  const [jsonContent, setJsonContent] = useState('')
  const [error, setError] = useState<string | null>(null)

  // Reset form when modal opens/closes or editing key changes
  useEffect(() => {
    if (open && editingKey && initialData) {
      setServerName(editingKey)
      setCommand(initialData.command || '')
      setUrl(initialData.url || '')
      setTimeout(initialData.timeout ? initialData.timeout.toString() : '')
      setArgs(initialData.args?.length > 0 ? initialData.args : [''])
      setTransportType(initialData?.type || 'stdio')

      // Initialize JSON content for toggle mode
      try {
        const jsonData = { [editingKey]: initialData }
        setJsonContent(JSON.stringify(jsonData, null, 2))
      } catch {
        setJsonContent('')
      }

      if (initialData.env) {
        // Convert env object to arrays of keys and values
        const keys = Object.keys(initialData.env)
        const values = keys.map((key) => initialData.env[key])

        setEnvKeys(keys.length > 0 ? keys : [''])
        setEnvValues(values.length > 0 ? values : [''])
      }

      if (initialData.headers) {
        // Convert headers object to arrays of keys and values
        const headerKeysList = Object.keys(initialData.headers)
        const headerValuesList = headerKeysList.map(
          (key) => initialData.headers![key]
        )

        setHeaderKeys(headerKeysList.length > 0 ? headerKeysList : [''])
        setHeaderValues(headerValuesList.length > 0 ? headerValuesList : [''])
      }
    } else if (open) {
      // Add mode - reset form
      resetForm()
    }
  }, [open, editingKey, initialData])

  const resetForm = () => {
    setServerName('')
    setCommand('')
    setUrl('')
    setTimeout('')
    setArgs([''])
    setEnvKeys([''])
    setEnvValues([''])
    setHeaderKeys([''])
    setHeaderValues([''])
    setTransportType('stdio')
    setIsToggled(false)
    setJsonContent('')
    setError(null)
  }

  const handleAddArg = () => {
    setArgs([...args, ''])
  }

  const handleRemoveArg = (index: number) => {
    const newArgs = [...args]
    newArgs.splice(index, 1)
    setArgs(newArgs.length > 0 ? newArgs : [''])
  }

  const handleArgChange = (index: number, value: string) => {
    const newArgs = [...args]
    newArgs[index] = value
    setArgs(newArgs)
  }

  const handleReorderArgs = (oldIndex: number, newIndex: number) => {
    setArgs(arrayMove(args, oldIndex, newIndex))
  }

  // Sensors for drag and drop
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        delay: 100,
        tolerance: 5,
      },
    }),
    useSensor(KeyboardSensor)
  )

  const handleAddEnv = () => {
    setEnvKeys([...envKeys, ''])
    setEnvValues([...envValues, ''])
  }

  const handleRemoveEnv = (index: number) => {
    const newKeys = [...envKeys]
    const newValues = [...envValues]
    newKeys.splice(index, 1)
    newValues.splice(index, 1)
    setEnvKeys(newKeys.length > 0 ? newKeys : [''])
    setEnvValues(newValues.length > 0 ? newValues : [''])
  }

  const handleEnvKeyChange = (index: number, value: string) => {
    const newKeys = [...envKeys]
    newKeys[index] = value
    setEnvKeys(newKeys)
  }

  const handleEnvValueChange = (index: number, value: string) => {
    const newValues = [...envValues]
    newValues[index] = value
    setEnvValues(newValues)
  }

  const handleAddHeader = () => {
    setHeaderKeys([...headerKeys, ''])
    setHeaderValues([...headerValues, ''])
  }

  const handleRemoveHeader = (index: number) => {
    const newKeys = [...headerKeys]
    const newValues = [...headerValues]
    newKeys.splice(index, 1)
    newValues.splice(index, 1)
    setHeaderKeys(newKeys.length > 0 ? newKeys : [''])
    setHeaderValues(newValues.length > 0 ? newValues : [''])
  }

  const handleHeaderKeyChange = (index: number, value: string) => {
    const newKeys = [...headerKeys]
    newKeys[index] = value
    setHeaderKeys(newKeys)
  }

  const handleHeaderValueChange = (index: number, value: string) => {
    const newValues = [...headerValues]
    newValues[index] = value
    setHeaderValues(newValues)
  }

  const handleSave = () => {
    // Handle JSON mode
    if (isToggled) {
      try {
        const parsedData = JSON.parse(jsonContent)
        // Validate that it's an object with server configurations
        if (typeof parsedData !== 'object' || parsedData === null) {
          setError(t('mcp-servers:editJson.errorFormat'))
          return
        }
        // For each server in the JSON, call onSave
        Object.entries(parsedData).forEach(([serverName, config]) => {
          onSave(serverName.trim(), config as MCPServerConfig)
        })
        onOpenChange(false)
        resetForm()
        setError(null)
        return
      } catch {
        setError(t('mcp-servers:editJson.errorFormat'))
        return
      }
    }

    // Handle form mode
    // Convert env arrays to object
    const envObj: Record<string, string> = {}
    envKeys.forEach((key, index) => {
      const keyName = key.trim()
      if (keyName !== '') {
        envObj[keyName] = envValues[index]?.trim() || ''
      }
    })

    // Convert headers arrays to object
    const headersObj: Record<string, string> = {}
    headerKeys.forEach((key, index) => {
      const keyName = key.trim()
      if (keyName !== '') {
        headersObj[keyName] = headerValues[index]?.trim() || ''
      }
    })

    // Filter out empty args
    const filteredArgs = args.map((arg) => arg.trim()).filter((arg) => arg)

    const config: MCPServerConfig = {
      command: transportType === 'stdio' ? command.trim() : '',
      args: transportType === 'stdio' ? filteredArgs : [],
      env: transportType === 'stdio' ? envObj : {},
      type: transportType,
      ...(transportType !== 'stdio' && {
        url: url.trim(),
        headers: Object.keys(headersObj).length > 0 ? headersObj : undefined,
        timeout: timeout.trim() !== '' ? parseInt(timeout) : undefined,
      }),
    }

    if (serverName.trim() !== '') {
      onSave(serverName.trim(), config)
      onOpenChange(false)
      resetForm()
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent showCloseButton={false}>
        <DialogHeader>
          <DialogTitle className="flex items-center justify-between">
            <span>
              {editingKey
                ? t('mcp-servers:editServer')
                : t('mcp-servers:addServer')}
            </span>
            <div
              className={cn(
                'size-6 cursor-pointer flex items-center justify-center rounded hover:bg-main-view-fg/10 transition-all duration-200 ease-in-out',
                isToggled && 'bg-main-view-fg/10 text-accent'
              )}
              title="Add server by JSON"
              onClick={() => setIsToggled(!isToggled)}
            >
              <IconCodeDots className="h-5 w-5 cursor-pointer transition-colors duration-200" />
            </div>
          </DialogTitle>
        </DialogHeader>
        {isToggled ? (
          <div className="space-y-4">
            <div className="space-y-2">
              <label className="text-sm mb-2 inline-block">
                {t('mcp-servers:editJson.placeholder')}
              </label>
              <div className="border border-main-view-fg/10 rounded-md overflow-hidden">
                <CodeEditor
                  value={jsonContent}
                  language="json"
                  placeholder={`{
  "serverName": {
    "command": "command",
    "args": ["arg1", "arg2"],
    "env": {
      "KEY": "value"
    }
  }
}`}
                  onChange={(e) => {
                    setJsonContent(e.target.value)
                    setError(null)
                  }}
                  onPaste={() => setError(null)}
                  style={{
                    fontFamily: 'ui-monospace',
                    backgroundColor: 'transparent',
                    wordBreak: 'break-all',
                    overflowWrap: 'anywhere',
                    whiteSpace: 'pre-wrap',
                  }}
                  className="w-full !text-sm min-h-[300px]"
                />
              </div>
              {error && <div className="text-destructive text-sm">{error}</div>}
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="space-y-2">
              <label className="text-sm mb-2 inline-block">
                {t('mcp-servers:serverName')}
              </label>
              <Input
                value={serverName}
                onChange={(e) => setServerName(e.target.value)}
                placeholder={t('mcp-servers:enterServerName')}
                autoFocus
              />
            </div>

            <div className="space-y-2">
              <label className="text-sm mb-2 inline-block">
                Transport Type
              </label>
              <RadioGroup
                value={transportType}
                onValueChange={(value) =>
                  setTransportType(value as 'http' | 'sse')
                }
                className="flex gap-6"
              >
                <div className="flex items-center space-x-2">
                  <RadioGroupItem value="stdio" id="stdio" />
                  <label
                    htmlFor="stdio"
                    className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
                  >
                    STDIO
                  </label>
                </div>
                <div className="flex items-center space-x-2">
                  <RadioGroupItem value="http" id="http" />
                  <label
                    htmlFor="http"
                    className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
                  >
                    HTTP
                  </label>
                </div>
                <div className="flex items-center space-x-2">
                  <RadioGroupItem value="sse" id="sse" />
                  <label
                    htmlFor="sse"
                    className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
                  >
                    SSE
                  </label>
                </div>
              </RadioGroup>
            </div>

            {transportType === 'stdio' ? (
              <div className="space-y-2">
                <label className="text-sm mb-2 inline-block">
                  {t('mcp-servers:command')}
                </label>
                <Input
                  value={command}
                  onChange={(e) => setCommand(e.target.value)}
                  placeholder={t('mcp-servers:enterCommand')}
                />
              </div>
            ) : (
              <div className="space-y-2">
                <label className="text-sm mb-2 inline-block">URL</label>
                <Input
                  value={url}
                  onChange={(e) => setUrl(e.target.value)}
                  placeholder="Enter URL"
                />
              </div>
            )}

            {transportType === 'stdio' && (
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <label className="text-sm">
                    {t('mcp-servers:arguments')}
                  </label>
                  <div
                    className="size-6 cursor-pointer flex items-center justify-center rounded hover:bg-main-view-fg/10 transition-all duration-200 ease-in-out"
                    onClick={handleAddArg}
                  >
                    <IconPlus size={18} className="text-main-view-fg/60" />
                  </div>
                </div>

                <DndContext
                  sensors={sensors}
                  collisionDetection={closestCenter}
                  onDragEnd={(event) => {
                    const { active, over } = event
                    if (active.id !== over?.id) {
                      const oldIndex = parseInt(active.id.toString())
                      const newIndex = parseInt(over?.id.toString() || '0')
                      handleReorderArgs(oldIndex, newIndex)
                    }
                  }}
                >
                  <SortableContext
                    items={args.map((_, index) => index)}
                    strategy={verticalListSortingStrategy}
                  >
                    {args.map((arg, index) => (
                      <SortableArgItem
                        key={index}
                        id={index}
                        value={arg}
                        onChange={(value) => handleArgChange(index, value)}
                        onRemove={() => handleRemoveArg(index)}
                        canRemove={args.length > 1}
                        placeholder={t('mcp-servers:argument', {
                          index: index + 1,
                        })}
                      />
                    ))}
                  </SortableContext>
                </DndContext>
              </div>
            )}

            {transportType === 'stdio' && (
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <label className="text-sm">{t('mcp-servers:envVars')}</label>
                  <div
                    className="size-6 cursor-pointer flex items-center justify-center rounded hover:bg-main-view-fg/10 transition-all duration-200 ease-in-out"
                    onClick={handleAddEnv}
                  >
                    <IconPlus size={18} className="text-main-view-fg/60" />
                  </div>
                </div>

                {envKeys.map((key, index) => (
                  <div key={`env-${index}`} className="flex items-center gap-2">
                    <Input
                      value={key}
                      onChange={(e) =>
                        handleEnvKeyChange(index, e.target.value)
                      }
                      placeholder={t('mcp-servers:key')}
                      className="flex-1"
                    />
                    <Input
                      value={envValues[index] || ''}
                      onChange={(e) =>
                        handleEnvValueChange(index, e.target.value)
                      }
                      placeholder={t('mcp-servers:value')}
                      className="flex-1"
                    />
                    {envKeys.length > 1 && (
                      <div
                        className="size-6 cursor-pointer flex items-center justify-center rounded hover:bg-main-view-fg/10 transition-all duration-200 ease-in-out"
                        onClick={() => handleRemoveEnv(index)}
                      >
                        <IconTrash size={18} className="text-destructive" />
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}

            {(transportType === 'http' || transportType === 'sse') && (
              <>
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <label className="text-sm">Headers</label>
                    <div
                      className="size-6 cursor-pointer flex items-center justify-center rounded hover:bg-main-view-fg/10 transition-all duration-200 ease-in-out"
                      onClick={handleAddHeader}
                    >
                      <IconPlus size={18} className="text-main-view-fg/60" />
                    </div>
                  </div>

                  {headerKeys.map((key, index) => (
                    <div
                      key={`header-${index}`}
                      className="flex items-center gap-2"
                    >
                      <Input
                        value={key}
                        onChange={(e) =>
                          handleHeaderKeyChange(index, e.target.value)
                        }
                        placeholder="Header name"
                        className="flex-1"
                      />
                      <Input
                        value={headerValues[index] || ''}
                        onChange={(e) =>
                          handleHeaderValueChange(index, e.target.value)
                        }
                        placeholder="Header value"
                        className="flex-1"
                      />
                      {headerKeys.length > 1 && (
                        <div
                          className="size-6 cursor-pointer flex items-center justify-center rounded hover:bg-main-view-fg/10 transition-all duration-200 ease-in-out"
                          onClick={() => handleRemoveHeader(index)}
                        >
                          <IconTrash size={18} className="text-destructive" />
                        </div>
                      )}
                    </div>
                  ))}
                </div>

                <div className="space-y-2">
                  <label className="text-sm mb-2 inline-block">
                    Timeout (seconds)
                  </label>
                  <Input
                    value={timeout}
                    onChange={(e) => setTimeout(e.target.value)}
                    placeholder="Enter timeout in seconds"
                    type="number"
                  />
                </div>
              </>
            )}
          </div>
        )}

        <DialogFooter>
          <Button variant="link" onClick={() => onOpenChange(false)}>
            {t('common:cancel')}
          </Button>
          <Button
            onClick={handleSave}
            disabled={!isToggled && serverName.trim() === ''}
          >
            {t('mcp-servers:save')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
