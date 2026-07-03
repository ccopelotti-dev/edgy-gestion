'use client'

import { useMemo, useState } from 'react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { generarLineasCierre } from '../../lib/cierreEjercicio'
import { formatARS, todayISO } from '../../lib/format'
import type { Asiento, AsientoInput, CuentaContable } from '../../types'

const inputClass =
  'flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm'

interface CierreDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onConfirmar: (input: AsientoInput) => void
  cuentas: CuentaContable[]
  asientos: Asiento[]
}

export function CierreDialog({ open, onOpenChange, onConfirmar, cuentas, asientos }: CierreDialogProps) {
  const [fecha, setFecha] = useState(todayISO())

  const preview = useMemo(() => generarLineasCierre(cuentas, asientos), [cuentas, asientos])
  const cuentasPorId = useMemo(() => new Map(cuentas.map((c) => [c.id, c])), [cuentas])

  function handleConfirmar() {
    if (preview.error) return
    onConfirmar({ fecha, descripcion: `Cierre de ejercicio al ${fecha}`, lineas: preview.lineas })
    onOpenChange(false)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>Cerrar ejercicio</DialogTitle>
          <DialogDescription>
            Cancela el saldo acumulado de las cuentas de Ingresos, Costos y Gastos contra
            "Resultado del Ejercicio". Esta v1 cierra todo el saldo acumulado a la fecha elegida --
            no filtra por rango de ejercicio.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4 py-2">
          <div className="grid gap-1.5 max-w-xs">
            <label className="text-sm font-medium">Fecha de cierre *</label>
            <input type="date" className={inputClass} value={fecha} onChange={(e) => setFecha(e.target.value)} />
          </div>

          {preview.error ? (
            <p className="text-sm text-destructive">{preview.error}</p>
          ) : (
            <>
              <div className="overflow-x-auto rounded-lg border max-h-64 overflow-y-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b bg-muted/50 text-left text-muted-foreground">
                      <th className="px-3 py-2 font-medium">Cuenta</th>
                      <th className="px-3 py-2 font-medium">Debe</th>
                      <th className="px-3 py-2 font-medium">Haber</th>
                    </tr>
                  </thead>
                  <tbody>
                    {preview.lineas.map((l, i) => (
                      <tr key={i} className="border-b last:border-0">
                        <td className="px-3 py-1.5">{cuentasPorId.get(l.cuentaId)?.nombre ?? '?'}</td>
                        <td className="px-3 py-1.5">{l.debe ? formatARS(l.debe) : '-'}</td>
                        <td className="px-3 py-1.5">{l.haber ? formatARS(l.haber) : '-'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p className="text-sm">
                Resultado del ejercicio:{' '}
                <b className={preview.resultado >= 0 ? 'text-green-700' : 'text-red-700'}>
                  {formatARS(preview.resultado)} {preview.resultado >= 0 ? '(ganancia)' : '(pérdida)'}
                </b>
              </p>
            </>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button onClick={handleConfirmar} disabled={!!preview.error}>
            Crear asiento de cierre
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
