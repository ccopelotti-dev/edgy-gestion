'use client'

import { useState, useMemo } from 'react'
import { Search, Plus, Pencil, Trash2, ImageOff } from 'lucide-react'
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
import type { Producto } from '../types'

// ─── Input class (same as dialogs) ────────────────────────────────────────────

const inputClass =
  'flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm'

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function Productos() {
  const { state, dispatch } = useProductosStock()

  const [search, setSearch] = useState('')
  const [categoriaFilter, setCategoriaFilter] = useState('')
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editingProducto, setEditingProducto] = useState<Producto | undefined>()

  // Categorias for products
  const categoriasProducto = useMemo(
    () => state.categorias.filter((c) => c.tipo === 'producto' || c.tipo === 'ambos'),
    [state.categorias],
  )

  // Categories map for name resolution
  const categoriasMap = useMemo(
    () => new Map(state.categorias.map((c) => [c.id, c])),
    [state.categorias],
  )

  // Filtered products
  const filtered = useMemo(() => {
    let list = state.productos
    if (categoriaFilter) {
      list = list.filter((p) => p.categoriaId === categoriaFilter)
    }
    if (search.trim()) {
      const q = search.toLowerCase()
      list = list.filter(
        (p) =>
          p.nombre.toLowerCase().includes(q) ||
          p.codigo.toLowerCase().includes(q),
      )
    }
    return list
  }, [state.productos, search, categoriaFilter])

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

  return (
    <div className="space-y-6">
      {/* Header with filters */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3">
        <div className="relative flex-1 w-full sm:max-w-xs">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <input
            className={cn(inputClass, 'pl-9')}
            placeholder="Buscar por nombre o codigo..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <select
          className={cn(inputClass, 'w-full sm:w-48')}
          value={categoriaFilter}
          onChange={(e) => setCategoriaFilter(e.target.value)}
        >
          <option value="">Todas las categorias</option>
          {categoriasProducto.map((c) => (
            <option key={c.id} value={c.id}>
              {c.nombre}
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
                <th className="px-4 py-3 font-medium">Nombre</th>
                <th className="px-4 py-3 font-medium">Categoria</th>
                <th className="px-4 py-3 font-medium text-right">Precio</th>
                <th className="px-4 py-3 font-medium text-right">Costo</th>
                <th className="px-4 py-3 font-medium text-right">Stock</th>
                <th className="px-4 py-3 font-medium">Estado</th>
                <th className="px-4 py-3 font-medium text-right">Acciones</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((p) => (
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
                  <td className="px-4 py-3 font-medium">{p.nombre}</td>
                  <td className="px-4 py-3 text-muted-foreground">
                    {categoriasMap.get(p.categoriaId)?.nombre ?? '-'}
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
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Dialog */}
      <ProductoDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        onSave={handleSave}
        categorias={state.categorias}
        editData={editingProducto}
      />
    </div>
  )
}
