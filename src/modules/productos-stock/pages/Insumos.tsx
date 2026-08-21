'use client'

import { useState, useMemo, useEffect } from 'react'
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
  Merge,
  Truck,
  Loader2,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { supabase } from '@/lib/supabase'
import {
  useProductosStock,
  fetchProductosStockState,
  crearInsumoConfirmado,
  actualizarInsumoConfirmado,
  eliminarInsumoConfirmado,
  ajustarStockConfirmado,
  recibirStockConfirmado,
} from '../data/store'
import { useClienteActual } from '@/hooks/useClienteActual'
import {
  KpiCard,
  StockBadge,
  ComercializableBadge,
  Amount,
  EmptyState,
} from '../components/productos/display'
import { InsumoDialog, AjusteStockDialog } from '../components/productos/dialogs'
import { DuplicadosDialog, detectarDuplicados } from '../components/productos/duplicados-dialog'
import { formatARS } from '../lib/format'
import { unidadAbrev } from '../types'
import type { Insumo, MotivoAjuste } from '../types'

// ─── Input class ──────────────────────────────────────────────────────────────

const inputClass =
  'flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm'

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function Insumos() {
  const { state, dispatch } = useProductosStock()
  const { cliente } = useClienteActual()
  const navigate = useNavigate()
  const { pathname } = useLocation()
  // Fase 16.2: acceso rápido a Movimientos filtrado por este insumo.
  const base = pathname.match(/^(\/m\/[^/]+)/)?.[1] ?? ''

  const [search, setSearch] = useState('')
  const [rubroFilter, setRubroFilter] = useState('')
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editingInsumo, setEditingInsumo] = useState<Insumo | undefined>()
  const [duplicadosOpen, setDuplicadosOpen] = useState(false)
  // Guardado/borrado confirmado (18/08, fase siguiente a Producto/Fórmula):
  // `eliminandoId` deshabilita el botón de borrar de esa fila puntual
  // mientras se espera la confirmación real de Supabase -- evita doble
  // click y, junto con eliminarInsumoConfirmado, evita el "borrado
  // fantasma" (insumo que desaparece de la lista pero sigue en la base
  // porque el DELETE fue rechazado por estar en uso en una fórmula/compra).
  const [eliminandoId, setEliminandoId] = useState<string | null>(null)

  // Fase 45i (Etapa 3 del split de OC): proveedores (catálogo de
  // Compras) para la columna "Proveedor habitual" y el selector de la
  // barra de asignación masiva -- mismo criterio directo-a-Supabase que
  // InsumoDialog/Producción, sin acoplar este módulo al Context de Compras.
  const [proveedores, setProveedores] = useState<{ id: string; nombre: string }[]>([])
  useEffect(() => {
    let activo = true
    supabase
      .from('proveedores')
      .select('id, nombre')
      .order('nombre')
      .then(({ data }) => {
        if (activo) setProveedores(data ?? [])
      })
    return () => {
      activo = false
    }
  }, [])
  const proveedoresMap = useMemo(
    () => new Map(proveedores.map((p) => [p.id, p.nombre])),
    [proveedores],
  )

  // Fase 45i: selección múltiple para asignar "Proveedor habitual" en
  // tanda -- pensada para usar junto con el filtro de Rubro de arriba
  // (filtrás por rubro, seleccionás los visibles, asignás el proveedor
  // de una sola vez) en vez de entrar insumo por insumo. `seleccion`
  // sobrevive a cambios de filtro a propósito -- si filtrás, seleccionás
  // algunos, y después cambiás el filtro para agregar más de otro rubro,
  // no perdés lo ya tildado.
  const [seleccion, setSeleccion] = useState<Set<string>>(new Set())
  const [proveedorMasivo, setProveedorMasivo] = useState('')
  const [asignandoMasivo, setAsignandoMasivo] = useState(false)
  const [errorAsignacionMasiva, setErrorAsignacionMasiva] = useState('')

  function toggleSeleccion(id: string) {
    setSeleccion((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  function toggleSeleccionVisibles() {
    setSeleccion((prev) => {
      const todosVisiblesSeleccionados = filtered.every((i) => prev.has(i.id))
      const next = new Set(prev)
      if (todosVisiblesSeleccionados) {
        for (const i of filtered) next.delete(i.id)
      } else {
        for (const i of filtered) next.add(i.id)
      }
      return next
    })
  }

  async function handleAsignarProveedorMasivo() {
    if (!cliente?.id || seleccion.size === 0) return
    setErrorAsignacionMasiva('')
    setAsignandoMasivo(true)
    const proveedorIdNuevo = proveedorMasivo || undefined
    const insumosSeleccionados = state.insumos.filter((i) => seleccion.has(i.id))
    const resultados = await Promise.all(
      insumosSeleccionados.map((i) =>
        actualizarInsumoConfirmado({ ...i, proveedorId: proveedorIdNuevo }, cliente.id),
      ),
    )
    setAsignandoMasivo(false)
    const fallidos = resultados.filter(
      (r): r is { ok: false; error: string } => !r.ok,
    )
    for (const r of resultados) {
      if (r.ok) dispatch({ type: 'CONFIRM_INSUMO', payload: r.data })
    }
    if (fallidos.length > 0) {
      setErrorAsignacionMasiva(
        `Se asignó a ${resultados.length - fallidos.length} de ${resultados.length} insumos -- ${fallidos.length} fallaron (${fallidos[0].error}).`,
      )
      return
    }
    setSeleccion(new Set())
    setProveedorMasivo('')
  }

  // Fase 34+ (fix): insumos sueltos que comparten nombre con un producto
  // vinculado -- ver duplicados-dialog.tsx. Se calcula acá arriba (no solo
  // dentro del dialog) para poder mostrar el conteo en el botón sin abrirlo.
  const duplicados = useMemo(
    () => detectarDuplicados(state.productos, state.insumos),
    [state.productos, state.insumos],
  )
  const totalDuplicados = duplicados.reduce((sum, g) => sum + g.huerfanos.length, 0)

  async function handleFusionado() {
    const fresh = await fetchProductosStockState()
    dispatch({ type: 'SET_STATE', payload: fresh })
  }

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

  async function handleDelete(id: string) {
    if (!window.confirm('Estas seguro de eliminar este insumo?')) return
    setEliminandoId(id)
    const res = await eliminarInsumoConfirmado(id)
    setEliminandoId(null)
    if (!res.ok) {
      window.alert(res.error)
      return
    }
    dispatch({ type: 'CONFIRM_DELETE_INSUMO', payload: id })
  }

  async function handleSave(
    data: Omit<Insumo, 'id' | 'stock' | 'createdAt' | 'productoVinculadoId'>,
  ): Promise<string | void> {
    if (!cliente?.id) return 'No se pudo identificar la cuenta -- probá recargar la página.'
    if (editingInsumo) {
      const res = await actualizarInsumoConfirmado({ ...editingInsumo, ...data }, cliente.id)
      if (!res.ok) return res.error
      dispatch({ type: 'CONFIRM_INSUMO', payload: res.data })
    } else {
      const res = await crearInsumoConfirmado({ ...data, stock: 0 }, cliente.id)
      if (!res.ok) return res.error
      dispatch({ type: 'CONFIRM_INSUMO', payload: res.data })
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
    // Fase 34+ (fix): si el insumo es un espejo, el Kardex real quedó
    // registrado bajo el producto vinculado (ver store.tsx) -- redirigir
    // ahí para no mostrar un historial vacío.
    if (insumo.productoVinculadoId) {
      navigate(`${base}/movimientos?itemId=${insumo.productoVinculadoId}&itemTipo=producto`)
      return
    }
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

  async function handleAjusteSave(data: {
    cantidad: number
    motivo: MotivoAjuste
    nota: string
  }): Promise<string | void> {
    if (!ajusteItem) return
    if (!cliente?.id) return 'No se pudo identificar la cuenta -- probá recargar la página.'

    if (ajusteMode === 'recibir') {
      const res = await recibirStockConfirmado(
        {
          itemTipo: 'insumo',
          itemId: ajusteItem.id,
          cantidad: Math.abs(data.cantidad),
          nota: data.nota,
        },
        cliente.id,
      )
      if (!res.ok) return res.error
      dispatch({ type: 'CONFIRM_STOCK_SYNC', payload: res.data })
    } else {
      const res = await ajustarStockConfirmado(
        {
          itemTipo: 'insumo',
          itemId: ajusteItem.id,
          cantidad: data.cantidad,
          motivo: data.motivo,
          nota: data.nota,
        },
        cliente.id,
      )
      if (!res.ok) return res.error
      dispatch({ type: 'CONFIRM_STOCK_SYNC', payload: res.data })
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
        {totalDuplicados > 0 && (
          <Button
            variant="outline"
            className="shrink-0 border-amber-300 text-amber-700 hover:bg-amber-50 dark:border-amber-900/50 dark:text-amber-400"
            onClick={() => setDuplicadosOpen(true)}
          >
            <Merge className="h-4 w-4 mr-1" />
            {totalDuplicados} duplicado{totalDuplicados === 1 ? '' : 's'}
          </Button>
        )}
        <Button onClick={handleOpenNew} className="shrink-0">
          <Plus className="h-4 w-4 mr-1" />
          Nuevo insumo
        </Button>
      </div>

      {/* Fase 45i (Etapa 3 del split de OC): barra de asignación masiva
          de Proveedor habitual -- aparece con la selección tildada en la
          tabla de abajo. Pensada para usar junto con el filtro de Rubro
          de arriba: filtrás por rubro, tildás los visibles, asignás. */}
      {seleccion.size > 0 && (
        <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3 rounded-lg border border-primary/30 bg-primary/5 px-4 py-3">
          <Truck className="h-4 w-4 shrink-0 text-muted-foreground" />
          <span className="text-sm font-medium">
            {seleccion.size} insumo{seleccion.size === 1 ? '' : 's'} seleccionado{seleccion.size === 1 ? '' : 's'}
          </span>
          <select
            className={cn(inputClass, 'w-full sm:w-56')}
            value={proveedorMasivo}
            onChange={(e) => setProveedorMasivo(e.target.value)}
          >
            <option value="">Sin proveedor habitual</option>
            {proveedores.map((p) => (
              <option key={p.id} value={p.id}>
                {p.nombre}
              </option>
            ))}
          </select>
          <Button
            size="sm"
            onClick={handleAsignarProveedorMasivo}
            disabled={asignandoMasivo}
            className="shrink-0"
          >
            {asignandoMasivo && <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />}
            Asignar a la selección
          </Button>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => setSeleccion(new Set())}
            disabled={asignandoMasivo}
            className="shrink-0"
          >
            Cancelar selección
          </Button>
          {errorAsignacionMasiva && (
            <span className="text-xs text-red-500 basis-full">{errorAsignacionMasiva}</span>
          )}
        </div>
      )}

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
                <th className="w-8 px-4 py-3">
                  <input
                    type="checkbox"
                    checked={filtered.length > 0 && filtered.every((i) => seleccion.has(i.id))}
                    onChange={toggleSeleccionVisibles}
                    title="Seleccionar todos los visibles"
                  />
                </th>
                <th className="px-4 py-3 font-medium">Nombre</th>
                <th className="px-4 py-3 font-medium">Rubro</th>
                <th className="px-4 py-3 font-medium">Proveedor habitual</th>
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
                  <td className="px-4 py-3">
                    <input
                      type="checkbox"
                      checked={seleccion.has(i.id)}
                      onChange={() => toggleSeleccion(i.id)}
                    />
                  </td>
                  <td className="px-4 py-3 font-medium">
                    {i.nombre}
                    {i.productoVinculadoId && (
                      <span
                        className="ml-2 rounded-full bg-blue-100 px-2 py-0.5 text-[10px] font-normal text-blue-700"
                        title="Vinculado a un producto -- el stock y el costo se sincronizan solos desde Productos"
                      >
                        vinculado a producto
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">
                    {(() => {
                      const rubro = rubrosMap.get(i.rubroId)
                      const subRubro = i.subRubroId ? subRubrosMap.get(i.subRubroId) : undefined
                      if (!rubro) return '-'
                      return subRubro ? `${rubro.nombre} / ${subRubro.nombre}` : rubro.nombre
                    })()}
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">
                    {i.proveedorId ? (proveedoresMap.get(i.proveedorId) ?? '-') : '—'}
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
                        disabled={eliminandoId === i.id}
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
        productos={state.productos}
        onIrAProducto={() => {
          setDialogOpen(false)
          navigate(`${base}/productos`)
        }}
      />

      {ajusteItem && (
        <AjusteStockDialog
          open={ajusteDialogOpen}
          onOpenChange={setAjusteDialogOpen}
          onSave={handleAjusteSave}
          item={ajusteItem}
        />
      )}

      <DuplicadosDialog
        open={duplicadosOpen}
        onOpenChange={setDuplicadosOpen}
        productos={state.productos}
        insumos={state.insumos}
        onFusionado={handleFusionado}
      />
    </div>
  )
}
