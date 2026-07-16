'use client'

import { useState, useMemo } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import {
  Search,
  Plus,
  Pencil,
  Trash2,
  Boxes,
  AlertTriangle,
  PackageX,
  DollarSign,
  PackagePlus,
  SlidersHorizontal,
  History,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { useProductosStock } from '../data/store'
import {
  KpiCard,
  StockBadge,
  ComercializableBadge,
  Amount,
  EmptyState,
} from '../components/productos/display'
import { InsumoDialog, AjusteStockDialog } from '../components/productos/dialogs'
import { formatARS } from '../lib/format'
import { unidadAbrev } from '../types'
import type { Insumo } from '../types'

// ─── Input class ──────────────────────────────────────────────────────────────

const inputClass =
  'flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm'

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function Insumos() {
  const { state, dispatch } = useProductosStock()
  const navigate = useNavigate()
  const { pathname } = useLocation()
  // Fase 16.2: acceso rápido a Movimientos filtrado por este insumo.
  const base = pathname.match(/^(\/m\/[^/]+)/)?.[1] ?? ''

  const [search, setSearch] = useState('')
  const [rubroFilter, setRubroFilter] = useState('')
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editingInsumo, setEditingInsumo] = useState<Insumo | undefined>()

  // Ajuste/Recibir dialog state
  const [ajusteDialogOpen, setAjusteDialogOpen] = useState(false)
  const [ajusteMode, setAjusteMode] = useState<'ajustar' | 'recibir'>('ajustar')
  const [ajusteItem, setAjusteItem] = useState<{
    id: string
    nombre: string
    stock: number
    tipo: 'producto' | 'insumo'
  } | null>(null)

  // KPI calculations
  const kpis = useMemo(() => {
    const total = state.insumos.length
    const sinStock = state.insumos.filter((i) => i.stock <= 0).length
    const bajoMinimo = state.insumos.filter(
      (i) => i.stock > 0 && i.stock < i.stockMinimo,
    ).length
    const valorInventario = state.insumos.reduce(
      (sum, i) => sum + i.stock * i.costo,
      0,
    )
    return { total, sinStock, bajoMinimo, valorInventario }
  }, [state.insumos])

  // Rubros for insumos
  const rubrosInsumo = useMemo(
    () => state.rubros.filter((r) => r.tipo === 'insumo' || r.tipo === 'ambos'),
    [state.rubros],
  )

  const rubrosMap = useMemo(() => new Map(state.rubros.map((r) => [r.id, r])), [state.rubros])
  const subRubrosMap = useMemo(
    () => new Map(state.subRubros.map((sr) => [sr.id, sr])),
    [state.subRubros],
  )

  // Filtered insumos
  const filtered = useMemo(() => {
    let list = state.insumos
    if (rubroFilter) {
      list = list.filter((i) => i.rubroId === rubroFilter)
    }
    if (search.trim()) {
      const q = search.toLowerCase()
      list = list.filter((i) => i.nombre.toLowerCase().includes(q))
    }
    return list
  }, [state.insumos, search, rubroFilter])

  function handleOpenNew() {
    setEditingInsumo(undefined)
    setDialogOpen(true)
  }

  function handleEdit(i: Insumo) {
    setEditingInsumo(i)
    setDialogOpen(true)
  }

  function handleDelete(id: string) {
    if (window.confirm('Estas seguro de eliminar este insumo?')) {
      dispatch({ type: 'DELETE_INSUMO', payload: id })
    }
  }

  function handleSave(data: Omit<Insumo, 'id' | 'stock' | 'createdAt' | 'productoVinculadoId'>) {
    if (editingInsumo) {
      dispatch({
        type: 'UPDATE_INSUMO',
        payload: { ...editingInsumo, ...data },
      })
    } else {
      dispatch({
        type: 'ADD_INSUMO',
        payload: { ...data, stock: 0 },
      })
    }
  }

  function handleRecibir(insumo: Insumo) {
    setAjusteMode('recibir')
    setAjusteItem({
      id: insumo.id,
      nombre: insumo.nombre,
      stock: insumo.stock,
      tipo: 'insumo',
    })
    setAjusteDialogOpen(true)
  }

  function handleVerMovimientos(insumo: Insumo) {
    navigate(`${base}/movimientos?itemId=${insumo.id}&itemTipo=insumo`)
  }

  function handleAjustar(insumo: Insumo) {
    setAjusteMode('ajustar')
    setAjusteItem({
      id: insumo.id,
      nombre: insumo.nombre,
      stock: insumo.stock,
      tipo: 'insumo',
    })
    setAjusteDialogOpen(true)
  }

  function handleAjusteSave(data: { cantidad: number; motivo: string; nota: string }) {
    if (!ajusteItem) return

    if (ajusteMode === 'recibir') {
      dispatch({
        type: 'RECIBIR_STOCK',
        payload: {
          itemTipo: 'insumo',
          itemId: ajusteItem.id,
          cantidad: Math.abs(data.cantidad),
          nota: data.nota,
        },
      })
    } else {
      dispatch({
        type: 'AJUSTAR_STOCK',
        payload: {
          itemTipo: 'insumo',
          itemId: ajusteItem.id,
          cantidad: data.cantidad,
          motivo: data.motivo as any,
          nota: data.nota,
        },
      })
    }
  }

  return (
    <div className="space-y-6">
      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiCard
          title="Insumos cargados"
          value={String(kpis.total)}
          accent="primary"
          icon={Boxes}
        />
        <KpiCard
          title="Sin stock"
          value={String(kpis.sinStock)}
          accent="expense"
          icon={PackageX}
        />
        <KpiCard
          title="Bajo minimo"
          value={String(kpis.bajoMinimo)}
          accent="warning"
          icon={AlertTriangle}
        />
        <KpiCard
          title="Valor inventario insumos"
          value={formatARS(kpis.valorInventario)}
          accent="income"
          icon={DollarSign}
        />
      </div>

      {/* Header with filters */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3">
        <div className="relative flex-1 w-full sm:max-w-xs">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <input
            className={cn(inputClass, 'pl-9')}
            placeholder="Buscar por nombre..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <select
          className={cn(inputClass, 'w-full sm:w-48')}
          value={rubroFilter}
          onChange={(e) => setRubroFilter(e.target.value)}
        >
          <option value="">Todos los rubros</option>
          {rubrosInsumo.map((r) => (
            <option key={r.id} value={r.id}>
              {r.nombre}
            </option>
          ))}
        </select>
        <Button onClick={handleOpenNew} className="shrink-0">
          <Plus className="h-4 w-4 mr-1" />
          Nuevo insumo
        </Button>
      </div>

      {/* Table */}
      {filtered.length === 0 ? (
        <EmptyState
          icon={Search}
          title="Sin resultados"
          description={
            state.insumos.length === 0
              ? 'No hay insumos cargados. Crea el primero.'
              : 'No se encontraron insumos con los filtros aplicados.'
          }
        />
      ) : (
        <div className="rounded-lg border bg-card shadow-sm overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-left text-muted-foreground">
                <th className="px-4 py-3 font-medium">Nombre</th>
                <th className="px-4 py-3 font-medium">Rubro</th>
                <th className="px-4 py-3 font-medium text-right">Stock</th>
                <th className="px-4 py-3 font-medium text-right">Minimo</th>
                <th className="px-4 py-3 font-medium text-right">Costo</th>
                <th className="px-4 py-3 font-medium">Comercializable</th>
                <th className="px-4 py-3 font-medium text-right">Acciones</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((i) => (
                <tr key={i.id} className="border-b last:border-0 hover:bg-muted/50">
                  <td className="px-4 py-3 font-medium">{i.nombre}</td>
                  <td className="px-4 py-3 text-muted-foreground">
                    {(() => {
                      const rubro = rubrosMap.get(i.rubroId)
                      const subRubro = i.subRubroId ? subRubrosMap.get(i.subRubroId) : undefined
                      if (!rubro) return '-'
                      return subRubro ? `${rubro.nombre} / ${subRubro.nombre}` : rubro.nombre
                    })()}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <span className="tabular-nums mr-1">
                      {i.stock} {unidadAbrev(i.unidad)}
                    </span>
                    <StockBadge stock={i.stock} minimo={i.stockMinimo} />
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums">
                    {i.stockMinimo} {unidadAbrev(i.unidad)}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <Amount value={i.costo} />
                  </td>
                  <td className="px-4 py-3">
                    <ComercializableBadge esComercializable={i.esComercializable} />
                  </td>
                  <td className="px-4 py-3 text-right">
                    <div className="flex items-center justify-end gap-1">
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8"
                        onClick={() => handleRecibir(i)}
                        title="Recibir stock"
                      >
                        <PackagePlus className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8"
                        onClick={() => handleAjustar(i)}
                        title="Ajustar stock"
                      >
                        <SlidersHorizontal className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8"
                        onClick={() => handleVerMovimientos(i)}
                        title="Ver movimientos"
                      >
                        <History className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8"
                        onClick={() => handleEdit(i)}
                        title="Editar"
                      >
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 text-muted-foreground hover:text-red-500"
                        onClick={() => handleDelete(i.id)}
                        title="Eliminar"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Dialogs */}
      <InsumoDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        onSave={handleSave}
        rubros={state.rubros}
        subRubros={state.subRubros}
        editData={editingInsumo}
      />

      {ajusteItem && (
        <AjusteStockDialog
          open={ajusteDialogOpen}
          onOpenChange={setAjusteDialogOpen}
          onSave={handleAjusteSave}
          item={ajusteItem}
        />
      )}
    </div>
  )
}
