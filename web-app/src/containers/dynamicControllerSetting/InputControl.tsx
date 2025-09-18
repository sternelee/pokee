import { useState } from 'react'
import { Input } from '@/components/ui/input'
import { Copy, Eye, EyeOff, CopyCheck } from 'lucide-react'
import { cn } from '@/lib/utils'
import { invoke } from '@tauri-apps/api/core'

type InputControl = {
  type?: string
  placeholder?: string
  value: string
  onChange: (value: string) => void
  inputActions?: string[]
  className?: string
  envVarHint?: string
  provider?: string
  settingKey?: string
}

export function InputControl({
  type = 'text',
  placeholder = '',
  value = '',
  onChange,
  className,
  inputActions = [],
  envVarHint,
  provider,
  settingKey,
}: InputControl) {
  const [showPassword, setShowPassword] = useState(false)
  const [isCopied, setIsCopied] = useState(false)
  const hasInputActions = inputActions && inputActions.length > 0

  const copyToClipboard = () => {
    if (value) {
      navigator.clipboard.writeText(value)
      setIsCopied(true)
      setTimeout(() => {
        setIsCopied(false)
      }, 1000)
    }
  }

  const inputType = type === 'password' && showPassword ? 'text' : type

  // Function to set environment variables when input loses focus
  const handleBlur = async () => {
    if (provider && settingKey && (settingKey === 'api-key' || settingKey === 'base-url')) {
      try {
        const apiKey = settingKey === 'api-key' ? value : undefined
        const baseUrl = settingKey === 'base-url' ? value : undefined

        await invoke('set_provider_env_vars_cmd', {
          provider,
          apiKey: apiKey || null,
          baseUrl: baseUrl || null
        })

        console.log(`Environment variable set for ${provider}: ${settingKey}`)
      } catch (error) {
        console.error('Failed to set environment variable:', error)
      }
    }
  }

  return (
    <div className={cn('space-y-1', className)}>
      <div
        className={cn(
          'relative',
          type === 'number' ? 'w-16' : 'w-full'
        )}
      >
        <Input
          type={inputType}
          placeholder={placeholder}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onBlur={handleBlur}
          className={cn(
            type === 'number' ? 'w-16' : 'w-full',
            hasInputActions && 'pr-16'
          )}
        />
        <div className="absolute right-2 top-1/2 transform -translate-y-1/2 flex items-center gap-1">
          {hasInputActions &&
            inputActions.includes('unobscure') &&
            type === 'password' && (
              <button
                onClick={() => setShowPassword(!showPassword)}
                className="p-1 rounded hover:bg-main-view-fg/5 text-main-view-fg/70"
              >
                {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            )}
          {hasInputActions && inputActions.includes('copy') && (
            <button
              onClick={copyToClipboard}
              className="p-1 rounded hover:bg-main-view-fg/5 text-main-view-fg/70"
            >
              {isCopied ? (
                <CopyCheck className="text-accent" size={16} />
              ) : (
                <Copy size={16} />
              )}
            </button>
          )}
        </div>
      </div>
      {envVarHint && (
        <p className="text-xs text-main-view-fg/60 mt-1">
          Environment variable: <code className="bg-main-view-fg/10 px-1 py-0.5 rounded">{envVarHint}</code>
        </p>
      )}
    </div>
  )
}
