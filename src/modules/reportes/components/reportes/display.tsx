'use client'

import type { ReactNode } from 'react'
import type { LucideIcon } from 'lucide-react'
import { Download, FlaskConical } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { exportarCSV } from '../../lib/exportCsv'
import type { ResultadoReporte } from '../../types'

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

// ─── ExampleBanner ────────────────────────────────────────────────────────────
// Para reportes de Financiero/Gestión: deja bien claro que no es dato real
// todavía, para que nadie tome una decisión de negocio sobre un número
// inventado.

export function ExampleBanner() {
  return (
    <div className="flex items-center gap-2 rounded-md border border-yellow-200 bg-yellow-50 px-4 py-2.5 text-sm text-yellow-800 dark:border-yellow-900/50 dark:bg-yellow-900/20 dark:text-yellow-400">
      <FlaskConical className="h-4 w-4 shrink-0" />
      <span>
        Datos de ejemplo -- este reporte todavía no lee datos reales (el módulo de origen sigue en
        localStorage, sin tabla en Supabase que consultar).
      </span>
    </div>
  )
}

// ─── ReportTable ──────────────────────────────────────────────────────────────
// Renderiza cualquier ResultadoReporte (columnas + filas genéricas) como
// tabla, con botón de exportar a CSV. Reusado por las 3 pestañas con
// reportes (Inventario, Financiero, Gestión).

export function ReportTable({
  resultado,
  nombreArchivo,
  className,
}: {
  resultado: ResultadoReporte
  nombreArchivo: string
  className?: string
}) {
  if (resultado.filas.length === 0) {
    return (
      <EmptyState
        icon={FlaskConical}
        title="Sin resultados"
        description="No hay datos para los filtros aplicados."
      />
    )
  }

  return (
    <div className={cn('space-y-3', className)}>
      <div className="flex justify-end">
        <Button variant="outline" size="sm" onClick={() => exportarCSV(nombreArchivo, resultado)}>
          <Download className="h-4 w-4 mr-1" />
          Exportar CSV
        </Button>
      </div>
      <div className="overflow-x-auto rounded-lg border bg-card shadow-sm">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b text-left text-muted-foreground">
              {resultado.columnas.map((c) => (
                <th key={c} className="px-4 py-2.5 font-medium whitespace-nowrap">
                  {c}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {resultado.filas.map((fila, idx) => (
              <tr key={idx} className="border-b last:border-0">
                {resultado.columnas.map((c) => (
                  <td key={c} className="px-4 py-2 whitespace-nowrap">
                    {fila[c]}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
