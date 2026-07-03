'use client'

import { useEffect, useState } from 'react'
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

// ─── RubroServicioDialog ──────────────────────────────────────────────────────

interface RubroDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onSave: (data: { nombre: string }) => void
  editData?: { nombre: string }
}

export function RubroServicioDialog({ open, onOpenChange, onSave, editData }: RubroDialogProps) {
  const [nombre, setNombre] = useState('')

  useEffect(() => {
    if (open) setNombre(editData?.nombre ?? '')
  }, [open, editData])

  function handleSave() {
    if (!nombre.trim()) return
    onSave({ nombre: nombre.trim() })
    onOpenChange(false)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{editData ? 'Editar rubro' : 'Nuevo rubro'}</DialogTitle>
          <DialogDescription>
            Clasifica los servicios ofrecidos (ej: Salud, Legal, Construcción).
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4 py-4">
          <div className="grid gap-1.5">
            <label className="text-sm font-medium">Nombre *</label>
            <input
              className={inputClass}
              value={nombre}
              onChange={(e) => setNombre(e.target.value)}
              placeholder="Ej: Salud"
              autoFocus
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button onClick={handleSave} disabled={!nombre.trim()}>
            {editData ? 'Guardar cambios' : 'Crear rubro'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// ─── SubRubroServicioDialog ───────────────────────────────────────────────────

interface SubRubroDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onSave: (data: { nombre: string }) => void
  rubroNombre: string
  editData?: { nombre: string }
}

export function SubRubroServicioDialog({
  open,
  onOpenChange,
  onSave,
  rubroNombre,
  editData,
}: SubRubroDialogProps) {
  const [nombre, setNombre] = useState('')

  useEffect(() => {
    if (open) setNombre(editData?.nombre ?? '')
  }, [open, editData])

  function handleSave() {
    if (!nombre.trim()) return
    onSave({ nombre: nombre.trim() })
    onOpenChange(false)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{editData ? 'Editar sub-rubro' : 'Nuevo sub-rubro'}</DialogTitle>
          <DialogDescription>Dentro de: {rubroNombre}</DialogDescription>
        </DialogHeader>

        <div className="grid gap-4 py-4">
          <div className="grid gap-1.5">
            <label className="text-sm font-medium">Nombre *</label>
            <input
              className={inputClass}
              value={nombre}
              onChange={(e) => setNombre(e.target.value)}
              placeholder="Ej: Clínica médica"
              autoFocus
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button onClick={handleSave} disabled={!nombre.trim()}>
            {editData ? 'Guardar cambios' : 'Crear sub-rubro'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
