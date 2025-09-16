import { useState, useRef } from 'react'
import { useNavigate } from '@tanstack/react-router'
import { useTranslation } from '@/i18n/react-i18next-compat'
import {
  Dialog,
  DialogTrigger,
  DialogContent,
  DialogTitle,
  DialogDescription,
  DialogClose,
  DialogFooter,
  DialogHeader,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { IconTrash } from '@tabler/icons-react'
import { DropdownMenuItem } from '@/components/ui/dropdown-menu'
import { toast } from 'sonner'
import { route } from '@/constants/routes'

interface DeleteThreadDialogProps {
  thread: Thread
  onDelete: (threadId: string) => void
  onDropdownClose: () => void
}

export function DeleteThreadDialog({
  thread,
  onDelete,
  onDropdownClose,
}: DeleteThreadDialogProps) {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const [isOpen, setIsOpen] = useState(false)
  const deleteButtonRef = useRef<HTMLButtonElement>(null)

  const handleOpenChange = (open: boolean) => {
    setIsOpen(open)
    if (!open) {
      onDropdownClose()
    }
  }

  const handleDelete = () => {
    onDelete(thread.id)
    setIsOpen(false)
    onDropdownClose()
    toast.success(t('common:toast.deleteThread.title'), {
      id: 'delete-thread',
      description: t('common:toast.deleteThread.description'),
    })
    setTimeout(() => {
      navigate({ to: route.home })
    }, 0)
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleDelete()
    }
  }

  return (
    <Dialog open={isOpen} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        <DropdownMenuItem onSelect={(e) => e.preventDefault()}>
          <IconTrash />
          <span>{t('common:delete')}</span>
        </DropdownMenuItem>
      </DialogTrigger>
      <DialogContent
        onOpenAutoFocus={(e) => {
          e.preventDefault()
          deleteButtonRef.current?.focus()
        }}
      >
        <DialogHeader>
          <DialogTitle>{t('common:deleteThread')}</DialogTitle>
          <DialogDescription>
            {t('common:dialogs.deleteThread.description')}
          </DialogDescription>
          <DialogFooter className="mt-4 flex flex-col-reverse sm:flex-row sm:justify-end gap-2">
            <DialogClose asChild>
              <Button variant="link" size="sm" className="w-full sm:w-auto">
                {t('common:cancel')}
              </Button>
            </DialogClose>
            <Button
              ref={deleteButtonRef}
              variant="destructive"
              onClick={handleDelete}
              onKeyDown={handleKeyDown}
              size="sm"
              className="w-full sm:w-auto"
              aria-label={`${t('common:delete')} ${thread.title || t('common:newThread')}`}
            >
              {t('common:delete')}
            </Button>
          </DialogFooter>
        </DialogHeader>
      </DialogContent>
    </Dialog>
  )
}
