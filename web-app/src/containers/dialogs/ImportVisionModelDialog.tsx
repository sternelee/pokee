import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Switch } from '@/components/ui/switch'
import { useServiceHub } from '@/hooks/useServiceHub'
import { useState } from 'react'
import { toast } from 'sonner'
import {
  IconLoader2,
  IconEye,
  IconCheck,
  IconAlertTriangle,
} from '@tabler/icons-react'

type ImportVisionModelDialogProps = {
  provider: ModelProvider
  trigger?: React.ReactNode
  onSuccess?: (importedModelName?: string) => void
}

export const ImportVisionModelDialog = ({
  provider,
  trigger,
  onSuccess,
}: ImportVisionModelDialogProps) => {
  const serviceHub = useServiceHub()
  const [open, setOpen] = useState(false)
  const [importing, setImporting] = useState(false)
  const [isVisionModel, setIsVisionModel] = useState(false)
  const [modelFile, setModelFile] = useState<string | null>(null)
  const [mmProjFile, setMmProjFile] = useState<string | null>(null)
  const [modelName, setModelName] = useState('')
  const [validationError, setValidationError] = useState<string | null>(null)
  const [isValidating, setIsValidating] = useState(false)
  const [mmprojValidationError, setMmprojValidationError] = useState<
    string | null
  >(null)
  const [isValidatingMmproj, setIsValidatingMmproj] = useState(false)

  const validateGgufFile = async (
    filePath: string,
    fileType: 'model' | 'mmproj'
  ): Promise<void> => {
    if (fileType === 'model') {
      setIsValidating(true)
      setValidationError(null)
    } else {
      setIsValidatingMmproj(true)
      setMmprojValidationError(null)
    }

    try {
      console.log(`Reading GGUF metadata for ${fileType}:`, filePath)

      // Handle validation differently for model files vs mmproj files
      if (fileType === 'model') {
        // For model files, use the standard validateGgufFile method
        if (typeof serviceHub.models().validateGgufFile === 'function') {
          const result = await serviceHub.models().validateGgufFile(filePath)

          if (result.metadata) {
            // Log full metadata for debugging
            console.log(
              `Full GGUF metadata for ${fileType}:`,
              JSON.stringify(result.metadata, null, 2)
            )

            // Check architecture from metadata
            const architecture =
              result.metadata.metadata?.['general.architecture']
            console.log(`${fileType} architecture:`, architecture)

            // Model files should NOT be clip
            if (architecture === 'clip') {
              const errorMessage =
                'This model has CLIP architecture and cannot be imported as a text generation model. CLIP models are designed for vision tasks and require different handling.'
              setValidationError(errorMessage)
              console.error(
                'CLIP architecture detected in model file:',
                architecture
              )
            } else {
              console.log(
                'Model validation passed. Architecture:',
                architecture
              )
            }
          }

          if (!result.isValid) {
            setValidationError(result.error || 'Model validation failed')
            console.error('Model validation failed:', result.error)
          }
        }
      } else {
        // For mmproj files, we need to manually validate since validateGgufFile rejects CLIP models
        try {
          // Import the readGgufMetadata function directly from Tauri
          const { invoke } = await import('@tauri-apps/api/core')

          const metadata = await invoke('plugin:llamacpp|read_gguf_metadata', {
            path: filePath,
          })

          console.log(
            `Full GGUF metadata for ${fileType}:`,
            JSON.stringify(metadata, null, 2)
          )

          // Check if architecture matches expected type
          const architecture = (
            metadata as { metadata?: Record<string, string> }
          ).metadata?.['general.architecture']
          console.log(`${fileType} architecture:`, architecture)

          // MMProj files MUST be clip
          if (architecture !== 'clip') {
            const errorMessage = `This MMProj file has "${architecture}" architecture but should have "clip" architecture. MMProj files must be CLIP models for vision processing.`
            setMmprojValidationError(errorMessage)
            console.error(
              'Non-CLIP architecture detected in mmproj file:',
              architecture
            )
          } else {
            console.log(
              'MMProj validation passed. Architecture:',
              architecture
            )
          }
        } catch (directError) {
          console.error('Failed to validate mmproj file directly:', directError)
          const errorMessage = `Failed to read MMProj metadata: ${
            directError instanceof Error ? directError.message : 'Unknown error'
          }`
          setMmprojValidationError(errorMessage)
        }
      }
    } catch (error) {
      console.error(`Failed to validate ${fileType} file:`, error)
      const errorMessage = `Failed to read ${fileType} metadata: ${error instanceof Error ? error.message : 'Unknown error'}`

      if (fileType === 'model') {
        setValidationError(errorMessage)
      } else {
        setMmprojValidationError(errorMessage)
      }
    } finally {
      if (fileType === 'model') {
        setIsValidating(false)
      } else {
        setIsValidatingMmproj(false)
      }
    }
  }

  const validateModelFile = async (filePath: string): Promise<void> => {
    await validateGgufFile(filePath, 'model')
  }

  const validateMmprojFile = async (filePath: string): Promise<void> => {
    await validateGgufFile(filePath, 'mmproj')
  }

  const handleFileSelect = async (type: 'model' | 'mmproj') => {
    const selectedFile = await serviceHub.dialog().open({
      multiple: false,
      directory: false,
    })

    if (selectedFile && typeof selectedFile === 'string') {
      const fileName = selectedFile.split(/[\\/]/).pop() || ''

      if (type === 'model') {
        setModelFile(selectedFile)
        // Auto-generate model name from GGUF file
        const sanitizedName = fileName
          .replace(/\s/g, '-')
          .replace(/\.(gguf|GGUF)$/, '')
          .replace(/[^a-zA-Z0-9/_.-]/g, '') // Remove any characters not allowed in model IDs
        setModelName(sanitizedName)

        // Validate the selected model file
        await validateModelFile(selectedFile)
      } else {
        setMmProjFile(selectedFile)
        // Validate the selected mmproj file
        await validateMmprojFile(selectedFile)
      }
    }
  }

  const handleImport = async () => {
    if (!modelFile) {
      toast.error('Please select a model file')
      return
    }

    if (isVisionModel && !mmProjFile) {
      toast.error('Please select both model and MMPROJ files for vision models')
      return
    }

    if (!modelName) {
      toast.error('Unable to determine model name from file')
      return
    }

    // Check if model already exists
    const modelExists = provider.models.some(
      (model) => model.name === modelName
    )

    if (modelExists) {
      toast.error('Model already exists', {
        description: `${modelName} already imported`,
      })
      return
    }

    setImporting(true)

    try {
      if (isVisionModel && mmProjFile) {
        // Import vision model with both files - let backend calculate SHA256 and sizes
        await serviceHub.models().pullModel(
          modelName,
          modelFile,
          undefined, // modelSha256 - calculated by backend
          undefined, // modelSize - calculated by backend
          mmProjFile // mmprojPath
          // mmprojSha256 and mmprojSize omitted - calculated by backend
        )
      } else {
        // Import regular model - let backend calculate SHA256 and size
        await serviceHub.models().pullModel(modelName, modelFile)
      }

      toast.success('Model imported successfully', {
        description: `${modelName} has been imported`,
      })

      // Reset form and close dialog
      resetForm()
      setOpen(false)
      onSuccess?.(modelName)
    } catch (error) {
      console.error('Import model error:', error)
      toast.error('Failed to import model', {
        description:
          error instanceof Error ? error.message : 'Unknown error occurred',
      })
    } finally {
      setImporting(false)
    }
  }

  const resetForm = () => {
    setModelFile(null)
    setMmProjFile(null)
    setModelName('')
    setIsVisionModel(false)
    setValidationError(null)
    setIsValidating(false)
    setMmprojValidationError(null)
    setIsValidatingMmproj(false)
  }

  const handleOpenChange = (newOpen: boolean) => {
    if (!importing) {
      setOpen(newOpen)
      if (!newOpen) {
        resetForm()
      }
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            Import Model
          </DialogTitle>
          <DialogDescription>
            Import a GGUF model file to add it to your collection. Enable vision
            support for models that work with images.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6">
          {/* Vision Model Toggle Card */}
          <div className="border border-main-view-fg/10 rounded-lg p-4 space-y-3 bg-main-view-fg/5">
            <div className="flex items-start space-x-3">
              <div className="flex-shrink-0 mt-0.5">
                <IconEye size={20} className="text-accent" />
              </div>
              <div className="flex-1">
                <h3 className="font-medium text-main-view-fg">
                  Vision Model Support
                </h3>
                <p className="text-sm text-main-view-fg/70">
                  Enable if your model supports image understanding (requires
                  MMPROJ file)
                </p>
              </div>
              <Switch
                id="vision-model"
                checked={isVisionModel}
                onCheckedChange={(checked) => {
                  setIsVisionModel(checked)
                  if (!checked) {
                    setMmProjFile(null)
                    setMmprojValidationError(null)
                    setIsValidatingMmproj(false)
                  }
                }}
                className="mt-1"
              />
            </div>
          </div>

          {/* Model Name Preview */}
          {modelName && (
            <div className="bg-main-view-fg/5 rounded-lg p-3">
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium text-main-view-fg/80">
                  Model will be saved as:
                </span>
              </div>
              <p className="text-base font-mono mt-1 text-main-view-fg">
                {modelName}
              </p>
            </div>
          )}

          {/* File Selection Area */}
          <div className="space-y-4">
            {/* Model File Selection */}
            <div className="border border-main-view-fg/10 rounded-lg p-4 space-y-3 bg-main-view-fg/5">
              <div className="flex items-center gap-2">
                <h3 className="font-medium text-main-view-fg">
                  Model File (GGUF)
                </h3>
                <span className="text-xs bg-main-view-fg/10 text-main-view-fg/70 px-2 py-1 rounded">
                  Required
                </span>
              </div>

              {modelFile ? (
                <div className="space-y-2">
                  <div className="bg-accent/10 border border-accent/20 rounded-lg p-3">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        {isValidating ? (
                          <IconLoader2
                            size={16}
                            className="text-accent animate-spin"
                          />
                        ) : validationError ? (
                          <IconAlertTriangle
                            size={16}
                            className="text-destructive"
                          />
                        ) : (
                          <IconCheck size={16} className="text-accent" />
                        )}
                        <span className="text-sm font-medium text-main-view-fg">
                          {modelFile.split(/[\\/]/).pop()}
                        </span>
                      </div>
                      <Button
                        variant="link"
                        size="sm"
                        onClick={() => handleFileSelect('model')}
                        disabled={importing || isValidating}
                        className="text-accent hover:text-accent/80"
                      >
                        Change
                      </Button>
                    </div>
                  </div>

                  {/* Validation Error Display */}
                  {validationError && (
                    <div className="bg-destructive/10 border border-destructive/20 rounded-lg p-3">
                      <div className="flex items-start gap-2">
                        <IconAlertTriangle
                          size={16}
                          className="text-destructive mt-0.5 flex-shrink-0"
                        />
                        <div>
                          <p className="text-sm font-medium text-destructive">
                            Model Validation Error
                          </p>
                          <p className="text-sm text-destructive/90 mt-1">
                            {validationError}
                          </p>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Validation Loading State */}
                  {isValidating && (
                    <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
                      <div className="flex items-center gap-2">
                        <IconLoader2
                          size={16}
                          className="text-blue-500 animate-spin"
                        />
                        <p className="text-sm text-blue-700">
                          Validating model file...
                        </p>
                      </div>
                    </div>
                  )}
                </div>
              ) : (
                <Button
                  type="button"
                  variant="link"
                  onClick={() => handleFileSelect('model')}
                  disabled={importing}
                  className="w-full h-12 border border-dashed border-main-view-fg/10 bg-main-view text-main-view-fg/50 hover:text-main-view-fg"
                >
                  Select GGUF File
                </Button>
              )}
            </div>

            {/* MMPROJ File Selection - only show if vision model is enabled */}
            {isVisionModel && (
              <div className="border border-main-view-fg/10 rounded-lg p-4 space-y-3 bg-main-view-fg/5">
                <div className="flex items-center gap-2">
                  <h3 className="font-medium text-main-view-fg">MMPROJ File</h3>
                  <span className="text-xs bg-accent/10 text-accent px-2 py-1 rounded">
                    Required for Vision
                  </span>
                </div>

                {mmProjFile ? (
                  <div className="space-y-2">
                    <div className="bg-accent/10 border border-accent/20 rounded-lg p-3">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          {isValidatingMmproj ? (
                            <IconLoader2
                              size={16}
                              className="text-accent animate-spin"
                            />
                          ) : mmprojValidationError ? (
                            <IconAlertTriangle
                              size={16}
                              className="text-destructive"
                            />
                          ) : (
                            <IconCheck size={16} className="text-accent" />
                          )}
                          <span className="text-sm font-medium text-main-view-fg">
                            {mmProjFile.split(/[\\/]/).pop()}
                          </span>
                        </div>
                        <Button
                          variant="link"
                          size="sm"
                          onClick={() => handleFileSelect('mmproj')}
                          disabled={importing || isValidatingMmproj}
                          className="text-accent hover:text-accent/80"
                        >
                          Change
                        </Button>
                      </div>
                    </div>

                    {/* MMProj Validation Error Display */}
                    {mmprojValidationError && (
                      <div className="bg-destructive/10 border border-destructive/20 rounded-lg p-3">
                        <div className="flex items-start gap-2">
                          <IconAlertTriangle
                            size={16}
                            className="text-destructive mt-0.5 flex-shrink-0"
                          />
                          <div>
                            <p className="text-sm font-medium text-destructive">
                              MMProj Validation Error
                            </p>
                            <p className="text-sm text-destructive/90 mt-1">
                              {mmprojValidationError}
                            </p>
                          </div>
                        </div>
                      </div>
                    )}

                    {/* MMProj Validation Loading State */}
                    {isValidatingMmproj && (
                      <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
                        <div className="flex items-center gap-2">
                          <IconLoader2
                            size={16}
                            className="text-blue-500 animate-spin"
                          />
                          <p className="text-sm text-blue-700">
                            Validating MMProj file...
                          </p>
                        </div>
                      </div>
                    )}
                  </div>
                ) : (
                  <Button
                    type="button"
                    variant="link"
                    onClick={() => handleFileSelect('mmproj')}
                    disabled={importing}
                    className="w-full h-12 border border-dashed border-main-view-fg/10 bg-main-view text-main-view-fg/50 hover:text-main-view-fg"
                  >
                    Select MMPROJ File
                  </Button>
                )}
              </div>
            )}
          </div>
        </div>

        <DialogFooter className="flex gap-2 pt-4">
          <Button
            variant="link"
            onClick={() => handleOpenChange(false)}
            disabled={importing}
            className="flex-1"
          >
            Cancel
          </Button>
          <Button
            onClick={handleImport}
            disabled={
              importing ||
              !modelFile ||
              !modelName ||
              (isVisionModel && !mmProjFile) ||
              validationError !== null ||
              isValidating ||
              mmprojValidationError !== null ||
              isValidatingMmproj
            }
            className="flex-1"
          >
            {importing && <IconLoader2 className="mr-2 h-4 w-4 animate-spin" />}
            {importing ? (
              'Importing...'
            ) : (
              <>Import {isVisionModel ? 'Vision ' : ''}Model</>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
