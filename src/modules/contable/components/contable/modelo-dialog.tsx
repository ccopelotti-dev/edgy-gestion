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
import { LineasEditor } from './display'
import type { AsientoModelo, CuentaContable, LineaAsientoInput } from '../../types'
import type { ModeloInput } from '../../data/useAsientosModelo'

const inputClass =
  'flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm'
const textareaClass =
  'flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm min-h-16'

interface ModeloDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onSave: (input: ModeloInput) => void
  cuentas: CuentaContable[]
  modeloEditar?: AsientoModelo | null
}

/** Alta/edición de una plantilla de asiento. A diferencia de AsientoDialog,
 * NO exige que balancee -- un modelo puede guardar montos en 0 para
 * completarlos recién al aplicarlo (ej. "Alquiler mensual" con el monto
 * exacto variando cada vez). El balance se exige al aplicar, no acá. */
export function ModeloDialog({ open, onOpenChange, onSave, cuentas, modeloEditar }: ModeloDialogProps) {
  const [nombre, setNombre] = useState('')
  const [descripcion, setDescripcion] = useState('')
  const [lineas, setLineas] = useState<LineaAsientoInput[]>([
    { cuentaId: '', debe: 0, haber: 0 },
    { cuentaId: '', debe: 0, haber: 0 },
  ])

  useEffect(() => {
    if (!open) return
    if (modeloEditar) {
      setNombre(modeloEditar.nombre)
      setDescripcion(modeloEditar.descripcion)
      setLineas(
        modeloEditar.lineas.map((l) => ({
          cuentaId: l.cuentaId,
          debe: l.debe,
          haber: l.haber,
          descripcion: l.descripcion,
        })),
      )
    } else {
      setNombre('')
      setDescripcion('')
      setLineas([
        { cuentaId: '', debe: 0, haber: 0 },
        { cuentaId: '', debe: 0, haber: 0 },
      ])
    }
  }, [open, modeloEditar])

  const cuentasImputables = cuentas.filter((c) => c.imputable && c.activa)
  const lineasValidas = lineas.filter((l) => l.cuentaId).length >= 2

  function handleSave() {
    if (!nombre.trim() || !lineasValidas) return
    onSave({ nombre: nombre.trim(), descripcion: descripcion.trim(), lineas })
    onOpenChange(false)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>{modeloEditar ? 'Editar modelo' : 'Nuevo modelo de asiento'}</DialogTitle>
          <DialogDescription>
            Plantilla reutilizable para asientos que se repiten (ej. alquiler mensual). Los montos
            se pueden dejar en 0 para completarlos al aplicar el modelo.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4 py-2">
          <div className="grid gap-1.5">
            <label className="text-sm font-medium">Nombre *</label>
            <input
              className={inputClass}
              value={nombre}
              onChange={(e) => setNombre(e.target.value)}
              placeholder="Ej: Alquiler mensual"
              autoFocus
            />
          </div>
          <div className="grid gap-1.5">
            <label className="text-sm font-medium">Descripción</label>
            <textarea
              className={textareaClass}
              value={descripcion}
              onChange={(e) => setDescripcion(e.target.value)}
              placeholder="Para qué se usa este modelo..."
            />
          </div>

          <LineasEditor
            lineas={lineas}
            onChange={setLineas}
            cuentasImputables={cuentasImputables}
            exigirBalance={false}
          />
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button onClick={handleSave} disabled={!nombre.trim() || !lineasValidas}>
            {modeloEditar ? 'Guardar cambios' : 'Crear modelo'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
