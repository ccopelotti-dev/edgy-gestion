'use client'

import { useState } from 'react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'

const inputClass =
  'flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm'

interface CarpetaDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onSave: (nombre: string) => void
}

export function CarpetaDialog({ open, onOpenChange, onSave }: CarpetaDialogProps) {
  const [nombre, setNombre] = useState('')

  function handleSave() {
    if (!nombre.trim()) return
    onSave(nombre.trim())
    setNombre('')
    onOpenChange(false)
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        if (!v) setNombre('')
        onOpenChange(v)
      }}
    >
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Nueva carpeta</DialogTitle>
          <DialogDescription>Para organizar archivos subidos a mano.</DialogDescription>
        </DialogHeader>

        <div className="grid gap-4 py-4">
          <div className="grid gap-1.5">
            <label className="text-sm font-medium">Nombre *</label>
            <input
              className={inputClass}
              value={nombre}
              onChange={(e) => setNombre(e.target.value)}
              placeholder="Ej: Contratos"
              autoFocus
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button onClick={handleSave} disabled={!nombre.trim()}>
            Crear carpeta
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
