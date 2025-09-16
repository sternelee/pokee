import { createFileRoute } from '@tanstack/react-router'
import { route } from '@/constants/routes'
import SettingsMenu from '@/containers/SettingsMenu'
import HeaderPage from '@/containers/HeaderPage'
import { Card, CardItem } from '@/containers/Card'
import { Progress } from '@/components/ui/progress'
import { useTranslation } from '@/i18n/react-i18next-compat'
import { useHardware } from '@/hooks/useHardware'
import { useEffect, useState } from 'react'
import { IconDeviceDesktopAnalytics } from '@tabler/icons-react'
import { useServiceHub } from '@/hooks/useServiceHub'
import type { HardwareData, SystemUsage } from '@/services/hardware/types'
import { formatMegaBytes } from '@/lib/utils'
import { toNumber } from '@/utils/number'
import { PlatformGuard } from '@/lib/platform/PlatformGuard'
import { PlatformFeature } from '@/lib/platform'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const Route = createFileRoute(route.settings.hardware as any)({
  component: Hardware,
})

function Hardware() {
  return (
    <PlatformGuard feature={PlatformFeature.HARDWARE_MONITORING}>
      <HardwareContent />
    </PlatformGuard>
  )
}

function HardwareContent() {
  const { t } = useTranslation()
  const [isLoading, setIsLoading] = useState(false)
  const serviceHub = useServiceHub()
  const {
    hardwareData,
    systemUsage,
    setHardwareData,
    updateSystemUsage,
    pollingPaused,
  } = useHardware()

  // Fetch initial hardware info and system usage
  useEffect(() => {
    setIsLoading(true)
    Promise.all([
      serviceHub
        .hardware()
        .getHardwareInfo()
        .then((data: HardwareData | null) => {
          if (data) setHardwareData(data)
        })
        .catch((error) => {
          console.error('Failed to get hardware info:', error)
        }),
      serviceHub
        .hardware()
        .getSystemUsage()
        .then((data: SystemUsage | null) => {
          if (data) updateSystemUsage(data)
        })
        .catch((error: unknown) => {
          console.error('Failed to get initial system usage:', error)
        }),
    ]).finally(() => {
      setIsLoading(false)
    })
  }, [serviceHub, setHardwareData, updateSystemUsage])

  useEffect(() => {
    if (pollingPaused) {
      return
    }
    const intervalId = setInterval(() => {
      serviceHub
        .hardware()
        .getSystemUsage()
        .then((data: SystemUsage | null) => {
          if (data) updateSystemUsage(data)
        })
        .catch((error: unknown) => {
          console.error('Failed to get system usage:', error)
        })
    }, 5000)

    return () => clearInterval(intervalId)
  }, [serviceHub, updateSystemUsage, pollingPaused])

  const handleClickSystemMonitor = async () => {
    try {
      await serviceHub.window().openSystemMonitorWindow()
    } catch (error) {
      console.error('Failed to open system monitor window:', error)
    }
  }

  return (
    <div className="flex flex-col h-full">
      <HeaderPage>
        <div className="flex items-center gap-2 justify-between w-full pr-3">
          <h1 className="font-medium">{t('common:settings')}</h1>
          <div
            className="flex items-center gap-1 hover:bg-main-view-fg/8 px-1.5 py-0.5 rounded relative z-10 cursor-pointer"
            onClick={handleClickSystemMonitor}
          >
            <IconDeviceDesktopAnalytics className="text-main-view-fg/50 size-5" />
            <p>{t('settings:hardware.systemMonitor')}</p>
          </div>
        </div>
      </HeaderPage>
      <div className="flex h-full w-full">
        <SettingsMenu />
        <div className="p-4 w-full h-[calc(100%-32px)] overflow-y-auto">
          {isLoading ? (
            <div className="flex items-center justify-center h-32">
              <div className="text-main-view-fg/50">
                Loading hardware information...
              </div>
            </div>
          ) : (
            <div className="flex flex-col justify-between gap-4 gap-y-3 w-full">
              {/* OS Information */}
              <Card title={t('settings:hardware.os')}>
                <CardItem
                  title={t('settings:hardware.name')}
                  actions={
                    <span className="text-main-view-fg/80 capitalize">
                      {hardwareData.os_type}
                    </span>
                  }
                />
                <CardItem
                  title={t('settings:hardware.version')}
                  actions={
                    <span className="text-main-view-fg/80">
                      {hardwareData.os_name}
                    </span>
                  }
                />
              </Card>

              {/* CPU Information */}
              <Card title={t('settings:hardware.cpu')}>
                <CardItem
                  title={t('settings:hardware.model')}
                  actions={
                    <span className="text-main-view-fg/80">
                      {hardwareData.cpu?.name}
                    </span>
                  }
                />
                <CardItem
                  title={t('settings:hardware.architecture')}
                  actions={
                    <span className="text-main-view-fg/80">
                      {hardwareData.cpu?.arch}
                    </span>
                  }
                />
                <CardItem
                  title={t('settings:hardware.cores')}
                  actions={
                    <span className="text-main-view-fg/80">
                      {hardwareData.cpu?.core_count}
                    </span>
                  }
                />
                {hardwareData.cpu?.extensions?.join(', ').length > 0 && (
                  <CardItem
                    title={t('settings:hardware.instructions')}
                    column={hardwareData.cpu?.extensions.length > 6}
                    actions={
                      <span className="text-main-view-fg/80 break-words">
                        {hardwareData.cpu?.extensions?.join(', ')}
                      </span>
                    }
                  />
                )}
                <CardItem
                  title={t('settings:hardware.usage')}
                  actions={
                    <div className="flex items-center gap-2">
                      {systemUsage.cpu > 0 && (
                        <>
                          <Progress
                            value={systemUsage.cpu}
                            className="h-2 w-10"
                          />
                          <span className="text-main-view-fg/80">
                            {systemUsage.cpu?.toFixed(2)}%
                          </span>
                        </>
                      )}
                    </div>
                  }
                />
              </Card>

              {/* RAM Information */}
              <Card title={t('settings:hardware.memory')}>
                <CardItem
                  title={t('settings:hardware.totalRam')}
                  actions={
                    <span className="text-main-view-fg/80">
                      {formatMegaBytes(hardwareData.total_memory)}
                    </span>
                  }
                />
                <CardItem
                  title={t('settings:hardware.availableRam')}
                  actions={
                    <span className="text-main-view-fg/80">
                      {formatMegaBytes(
                        hardwareData.total_memory - systemUsage.used_memory
                      )}
                    </span>
                  }
                />
                <CardItem
                  title={t('settings:hardware.usage')}
                  actions={
                    <div className="flex items-center gap-2">
                      {hardwareData.total_memory > 0 && (
                        <>
                          <Progress
                            value={
                              toNumber(
                                systemUsage.used_memory /
                                  hardwareData.total_memory
                              ) * 100
                            }
                            className="h-2 w-10"
                          />
                          <span className="text-main-view-fg/80">
                            {(
                              toNumber(
                                systemUsage.used_memory /
                                  hardwareData.total_memory
                              ) * 100
                            ).toFixed(2)}
                            %
                          </span>
                        </>
                      )}
                    </div>
                  }
                />
              </Card>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
