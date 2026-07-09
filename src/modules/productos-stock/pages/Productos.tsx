'use client'

import { useState, useMemo } from 'react'
import { Search, Plus, Pencil, Trash2, ImageOff, QrCode } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { useProductosStock } from '../data/store'
import {
  KpiCard,
  StockBadge,
  EstadoBadge,
  Amount,
  EmptyState,
} from '../components/productos/display'
import { ProductoDialog } from '../components/productos/dialogs'
import { EtiquetaDialog } from '../components/productos/etiqueta'
import { generarCodigoInterno } from '../lib/etiqueta'
import type { Producto } from '../types'

// ─── Input class (same as dialogs) ────────────────────────────────────────────

const inputClass =
  'flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm'

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function Productos() {
  const { state, dispatch } = useProductosStock()

  const [search, setSearch] = useState('')
  const [rubroFilter, setRubroFilter] = useState('')
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editingProducto, setEditingProducto] = useState<Producto | undefined>()
  const [etiquetaProductoId, setEtiquetaProductoId] = useState<string | null>(null)

  // Rubros aplicables a productos
  const rubrosProducto = useMemo(
    () => state.rubros.filter((r) => r.tipo === 'producto' || r.tipo === 'ambos'),
    [state.rubros],
  )

  // Mapas para resolver nombres
  const rubrosMap = useMemo(() => new Map(state.rubros.map((r) => [r.id, r])), [state.rubros])
  const subRubrosMap = useMemo(
    () => new Map(state.subRubros.map((sr) => [sr.id, sr])),
    [state.subRubros],
  )

  // Producto para la etiqueta (siempre lo mas actual de state.productos, para
  // que el codigo generado se refleje apenas se genera).
  const etiquetaProducto = useMemo(
    () =>
      etiquetaProductoId
        ? (state.productos.find((p) => p.id === etiquetaProductoId) ?? null)
        : null,
    [state.productos, etiquetaProductoId],
  )

  // Filtered products
  const filtered = useMemo(() => {
    let list = state.productos
    if (rubroFilter) {
      list = list.filter((p) => p.rubroId === rubroFilter)
    }
    if (search.trim()) {
      const q = search.toLowerCase()
      list = list.filter(
        (p) =>
          p.nombre.toLowerCase().includes(q) ||
          p.codigo.toLowerCase().includes(q) ||
          (p.codigoBarras ?? '').toLowerCase().includes(q),
      )
    }
    return list
  }, [state.productos, search, rubroFilter])

  function handleOpenNew() {
    setEditingProducto(undefined)
    setDialogOpen(true)
  }

  function handleEdit(p: Producto) {
    setEditingProducto(p)
    setDialogOpen(true)
  }

  function handleDelete(id: string) {
    if (window.confirm('Estas seguro de eliminar este producto?')) {
      dispatch({ type: 'DELETE_PRODUCTO', payload: id })
    }
  }

  function handleSave(data: Omit<Producto, 'id' | 'stock' | 'createdAt' | 'tieneFormula'>) {
    if (editingProducto) {
      dispatch({
        type: 'UPDATE_PRODUCTO',
        payload: {
          ...editingProducto,
          ...data,
        },
      })
    } else {
      dispatch({
        type: 'ADD_PRODUCTO',
        payload: {
          ...data,
          stock: 0,
          tieneFormula: false,
        },
      })
    }
  }

  // Genera un código interno y lo persiste de inmediato -- lo llama
  // EtiquetaDialog cuando el producto todavía no tiene codigoBarras.
  function handleGenerarCodigo(producto: Producto): string {
    const nuevoCodigo = generarCodigoInterno()
    dispatch({ type: 'UPDATE_PRODUCTO', payload: { ...producto, codigoBarras: nuevoCodigo } })
    return nuevoCodigo
  }

  return (
    <div className="space-y-6">
      {/* Header with filters */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3">
        <div className="relative flex-1 w-full sm:max-w-xs">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <input
            className={cn(inputClass, 'pl-9')}
            placeholder="Buscar por nombre, codigo o cód. de barras..."
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
          {rubrosProducto.map((r) => (
            <option key={r.id} value={r.id}>
              {r.nombre}
            </option>
          ))}
        </select>
        <Button onClick={handleOpenNew} className="shrink-0">
          <Plus className="h-4 w-4 mr-1" />
          Nuevo producto
        </Button>
      </div>

      {/* Table */}
      {filtered.length === 0 ? (
        <EmptyState
          icon={Search}
          title="Sin resultados"
          description={
            state.productos.length === 0
              ? 'No hay productos cargados. Crea el primero.'
              : 'No se encontraron productos con los filtros aplicados.'
          }
        />
      ) : (
        <div className="rounded-lg border bg-card shadow-sm overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-left text-muted-foreground">
                <th className="px-4 py-3 font-medium"></th>
                <th className="px-4 py-3 font-medium">Codigo</th>
                <th className="px-4 py-3 font-medium">Cód. barras</th>
                <th className="px-4 py-3 font-medium">Nombre</th>
                <th className="px-4 py-3 font-medium">Rubro</th>
                <th className="px-4 py-3 font-medium text-right">Precio</th>
                <th className="px-4 py-3 font-medium text-right">Costo</th>
                <th className="px-4 py-3 font-medium text-right">Stock</th>
                <th className="px-4 py-3 font-medium">Estado</th>
                <th className="px-4 py-3 font-medium text-right">Acciones</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((p) => {
                const rubro = rubrosMap.get(p.rubroId)
                const subRubro = p.subRubroId ? subRubrosMap.get(p.subRubroId) : undefined
                return (
                  <tr key={p.id} className="border-b last:border-0 hover:bg-muted/50">
                    <td className="px-4 py-3">
                      {p.imagenes && p.imagenes.length > 0 ? (
                        <img
                          src={p.imagenes[0]}
                          alt={p.nombre}
                          className="h-10 w-10 rounded-md border object-cover"
                        />
                      ) : (
                        <div className="flex h-10 w-10 items-center justify-center rounded-md border bg-muted text-muted-foreground">
                          <ImageOff className="h-4 w-4" />
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-3 font-mono text-xs">{p.codigo}</td>
                    <td className="px-4 py-3 font-mono text-xs text-muted-foreground">
                      {p.codigoBarras ?? '-'}
                    </td>
                    <td className="px-4 py-3 font-medium">
                      {p.nombre}
                      {p.tipo === 'con_variantes' && (
                        <span className="ml-2 inline-flex items-center rounded-full bg-indigo-100 px-2 py-0.5 text-[10px] font-medium text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-400">
                          {p.variantes.length} variante{p.variantes.length === 1 ? '' : 's'}
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">
                      {rubro
                        ? subRubro
                          ? `${rubro.nombre} / ${subRubro.nombre}`
                          : rubro.nombre
                        : '-'}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <Amount value={p.precioVenta} />
                    </td>
                    <td className="px-4 py-3 text-right">
                      <Amount value={p.costo} />
                    </td>
                    <td className="px-4 py-3 text-right">
                      <span className="tabular-nums mr-2">{p.stock}</span>
                      {p.controlaStock && (
                        <StockBadge stock={p.stock} minimo={p.stockMinimo} />
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <EstadoBadge estado={p.estado} />
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className="flex items-center justify-end gap-1">
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8"
                          onClick={() => setEtiquetaProductoId(p.id)}
                          title="Generar/imprimir etiqueta"
                        >
                          <QrCode className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8"
                          onClick={() => handleEdit(p)}
                          title="Editar"
                        >
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 text-muted-foreground hover:text-red-500"
                          onClick={() => handleDelete(p.id)}
                          title="Eliminar"
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Dialogs */}
      <ProductoDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        onSave={handleSave}
        rubros={state.rubros}
        subRubros={state.subRubros}
        productos={state.productos}
        marcas={state.marcas}
        onCrearMarca={(nombre) => dispatch({ type: 'ADD_MARCA', payload: { nombre } })}
        plantillasGarantia={state.plantillasGarantia}
        editData={editingProducto}
      />

      <EtiquetaDialog
        open={!!etiquetaProductoId}
        onOpenChange={(v) => !v && setEtiquetaProductoId(null)}
        producto={etiquetaProducto}
        onGenerarCodigo={handleGenerarCodigo}
      />
    </div>
  )
}
