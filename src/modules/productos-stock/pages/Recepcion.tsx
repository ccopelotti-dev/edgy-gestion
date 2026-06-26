'use client'

import { useState, useMemo } from 'react'
import {
  PackageCheck,
  FileEdit,
  DollarSign,
  CheckCircle2,
  Plus,
  Check,
  X,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { useProductosStock } from '../data/store'
import {
  KpiCard,
  EstadoRecepcionBadge,
  Amount,
  EmptyState,
} from '../components/productos/display'
import { RecepcionDialog } from '../components/productos/dialogs'
import { formatARS, formatDate } from '../lib/format'
import type { EstadoRecepcion, Recepcion } from '../types'

// ─── Tab config ──────────────────────────────────────────────────────────────

type TabFilter = 'todos' | EstadoRecepcion

const TABS: { value: TabFilter; label: string }[] = [
  { value: 'todos', label: 'Todos' },
  { value: 'borrador', label: 'Borradores' },
  { value: 'confirmada', label: 'Confirmadas' },
  { value: 'cancelada', label: 'Canceladas' },
]

// ─── Helpers ─────────────────────────────────────────────────────────────────

function recepcionValor(r: Recepcion): number {
  return r.lineas.reduce((sum, l) => sum + l.cantidad * l.costoUnitario, 0)
}

// ─── Page ────────────────────────────────────────────────────────────────────

export default function RecepcionPage() {
  const { state, dispatch } = useProductosStock()

  const [activeTab, setActiveTab] = useState<TabFilter>('todos')
  const [dialogOpen, setDialogOpen] = useState(false)

  // KPIs
  const kpis = useMemo(() => {
    const recepciones = state.recepciones
    const borradores = recepciones.filter((r) => r.estado === 'borrador')
    const confirmadas = recepciones.filter((r) => r.estado === 'confirmada')

    return {
      total: recepciones.length,
      borradores: borradores.length,
      valorBorradores: borradores.reduce((sum, r) => sum + recepcionValor(r), 0),
      valorConfirmado: confirmadas.reduce((sum, r) => sum + recepcionValor(r), 0),
    }
  }, [state.recepciones])

  // Filtered list
  const filteredRecepciones = useMemo(() => {
    const sorted = [...state.recepciones].sort(
      (a, b) => b.fecha.localeCompare(a.fecha) || b.createdAt.localeCompare(a.createdAt),
    )
    if (activeTab === 'todos') return sorted
    return sorted.filter((r) => r.estado === activeTab)
  }, [state.recepciones, activeTab])

  // Resolve item names
  const productosMap = useMemo(
    () => new Map(state.productos.map((p) => [p.id, p.nombre])),
    [state.productos],
  )
  const insumosMap = useMemo(
    () => new Map(state.insumos.map((i) => [i.id, i.nombre])),
    [state.insumos],
  )

  return (
    <div className="space-y-6">
      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiCard
          title="Total recepciones"
          value={String(kpis.total)}
          accent="primary"
          icon={PackageCheck}
        />
        <KpiCard
          title="Borradores"
          value={String(kpis.borradores)}
          accent="warning"
          icon={FileEdit}
        />
        <KpiCard
          title="Valor borradores"
          value={formatARS(kpis.valorBorradores)}
          accent="warning"
          icon={DollarSign}
        />
        <KpiCard
          title="Valor confirmado"
          value={formatARS(kpis.valorConfirmado)}
          accent="income"
          icon={CheckCircle2}
        />
      </div>

      {/* Tabs + action */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-1 rounded-lg border bg-muted p-1">
          {TABS.map((tab) => (
            <button
              key={tab.value}
              onClick={() => setActiveTab(tab.value)}
              className={cn(
                'rounded-md px-3 py-1.5 text-sm font-medium transition-colors',
                activeTab === tab.value
                  ? 'bg-background text-foreground shadow-sm'
                  : 'text-muted-foreground hover:text-foreground',
              )}
            >
              {tab.label}
            </button>
          ))}
        </div>

        <Button onClick={() => setDialogOpen(true)}>
          <Plus className="h-4 w-4 mr-1" />
          Nueva recepcion
        </Button>
      </div>

      {/* Table */}
      {filteredRecepciones.length === 0 ? (
        <EmptyState
          icon={PackageCheck}
          title="Sin recepciones"
          description="No hay recepciones registradas en este filtro."
        >
          <Button variant="outline" size="sm" onClick={() => setDialogOpen(true)}>
            Crear primera recepcion
          </Button>
        </EmptyState>
      ) : (
        <div className="rounded-lg border bg-card shadow-sm overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-left text-muted-foreground">
                <th className="px-4 py-3 font-medium">Fecha</th>
                <th className="px-4 py-3 font-medium">Proveedor</th>
                <th className="px-4 py-3 font-medium">N. Remito</th>
                <th className="px-4 py-3 font-medium">Estado</th>
                <th className="px-4 py-3 font-medium text-right">Items</th>
                <th className="px-4 py-3 font-medium text-right">Valor total</th>
                <th className="px-4 py-3 font-medium text-right">Acciones</th>
              </tr>
            </thead>
            <tbody>
              {filteredRecepciones.map((r) => (
                <tr key={r.id} className="border-b last:border-0">
                  <td className="px-4 py-3 tabular-nums">{formatDate(r.fecha)}</td>
                  <td className="px-4 py-3">{r.proveedor || '-'}</td>
                  <td className="px-4 py-3 text-muted-foreground">
                    {r.numeroRemito || '-'}
                  </td>
                  <td className="px-4 py-3">
                    <EstadoRecepcionBadge estado={r.estado} />
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums">
                    {r.lineas.length}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <Amount value={recepcionValor(r)} />
                  </td>
                  <td className="px-4 py-3 text-right">
                    {r.estado === 'borrador' && (
                      <div className="flex items-center justify-end gap-1">
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-7 text-xs text-green-600 hover:text-green-700"
                          onClick={() =>
                            dispatch({ type: 'CONFIRMAR_RECEPCION', payload: r.id })
                          }
                        >
                          <Check className="h-3.5 w-3.5 mr-1" />
                          Confirmar
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-7 text-xs text-red-600 hover:text-red-700"
                          onClick={() =>
                            dispatch({ type: 'CANCELAR_RECEPCION', payload: r.id })
                          }
                        >
                          <X className="h-3.5 w-3.5 mr-1" />
                          Cancelar
                        </Button>
                      </div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Dialog */}
      <RecepcionDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        productos={state.productos}
        insumos={state.insumos}
        onSave={(data) => {
          dispatch({
            type: 'ADD_RECEPCION',
            payload: { ...data, estado: 'borrador' },
          })
        }}
      />
    </div>
  )
}
