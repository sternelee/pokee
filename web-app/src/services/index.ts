/**
 * Service Hub - Centralized service initialization and access
 *
 * This hub initializes all platform services once at app startup,
 * then provides synchronous access to service instances throughout the app.
 */

import { isPlatformTauri } from '@/lib/platform/utils'

// Import default services
import { DefaultThemeService } from './theme/default'
import { DefaultWindowService } from './window/default'
import { DefaultEventsService } from './events/default'
import { DefaultHardwareService } from './hardware/default'
import { DefaultAppService } from './app/default'
import { DefaultAnalyticService } from './analytic/default'
import { DefaultMessagesService } from './messages/default'
import { DefaultMCPService } from './mcp/default'
import { DefaultThreadsService } from './threads/default'
import { DefaultProvidersService } from './providers/default'
import { DefaultModelsService } from './models/default'
import { DefaultAssistantsService } from './assistants/default'
import { DefaultDialogService } from './dialog/default'
import { DefaultOpenerService } from './opener/default'
import { DefaultUpdaterService } from './updater/default'
import { DefaultPathService } from './path/default'
import { DefaultCoreService } from './core/default'
import { DefaultDeepLinkService } from './deeplink/default'

// Import service types
import type { ThemeService } from './theme/types'
import type { WindowService } from './window/types'
import type { EventsService } from './events/types'
import type { HardwareService } from './hardware/types'
import type { AppService } from './app/types'
import type { AnalyticService } from './analytic/types'
import type { MessagesService } from './messages/types'
import type { MCPService } from './mcp/types'
import type { ThreadsService } from './threads/types'
import type { ProvidersService } from './providers/types'
import type { ModelsService } from './models/types'
import type { AssistantsService } from './assistants/types'
import type { DialogService } from './dialog/types'
import type { OpenerService } from './opener/types'
import type { UpdaterService } from './updater/types'
import type { PathService } from './path/types'
import type { CoreService } from './core/types'
import type { DeepLinkService } from './deeplink/types'

export interface ServiceHub {
  // Service getters - all synchronous after initialization
  theme(): ThemeService
  window(): WindowService
  events(): EventsService
  hardware(): HardwareService
  app(): AppService
  analytic(): AnalyticService
  messages(): MessagesService
  mcp(): MCPService
  threads(): ThreadsService
  providers(): ProvidersService
  models(): ModelsService
  assistants(): AssistantsService
  dialog(): DialogService
  opener(): OpenerService
  updater(): UpdaterService
  path(): PathService
  core(): CoreService
  deeplink(): DeepLinkService
}

class PlatformServiceHub implements ServiceHub {
  private themeService: ThemeService = new DefaultThemeService()
  private windowService: WindowService = new DefaultWindowService()
  private eventsService: EventsService = new DefaultEventsService()
  private hardwareService: HardwareService = new DefaultHardwareService()
  private appService: AppService = new DefaultAppService()
  private analyticService: AnalyticService = new DefaultAnalyticService()
  private messagesService: MessagesService = new DefaultMessagesService()
  private mcpService: MCPService = new DefaultMCPService()
  private threadsService: ThreadsService = new DefaultThreadsService()
  private providersService: ProvidersService = new DefaultProvidersService()
  private modelsService: ModelsService = new DefaultModelsService()
  private assistantsService: AssistantsService = new DefaultAssistantsService()
  private dialogService: DialogService = new DefaultDialogService()
  private openerService: OpenerService = new DefaultOpenerService()
  private updaterService: UpdaterService = new DefaultUpdaterService()
  private pathService: PathService = new DefaultPathService()
  private coreService: CoreService = new DefaultCoreService()
  private deepLinkService: DeepLinkService = new DefaultDeepLinkService()
  private initialized = false

  /**
   * Initialize all platform services
   */
  async initialize(): Promise<void> {
    if (this.initialized) return

    console.log(
      'Initializing service hub for platform:',
      isPlatformTauri() ? 'Tauri' : 'Web'
    )

    try {
      if (isPlatformTauri()) {
        const [
          themeModule,
          windowModule,
          eventsModule,
          hardwareModule,
          appModule,
          mcpModule,
          providersModule,
          dialogModule,
          openerModule,
          updaterModule,
          pathModule,
          coreModule,
          deepLinkModule,
        ] = await Promise.all([
          import('./theme/tauri'),
          import('./window/tauri'),
          import('./events/tauri'),
          import('./hardware/tauri'),
          import('./app/tauri'),
          import('./mcp/tauri'),
          import('./providers/tauri'),
          import('./dialog/tauri'),
          import('./opener/tauri'),
          import('./updater/tauri'),
          import('./path/tauri'),
          import('./core/tauri'),
          import('./deeplink/tauri'),
        ])

        this.themeService = new themeModule.TauriThemeService()
        this.windowService = new windowModule.TauriWindowService()
        this.eventsService = new eventsModule.TauriEventsService()
        this.hardwareService = new hardwareModule.TauriHardwareService()
        this.appService = new appModule.TauriAppService()
        this.mcpService = new mcpModule.TauriMCPService()
        this.providersService = new providersModule.TauriProvidersService()
        this.dialogService = new dialogModule.TauriDialogService()
        this.openerService = new openerModule.TauriOpenerService()
        this.updaterService = new updaterModule.TauriUpdaterService()
        this.pathService = new pathModule.TauriPathService()
        this.coreService = new coreModule.TauriCoreService()
        this.deepLinkService = new deepLinkModule.TauriDeepLinkService()
      } else {
        const [
          themeModule,
          appModule,
          pathModule,
          coreModule,
          dialogModule,
          eventsModule,
          windowModule,
          deepLinkModule,
          providersModule,
          mcpModule,
        ] = await Promise.all([
          import('./theme/web'),
          import('./app/web'),
          import('./path/web'),
          import('./core/web'),
          import('./dialog/web'),
          import('./events/web'),
          import('./window/web'),
          import('./deeplink/web'),
          import('./providers/web'),
          import('./mcp/web'),
        ])

        this.themeService = new themeModule.WebThemeService()
        this.appService = new appModule.WebAppService()
        this.pathService = new pathModule.WebPathService()
        this.coreService = new coreModule.WebCoreService()
        this.dialogService = new dialogModule.WebDialogService()
        this.eventsService = new eventsModule.WebEventsService()
        this.windowService = new windowModule.WebWindowService()
        this.deepLinkService = new deepLinkModule.WebDeepLinkService()
        this.providersService = new providersModule.WebProvidersService()
        this.mcpService = new mcpModule.WebMCPService()
      }

      this.initialized = true
      console.log('Service hub initialized successfully')
    } catch (error) {
      console.error('Failed to initialize service hub:', error)
      this.initialized = true
      throw error
    }
  }

  private ensureInitialized(): void {
    if (!this.initialized) {
      throw new Error(
        'Service hub not initialized. Call initializeServiceHub() first.'
      )
    }
  }

  // Service getters - all synchronous after initialization
  theme(): ThemeService {
    this.ensureInitialized()
    return this.themeService
  }

  window(): WindowService {
    this.ensureInitialized()
    return this.windowService
  }

  events(): EventsService {
    this.ensureInitialized()
    return this.eventsService
  }

  hardware(): HardwareService {
    this.ensureInitialized()
    return this.hardwareService
  }

  app(): AppService {
    this.ensureInitialized()
    return this.appService
  }

  analytic(): AnalyticService {
    this.ensureInitialized()
    return this.analyticService
  }

  messages(): MessagesService {
    this.ensureInitialized()
    return this.messagesService
  }

  mcp(): MCPService {
    this.ensureInitialized()
    return this.mcpService
  }

  threads(): ThreadsService {
    this.ensureInitialized()
    return this.threadsService
  }

  providers(): ProvidersService {
    this.ensureInitialized()
    return this.providersService
  }

  models(): ModelsService {
    this.ensureInitialized()
    return this.modelsService
  }

  assistants(): AssistantsService {
    this.ensureInitialized()
    return this.assistantsService
  }

  dialog(): DialogService {
    this.ensureInitialized()
    return this.dialogService
  }

  opener(): OpenerService {
    this.ensureInitialized()
    return this.openerService
  }

  updater(): UpdaterService {
    this.ensureInitialized()
    return this.updaterService
  }

  path(): PathService {
    this.ensureInitialized()
    return this.pathService
  }

  core(): CoreService {
    this.ensureInitialized()
    return this.coreService
  }

  deeplink(): DeepLinkService {
    this.ensureInitialized()
    return this.deepLinkService
  }
}

export async function initializeServiceHub(): Promise<ServiceHub> {
  const serviceHub = new PlatformServiceHub()
  await serviceHub.initialize()
  return serviceHub
}
