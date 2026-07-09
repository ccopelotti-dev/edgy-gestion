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
import type { PlantillaGarantia } from '../../types'

const inputClass =
  'flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm'

// ─── PlantillaGarantiaDialog ──────────────────────────────────────────────────
//
// Fase 4 del refactor de Productos. Catálogo flexible de plantillas de
// garantía (ej. "Garantía estándar", "Garantía extendida"), asignables como
// default a nivel Rubro y con override puntual a nivel Producto (ver
// rubro-dialogs.tsx y dialogs.tsx). La activación real de la garantía en una
// venta queda para la Fase 6 -- acá solo se administra el catálogo.

interface PlantillaGarantiaFormData {
  nombre: string
  duracionMeses: number
  cobertura: string
}

interface PlantillaGarantiaDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onSave: (data: PlantillaGarantiaFormData) => void
  editData?: PlantillaGarantia
}

const emptyPlantilla: PlantillaGarantiaFormData = {
  nombre: '',
  duracionMeses: 12,
  cobertura: '',
}

export function PlantillaGarantiaDialog({
  open,
  onOpenChange,
  onSave,
  editData,
}: PlantillaGarantiaDialogProps) {
  const [form, setForm] = useState<PlantillaGarantiaFormData>(emptyPlantilla)

  useEffect(() => {
    if (open) {
      setForm(
        editData
          ? {
              nombre: editData.nombre,
              duracionMeses: editData.duracionMeses,
              cobertura: editData.cobertura,
            }
          : emptyPlantilla,
      )
    }
  }, [open, editData])

  function handleSave() {
    if (!form.nombre.trim()) return
    onSave({
      nombre: form.nombre.trim(),
      duracionMeses: form.duracionMeses,
      cobertura: form.cobertura.trim(),
    })
    onOpenChange(false)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>
            {editData ? 'Editar plantilla de garantía' : 'Nueva plantilla de garantía'}
          </DialogTitle>
          <DialogDescription>
            Se asigna como default a un rubro entero, o de forma puntual a un producto (ver
            Rubros y Productos).
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4 py-4">
          <div className="grid gap-1.5">
            <label className="text-sm font-medium">Nombre *</label>
            <input
              className={inputClass}
              value={form.nombre}
              onChange={(e) => setForm({ ...form, nombre: e.target.value })}
              placeholder="Ej: Garantía estándar"
              autoFocus
            />
          </div>

          <div className="grid gap-1.5">
            <label className="text-sm font-medium">Duración (meses) *</label>
            <input
              className={inputClass}
              type="number"
              min={1}
              step={1}
              value={form.duracionMeses || ''}
              onChange={(e) =>
                setForm({ ...form, duracionMeses: parseInt(e.target.value, 10) || 0 })
              }
              placeholder="Ej: 12"
            />
          </div>

          <div className="grid gap-1.5">
            <label className="text-sm font-medium">Cobertura</label>
            <textarea
              className={`${inputClass} min-h-[70px] resize-y`}
              value={form.cobertura}
              onChange={(e) => setForm({ ...form, cobertura: e.target.value })}
              placeholder="Ej: Cubre defectos de fabricación, no cubre mal uso ni desgaste normal."
              rows={3}
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button onClick={handleSave} disabled={!form.nombre.trim() || form.duracionMeses <= 0}>
            {editData ? 'Guardar cambios' : 'Crear plantilla'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
