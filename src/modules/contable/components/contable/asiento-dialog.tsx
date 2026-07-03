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
import { validarAsiento } from '../../lib/partidaDoble'
import { todayISO } from '../../lib/format'
import type { AsientoInput, CuentaContable, LineaAsientoInput } from '../../types'

const inputClass =
  'flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm'

interface AsientoDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onSave: (input: AsientoInput) => void
  cuentas: CuentaContable[]
  /** Líneas iniciales -- usado al "aplicar" un modelo, para prellenar. */
  lineasIniciales?: LineaAsientoInput[]
  descripcionInicial?: string
}

export function AsientoDialog({
  open,
  onOpenChange,
  onSave,
  cuentas,
  lineasIniciales,
  descripcionInicial,
}: AsientoDialogProps) {
  const [fecha, setFecha] = useState(todayISO())
  const [descripcion, setDescripcion] = useState('')
  const [lineas, setLineas] = useState<LineaAsientoInput[]>([
    { cuentaId: '', debe: 0, haber: 0 },
    { cuentaId: '', debe: 0, haber: 0 },
  ])

  useEffect(() => {
    if (!open) return
    setFecha(todayISO())
    setDescripcion(descripcionInicial ?? '')
    setLineas(
      lineasIniciales && lineasIniciales.length >= 2
        ? lineasIniciales
        : [
            { cuentaId: '', debe: 0, haber: 0 },
            { cuentaId: '', debe: 0, haber: 0 },
          ],
    )
  }, [open, lineasIniciales, descripcionInicial])

  const cuentasImputables = cuentas.filter((c) => c.imputable && c.activa)
  const validacion = validarAsiento(lineas, fecha)

  function handleSave() {
    if (!validacion.valido) return
    onSave({ fecha, descripcion: descripcion.trim(), lineas })
    onOpenChange(false)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Nuevo asiento manual</DialogTitle>
          <DialogDescription>
            La suma del Debe tiene que ser igual a la suma del Haber -- es la regla de partida
            doble, no se puede guardar un asiento que no balancee.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4 py-2">
          <div className="grid grid-cols-2 gap-4">
            <div className="grid gap-1.5">
              <label className="text-sm font-medium">Fecha *</label>
              <input type="date" className={inputClass} value={fecha} onChange={(e) => setFecha(e.target.value)} />
            </div>
            <div className="grid gap-1.5">
              <label className="text-sm font-medium">Descripción</label>
              <input
                className={inputClass}
                value={descripcion}
                onChange={(e) => setDescripcion(e.target.value)}
                placeholder="Ej: Pago de alquiler julio"
              />
            </div>
          </div>

          <LineasEditor lineas={lineas} onChange={setLineas} cuentasImputables={cuentasImputables} />

          {!validacion.valido && lineas.some((l) => l.cuentaId) && (
            <ul className="text-xs text-destructive space-y-0.5">
              {validacion.errores.map((e, i) => (
                <li key={i}>&bull; {e}</li>
              ))}
            </ul>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button onClick={handleSave} disabled={!validacion.valido}>
            Crear asiento
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
