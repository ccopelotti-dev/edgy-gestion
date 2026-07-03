'use client'

import type { ReactNode } from 'react'
import type { LucideIcon } from 'lucide-react'
import { Plus, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { formatARS } from '../../lib/format'
import { origenAsientoLabel } from '../../types'
import type { CuentaContable, LineaAsientoInput, OrigenAsiento } from '../../types'

const inputClass =
  'flex h-9 w-full rounded-md border border-input bg-background px-2 py-1 text-sm shadow-sm'

// ─── EmptyState ───────────────────────────────────────────────────────────────

export function EmptyState({
  icon: Icon,
  title,
  description,
  children,
}: {
  icon: LucideIcon
  title: string
  description: string
  children?: ReactNode
}) {
  return (
    <div className="flex flex-col items-center justify-center rounded-lg border-2 border-dashed border-muted-foreground/25 py-12 px-6 text-center">
      <Icon className="h-10 w-10 text-muted-foreground/50 mb-3" />
      <h3 className="text-sm font-medium text-foreground">{title}</h3>
      <p className="mt-1 text-sm text-muted-foreground max-w-sm">{description}</p>
      {children && <div className="mt-4">{children}</div>}
    </div>
  )
}

// ─── OrigenBadge ──────────────────────────────────────────────────────────────

const ORIGEN_ESTILOS: Record<OrigenAsiento, string> = {
  manual: 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300',
  modelo: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',
  cierre: 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400',
  ajuste_inflacion: 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400',
}

export function OrigenBadge({ origen }: { origen: OrigenAsiento }) {
  return (
    <span className={cn('inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium', ORIGEN_ESTILOS[origen])}>
      {origenAsientoLabel(origen)}
    </span>
  )
}

// ─── LineasEditor ─────────────────────────────────────────────────────────────
// Tabla dinámica de líneas débito/crédito, compartida por AsientoDialog y
// ModeloDialog -- ambos son "un conjunto de líneas que deben poder
// balancear" (un modelo no exige balancear con montos != 0 porque puede
// guardar líneas en 0 a completar al aplicar, pero la UI es la misma).

interface LineasEditorProps {
  lineas: LineaAsientoInput[]
  onChange: (lineas: LineaAsientoInput[]) => void
  cuentasImputables: CuentaContable[]
  exigirBalance?: boolean
}

export function LineasEditor({ lineas, onChange, cuentasImputables, exigirBalance = true }: LineasEditorProps) {
  function actualizarLinea(idx: number, cambios: Partial<LineaAsientoInput>) {
    const nuevas = lineas.map((l, i) => (i === idx ? { ...l, ...cambios } : l))
    onChange(nuevas)
  }

  function agregarLinea() {
    onChange([...lineas, { cuentaId: '', debe: 0, haber: 0 }])
  }

  function quitarLinea(idx: number) {
    onChange(lineas.filter((_, i) => i !== idx))
  }

  const totalDebe = lineas.reduce((sum, l) => sum + (l.debe || 0), 0)
  const totalHaber = lineas.reduce((sum, l) => sum + (l.haber || 0), 0)
  const diferencia = Math.round((totalDebe - totalHaber) * 100) / 100
  const balancea = Math.abs(diferencia) < 0.005

  return (
    <div className="space-y-2">
      <div className="overflow-x-auto rounded-lg border">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b bg-muted/50 text-left text-muted-foreground">
              <th className="px-2 py-2 font-medium">Cuenta</th>
              <th className="px-2 py-2 font-medium w-28">Debe</th>
              <th className="px-2 py-2 font-medium w-28">Haber</th>
              <th className="px-2 py-2 font-medium">Descripción</th>
              <th className="w-8" />
            </tr>
          </thead>
          <tbody>
            {lineas.map((linea, idx) => (
              <tr key={idx} className="border-b last:border-0">
                <td className="px-2 py-1.5">
                  <select
                    className={inputClass}
                    value={linea.cuentaId}
                    onChange={(e) => actualizarLinea(idx, { cuentaId: e.target.value })}
                  >
                    <option value="">Elegir cuenta...</option>
                    {cuentasImputables.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.codigo} - {c.nombre}
                      </option>
                    ))}
                  </select>
                </td>
                <td className="px-2 py-1.5">
                  <input
                    type="number"
                    step={0.01}
                    min={0}
                    className={inputClass}
                    value={linea.debe || ''}
                    onChange={(e) =>
                      actualizarLinea(idx, { debe: parseFloat(e.target.value) || 0, haber: 0 })
                    }
                  />
                </td>
                <td className="px-2 py-1.5">
                  <input
                    type="number"
                    step={0.01}
                    min={0}
                    className={inputClass}
                    value={linea.haber || ''}
                    onChange={(e) =>
                      actualizarLinea(idx, { haber: parseFloat(e.target.value) || 0, debe: 0 })
                    }
                  />
                </td>
                <td className="px-2 py-1.5">
                  <input
                    className={inputClass}
                    value={linea.descripcion ?? ''}
                    onChange={(e) => actualizarLinea(idx, { descripcion: e.target.value })}
                    placeholder="Opcional"
                  />
                </td>
                <td className="px-2 py-1.5">
                  <button
                    type="button"
                    onClick={() => quitarLinea(idx)}
                    className="text-muted-foreground hover:text-destructive"
                    disabled={lineas.length <= 2}
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <Button type="button" variant="outline" size="sm" onClick={agregarLinea}>
        <Plus className="h-4 w-4 mr-1" />
        Agregar línea
      </Button>

      <div
        className={cn(
          'flex items-center justify-between rounded-md px-3 py-2 text-sm',
          !exigirBalance
            ? 'bg-muted/50 text-muted-foreground'
            : balancea
              ? 'bg-green-50 text-green-700 dark:bg-green-900/20 dark:text-green-400'
              : 'bg-red-50 text-red-700 dark:bg-red-900/20 dark:text-red-400',
        )}
      >
        <span>
          Debe: <b>{formatARS(totalDebe)}</b> &nbsp;·&nbsp; Haber: <b>{formatARS(totalHaber)}</b>
        </span>
        {exigirBalance && <span>{balancea ? 'Balancea ✓' : `Diferencia: ${formatARS(diferencia)}`}</span>}
      </div>
    </div>
  )
}
