'use client'

import { useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import {
  ArrowUpCircle,
  ArrowDownCircle,
  SlidersHorizontal,
  History,
  Search,
  X,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { useProductosStock } from '../data/store'
import { KpiCard, EmptyState } from '../components/productos/display'
import { formatDate, formatQty } from '../lib/format'
import { unidadAbrev, MOTIVOS_AJUSTE } from '../types'
import type { MovimientoStock } from '../types'

// ─── Labels ───────────────────────────────────────────────────────────────────

const TIPO_LABEL: Record<MovimientoStock['tipo'], string> = {
  ingreso: 'Ingreso',
  egreso: 'Egreso',
  ajuste: 'Ajuste',
}

const TIPO_CLASSES: Record<MovimientoStock['tipo'], string> = {
  ingreso: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400',
  egreso: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400',
  ajuste: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',
}

const ORIGEN_LABEL: Record<NonNullable<MovimientoStock['origen']>, string> = {
  recepcion: 'Recepción (compra)',
  transferencia: 'Transferencia',
  ajuste_manual: 'Ajuste manual',
  formula: 'Producción',
  venta: 'Venta',
}

const MOTIVO_LABEL: Record<string, string> = Object.fromEntries(
  MOTIVOS_AJUSTE.map((m) => [m.value, m.label]),
)

type TipoFilter = 'todos' | MovimientoStock['tipo']
type ItemTipoFilter = 'todos' | 'producto' | 'insumo'

// ─── Page ────────────────────────────────────────────────────────────────────

export default function Movimientos() {
  const { state } = useProductosStock()
  const [searchParams, setSearchParams] = useSearchParams()

  // Fase 16.2 (a pedido del usuario): acceso rápido desde Insumos/Productos
  // -- el ícono "Movimientos" de la fila navega acá con ?itemId=&itemTipo=,
  // que arranca el filtro ya enfocado en ese ítem puntual.
  const focusItemId = searchParams.get('itemId') ?? ''
  const focusItemTipo = (searchParams.get('itemTipo') as 'producto' | 'insumo' | null) ?? null

  const [tipoFilter, setTipoFilter] = useState<TipoFilter>('todos')
  const [itemTipoFilter, setItemTipoFilter] = useState<ItemTipoFilter>('todos')
  const [origenFilter, setOrigenFilter] = useState('')
  const [fechaDesde, setFechaDesde] = useState('')
  const [fechaHasta, setFechaHasta] = useState('')
  const [busqueda, setBusqueda] = useState('')

  const productosMap = useMemo(
    () => new Map(state.productos.map((p) => [p.id, p])),
    [state.productos],
  )
  const insumosMap = useMemo(
    () => new Map(state.insumos.map((i) => [i.id, i])),
    [state.insumos],
  )

  function nombreItem(m: MovimientoStock): string {
    if (m.itemTipo === 'producto') return productosMap.get(m.itemId)?.nombre ?? 'Producto eliminado'
    return insumosMap.get(m.itemId)?.nombre ?? 'Insumo eliminado'
  }

  function unidadItem(m: MovimientoStock): string {
    if (m.itemTipo === 'producto') return unidadAbrev(productosMap.get(m.itemId)?.unidadVenta ?? 'unidad')
    return unidadAbrev(insumosMap.get(m.itemId)?.unidad ?? 'unidad')
  }

  const focusItemNombre = useMemo(() => {
    if (!focusItemId) return ''
    if (focusItemTipo === 'insumo') return insumosMap.get(focusItemId)?.nombre ?? ''
    return productosMap.get(focusItemId)?.nombre ?? ''
  }, [focusItemId, focusItemTipo, productosMap, insumosMap])

  function limpiarFoco() {
    const next = new URLSearchParams(searchParams)
    next.delete('itemId')
    next.delete('itemTipo')
    setSearchParams(next)
  }

  // KPIs -- sobre el total historico, no sobre lo filtrado en pantalla.
  const kpis = useMemo(() => {
    const total = state.movimientos.length
    const ingresos = state.movimientos.filter((m) => m.tipo === 'ingreso').length
    const egresos = state.movimientos.filter((m) => m.tipo === 'egreso').length
    const ajustes = state.movimientos.filter((m) => m.tipo === 'ajuste').length
    return { total, ingresos, egresos, ajustes }
  }, [state.movimientos])

  const filtrados = useMemo(() => {
    let list = [...state.movimientos]

    if (focusItemId) {
      list = list.filter((m) => m.itemId === focusItemId)
    }
    if (tipoFilter !== 'todos') list = list.filter((m) => m.tipo === tipoFilter)
    if (itemTipoFilter !== 'todos') list = list.filter((m) => m.itemTipo === itemTipoFilter)
    if (origenFilter) list = list.filter((m) => m.origen === origenFilter)
    if (fechaDesde) list = list.filter((m) => m.fecha >= fechaDesde)
    if (fechaHasta) list = list.filter((m) => m.fecha <= fechaHasta)
    if (busqueda.trim()) {
      const q = busqueda.toLowerCase()
      list = list.filter((m) => nombreItem(m).toLowerCase().includes(q))
    }

    return list.sort((a, b) => b.fecha.localeCompare(a.fecha))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    state.movimientos,
    focusItemId,
    tipoFilter,
    itemTipoFilter,
    origenFilter,
    fechaDesde,
    fechaHasta,
    busqueda,
    productosMap,
    insumosMap,
  ])

  const inputClass =
    'flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm'

  return (
    <div className="space-y-6">
      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiCard title="Movimientos totales" value={String(kpis.total)} accent="primary" icon={History} />
        <KpiCard title="Ingresos" value={String(kpis.ingresos)} accent="income" icon={ArrowUpCircle} />
        <KpiCard title="Egresos" value={String(kpis.egresos)} accent="expense" icon={ArrowDownCircle} />
        <KpiCard title="Ajustes" value={String(kpis.ajustes)} accent="warning" icon={SlidersHorizontal} />
      </div>

      {/* Chip de ítem enfocado (llegó desde Insumos/Productos) */}
      {focusItemId && (
        <div className="flex items-center gap-2 rounded-lg border bg-muted/50 px-3 py-2 text-sm w-fit">
          <span className="text-muted-foreground">Mostrando movimientos de:</span>
          <span className="font-medium">{focusItemNombre || 'ítem'}</span>
          <button
            onClick={limpiarFoco}
            className="rounded-full p-0.5 text-muted-foreground hover:bg-muted hover:text-foreground"
            title="Quitar filtro"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      )}

      {/* Filtros */}
      <div className="flex flex-col sm:flex-row flex-wrap items-start sm:items-center gap-3">
        <div className="relative flex-1 w-full sm:max-w-xs">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <input
            className={cn(inputClass, 'pl-9')}
            placeholder="Buscar por nombre..."
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
          />
        </div>
        <select
          className={cn(inputClass, 'w-full sm:w-40')}
          value={tipoFilter}
          onChange={(e) => setTipoFilter(e.target.value as TipoFilter)}
        >
          <option value="todos">Todos los tipos</option>
          <option value="ingreso">Ingreso</option>
          <option value="egreso">Egreso</option>
          <option value="ajuste">Ajuste</option>
        </select>
        <select
          className={cn(inputClass, 'w-full sm:w-40')}
          value={itemTipoFilter}
          onChange={(e) => setItemTipoFilter(e.target.value as ItemTipoFilter)}
        >
          <option value="todos">Productos e insumos</option>
          <option value="producto">Solo productos</option>
          <option value="insumo">Solo insumos</option>
        </select>
        <select
          className={cn(inputClass, 'w-full sm:w-44')}
          value={origenFilter}
          onChange={(e) => setOrigenFilter(e.target.value)}
        >
          <option value="">Todos los orígenes</option>
          {(Object.entries(ORIGEN_LABEL) as [string, string][]).map(([val, label]) => (
            <option key={val} value={val}>{label}</option>
          ))}
        </select>
        <input
          type="date"
          className={cn(inputClass, 'w-full sm:w-40')}
          value={fechaDesde}
          onChange={(e) => setFechaDesde(e.target.value)}
          title="Desde"
        />
        <input
          type="date"
          className={cn(inputClass, 'w-full sm:w-40')}
          value={fechaHasta}
          onChange={(e) => setFechaHasta(e.target.value)}
          title="Hasta"
        />
      </div>

      {/* Table */}
      {filtrados.length === 0 ? (
        <EmptyState
          icon={History}
          title="Sin movimientos"
          description={
            state.movimientos.length === 0
              ? 'Todavía no hay movimientos de stock registrados.'
              : 'No se encontraron movimientos con los filtros aplicados.'
          }
        />
      ) : (
        <div className="rounded-lg border bg-card shadow-sm overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-left text-muted-foreground">
                <th className="px-4 py-3 font-medium">Fecha</th>
                <th className="px-4 py-3 font-medium">Ítem</th>
                <th className="px-4 py-3 font-medium">Tipo</th>
                <th className="px-4 py-3 font-medium text-right">Cantidad</th>
                <th className="px-4 py-3 font-medium">Motivo / Origen</th>
                <th className="px-4 py-3 font-medium">Nota</th>
              </tr>
            </thead>
            <tbody>
              {filtrados.map((m) => {
                const cantidadMostrada = m.tipo === 'egreso' ? -Math.abs(m.cantidad) : m.cantidad
                return (
                  <tr key={m.id} className="border-b last:border-0 hover:bg-muted/50">
                    <td className="px-4 py-3 tabular-nums whitespace-nowrap">{formatDate(m.fecha)}</td>
                    <td className="px-4 py-3">
                      <div className="font-medium">{nombreItem(m)}</div>
                      <span
                        className={cn(
                          'inline-flex items-center rounded-full px-1.5 py-0.5 text-[10px] font-medium mt-0.5',
                          m.itemTipo === 'producto'
                            ? 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400'
                            : 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',
                        )}
                      >
                        {m.itemTipo === 'producto' ? 'Producto' : 'Insumo'}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={cn(
                          'inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium',
                          TIPO_CLASSES[m.tipo],
                        )}
                      >
                        {TIPO_LABEL[m.tipo]}
                      </span>
                    </td>
                    <td
                      className={cn(
                        'px-4 py-3 text-right tabular-nums font-medium whitespace-nowrap',
                        cantidadMostrada > 0 ? 'text-green-700' : cantidadMostrada < 0 ? 'text-red-700' : '',
                      )}
                    >
                      {cantidadMostrada > 0 ? '+' : ''}
                      {formatQty(cantidadMostrada, unidadItem(m))}
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">
                      {m.motivo ? MOTIVO_LABEL[m.motivo] ?? m.motivo : m.origen ? ORIGEN_LABEL[m.origen] : '—'}
                      {m.fechaVencimiento && (
                        <div className="text-xs text-amber-600 mt-0.5">
                          Vence {formatDate(m.fechaVencimiento)}
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-3 text-muted-foreground max-w-xs truncate" title={m.nota}>
                      {m.nota || '—'}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
