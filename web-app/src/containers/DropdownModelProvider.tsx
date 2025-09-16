import { useEffect, useState, useRef, useMemo, useCallback } from 'react'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover'
import { useModelProvider } from '@/hooks/useModelProvider'
import { cn, getProviderTitle } from '@/lib/utils'
import { highlightFzfMatch } from '@/utils/highlight'
import Capabilities from './Capabilities'
import { IconSettings, IconX } from '@tabler/icons-react'
import { useNavigate } from '@tanstack/react-router'
import { route } from '@/constants/routes'
import { useThreads } from '@/hooks/useThreads'
import ProvidersAvatar from '@/containers/ProvidersAvatar'
import { Fzf } from 'fzf'
import { localStorageKey } from '@/constants/localStorage'
import { useTranslation } from '@/i18n/react-i18next-compat'
import { useFavoriteModel } from '@/hooks/useFavoriteModel'
import { predefinedProviders } from '@/consts/providers'
import { useServiceHub } from '@/hooks/useServiceHub'
import { PlatformFeatures } from '@/lib/platform/const'
import { PlatformFeature } from '@/lib/platform/types'

type DropdownModelProviderProps = {
  model?: ThreadModel
  useLastUsedModel?: boolean
}

interface SearchableModel {
  provider: ModelProvider
  model: Model
  searchStr: string
  value: string
  highlightedId?: string
}

// Helper functions for localStorage
const getLastUsedModel = (): { provider: string; model: string } | null => {
  try {
    const stored = localStorage.getItem(localStorageKey.lastUsedModel)
    return stored ? JSON.parse(stored) : null
  } catch (error) {
    console.debug('Failed to get last used model from localStorage:', error)
    return null
  }
}

const setLastUsedModel = (provider: string, model: string) => {
  try {
    localStorage.setItem(
      localStorageKey.lastUsedModel,
      JSON.stringify({ provider, model })
    )
  } catch (error) {
    console.debug('Failed to set last used model in localStorage:', error)
  }
}

const DropdownModelProvider = ({
  model,
  useLastUsedModel = false,
}: DropdownModelProviderProps) => {
  const {
    providers,
    getProviderByName,
    selectModelProvider,
    // getModelBy,
    selectedProvider,
    selectedModel,
    updateProvider,
  } = useModelProvider()
  const [displayModel, setDisplayModel] = useState<string>('')
  const { updateCurrentThreadModel } = useThreads()
  const navigate = useNavigate()
  const { t } = useTranslation()
  const { favoriteModels } = useFavoriteModel()
  const serviceHub = useServiceHub()

  // Search state
  const [open, setOpen] = useState(false)
  const [searchValue, setSearchValue] = useState('')
  const searchInputRef = useRef<HTMLInputElement>(null)

  // Helper function to check if a model exists in providers
  const checkModelExists = useCallback(
    (providerName: string, modelId: string) => {
      const provider = providers.find(
        (p) => p.provider === providerName && p.active
      )
      return provider?.models.find((m) => m.id === modelId)
    },
    [providers]
  )

  // Helper function to get context size from model settings
  // const getContextSize = useCallback((): number => {
  //   if (!selectedModel?.settings?.ctx_len?.controller_props?.value) {
  //     return 8192 // Default context size
  //   }
  //   return selectedModel.settings.ctx_len.controller_props.value as number
  // }, [selectedModel?.settings?.ctx_len?.controller_props?.value])

  // Initialize model provider - avoid race conditions with manual selections
  useEffect(() => {
    const initializeModel = async () => {
      // Auto select model when existing thread is passed
      if (model) {
        selectModelProvider(model?.provider as string, model?.id as string)
        if (!checkModelExists(model.provider, model.id)) {
          selectModelProvider('', '')
        }
      } else if (useLastUsedModel) {
        // Try to use last used model only when explicitly requested (for new chat)
        const lastUsed = getLastUsedModel()
        if (lastUsed && checkModelExists(lastUsed.provider, lastUsed.model)) {
          selectModelProvider(lastUsed.provider, lastUsed.model)
        } else {
          // For web-only builds, auto-select the first model from jan provider
          if (PlatformFeatures[PlatformFeature.WEB_AUTO_MODEL_SELECTION]) {
            const janProvider = providers.find(
              (p) => p.provider === 'jan' && p.active && p.models.length > 0
            )
            if (janProvider && janProvider.models.length > 0) {
              const firstModel = janProvider.models[0]
              selectModelProvider(janProvider.provider, firstModel.id)
              return
            }
          }
          selectModelProvider('', '')
        }
      } else {
        // Get current state for web auto-selection check
        const currentState = { selectedModel, selectedProvider }
        if (
          PlatformFeatures[PlatformFeature.WEB_AUTO_MODEL_SELECTION] &&
          !currentState.selectedModel &&
          !currentState.selectedProvider
        ) {
          // For web-only builds, auto-select the first model from jan provider only if nothing is selected
          const janProvider = providers.find(
            (p) => p.provider === 'jan' && p.active && p.models.length > 0
          )
          if (janProvider && janProvider.models.length > 0) {
            const firstModel = janProvider.models[0]
            selectModelProvider(janProvider.provider, firstModel.id)
          }
        }
      }
    }

    initializeModel()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    model,
    selectModelProvider,
    updateCurrentThreadModel,
    providers,
    useLastUsedModel,
    checkModelExists,
    updateProvider,
    getProviderByName,
    serviceHub,
    // selectedModel and selectedProvider intentionally excluded to prevent race conditions
  ])

  // Update display model when selection changes
  useEffect(() => {
    if (selectedProvider && selectedModel) {
      setDisplayModel(selectedModel.id)
    } else {
      setDisplayModel(t('common:selectAModel'))
    }
  }, [selectedProvider, selectedModel, t])

  // Reset search value when dropdown closes
  const onOpenChange = useCallback((open: boolean) => {
    setOpen(open)
    if (!open) {
      requestAnimationFrame(() => setSearchValue(''))
    } else {
      // Focus search input when opening
      setTimeout(() => {
        searchInputRef.current?.focus()
      }, 100)
    }
  }, [])

  // Clear search and focus input
  const onClearSearch = useCallback(() => {
    setSearchValue('')
    searchInputRef.current?.focus()
  }, [])

  // Create searchable items from all models
  const searchableItems = useMemo(() => {
    const items: SearchableModel[] = []

    providers.forEach((provider) => {
      if (!provider.active) return

      provider.models.forEach((modelItem) => {
        // Skip models that require API key but don't have one
        if (
          provider &&
          predefinedProviders.some((e) =>
            e.provider.includes(provider.provider)
          ) &&
          !provider.api_key?.length
        )
          return

        const capabilities = modelItem.capabilities || []
        const capabilitiesString = capabilities.join(' ')
        const providerTitle = getProviderTitle(provider.provider)

        // Create search string with model id, provider, and capabilities
        const searchStr =
          `${modelItem.id} ${providerTitle} ${provider.provider} ${capabilitiesString}`.toLowerCase()

        items.push({
          provider,
          model: modelItem,
          searchStr,
          value: `${provider.provider}:${modelItem.id}`,
        })
      })
    })

    return items
  }, [providers])

  // Create Fzf instance for fuzzy search
  const fzfInstance = useMemo(() => {
    return new Fzf(searchableItems, {
      selector: (item) => item.model.id.toLowerCase(),
    })
  }, [searchableItems])

  // Get favorite models that are currently available
  const favoriteItems = useMemo(() => {
    return searchableItems.filter((item) =>
      favoriteModels.some((fav) => fav.id === item.model.id)
    )
  }, [searchableItems, favoriteModels])

  // Filter models based on search value
  const filteredItems = useMemo(() => {
    if (!searchValue) return searchableItems

    return fzfInstance.find(searchValue.toLowerCase()).map((result) => {
      const item = result.item
      const positions = Array.from(result.positions) || []
      const highlightedId = highlightFzfMatch(
        item.model.id,
        positions,
        'text-accent'
      )

      return {
        ...item,
        highlightedId,
      }
    })
  }, [searchableItems, searchValue, fzfInstance])

  // Group filtered items by provider, excluding favorites when not searching
  const groupedItems = useMemo(() => {
    const groups: Record<string, SearchableModel[]> = {}

    if (!searchValue) {
      // When not searching, show all active providers (even without models)
      providers.forEach((provider) => {
        if (provider.active) {
          groups[provider.provider] = []
        }
      })
    }

    // Add the filtered items to their respective groups
    filteredItems.forEach((item) => {
      const providerKey = item.provider.provider
      if (!groups[providerKey]) {
        groups[providerKey] = []
      }

      // When not searching, exclude favorite models from regular provider sections
      const isFavorite = favoriteModels.some((fav) => fav.id === item.model.id)
      if (!searchValue && isFavorite) return // Skip adding this item to regular provider section

      groups[providerKey].push(item)
    })

    return groups
  }, [filteredItems, providers, searchValue, favoriteModels])

  const handleSelect = useCallback(
    async (searchableModel: SearchableModel) => {
      selectModelProvider(
        searchableModel.provider.provider,
        searchableModel.model.id
      )
      updateCurrentThreadModel({
        id: searchableModel.model.id,
        provider: searchableModel.provider.provider,
      })

      // Store the selected model as last used
      if (useLastUsedModel) {
        setLastUsedModel(
          searchableModel.provider.provider,
          searchableModel.model.id
        )
      }
      setSearchValue('')
      setOpen(false)
    },
    [
      selectModelProvider,
      updateCurrentThreadModel,
      useLastUsedModel,
      // updateProvider,
      // getProviderByName,
      // serviceHub,
    ]
  )

  if (!providers.length) return null

  const provider = getProviderByName(selectedProvider)

  return (
    <Popover open={open} onOpenChange={onOpenChange}>
      <div className="bg-main-view-fg/5 hover:bg-main-view-fg/8 px-2 py-1 flex items-center gap-1.5 rounded-sm max-h-[32px] mr-0.5">
        <PopoverTrigger asChild>
          <button
            title={displayModel}
            className="font-medium cursor-pointer flex items-center gap-1.5 relative z-20 max-w-38"
          >
            {provider && (
              <div className="shrink-0">
                <ProvidersAvatar provider={provider} />
              </div>
            )}
            <span
              className={cn(
                'text-main-view-fg/80 truncate leading-normal',
                !selectedModel?.id && 'text-main-view-fg/50'
              )}
            >
              {displayModel}
            </span>
          </button>
        </PopoverTrigger>
      </div>

      <PopoverContent
        className={cn(
          'w-60 p-0 backdrop-blur-2xl',
          searchValue.length === 0 && 'h-[320px]'
        )}
        align="start"
        sideOffset={10}
        alignOffset={-8}
        side={searchValue.length === 0 ? undefined : 'top'}
        avoidCollisions={searchValue.length === 0 ? true : false}
      >
        <div className="flex flex-col w-full h-full">
          {/* Search input */}
          <div className="relative px-2 py-1.5 border-b border-main-view-fg/10 backdrop-blur-4xl">
            <input
              ref={searchInputRef}
              value={searchValue}
              onChange={(e) => setSearchValue(e.target.value)}
              placeholder={t('common:searchModels')}
              className="text-sm font-normal outline-0"
            />
            {searchValue.length > 0 && (
              <div className="absolute right-2 top-0 bottom-0 flex items-center justify-center">
                <IconX
                  size={16}
                  className="text-main-view-fg/50 hover:text-main-view-fg cursor-pointer"
                  onClick={onClearSearch}
                />
              </div>
            )}
          </div>

          {/* Model list */}
          <div className="max-h-[320px] overflow-y-auto">
            {Object.keys(groupedItems).length === 0 && searchValue ? (
              <div className="py-3 px-4 text-sm text-main-view-fg/60">
                {t('common:noModelsFoundFor', { searchValue })}
              </div>
            ) : (
              <div className="py-1">
                {/* Favorites section - only show when not searching */}
                {!searchValue && favoriteItems.length > 0 && (
                  <div className="bg-main-view-fg/2 backdrop-blur-2xl rounded-sm my-1.5 mx-1.5">
                    {/* Favorites header */}
                    <div className="flex items-center gap-1.5 px-2 py-1">
                      <span className="text-sm font-medium text-main-view-fg/80">
                        {t('common:favorites')}
                      </span>
                    </div>

                    {/* Favorite models */}
                    {favoriteItems.map((searchableModel) => {
                      const isSelected =
                        selectedModel?.id === searchableModel.model.id &&
                        selectedProvider === searchableModel.provider.provider
                      const capabilities =
                        searchableModel.model.capabilities || []

                      return (
                        <div
                          key={`fav-${searchableModel.value}`}
                          title={searchableModel.model.id}
                          onClick={() => handleSelect(searchableModel)}
                          className={cn(
                            'mx-1 mb-1 px-2 py-1.5 rounded-sm cursor-pointer flex items-center gap-2 transition-all duration-200',
                            'hover:bg-main-view-fg/4',
                            isSelected &&
                              'bg-main-view-fg/8 hover:bg-main-view-fg/8'
                          )}
                        >
                          <div className="flex items-center gap-1 flex-1 min-w-0">
                            <div className="shrink-0 -ml-1">
                              <ProvidersAvatar
                                provider={searchableModel.provider}
                              />
                            </div>
                            <span className="truncate text-main-view-fg/80 text-sm">
                              {searchableModel.model.id}
                            </span>
                            <div className="flex-1"></div>
                            {capabilities.length > 0 && (
                              <div className="flex-shrink-0 -mr-1.5">
                                <Capabilities capabilities={capabilities} />
                              </div>
                            )}
                          </div>
                        </div>
                      )
                    })}
                  </div>
                )}

                {/* Divider between favorites and regular providers */}
                {favoriteItems.length > 0 && (
                  <div className="border-b border-1 border-main-view-fg/8 mx-2"></div>
                )}

                {/* Regular provider sections */}
                {Object.entries(groupedItems).map(([providerKey, models]) => {
                  const providerInfo = providers.find(
                    (p) => p.provider === providerKey
                  )

                  if (!providerInfo) return null

                  return (
                    <div
                      key={providerKey}
                      className="bg-main-view-fg/2 backdrop-blur-2xl first:mt-0 rounded-sm my-1.5 mx-1.5 first:mb-0"
                    >
                      {/* Provider header */}
                      <div className="flex items-center justify-between px-2 py-1">
                        <div className="flex items-center gap-1.5">
                          <ProvidersAvatar provider={providerInfo} />
                          <span className="capitalize truncate text-sm font-medium text-main-view-fg/80">
                            {getProviderTitle(providerInfo.provider)}
                          </span>
                        </div>
                        {PlatformFeatures[
                          PlatformFeature.MODEL_PROVIDER_SETTINGS
                        ] && (
                          <div
                            className="size-6 cursor-pointer flex items-center justify-center rounded-sm hover:bg-main-view-fg/10 transition-all duration-200 ease-in-out"
                            onClick={(e) => {
                              e.stopPropagation()
                              navigate({
                                to: route.settings.providers,
                                params: { providerName: providerInfo.provider },
                              })
                              setOpen(false)
                            }}
                          >
                            <IconSettings
                              size={16}
                              className="text-main-view-fg/50"
                            />
                          </div>
                        )}
                      </div>

                      {/* Models for this provider */}
                      {models.length === 0 ? (
                        // Show message when provider has no available models
                        <></>
                      ) : (
                        models.map((searchableModel) => {
                          const isSelected =
                            selectedModel?.id === searchableModel.model.id &&
                            selectedProvider ===
                              searchableModel.provider.provider
                          const capabilities =
                            searchableModel.model.capabilities || []

                          return (
                            <div
                              key={searchableModel.value}
                              title={searchableModel.model.id}
                              onClick={() => handleSelect(searchableModel)}
                              className={cn(
                                'mx-1 mb-1 px-2 py-1.5 rounded-sm cursor-pointer flex items-center gap-2 transition-all duration-200',
                                'hover:bg-main-view-fg/4',
                                isSelected &&
                                  'bg-main-view-fg/8 hover:bg-main-view-fg/8'
                              )}
                            >
                              <div className="flex items-center gap-2 flex-1 min-w-0">
                                <span
                                  className="truncate text-main-view-fg/80 text-sm"
                                  title={searchableModel.model.id}
                                >
                                  {searchableModel.model.id}
                                </span>

                                <div className="flex-1"></div>
                                {capabilities.length > 0 && (
                                  <div className="flex-shrink-0 -mr-1.5">
                                    <Capabilities capabilities={capabilities} />
                                  </div>
                                )}
                              </div>
                            </div>
                          )
                        })
                      )}
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        </div>
      </PopoverContent>
    </Popover>
  )
}

export default DropdownModelProvider
