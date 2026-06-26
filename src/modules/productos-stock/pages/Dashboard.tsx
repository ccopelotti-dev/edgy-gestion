'use client'

import { useMemo } from 'react'
import { Package, Boxes, AlertTriangle, DollarSign } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useProductosStock, useStockBajo, useValorInventario } from '../data/store'
import { KpiCard, StockBadge } from '../components/productos/display'
import { formatARS, formatDate } from '../lib/format'
import { unidadAbrev } from '../types'

// ─── Tipo movimiento badge ────────────────────────────────────────────────────

const tipoBadge: Record<string, { label: string; classes: string }> = {
  ingreso: {
    label: 'Ingreso',
    classes: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400',
  },
  egreso: {
    label: 'Egreso',
    classes: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400',
  },
  ajuste: {
    label: 'Ajuste',
    classes: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400',
  },
}

const origenLabels: Record<string, string> = {
  recepcion: 'Recepcion',
  transferencia: 'Transferencia',
  ajuste_manual: 'Ajuste manual',
  formula: 'Formula',
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function Dashboard() {
  const { state } = useProductosStock()
  const stockBajo = useStockBajo()
  const valorInventario = useValorInventario()

  const ultimosMovimientos = useMemo(
    () =>
      [...state.movimientos]
        .sort((a, b) => b.fecha.localeCompare(a.fecha))
        .slice(0, 10),
    [state.movimientos],
  )

  // Maps for resolving item names
  const productosMap = useMemo(
    () => new Map(state.productos.map((p) => [p.id, p])),
    [state.productos],
  )
  const insumosMap = useMemo(
    () => new Map(state.insumos.map((i) => [i.id, i])),
    [state.insumos],
  )

  function resolveItemName(itemTipo: 'producto' | 'insumo', itemId: string): string {
    if (itemTipo === 'producto') return productosMap.get(itemId)?.nombre ?? 'Producto eliminado'
    return insumosMap.get(itemId)?.nombre ?? 'Insumo eliminado'
  }

  const totalStockBajo = stockBajo.productos.length + stockBajo.insumos.length

  return (
    <div className="space-y-6">
      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiCard
          title="Total Productos"
          value={String(state.productos.length)}
          accent="primary"
          icon={Package}
        />
        <KpiCard
          title="Total Insumos"
          value={String(state.insumos.length)}
          accent="primary"
          icon={Boxes}
        />
        <KpiCard
          title="Stock Bajo"
          value={String(totalStockBajo)}
          accent="warning"
          icon={AlertTriangle}
          subtitle={`${stockBajo.productos.length} productos, ${stockBajo.insumos.length} insumos`}
        />
        <KpiCard
          title="Valor del Inventario"
          value={formatARS(valorInventario.total)}
          accent="income"
          icon={DollarSign}
          subtitle={`Productos: ${formatARS(valorInventario.productos)} | Insumos: ${formatARS(valorInventario.insumos)}`}
        />
      </div>

      {/* Content: two columns */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Left: Ultimos movimientos */}
        <div className="rounded-lg border bg-card shadow-sm">
          <div className="border-b px-4 py-3">
            <h3 className="text-sm font-semibold">Ultimos movimientos</h3>
          </div>
          {ultimosMovimientos.length === 0 ? (
            <p className="px-4 py-8 text-center text-sm text-muted-foreground">
              No hay movimientos registrados.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left text-muted-foreground">
                    <th className="px-4 py-2 font-medium">Fecha</th>
                    <th className="px-4 py-2 font-medium">Tipo</th>
                    <th className="px-4 py-2 font-medium">Item</th>
                    <th className="px-4 py-2 font-medium text-right">Cantidad</th>
                    <th className="px-4 py-2 font-medium">Origen</th>
                  </tr>
                </thead>
                <tbody>
                  {ultimosMovimientos.map((m) => {
                    const cfg = tipoBadge[m.tipo]
                    return (
                      <tr key={m.id} className="border-b last:border-0">
                        <td className="px-4 py-2 tabular-nums">{formatDate(m.fecha)}</td>
                        <td className="px-4 py-2">
                          <span
                            className={cn(
                              'inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium',
                              cfg.classes,
                            )}
                          >
                            {cfg.label}
                          </span>
                        </td>
                        <td className="px-4 py-2">{resolveItemName(m.itemTipo, m.itemId)}</td>
                        <td className="px-4 py-2 text-right tabular-nums">
                          {m.tipo === 'egreso' ? `-${m.cantidad}` : `+${m.cantidad}`}
                        </td>
                        <td className="px-4 py-2 text-muted-foreground">
                          {m.origen ? (origenLabels[m.origen] ?? m.origen) : '-'}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Right: Alertas de stock */}
        <div className="rounded-lg border bg-card shadow-sm">
          <div className="border-b px-4 py-3">
            <h3 className="text-sm font-semibold">Alertas de stock</h3>
          </div>
          {totalStockBajo === 0 ? (
            <p className="px-4 py-8 text-center text-sm text-muted-foreground">
              Todos los items estan por encima del stock minimo.
            </p>
          ) : (
            <div className="divide-y">
              {stockBajo.productos.map((p) => (
                <div key={p.id} className="flex items-center justify-between px-4 py-3">
                  <div>
                    <p className="text-sm font-medium">{p.nombre}</p>
                    <p className="text-xs text-muted-foreground">
                      Producto &middot; Stock: {p.stock} / Min: {p.stockMinimo}
                    </p>
                  </div>
                  <StockBadge stock={p.stock} minimo={p.stockMinimo} />
                </div>
              ))}
              {stockBajo.insumos.map((i) => (
                <div key={i.id} className="flex items-center justify-between px-4 py-3">
                  <div>
                    <p className="text-sm font-medium">{i.nombre}</p>
                    <p className="text-xs text-muted-foreground">
                      Insumo &middot; Stock: {i.stock} {unidadAbrev(i.unidad)} / Min: {i.stockMinimo}
                    </p>
                  </div>
                  <StockBadge stock={i.stock} minimo={i.stockMinimo} />
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
