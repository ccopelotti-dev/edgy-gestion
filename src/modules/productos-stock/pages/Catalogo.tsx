'use client'

import { useState, useMemo } from 'react'
import { Search, ImageOff, ChevronLeft, ChevronRight, Images } from 'lucide-react'
import { cn } from '@/lib/utils'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog'
import { useProductosStock } from '../data/store'
import { Amount, EmptyState } from '../components/productos/display'
import type { Producto } from '../types'

// ─── Input class (same as resto del módulo) ───────────────────────────────────

const inputClass =
  'flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm'

// ─── Page ─────────────────────────────────────────────────────────────────────
//
// Vista de catálogo visual, pensada como referencia de lo que eventualmente se
// va a mostrar en un catálogo público para compartir en redes (esa parte es
// una entrega aparte: requiere que los productos vivan en Supabase, no en
// localStorage, para que cualquier visitante externo pueda verlos).
// Por ahora es una vista interna, detrás del login existente del módulo.

export default function Catalogo() {
  const { state } = useProductosStock()

  const [search, setSearch] = useState('')
  const [categoriaFilter, setCategoriaFilter] = useState('')
  const [incluirNoDisponibles, setIncluirNoDisponibles] = useState(false)
  const [productoAbierto, setProductoAbierto] = useState<Producto | null>(null)
  const [indiceImagen, setIndiceImagen] = useState(0)

  const categoriasMap = useMemo(
    () => new Map(state.categorias.map((c) => [c.id, c])),
    [state.categorias],
  )

  const categoriasProducto = useMemo(
    () => state.categorias.filter((c) => c.tipo === 'producto' || c.tipo === 'ambos'),
    [state.categorias],
  )

  const productos = useMemo(() => {
    let list = state.productos
    if (!incluirNoDisponibles) {
      list = list.filter((p) => p.disponible && p.estado === 'activo')
    }
    if (categoriaFilter) {
      list = list.filter((p) => p.categoriaId === categoriaFilter)
    }
    if (search.trim()) {
      const q = search.toLowerCase()
      list = list.filter(
        (p) =>
          p.nombre.toLowerCase().includes(q) ||
          p.descripcion.toLowerCase().includes(q),
      )
    }
    return list
  }, [state.productos, search, categoriaFilter, incluirNoDisponibles])

  function abrirProducto(p: Producto) {
    setProductoAbierto(p)
    setIndiceImagen(0)
  }

  function imagenSiguiente() {
    if (!productoAbierto) return
    setIndiceImagen((i) => (i + 1) % productoAbierto.imagenes.length)
  }

  function imagenAnterior() {
    if (!productoAbierto) return
    setIndiceImagen(
      (i) => (i - 1 + productoAbierto.imagenes.length) % productoAbierto.imagenes.length,
    )
  }

  return (
    <div className="space-y-6">
      {/* Nota de alcance */}
      <div className="rounded-lg border border-dashed bg-muted/40 px-4 py-3 text-xs text-muted-foreground">
        Vista interna del catálogo (dentro del panel). El catálogo público para compartir en
        redes es una entrega aparte, que requiere migrar los productos a Supabase.
      </div>

      {/* Filtros */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3">
        <div className="relative flex-1 w-full sm:max-w-xs">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <input
            className={cn(inputClass, 'pl-9')}
            placeholder="Buscar producto..."
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
        <label className="flex items-center gap-2 text-sm whitespace-nowrap">
          <input
            type="checkbox"
            checked={incluirNoDisponibles}
            onChange={(e) => setIncluirNoDisponibles(e.target.checked)}
            className="rounded border-input"
          />
          Incluir no disponibles
        </label>
      </div>

      {/* Grilla */}
      {productos.length === 0 ? (
        <EmptyState
          icon={ImageOff}
          title="Sin productos para mostrar"
          description={
            state.productos.length === 0
              ? 'Todavía no hay productos cargados.'
              : 'No se encontraron productos con los filtros aplicados.'
          }
        />
      ) : (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
          {productos.map((p) => {
            const noDisponible = !(p.disponible && p.estado === 'activo')
            return (
              <button
                key={p.id}
                type="button"
                onClick={() => abrirProducto(p)}
                className="group flex flex-col overflow-hidden rounded-lg border bg-card text-left shadow-sm transition-shadow hover:shadow-md"
              >
                <div className="relative aspect-square w-full overflow-hidden bg-muted">
                  {p.imagenes && p.imagenes.length > 0 ? (
                    <img
                      src={p.imagenes[0]}
                      alt={p.nombre}
                      className="h-full w-full object-cover transition-transform group-hover:scale-105"
                    />
                  ) : (
                    <div className="flex h-full w-full items-center justify-center text-muted-foreground">
                      <ImageOff className="h-8 w-8" />
                    </div>
                  )}
                  {p.imagenes && p.imagenes.length > 1 && (
                    <span className="absolute bottom-1.5 right-1.5 inline-flex items-center gap-1 rounded-full bg-black/60 px-1.5 py-0.5 text-[10px] text-white">
                      <Images className="h-3 w-3" />
                      {p.imagenes.length}
                    </span>
                  )}
                  {noDisponible && (
                    <span className="absolute left-1.5 top-1.5 rounded-full bg-gray-900/70 px-1.5 py-0.5 text-[10px] text-white">
                      No disponible
                    </span>
                  )}
                </div>
                <div className="flex flex-1 flex-col gap-1 p-3">
                  <p className="line-clamp-2 text-sm font-medium leading-tight">{p.nombre}</p>
                  <p className="text-xs text-muted-foreground">
                    {categoriasMap.get(p.categoriaId)?.nombre ?? 'Sin categoria'}
                  </p>
                  <div className="mt-auto pt-1">
                    <Amount value={p.precioVenta} className="text-sm font-semibold" />
                  </div>
                </div>
              </button>
            )
          })}
        </div>
      )}

      {/* Lightbox / detalle */}
      <Dialog open={!!productoAbierto} onOpenChange={(v) => !v && setProductoAbierto(null)}>
        <DialogContent className="max-w-xl">
          {productoAbierto && (
            <>
              <DialogHeader>
                <DialogTitle>{productoAbierto.nombre}</DialogTitle>
                <DialogDescription>
                  {categoriasMap.get(productoAbierto.categoriaId)?.nombre ?? 'Sin categoria'}
                </DialogDescription>
              </DialogHeader>

              <div className="relative aspect-square w-full overflow-hidden rounded-md bg-muted">
                {productoAbierto.imagenes.length > 0 ? (
                  <img
                    src={productoAbierto.imagenes[indiceImagen]}
                    alt={productoAbierto.nombre}
                    className="h-full w-full object-contain"
                  />
                ) : (
                  <div className="flex h-full w-full items-center justify-center text-muted-foreground">
                    <ImageOff className="h-10 w-10" />
                  </div>
                )}

                {productoAbierto.imagenes.length > 1 && (
                  <>
                    <button
                      type="button"
                      onClick={imagenAnterior}
                      className="absolute left-2 top-1/2 -translate-y-1/2 rounded-full bg-black/50 p-1.5 text-white hover:bg-black/70"
                    >
                      <ChevronLeft className="h-4 w-4" />
                    </button>
                    <button
                      type="button"
                      onClick={imagenSiguiente}
                      className="absolute right-2 top-1/2 -translate-y-1/2 rounded-full bg-black/50 p-1.5 text-white hover:bg-black/70"
                    >
                      <ChevronRight className="h-4 w-4" />
                    </button>
                  </>
                )}
              </div>

              {productoAbierto.imagenes.length > 1 && (
                <div className="flex gap-2 overflow-x-auto">
                  {productoAbierto.imagenes.map((url, idx) => (
                    <button
                      key={url}
                      type="button"
                      onClick={() => setIndiceImagen(idx)}
                      className={cn(
                        'h-14 w-14 shrink-0 overflow-hidden rounded-md border-2',
                        idx === indiceImagen ? 'border-primary' : 'border-transparent',
                      )}
                    >
                      <img src={url} alt="" className="h-full w-full object-cover" />
                    </button>
                  ))}
                </div>
              )}

              <div className="flex items-center justify-between pt-1">
                <p className="text-sm text-muted-foreground max-w-[70%]">
                  {productoAbierto.descripcion || 'Sin descripción'}
                </p>
                <Amount value={productoAbierto.precioVenta} className="text-lg font-bold" />
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}
