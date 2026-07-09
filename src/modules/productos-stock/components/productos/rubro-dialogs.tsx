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
import type { Rubro, PlantillaGarantia } from '../../types'

const inputClass =
  'flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm'

// ─── RubroDialog ──────────────────────────────────────────────────────────────

interface RubroFormData {
  nombre: string
  tipo: Rubro['tipo']
  /** Garantía default para todos los productos de este rubro (Fase 4). */
  plantillaGarantiaId?: string
}

interface RubroDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onSave: (data: RubroFormData) => void
  editData?: Rubro
  plantillasGarantia: PlantillaGarantia[]
}

const emptyRubro: RubroFormData = { nombre: '', tipo: 'ambos', plantillaGarantiaId: undefined }

export function RubroDialog({
  open,
  onOpenChange,
  onSave,
  editData,
  plantillasGarantia,
}: RubroDialogProps) {
  const [form, setForm] = useState<RubroFormData>(emptyRubro)

  useEffect(() => {
    if (open) {
      setForm(
        editData
          ? {
              nombre: editData.nombre,
              tipo: editData.tipo,
              plantillaGarantiaId: editData.plantillaGarantiaId,
            }
          : emptyRubro,
      )
    }
  }, [open, editData])

  function handleSave() {
    if (!form.nombre.trim()) return
    onSave({
      nombre: form.nombre.trim(),
      tipo: form.tipo,
      plantillaGarantiaId: form.plantillaGarantiaId || undefined,
    })
    onOpenChange(false)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{editData ? 'Editar rubro' : 'Nuevo rubro'}</DialogTitle>
          <DialogDescription>
            El rubro clasifica productos, insumos o ambos (ej: Bebidas, Panificados).
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4 py-4">
          <div className="grid gap-1.5">
            <label className="text-sm font-medium">Nombre *</label>
            <input
              className={inputClass}
              value={form.nombre}
              onChange={(e) => setForm({ ...form, nombre: e.target.value })}
              placeholder="Ej: Bebidas"
            />
          </div>

          <div className="grid gap-1.5">
            <label className="text-sm font-medium">Aplica a</label>
            <select
              className={inputClass}
              value={form.tipo}
              onChange={(e) => setForm({ ...form, tipo: e.target.value as Rubro['tipo'] })}
            >
              <option value="ambos">Productos e insumos</option>
              <option value="producto">Solo productos</option>
              <option value="insumo">Solo insumos</option>
            </select>
          </div>

          <div className="grid gap-1.5">
            <label className="text-sm font-medium">Garantía por defecto</label>
            <select
              className={inputClass}
              value={form.plantillaGarantiaId ?? ''}
              onChange={(e) =>
                setForm({ ...form, plantillaGarantiaId: e.target.value || undefined })
              }
            >
              <option value="">Sin garantía</option>
              {plantillasGarantia.map((pg) => (
                <option key={pg.id} value={pg.id}>
                  {pg.nombre} ({pg.duracionMeses} {pg.duracionMeses === 1 ? 'mes' : 'meses'})
                </option>
              ))}
            </select>
            <p className="text-xs text-muted-foreground">
              Se aplica a todos los productos de este rubro, salvo que un producto puntual
              tenga su propia garantía asignada.
            </p>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button onClick={handleSave} disabled={!form.nombre.trim()}>
            {editData ? 'Guardar cambios' : 'Crear rubro'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// ─── SubRubroDialog ───────────────────────────────────────────────────────────

interface SubRubroFormData {
  nombre: string
}

interface SubRubroDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onSave: (data: SubRubroFormData) => void
  rubroNombre: string
  editData?: { nombre: string }
}

export function SubRubroDialog({
  open,
  onOpenChange,
  onSave,
  rubroNombre,
  editData,
}: SubRubroDialogProps) {
  const [nombre, setNombre] = useState('')

  useEffect(() => {
    if (open) {
      setNombre(editData?.nombre ?? '')
    }
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
              placeholder="Ej: Gaseosas"
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
