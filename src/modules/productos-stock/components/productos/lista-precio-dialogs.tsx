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
import type { ListaPrecio } from '../../types'

const inputClass =
  'flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm'

// ─── ListaPrecioDialog ────────────────────────────────────────────────────────

interface ListaPrecioFormData {
  nombre: string
  porcentajeRecargo: number
}

interface ListaPrecioDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onSave: (data: ListaPrecioFormData) => void
  editData?: ListaPrecio
}

const emptyLista: ListaPrecioFormData = { nombre: '', porcentajeRecargo: 0 }

export function ListaPrecioDialog({
  open,
  onOpenChange,
  onSave,
  editData,
}: ListaPrecioDialogProps) {
  const [form, setForm] = useState<ListaPrecioFormData>(emptyLista)

  useEffect(() => {
    if (open) {
      setForm(
        editData
          ? { nombre: editData.nombre, porcentajeRecargo: editData.porcentajeRecargo }
          : emptyLista,
      )
    }
  }, [open, editData])

  function handleSave() {
    if (!form.nombre.trim()) return
    onSave({ nombre: form.nombre.trim(), porcentajeRecargo: form.porcentajeRecargo })
    onOpenChange(false)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{editData ? 'Editar lista de precio' : 'Nueva lista de precio'}</DialogTitle>
          <DialogDescription>
            El % de recargo se aplica sobre el costo de cada producto (ej: costo $100 + 30% =
            $130).
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4 py-4">
          <div className="grid gap-1.5">
            <label className="text-sm font-medium">Nombre *</label>
            <input
              className={inputClass}
              value={form.nombre}
              onChange={(e) => setForm({ ...form, nombre: e.target.value })}
              placeholder="Ej: Delivery"
              autoFocus
            />
          </div>

          <div className="grid gap-1.5">
            <label className="text-sm font-medium">% de recargo sobre el costo</label>
            <input
              className={inputClass}
              type="number"
              min={0}
              step={0.1}
              value={form.porcentajeRecargo || ''}
              onChange={(e) =>
                setForm({ ...form, porcentajeRecargo: parseFloat(e.target.value) || 0 })
              }
              placeholder="Ej: 30"
            />
            <p className="text-xs text-muted-foreground">
              Es el recargo por defecto de la lista. Podés pisar el precio de un producto
              puntual desde la tabla de la derecha.
            </p>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button onClick={handleSave} disabled={!form.nombre.trim()}>
            {editData ? 'Guardar cambios' : 'Crear lista'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
