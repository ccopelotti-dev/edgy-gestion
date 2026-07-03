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
import { generarLineasAjusteInflacion } from '../../lib/ajusteInflacion'
import { formatARS, todayISO } from '../../lib/format'
import type { Asiento, AsientoInput, CuentaContable } from '../../types'

const inputClass =
  'flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm'

interface AjusteInflacionDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onConfirmar: (input: AsientoInput) => void
  cuentas: CuentaContable[]
  asientos: Asiento[]
}

export function AjusteInflacionDialog({
  open,
  onOpenChange,
  onConfirmar,
  cuentas,
  asientos,
}: AjusteInflacionDialogProps) {
  const [fecha, setFecha] = useState(todayISO())
  const [coeficiente, setCoeficiente] = useState('1.00')
  const [seleccionadas, setSeleccionadas] = useState<string[]>([])

  const cuentasImputables = cuentas.filter((c) => c.imputable && c.activa)
  const coefNum = parseFloat(coeficiente) || 0

  const preview = useMemo(
    () => generarLineasAjusteInflacion(cuentas, asientos, seleccionadas, coefNum),
    [cuentas, asientos, seleccionadas, coefNum],
  )
  const cuentasPorId = useMemo(() => new Map(cuentas.map((c) => [c.id, c])), [cuentas])

  function toggleCuenta(id: string) {
    setSeleccionadas((prev) => (prev.includes(id) ? prev.filter((c) => c !== id) : [...prev, id]))
  }

  function handleConfirmar() {
    if (preview.error) return
    onConfirmar({ fecha, descripcion: `Ajuste por inflación (coeficiente ${coefNum})`, lineas: preview.lineas })
    onOpenChange(false)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Ajuste por inflación</DialogTitle>
          <DialogDescription>
            Aplica un coeficiente a las cuentas no monetarias elegidas y genera la contrapartida en
            "Resultado por Exposición a la Inflación". Revisar con un contador antes de usarlo en un
            cierre real -- esta v1 no distingue automáticamente qué cuentas son monetarias.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4 py-2">
          <div className="grid grid-cols-2 gap-4">
            <div className="grid gap-1.5">
              <label className="text-sm font-medium">Fecha *</label>
              <input type="date" className={inputClass} value={fecha} onChange={(e) => setFecha(e.target.value)} />
            </div>
            <div className="grid gap-1.5">
              <label className="text-sm font-medium">Coeficiente *</label>
              <input
                type="number"
                step={0.0001}
                min={0}
                className={inputClass}
                value={coeficiente}
                onChange={(e) => setCoeficiente(e.target.value)}
                placeholder="Ej: 1.0850"
              />
            </div>
          </div>

          <div className="grid gap-1.5">
            <label className="text-sm font-medium">Cuentas a ajustar *</label>
            <div className="max-h-40 overflow-y-auto rounded-md border p-2 space-y-1">
              {cuentasImputables.map((c) => (
                <label key={c.id} className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={seleccionadas.includes(c.id)}
                    onChange={() => toggleCuenta(c.id)}
                  />
                  {c.codigo} - {c.nombre}
                </label>
              ))}
            </div>
          </div>

          {preview.error ? (
            <p className="text-sm text-destructive">{preview.error}</p>
          ) : (
            <>
              <div className="overflow-x-auto rounded-lg border max-h-56 overflow-y-auto">
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
                Ajuste neto: <b>{formatARS(preview.totalAjusteNeto)}</b>
              </p>
            </>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button onClick={handleConfirmar} disabled={!!preview.error}>
            Crear asiento de ajuste
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
