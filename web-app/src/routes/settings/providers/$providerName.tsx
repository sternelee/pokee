/* eslint-disable @typescript-eslint/no-explicit-any */
import { Card, CardItem } from '@/containers/Card'
import HeaderPage from '@/containers/HeaderPage'
import SettingsMenu from '@/containers/SettingsMenu'
import { useModelProvider } from '@/hooks/useModelProvider'
import { cn, getProviderTitle } from '@/lib/utils'
import {
  createFileRoute,
  Link,
  useParams,
  useSearch,
} from '@tanstack/react-router'
import { useTranslation } from '@/i18n/react-i18next-compat'
import Capabilities from '@/containers/Capabilities'
import { DynamicControllerSetting } from '@/containers/dynamicControllerSetting'
import { RenderMarkdown } from '@/containers/RenderMarkdown'
import { DialogEditModel } from '@/containers/dialogs/EditModel'
import { DialogAddModel } from '@/containers/dialogs/AddModel'
import { ImportVisionModelDialog } from '@/containers/dialogs/ImportVisionModelDialog'
import { ModelSetting } from '@/containers/ModelSetting'
import { DialogDeleteModel } from '@/containers/dialogs/DeleteModel'
import { FavoriteModelAction } from '@/containers/FavoriteModelAction'
import Joyride, { CallBackProps, STATUS } from 'react-joyride'
import { CustomTooltipJoyRide } from '@/containers/CustomeTooltipJoyRide'
import { route } from '@/constants/routes'
import DeleteProvider from '@/containers/dialogs/DeleteProvider'
import { useServiceHub } from '@/hooks/useServiceHub'
import { localStorageKey } from '@/constants/localStorage'
import { Button } from '@/components/ui/button'
import {
  IconFolderPlus,
  IconLoader,
  IconRefresh,
  IconUpload,
} from '@tabler/icons-react'
import { toast } from 'sonner'
import { useCallback, useEffect, useState } from 'react'
import { predefinedProviders } from '@/consts/providers'
import { useModelLoad } from '@/hooks/useModelLoad'
import { PlatformFeatures } from '@/lib/platform/const'
import { PlatformFeature } from '@/lib/platform/types'
import { useBackendUpdater } from '@/hooks/useBackendUpdater'

// as route.threadsDetail
export const Route = createFileRoute('/settings/providers/$providerName')({
  component: ProviderDetail,
  validateSearch: (search: Record<string, unknown>): { step?: string } => {
    // validate and parse the search params into a typed state
    return {
      step: String(search?.step),
    }
  },
})

function ProviderDetail() {
  const { t } = useTranslation()
  const serviceHub = useServiceHub()
  const { setModelLoadError } = useModelLoad()
  const steps = [
    {
      target: '.first-step-setup-remote-provider',
      title: t('providers:joyride.chooseProviderTitle'),
      disableBeacon: true,
      content: t('providers:joyride.chooseProviderContent'),
    },
    {
      target: '.second-step-setup-remote-provider',
      title: t('providers:joyride.getApiKeyTitle'),
      disableBeacon: true,
      content: t('providers:joyride.getApiKeyContent'),
    },
    {
      target: '.third-step-setup-remote-provider',
      title: t('providers:joyride.insertApiKeyTitle'),
      disableBeacon: true,
      content: t('providers:joyride.insertApiKeyContent'),
    },
  ]
  const { step } = useSearch({ from: Route.id })
  const [activeModels, setActiveModels] = useState<string[]>([])
  const [loadingModels, setLoadingModels] = useState<string[]>([])
  const [refreshingModels, setRefreshingModels] = useState(false)
  const [isCheckingBackendUpdate, setIsCheckingBackendUpdate] = useState(false)
  const [isInstallingBackend, setIsInstallingBackend] = useState(false)
  const { checkForUpdate: checkForBackendUpdate, installBackend } =
    useBackendUpdater()
  const { providerName } = useParams({ from: Route.id })
  const { getProviderByName, setProviders, updateProvider } = useModelProvider()
  const provider = getProviderByName(providerName)
  const isSetup = step === 'setup_remote_provider'

  // Check if llamacpp provider needs backend configuration
  const needsBackendConfig =
    provider?.provider === 'llamacpp' &&
    provider.settings?.some(
      (setting) =>
        setting.key === 'version_backend' &&
        (setting.controller_props.value === 'none' ||
          setting.controller_props.value === '' ||
          !setting.controller_props.value)
    )

  const handleModelImportSuccess = async (importedModelName?: string) => {
    // Refresh the provider to update the models list
    await serviceHub.providers().getProviders().then(setProviders)

    // If a model was imported and it might have vision capabilities, check and update
    if (importedModelName && providerName === 'llamacpp') {
      try {
        const mmprojExists = await serviceHub
          .models()
          .checkMmprojExists(importedModelName)
        if (mmprojExists) {
          // Get the updated provider after refresh
          const { getProviderByName, updateProvider: updateProviderState } =
            useModelProvider.getState()
          const llamacppProvider = getProviderByName('llamacpp')

          if (llamacppProvider) {
            const modelIndex = llamacppProvider.models.findIndex(
              (m: Model) => m.id === importedModelName
            )
            if (modelIndex !== -1) {
              const model = llamacppProvider.models[modelIndex]
              const capabilities = model.capabilities || []

              // Add 'vision' capability if not already present AND if user hasn't manually configured capabilities
              // Check if model has a custom capabilities config flag

              const hasUserConfiguredCapabilities =
                (model as any)._userConfiguredCapabilities === true

              if (
                !capabilities.includes('vision') &&
                !hasUserConfiguredCapabilities
              ) {
                const updatedModels = [...llamacppProvider.models]
                updatedModels[modelIndex] = {
                  ...model,
                  capabilities: [...capabilities, 'vision'],
                  // Mark this as auto-detected, not user-configured
                  _autoDetectedVision: true,
                } as any

                updateProviderState('llamacpp', { models: updatedModels })
                console.log(
                  `Vision capability added to model after provider refresh: ${importedModelName}`
                )
              }
            }
          }
        }
      } catch (error) {
        console.error('Error checking mmproj existence after import:', error)
      }
    }
  }

  useEffect(() => {
    // Initial data fetch
    serviceHub
      .models()
      .getActiveModels()
      .then((models) => setActiveModels(models || []))

    // Set up interval for real-time updates
    const intervalId = setInterval(() => {
      serviceHub
        .models()
        .getActiveModels()
        .then((models) => setActiveModels(models || []))
    }, 5000)

    return () => clearInterval(intervalId)
  }, [serviceHub, setActiveModels])

  // Auto-refresh provider settings to get updated backend configuration
  const refreshSettings = useCallback(async () => {
    if (!provider) return

    try {
      // Refresh providers to get updated settings from the extension
      const updatedProviders = await serviceHub.providers().getProviders()
      setProviders(updatedProviders)
    } catch (error) {
      console.error('Failed to refresh settings:', error)
    }
  }, [provider, serviceHub, setProviders])

  // Auto-refresh settings when provider changes or when llamacpp needs backend config
  useEffect(() => {
    if (provider && needsBackendConfig) {
      // Auto-refresh every 3 seconds when backend is being configured
      const intervalId = setInterval(refreshSettings, 3000)
      return () => clearInterval(intervalId)
    }
  }, [provider, needsBackendConfig, refreshSettings])

  // Note: settingsChanged event is now handled globally in GlobalEventHandler
  // This ensures all screens receive the event intermediately

  const handleJoyrideCallback = (data: CallBackProps) => {
    const { status } = data

    if (status === STATUS.FINISHED) {
      localStorage.setItem(localStorageKey.setupCompleted, 'true')
    }
  }

  const handleRefreshModels = async () => {
    if (!provider || !provider.base_url) {
      toast.error(t('providers:models'), {
        description: t('providers:refreshModelsError'),
      })
      return
    }

    setRefreshingModels(true)
    try {
      const modelIds = await serviceHub
        .providers()
        .fetchModelsFromProvider(provider)

      // Create new models from the fetched IDs
      const newModels: Model[] = modelIds.map((id) => ({
        id,
        model: id,
        name: id,
        capabilities: ['completion'], // Default capability
        version: '1.0',
      }))

      // Filter out models that already exist
      const existingModelIds = provider.models.map((m) => m.id)
      const modelsToAdd = newModels.filter(
        (model) => !existingModelIds.includes(model.id)
      )

      if (modelsToAdd.length > 0) {
        // Update the provider with new models
        const updatedModels = [...provider.models, ...modelsToAdd]
        updateProvider(providerName, {
          ...provider,
          models: updatedModels,
        })

        toast.success(t('providers:models'), {
          description: t('providers:refreshModelsSuccess', {
            count: modelsToAdd.length,
            provider: provider.provider,
          }),
        })
      } else {
        toast.success(t('providers:models'), {
          description: t('providers:noNewModels'),
        })
      }
    } catch (error) {
      console.error(
        t('providers:refreshModelsFailed', { provider: provider.provider }),
        error
      )
      toast.error(t('providers:models'), {
        description: t('providers:refreshModelsFailed', {
          provider: provider.provider,
        }),
      })
    } finally {
      setRefreshingModels(false)
    }
  }

  const handleStartModel = async (modelId: string) => {
    // Add model to loading state
    setLoadingModels((prev) => [...prev, modelId])
    if (provider) {
      try {
        // Start the model with plan result
        await serviceHub.models().startModel(provider, modelId)

        // Refresh active models after starting
        serviceHub
          .models()
          .getActiveModels()
          .then((models) => setActiveModels(models || []))
      } catch (error) {
        console.error('Error starting model:', error)
        if (
          error &&
          typeof error === 'object' &&
          'message' in error &&
          typeof error.message === 'string'
        ) {
          setModelLoadError({ message: error.message })
        } else {
          setModelLoadError(typeof error === 'string' ? error : `${error}`)
        }
      } finally {
        // Remove model from loading state
        setLoadingModels((prev) => prev.filter((id) => id !== modelId))
      }
    }
  }

  const handleStopModel = (modelId: string) => {
    // Original: stopModel(modelId).then(() => { setActiveModels((prevModels) => prevModels.filter((model) => model !== modelId)) })
    serviceHub
      .models()
      .stopModel(modelId)
      .then(() => {
        // Refresh active models after stopping
        serviceHub
          .models()
          .getActiveModels()
          .then((models) => setActiveModels(models || []))
      })
      .catch((error) => {
        console.error('Error stopping model:', error)
      })
  }

  const handleCheckForBackendUpdate = useCallback(async () => {
    if (provider?.provider !== 'llamacpp') return

    setIsCheckingBackendUpdate(true)
    try {
      const update = await checkForBackendUpdate(true)
      if (!update) {
        toast.info(t('settings:noBackendUpdateAvailable'))
      }
      // If update is available, the BackendUpdater dialog will automatically show
    } catch (error) {
      console.error('Failed to check for backend updates:', error)
      toast.error(t('settings:backendUpdateError'))
    } finally {
      setIsCheckingBackendUpdate(false)
    }
  }, [provider, checkForBackendUpdate, t])

  const handleInstallBackendFromFile = useCallback(async () => {
    if (provider?.provider !== 'llamacpp') return

    setIsInstallingBackend(true)
    try {
      // Open file dialog with filter for .tar.gz files
      const selectedFile = await serviceHub.dialog().open({
        multiple: false,
        directory: false,
        filters: [
          {
            name: 'Backend Archives',
            extensions: ['tar.gz'],
          },
        ],
      })

      if (selectedFile && typeof selectedFile === 'string') {
        // Process the file path: replace spaces with dashes and convert to lowercase
        const processedFilePath = selectedFile
          .replace(/\s+/g, '-')
          .toLowerCase()

        // Install the backend using the llamacpp extension
        await installBackend(processedFilePath)

        // Extract filename from the selected file path and replace spaces with dashes
        const fileName = (
          selectedFile.split(/[/\\]/).pop() || selectedFile
        ).replace(/\s+/g, '-')

        toast.success(t('settings:backendInstallSuccess'), {
          description: `Llamacpp ${fileName} installed`,
        })

        // Refresh settings to update backend configuration
        await refreshSettings()
      }
    } catch (error) {
      console.error('Failed to install backend from file:', error)
      toast.error(t('settings:backendInstallError'), {
        description:
          error instanceof Error ? error.message : 'Unknown error occurred',
      })
    } finally {
      setIsInstallingBackend(false)
    }
  }, [provider, serviceHub, refreshSettings, t, installBackend])

  // Check if model provider settings are enabled for this platform
  if (!PlatformFeatures[PlatformFeature.MODEL_PROVIDER_SETTINGS]) {
    return (
      <div className="flex flex-col h-full">
        <HeaderPage>
          <h1 className="font-medium">{t('common:settings')}</h1>
        </HeaderPage>
        <div className="flex h-full w-full">
          <SettingsMenu />
          <div className="p-4 w-full h-[calc(100%-32px)] overflow-y-auto flex items-center justify-center">
            <div className="text-center">
              <h2 className="text-lg font-medium text-main-view-fg/80 mb-2">
                {t('common:notAvailable')}
              </h2>
              <p className="text-main-view-fg/60">
                Provider settings are not available on the web platform.
              </p>
            </div>
          </div>
        </div>
      </div>
    )
  }

  return (
    <>
      <Joyride
        run={isSetup}
        floaterProps={{
          hideArrow: true,
        }}
        steps={steps}
        tooltipComponent={CustomTooltipJoyRide}
        spotlightPadding={0}
        continuous={true}
        showSkipButton={true}
        hideCloseButton={true}
        spotlightClicks={true}
        disableOverlay={IS_LINUX}
        disableOverlayClose={true}
        callback={handleJoyrideCallback}
        locale={{
          back: t('providers:joyride.back'),
          close: t('providers:joyride.close'),
          last: t('providers:joyride.last'),
          next: t('providers:joyride.next'),
          skip: t('providers:joyride.skip'),
        }}
      />
      <div className="flex flex-col h-full">
        <HeaderPage>
          <h1 className="font-medium">{t('common:settings')}</h1>
        </HeaderPage>
        <div className="flex h-full w-full">
          <SettingsMenu />
          <div className="p-4 w-full h-[calc(100%-32px)] overflow-y-auto">
            <div className="flex flex-col justify-between gap-4 gap-y-3 w-full">
              <div className="flex items-center justify-between">
                <h1 className="font-medium text-base">
                  {getProviderTitle(providerName)}
                </h1>
              </div>

              <div
                className={cn(
                  'flex flex-col gap-3',
                  provider &&
                    provider.provider === 'llamacpp' &&
                    'flex-col-reverse'
                )}
              >
                {/* Settings */}
                <Card>
                  {provider?.settings.map((setting, settingIndex) => {
                    // Use the DynamicController component
                    const actionComponent = (
                      <div className="mt-2">
                        {needsBackendConfig &&
                        setting.key === 'version_backend' ? (
                          <div className="flex items-center gap-1 text-sm text-main-view-fg/70">
                            <IconLoader size={16} className="animate-spin" />
                            <span>loading</span>
                          </div>
                        ) : (
                          <DynamicControllerSetting
                            controllerType={setting.controller_type}
                            controllerProps={setting.controller_props}
                            className={cn(
                              setting.key === 'api-key' &&
                                'third-step-setup-remote-provider',
                              setting.key === 'device' && 'hidden'
                            )}
                            onChange={(newValue) => {
                              if (provider) {
                                const newSettings = [...provider.settings]
                                // Handle different value types by forcing the type
                                // Use type assertion to bypass type checking

                                ;(
                                  newSettings[settingIndex]
                                    .controller_props as {
                                    value: string | boolean | number
                                  }
                                ).value = newValue

                                // Create update object with updated settings
                                const updateObj: Partial<ModelProvider> = {
                                  settings: newSettings,
                                }
                                // Check if this is an API key or base URL setting and update the corresponding top-level field
                                const settingKey = setting.key
                                if (
                                  settingKey === 'api-key' &&
                                  typeof newValue === 'string'
                                ) {
                                  updateObj.api_key = newValue
                                } else if (
                                  settingKey === 'base-url' &&
                                  typeof newValue === 'string'
                                ) {
                                  updateObj.base_url = newValue
                                }

                                // Reset device setting to empty when backend version changes
                                if (settingKey === 'version_backend') {
                                  const deviceSettingIndex =
                                    newSettings.findIndex(
                                      (s) => s.key === 'device'
                                    )

                                  if (deviceSettingIndex !== -1) {
                                    ;(
                                      newSettings[deviceSettingIndex]
                                        .controller_props as {
                                        value: string
                                      }
                                    ).value = ''
                                  }

                                  // Reset llamacpp device activations when backend version changes
                                }

                                serviceHub
                                  .providers()
                                  .updateSettings(
                                    providerName,
                                    updateObj.settings ?? []
                                  )
                                updateProvider(providerName, {
                                  ...provider,
                                  ...updateObj,
                                })

                                serviceHub.models().stopAllModels()
                              }
                            }}
                          />
                        )}
                      </div>
                    )

                    return (
                      <CardItem
                        key={settingIndex}
                        title={setting.title}
                        className={cn(setting.key === 'device' && 'hidden')}
                        column={
                          setting.controller_type === 'input' &&
                          setting.controller_props.type !== 'number'
                            ? true
                            : false
                        }
                        description={
                          <>
                            <RenderMarkdown
                              className="![>p]:text-main-view-fg/70 select-none"
                              content={setting.description}
                              components={{
                                // Make links open in a new tab
                                a: ({ ...props }) => {
                                  return (
                                    <a
                                      {...props}
                                      target="_blank"
                                      rel="noopener noreferrer"
                                      className={cn(
                                        setting.key === 'api-key' &&
                                          'second-step-setup-remote-provider'
                                      )}
                                    />
                                  )
                                },
                                p: ({ ...props }) => (
                                  <p {...props} className="!mb-0" />
                                ),
                              }}
                            />
                            {setting.key === 'version_backend' &&
                              setting.controller_props?.recommended && (
                                <div className="mt-1 text-sm text-main-view-fg/60">
                                  <span className="font-medium">
                                    {setting.controller_props.recommended
                                      ?.split('/')
                                      .pop() ||
                                      setting.controller_props.recommended}
                                  </span>
                                  <span> is the recommended backend.</span>
                                </div>
                              )}
                            {setting.key === 'version_backend' &&
                              provider?.provider === 'llamacpp' && (
                                <div className="mt-2 flex flex-wrap gap-2">
                                  <Button
                                    variant="link"
                                    size="sm"
                                    className="p-0"
                                    onClick={handleCheckForBackendUpdate}
                                    disabled={isCheckingBackendUpdate}
                                  >
                                    <div className="cursor-pointer flex items-center justify-center rounded-sm hover:bg-main-view-fg/15 bg-main-view-fg/10 transition-all duration-200 ease-in-out px-2 py-1 gap-1">
                                      <IconRefresh
                                        size={12}
                                        className={cn(
                                          'text-main-view-fg/50',
                                          isCheckingBackendUpdate &&
                                            'animate-spin'
                                        )}
                                      />
                                      <span>
                                        {isCheckingBackendUpdate
                                          ? t(
                                              'settings:checkingForBackendUpdates'
                                            )
                                          : t(
                                              'settings:checkForBackendUpdates'
                                            )}
                                      </span>
                                    </div>
                                  </Button>
                                  <Button
                                    variant="link"
                                    size="sm"
                                    className="p-0"
                                    onClick={handleInstallBackendFromFile}
                                    disabled={isInstallingBackend}
                                  >
                                    <div className="cursor-pointer flex items-center justify-center rounded-sm hover:bg-main-view-fg/15 bg-main-view-fg/10 transition-all duration-200 ease-in-out px-2 py-1 gap-1">
                                      <IconUpload
                                        size={12}
                                        className={cn(
                                          'text-main-view-fg/50',
                                          isInstallingBackend && 'animate-pulse'
                                        )}
                                      />
                                      <span>
                                        {isInstallingBackend
                                          ? 'Installing Backend...'
                                          : 'Install Backend from File'}
                                      </span>
                                    </div>
                                  </Button>
                                </div>
                              )}
                          </>
                        }
                        actions={actionComponent}
                      />
                    )
                  })}

                  <DeleteProvider provider={provider} />
                </Card>

                {/* Models */}
                <Card
                  header={
                    <div className="flex items-center justify-between mb-4">
                      <h1 className="text-main-view-fg font-medium text-base">
                        {t('providers:models')}
                      </h1>
                      <div className="flex items-center gap-2">
                        {provider && provider.provider !== 'llamacpp' && (
                          <>
                            {!predefinedProviders.some(
                              (p) => p.provider === provider.provider
                            ) && (
                              <Button
                                variant="link"
                                size="sm"
                                className="hover:no-underline"
                                onClick={handleRefreshModels}
                                disabled={refreshingModels}
                              >
                                <div className="cursor-pointer flex items-center justify-center rounded hover:bg-main-view-fg/15 bg-main-view-fg/10 transition-all duration-200 ease-in-out px-1.5 py-1 gap-1">
                                  {refreshingModels ? (
                                    <IconLoader
                                      size={18}
                                      className="text-main-view-fg/50 animate-spin"
                                    />
                                  ) : (
                                    <IconRefresh
                                      size={18}
                                      className="text-main-view-fg/50"
                                    />
                                  )}
                                  <span className="text-main-view-fg/70">
                                    {refreshingModels
                                      ? t('providers:refreshing')
                                      : t('providers:refresh')}
                                  </span>
                                </div>
                              </Button>
                            )}
                            <DialogAddModel provider={provider} />
                          </>
                        )}
                        {provider && provider.provider === 'llamacpp' && (
                          <ImportVisionModelDialog
                            provider={provider}
                            onSuccess={handleModelImportSuccess}
                            trigger={
                              <Button
                                variant="link"
                                size="sm"
                                className="hover:no-underline !outline-none focus:outline-none active:outline-none"
                                asChild
                              >
                                <div className="cursor-pointer flex items-center justify-center rounded hover:bg-main-view-fg/15 bg-main-view-fg/10 transition-all duration-200 ease-in-out p-1.5 py-1 gap-1 -mr-2">
                                  <IconFolderPlus
                                    size={18}
                                    className="text-main-view-fg/50"
                                  />
                                  <span className="text-main-view-fg/70">
                                    {t('providers:import')}
                                  </span>
                                </div>
                              </Button>
                            }
                          />
                        )}
                      </div>
                    </div>
                  }
                >
                  {provider?.models.length ? (
                    provider?.models.map((model, modelIndex) => {
                      const capabilities = model.capabilities || []
                      return (
                        <CardItem
                          key={modelIndex}
                          title={
                            <div className="flex items-center gap-2">
                              <h1
                                className="font-medium line-clamp-1"
                                title={model.id}
                              >
                                {model.id}
                              </h1>
                              <Capabilities capabilities={capabilities} />
                            </div>
                          }
                          actions={
                            <div className="flex items-center gap-0.5">
                              <DialogEditModel
                                provider={provider}
                                modelId={model.id}
                              />
                              {model.settings && (
                                <ModelSetting
                                  provider={provider}
                                  model={model}
                                />
                              )}
                              {((provider &&
                                !predefinedProviders.some(
                                  (p) => p.provider === provider.provider
                                )) ||
                                (provider &&
                                  predefinedProviders.some(
                                    (p) => p.provider === provider.provider
                                  ) &&
                                  Boolean(provider.api_key?.length))) && (
                                <FavoriteModelAction model={model} />
                              )}
                              <DialogDeleteModel
                                provider={provider}
                                modelId={model.id}
                              />
                              {provider && provider.provider === 'llamacpp' && (
                                <div className="ml-2">
                                  {activeModels.some(
                                    (activeModel) => activeModel === model.id
                                  ) ? (
                                    <Button
                                      size="sm"
                                      variant="destructive"
                                      onClick={() => handleStopModel(model.id)}
                                    >
                                      {t('providers:stop')}
                                    </Button>
                                  ) : (
                                    <Button
                                      size="sm"
                                      disabled={loadingModels.includes(
                                        model.id
                                      )}
                                      onClick={() => handleStartModel(model.id)}
                                    >
                                      {loadingModels.includes(model.id) ? (
                                        <div className="flex items-center gap-2">
                                          <IconLoader
                                            size={16}
                                            className="animate-spin"
                                          />
                                        </div>
                                      ) : (
                                        t('providers:start')
                                      )}
                                    </Button>
                                  )}
                                </div>
                              )}
                            </div>
                          }
                        />
                      )
                    })
                  ) : (
                    <div className="-mt-2">
                      <div className="flex items-center gap-2 text-main-view-fg/80">
                        <h6 className="font-medium text-base">
                          {t('providers:noModelFound')}
                        </h6>
                      </div>
                      <p className="text-main-view-fg/70 mt-1 text-xs leading-relaxed">
                        {t('providers:noModelFoundDesc')}
                        &nbsp;
                        <Link to={route.hub.index}>{t('common:hub')}</Link>
                      </p>
                    </div>
                  )}
                </Card>
              </div>
            </div>
          </div>
        </div>
      </div>
    </>
  )
}
