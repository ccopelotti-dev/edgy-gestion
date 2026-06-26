'use client'

import { useMemo } from 'react'
import { ArrowLeftRight, Building2, Info } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useProductosStock } from '../data/store'
import { EmptyState } from '../components/productos/display'
import { formatDate } from '../lib/format'

// ─── Page ────────────────────────────────────────────────────────────────────

export default function Transferencias() {
  const { state } = useProductosStock()

  const transferencias = useMemo(
    () =>
      [...state.transferencias].sort((a, b) =>
        b.fecha.localeCompare(a.fecha),
      ),
    [state.transferencias],
  )

  return (
    <div className="space-y-6">
      {/* Info banner */}
      <div className="flex items-start gap-3 rounded-lg border border-blue-200 bg-blue-50 p-4 dark:border-blue-900 dark:bg-blue-950/30">
        <Info className="h-5 w-5 text-blue-500 mt-0.5 shrink-0" />
        <div className="space-y-1">
          <p className="text-sm font-medium text-blue-900 dark:text-blue-300">
            Transferencias entre sucursales
          </p>
          <p className="text-sm text-blue-700 dark:text-blue-400">
            Las transferencias permiten mover stock entre sucursales. Cuando tengas 2 o
            mas sucursales activas, podras transferir productos e insumos entre ellas.
          </p>
        </div>
      </div>

      {/* Action */}
      <div className="flex items-center justify-end">
        <Button disabled title="Requiere 2+ sucursales">
          <ArrowLeftRight className="h-4 w-4 mr-1" />
          Nueva transferencia
        </Button>
      </div>

      {/* Table or empty state */}
      {transferencias.length === 0 ? (
        <EmptyState
          icon={Building2}
          title="Sin transferencias"
          description="No hay transferencias registradas. Cuando tengas multiples sucursales, podras transferir stock entre ellas."
        />
      ) : (
        <div className="rounded-lg border bg-card shadow-sm overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-left text-muted-foreground">
                <th className="px-4 py-3 font-medium">Fecha</th>
                <th className="px-4 py-3 font-medium">Origen</th>
                <th className="px-4 py-3 font-medium">Destino</th>
                <th className="px-4 py-3 font-medium text-right">Items</th>
                <th className="px-4 py-3 font-medium">Notas</th>
              </tr>
            </thead>
            <tbody>
              {transferencias.map((t) => (
                <tr key={t.id} className="border-b last:border-0">
                  <td className="px-4 py-3 tabular-nums">{formatDate(t.fecha)}</td>
                  <td className="px-4 py-3">{t.sucursalOrigen}</td>
                  <td className="px-4 py-3">{t.sucursalDestino}</td>
                  <td className="px-4 py-3 text-right tabular-nums">
                    {t.lineas.length}
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">
                    {t.notas || '-'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
