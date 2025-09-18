import { InputControl } from '@/containers/dynamicControllerSetting/InputControl'
import { CheckboxControl } from '@/containers/dynamicControllerSetting/CheckboxControl'
import { DropdownControl } from '@/containers/dynamicControllerSetting/DropdownControl'
import { TextareaControl } from '@/containers/dynamicControllerSetting/TextareaControl'
import { SliderControl } from '@/containers/dynamicControllerSetting/SliderControl'

// Dynamic controller component that renders the appropriate control based on controller_type
type DynamicControllerProps = {
  key?: string
  title?: string
  className?: string
  description?: string
  readonly?: boolean
  controllerType:
    | 'input'
    | 'checkbox'
    | 'dropdown'
    | 'textarea'
    | 'slider'
    | string
  controllerProps: {
    value?: string | boolean | number
    placeholder?: string
    type?: string
    options?: Array<{ value: number | string; name: string }>
    input_actions?: string[]
    rows?: number
    min?: number
    max?: number
    step?: number
    recommended?: string
  }
  onChange: (value: string | boolean | number) => void
  provider?: string
  settingKey?: string
}

export function DynamicControllerSetting({
  className,
  controllerType,
  controllerProps,
  onChange,
  provider,
  settingKey,
}: DynamicControllerProps) {
  // Function to get environment variable hint based on setting key and provider
  const getEnvVarHint = (): string | undefined => {
    if (controllerType === 'input' && controllerProps.type === 'password') {
      // This is likely an API key field
      if (provider) {
        switch (provider) {
          case 'openai':
          case 'openai-compatible':
            return 'OPENAI_API_KEY'
          case 'anthropic':
            return 'ANTHROPIC_API_KEY'
          case 'openrouter':
            return 'OPENROUTER_API_KEY'
          default:
            return `${provider.toUpperCase()}_API_KEY`
        }
      }
    }
    if (controllerType === 'input' && controllerProps.type === 'url') {
      // This is likely a base URL field
      if (provider) {
        switch (provider) {
          case 'openai-compatible':
            return 'OPENAI_BASE_URL'
          case 'openrouter':
            return 'OPENROUTER_BASE_URL'
          default:
            return `${provider.toUpperCase()}_BASE_URL`
        }
      }
    }
    return undefined
  }

  const envVarHint = settingKey ? getEnvVarHint() : undefined

  if (controllerType === 'input') {
    return (
      <InputControl
        type={controllerProps.type}
        placeholder={controllerProps.placeholder}
        value={
          typeof controllerProps.value === 'number'
            ? controllerProps.value.toString()
            : (controllerProps.value as string) || ''
        }
        inputActions={controllerProps.input_actions}
        className={className}
        envVarHint={envVarHint}
        provider={provider}
        settingKey={settingKey}
        onChange={(newValue) => onChange(newValue)}
      />
    )
  } else if (controllerType === 'checkbox') {
    return (
      <CheckboxControl
        checked={controllerProps.value as boolean}
        onChange={(newValue) => onChange(newValue)}
      />
    )
  } else if (controllerType === 'dropdown') {
    return (
      <DropdownControl
        value={controllerProps.value as string}
        options={controllerProps.options}
        recommended={controllerProps.recommended}
        onChange={(newValue) => onChange(newValue)}
      />
    )
  } else if (controllerType === 'textarea') {
    return (
      <TextareaControl
        placeholder={controllerProps.placeholder}
        value={(controllerProps.value as string) || ''}
        inputActions={controllerProps.input_actions}
        rows={controllerProps.rows}
        onChange={(newValue) => onChange(newValue)}
      />
    )
  } else if (controllerType === 'slider') {
    return (
      <SliderControl
        value={[controllerProps.value as number]}
        min={controllerProps.min}
        max={controllerProps.max}
        step={controllerProps.step}
        onChange={(newValue) => newValue && onChange(newValue[0])}
      />
    )
  }

  // Default to checkbox if controller type is not recognized
  return (
    <CheckboxControl
      checked={!!controllerProps.value}
      onChange={(newValue) => onChange(newValue)}
    />
  )
}
