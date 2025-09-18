import { createFileRoute } from '@tanstack/react-router'
import { route } from '@/constants/routes'
import HeaderPage from '@/containers/HeaderPage'
import SettingsMenu from '@/containers/SettingsMenu'
import { Card, CardItem } from '@/containers/Card'
import {
  IconPencil,
  IconPlus,
  IconTrash,
  IconCodeCircle,
  IconTool,
} from '@tabler/icons-react'
import { useMCPServers, MCPServerConfig } from '@/hooks/useMCPServers'
import { useEffect, useState } from 'react'
import AddEditMCPServer from '@/containers/dialogs/AddEditMCPServer'
import DeleteMCPServerConfirm from '@/containers/dialogs/DeleteMCPServerConfirm'
import EditJsonMCPserver from '@/containers/dialogs/EditJsonMCPserver'
import { MCPServerToolsDialog } from '@/containers/dialogs/MCPServerToolsDialog'
import { Switch } from '@/components/ui/switch'
import { twMerge } from 'tailwind-merge'
import { useServiceHub } from '@/hooks/useServiceHub'
import { useToolApproval } from '@/hooks/useToolApproval'
import { toast } from 'sonner'
import { useTranslation } from '@/i18n/react-i18next-compat'
import { useAppState } from '@/hooks/useAppState'
import { PlatformGuard } from '@/lib/platform/PlatformGuard'
import { PlatformFeature } from '@/lib/platform'
import { cn } from '@/lib/utils'

// Function to mask sensitive values
const maskSensitiveValue = (value: string) => {
  if (!value) return value
  if (value.length <= 8) return '*'.repeat(value.length)
  return value.slice(0, 4) + '*'.repeat(value.length - 8) + value.slice(-4)
}

// Function to mask sensitive URL parameters
const maskSensitiveUrl = (url: string) => {
  if (!url) return url

  try {
    const urlObj = new URL(url)
    const params = urlObj.searchParams

    // List of sensitive parameter names (case-insensitive)
    const sensitiveParams = [
      'api_key',
      'apikey',
      'key',
      'token',
      'secret',
      'password',
      'pwd',
      'auth',
      'authorization',
      'bearer',
      'access_token',
      'refresh_token',
      'client_secret',
      'private_key',
      'signature',
      'hash',
    ]

    // Mask sensitive parameters
    sensitiveParams.forEach((paramName) => {
      // Check both exact match and case-insensitive match
      for (const [key, value] of params.entries()) {
        if (key.toLowerCase() === paramName.toLowerCase()) {
          params.set(key, maskSensitiveValue(value))
        }
      }
    })

    // Reconstruct URL with masked parameters
    urlObj.search = params.toString()
    return urlObj.toString()
  } catch {
    // If URL parsing fails, just mask the entire query string after '?'
    const queryIndex = url.indexOf('?')
    if (queryIndex === -1) return url

    const baseUrl = url.substring(0, queryIndex + 1)
    const queryString = url.substring(queryIndex + 1)
    return baseUrl + maskSensitiveValue(queryString)
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const Route = createFileRoute(route.settings.mcp_servers as any)({
  component: MCPServers,
})

function MCPServers() {
  return (
    <PlatformGuard feature={PlatformFeature.MCP_SERVERS_SETTINGS}>
      <MCPServersDesktop />
    </PlatformGuard>
  )
}

function MCPServersDesktop() {
  const { t } = useTranslation()
  const serviceHub = useServiceHub()
  const {
    mcpServers,
    addServer,
    editServer,
    renameServer,
    deleteServer,
    syncServers,
    syncServersAndRestart,
    getServerConfig,
  } = useMCPServers()
  const { allowAllMCPPermissions, setAllowAllMCPPermissions } =
    useToolApproval()

  const [open, setOpen] = useState(false)
  const [editingKey, setEditingKey] = useState<string | null>(null)
  const [currentConfig, setCurrentConfig] = useState<
    MCPServerConfig | undefined
  >(undefined)

  // Delete confirmation dialog state
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
  const [serverToDelete, setServerToDelete] = useState<string | null>(null)

  // JSON editor dialog state
  const [jsonEditorOpen, setJsonEditorOpen] = useState(false)
  const [jsonServerName, setJsonServerName] = useState<string | null>(null)
  const [jsonEditorData, setJsonEditorData] = useState<
    MCPServerConfig | Record<string, MCPServerConfig> | undefined
  >(undefined)

  // Tools dialog state
  const [toolsDialogOpen, setToolsDialogOpen] = useState(false)
  const [toolsServerName, setToolsServerName] = useState<string | null>(null)
  const [connectedServers, setConnectedServers] = useState<string[]>([])
  const [loadingServers, setLoadingServers] = useState<{
    [key: string]: boolean
  }>({})
  const { setErrorMessage } = useAppState()

  const handleOpenDialog = (serverKey?: string) => {
    if (serverKey) {
      // Edit mode
      setCurrentConfig(mcpServers[serverKey])
      setEditingKey(serverKey)
    } else {
      // Add mode
      setCurrentConfig(undefined)
      setEditingKey(null)
    }
    setOpen(true)
  }

  const handleSaveServer = async (name: string, config: MCPServerConfig) => {
    if (editingKey) {
      // If server name changed, rename it while preserving position
      if (editingKey !== name) {
        toggleServer(editingKey, false)
        renameServer(editingKey, name, config)
        toggleServer(name, true)
        // Restart servers to update tool references with new server name
        syncServersAndRestart()
      } else {
        toggleServer(editingKey, false)
        editServer(editingKey, config)
        toggleServer(editingKey, true)
        syncServers()
      }
    } else {
      // Add new server
      toggleServer(name, false)
      addServer(name, config)
      toggleServer(name, true)
      syncServers()
    }
  }

  const handleEdit = (serverKey: string) => {
    handleOpenDialog(serverKey)
  }

  const handleDeleteClick = (serverKey: string) => {
    setServerToDelete(serverKey)
    setDeleteDialogOpen(true)
  }

  const handleConfirmDelete = async () => {
    if (serverToDelete) {
      // Stop the server before deletion
      try {
        await serviceHub.mcp().deactivateMCPServer(serverToDelete)
      } catch (error) {
        console.error('Error stopping server before deletion:', error)
      }

      deleteServer(serverToDelete)
      setServerToDelete(null)
      syncServersAndRestart()
    }
  }

  const handleOpenJsonEditor = async (serverKey?: string) => {
    if (serverKey) {
      // Edit single server JSON
      setJsonServerName(serverKey)
      setJsonEditorData(mcpServers[serverKey])
    } else {
      // Edit all servers JSON
      setJsonServerName(null)
      setJsonEditorData(mcpServers)
    }
    setJsonEditorOpen(true)
  }

  const handleOpenToolsDialog = (serverKey: string) => {
    setToolsServerName(serverKey)
    setToolsDialogOpen(true)
  }

  const handleSaveJson = async (
    data: MCPServerConfig | Record<string, MCPServerConfig>
  ) => {
    if (jsonServerName) {
      try {
        toggleServer(jsonServerName, false)
      } catch (error) {
        console.error('Error deactivating server:', error)
      }
      // Save single server
      editServer(jsonServerName, data as MCPServerConfig)
      toggleServer(jsonServerName, (data as MCPServerConfig).active || false)
    } else {
      // Save all servers
      // Clear existing servers first
      Object.keys(mcpServers).forEach((serverKey) => {
        toggleServer(serverKey, false)
        deleteServer(serverKey)
      })

      // Add all servers from the JSON
      Object.entries(data as Record<string, MCPServerConfig>).forEach(
        ([key, config]) => {
          addServer(key, config)
          toggleServer(key, config.active || false)
        }
      )
    }
  }

  const toggleServer = (serverKey: string, active: boolean) => {
    if (serverKey) {
      setLoadingServers((prev) => ({ ...prev, [serverKey]: true }))
      const config = getServerConfig(serverKey)
      if (active && config) {
        serviceHub
          .mcp()
          .activateMCPServer(serverKey, {
            ...(config ?? (mcpServers[serverKey] as MCPServerConfig)),
            active,
          })
          .then(() => {
            // Save single server
            editServer(serverKey, {
              ...(config ?? (mcpServers[serverKey] as MCPServerConfig)),
              active,
            })
            syncServers()
            toast.success(
              active
                ? t('mcp-servers:serverStatusActive', { serverKey })
                : t('mcp-servers:serverStatusInactive', { serverKey })
            )
            serviceHub.mcp().getConnectedServers().then(setConnectedServers)
          })
          .catch((error) => {
            editServer(serverKey, {
              ...(config ?? (mcpServers[serverKey] as MCPServerConfig)),
              active: false,
            })
            setErrorMessage({
              message: error,
              subtitle: t('mcp-servers:checkParams'),
            })
          })
          .finally(() => {
            setLoadingServers((prev) => ({ ...prev, [serverKey]: false }))
          })
      } else {
        editServer(serverKey, {
          ...(config ?? (mcpServers[serverKey] as MCPServerConfig)),
          active,
        })
        syncServers()
        serviceHub
          .mcp()
          .deactivateMCPServer(serverKey)
          .finally(() => {
            serviceHub.mcp().getConnectedServers().then(setConnectedServers)
            setLoadingServers((prev) => ({ ...prev, [serverKey]: false }))
          })
      }
    }
  }

  useEffect(() => {
    serviceHub.mcp().getConnectedServers().then(setConnectedServers)

    const intervalId = setInterval(() => {
      serviceHub.mcp().getConnectedServers().then(setConnectedServers)
    }, 3000)

    return () => clearInterval(intervalId)
  }, [serviceHub, setConnectedServers])

  return (
    <div className="flex flex-col h-full">
      <HeaderPage>
        <h1 className="font-medium">{t('common:settings')}</h1>
      </HeaderPage>
      <div className="flex h-full w-full">
        <SettingsMenu />
        <div className="p-4 w-full h-[calc(100%-32px)] overflow-y-auto">
          <div className="flex flex-col justify-between gap-4 gap-y-3 w-full">
            <Card
              header={
                <div className="flex flex-col mb-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <h1 className="text-main-view-fg font-medium text-base">
                        {t('mcp-servers:title')}
                      </h1>
                      <div className="text-xs bg-main-view-fg/10 border border-main-view-fg/20 text-main-view-fg/70 rounded-full py-0.5 px-2">
                        <span>{t('mcp-servers:experimental')}</span>
                      </div>
                    </div>

                    <div className="flex items-center gap-0.5">
                      <div
                        className="size-6 cursor-pointer flex items-center justify-center rounded hover:bg-main-view-fg/10 transition-all duration-200 ease-in-out"
                        onClick={() => handleOpenJsonEditor()}
                        title={t('mcp-servers:editAllJson')}
                      >
                        <IconCodeCircle
                          size={18}
                          className="text-main-view-fg/50"
                        />
                      </div>
                      <div
                        className="size-6 cursor-pointer flex items-center justify-center rounded hover:bg-main-view-fg/10 transition-all duration-200 ease-in-out"
                        onClick={() => handleOpenDialog()}
                        title={t('mcp-servers:addServer')}
                      >
                        <IconPlus size={18} className="text-main-view-fg/50" />
                      </div>
                    </div>
                  </div>
                  <p className="text-sm text-main-view-fg/70 mt-1">
                    {t('mcp-servers:findMore')}{' '}
                    <a
                      href="https://mcp.so/"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-primary hover:underline"
                    >
                      mcp.so
                    </a>
                  </p>
                </div>
              }
            >
              <CardItem
                title={t('mcp-servers:allowPermissions')}
                description={t('mcp-servers:allowPermissionsDesc')}
                actions={
                  <div className="flex-shrink-0 ml-4">
                    <Switch
                      checked={allowAllMCPPermissions}
                      onCheckedChange={setAllowAllMCPPermissions}
                    />
                  </div>
                }
              />
            </Card>

            {Object.keys(mcpServers).length === 0 ? (
              <div className="py-4 text-center font-medium text-main-view-fg/50">
                {t('mcp-servers:noServers')}
              </div>
            ) : (
              Object.entries(mcpServers).map(([key, config], index) => (
                <Card key={`${key}-${index}`}>
                  <CardItem
                    align="start"
                    title={
                      <div className="flex items-center gap-x-2">
                        <div
                          className={twMerge(
                            'size-2 rounded-full',
                            connectedServers.includes(key)
                              ? 'bg-accent'
                              : 'bg-main-view-fg/50'
                          )}
                        />
                        <h1 className="text-main-view-fg text-base capitalize">
                          {key}
                        </h1>
                      </div>
                    }
                    descriptionOutside={
                      <div className="text-sm text-main-view-fg/70">
                        <div className="mb-1">
                          Transport:{' '}
                          <span className="uppercase">
                            {config.type || 'stdio'}
                          </span>
                        </div>

                        {config.type === 'stdio' || !config.type ? (
                          <>
                            <div>
                              {t('mcp-servers:command')}: {config.command}
                            </div>
                            <div className="my-1 break-all">
                              {t('mcp-servers:args')}:{' '}
                              {config?.args?.join(', ')}
                            </div>
                            {config.env &&
                              Object.keys(config.env).length > 0 && (
                                <div className="break-all">
                                  {t('mcp-servers:env')}:{' '}
                                  {Object.entries(config.env)
                                    .map(
                                      ([key, value]) =>
                                        `${key}=${maskSensitiveValue(value)}`
                                    )
                                    .join(', ')}
                                </div>
                              )}
                          </>
                        ) : (
                          <>
                            <div className="break-all">
                              URL: {maskSensitiveUrl(config.url || '')}
                            </div>
                            {config.headers &&
                              Object.keys(config.headers).length > 0 && (
                                <div className="my-1 break-all">
                                  Headers:{' '}
                                  {Object.entries(config.headers)
                                    .map(
                                      ([key, value]) =>
                                        `${key}=${maskSensitiveValue(value)}`
                                    )
                                    .join(', ')}
                                </div>
                              )}
                            {config.timeout && (
                              <div>Timeout: {config.timeout}s</div>
                            )}
                          </>
                        )}
                      </div>
                    }
                    actions={
                      <div className="flex items-center gap-0.5">
                        <div
                          className={cn(
                            'size-6 cursor-pointer flex items-center justify-center rounded hover:bg-main-view-fg/10 transition-all duration-200 ease-in-out',
                            !connectedServers.includes(key) &&
                              'opacity-50 cursor-not-allowed'
                          )}
                          onClick={() =>
                            connectedServers.includes(key) &&
                            handleOpenToolsDialog(key)
                          }
                          title={t('mcp-servers:viewTools.title', {
                            serverName: key,
                          })}
                        >
                          <IconTool
                            size={18}
                            className={twMerge(
                              'text-main-view-fg/50',
                              connectedServers.includes(key) &&
                                'hover:text-accent'
                            )}
                          />
                        </div>
                        <div
                          className="size-6 cursor-pointer flex items-center justify-center rounded hover:bg-main-view-fg/10 transition-all duration-200 ease-in-out"
                          onClick={() => handleOpenJsonEditor(key)}
                          title={t('mcp-servers:editJson.title', {
                            serverName: key,
                          })}
                        >
                          <IconCodeCircle
                            size={18}
                            className="text-main-view-fg/50"
                          />
                        </div>
                        <div
                          className="size-6 cursor-pointer flex items-center justify-center rounded hover:bg-main-view-fg/10 transition-all duration-200 ease-in-out"
                          onClick={() => handleEdit(key)}
                          title={t('mcp-servers:editServer')}
                        >
                          <IconPencil
                            size={18}
                            className="text-main-view-fg/50"
                          />
                        </div>
                        <div
                          className="size-6 cursor-pointer flex items-center justify-center rounded hover:bg-main-view-fg/10 transition-all duration-200 ease-in-out"
                          onClick={() => handleDeleteClick(key)}
                          title={t('mcp-servers:deleteServer.title')}
                        >
                          <IconTrash
                            size={18}
                            className="text-main-view-fg/50"
                          />
                        </div>
                        <div className="ml-2">
                          <Switch
                            checked={config.active}
                            loading={!!loadingServers[key]}
                            onCheckedChange={(checked) =>
                              toggleServer(key, checked)
                            }
                          />
                        </div>
                      </div>
                    }
                  />
                </Card>
              ))
            )}
          </div>
        </div>
      </div>

      {/* Use the AddEditMCPServer component */}
      <AddEditMCPServer
        open={open}
        onOpenChange={setOpen}
        editingKey={editingKey}
        initialData={currentConfig}
        onSave={handleSaveServer}
      />

      {/* Delete confirmation dialog */}
      <DeleteMCPServerConfirm
        open={deleteDialogOpen}
        onOpenChange={setDeleteDialogOpen}
        serverName={serverToDelete || ''}
        onConfirm={handleConfirmDelete}
      />

      {/* JSON editor dialog */}
      <EditJsonMCPserver
        open={jsonEditorOpen}
        onOpenChange={setJsonEditorOpen}
        serverName={jsonServerName}
        initialData={
          jsonEditorData as MCPServerConfig | Record<string, MCPServerConfig>
        }
        onSave={handleSaveJson}
      />

      {/* Tools detail dialog */}
      <MCPServerToolsDialog
        open={toolsDialogOpen}
        onOpenChange={setToolsDialogOpen}
        serverName={toolsServerName || ''}
      />
    </div>
  )
}
