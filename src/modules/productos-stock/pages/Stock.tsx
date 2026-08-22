'use client'

import { useState, useMemo } from 'react'
import {
  ClipboardCheck,
  AlertTriangle,
  XCircle,
  DollarSign,
  PackagePlus,
  SlidersHorizontal,
  Search,
} from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from '@/components/ui/dialog'
import { Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { useProductosStock, ajustarStockConfirmado, recibirStockConfirmado } from '../data/store'
import { useClienteActual } from '@/hooks/useClienteActual'
import { KpiCard, StockBadge, Amount, EmptyState } from '../components/productos/display'
import { formatARS } from '../lib/format'
import { unidadAbrev, MOTIVOS_AJUSTE } from '../types'
import type { MotivoAjuste } from '../types'

// ─── Input class (consistente con dialogs) ──────────────────────────────────

const inputClass =
  'flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm'

// ─── Item unificado para la tabla ────────────────────────────────────────────
// Cuando un producto es 'con_variantes', cada variante genera UN StockItem
// propio (id = variante.id, nombre = "Producto — Color / Talle") en vez de
// un único renglón para todo el producto -- así Recibir/Ajustar operan
// sobre la variante puntual, igual que Recepción y Control de Stock.

interface StockItem {
  id: string
  nombre: string
  tipo: 'producto' | 'insumo'
  stock: number
  minimo: number
  costo: number
  unidadAbrev: string
  /** Producto padre + variante puntual, solo cuando aplica. */
  productoId?: string
  varianteId?: string
  /** Para el filtro por Rubro (ambos, Producto e Insumo, tienen rubroId). */
  rubroId?: string
  /** Solo Producto tiene código/código de barras -- Insumo no. Se suman acá
   * para poder buscarlos junto con el nombre (igual que en Productos.tsx). */
  codigo?: string
  codigoBarras?: string
}

// ─── Page ────────────────────────────────────────────────────────────────────

export default function Stock() {
  const { state, dispatch } = useProductosStock()
  const { cliente } = useClienteActual()

  const [soloAlertas, setSoloAlertas] = useState(false)
  const [rubroFilter, setRubroFilter] = useState('')
  const [search, setSearch] = useState('')

  // Modal states
  const [recibirItem, setRecibirItem] = useState<StockItem | null>(null)
  const [ajustarItem, setAjustarItem] = useState<StockItem | null>(null)

  // Recibir form
  const [recibirCantidad, setRecibirCantidad] = useState(0)
  const [recibirCosto, setRecibirCosto] = useState(0)

  // Ajustar form
  const [ajustarCantidad, setAjustarCantidad] = useState(0)
  const [ajustarMotivo, setAjustarMotivo] = useState<MotivoAjuste>('conteo_fisico')
  const [ajustarNota, setAjustarNota] = useState('')

  // Guardado confirmado (rediseño Stock/Producción): ambos diálogos esperan
  // la confirmación real de Supabase antes de cerrar -- si falla, el error
  // se muestra en el propio diálogo y el stock local NO se toca.
  const [guardandoRecibir, setGuardandoRecibir] = useState(false)
  const [errorRecibir, setErrorRecibir] = useState('')
  const [guardandoAjustar, setGuardandoAjustar] = useState(false)
  const [errorAjustar, setErrorAjustar] = useState('')

  // Build unified list
  const items = useMemo<StockItem[]>(() => {
    const fromProductos: StockItem[] = state.productos
      .filter((p) => p.controlaStock)
      .flatMap((p) => {
        if (p.tipo === 'con_variantes') {
          return p.variantes.map((v) => ({
            id: v.id,
            nombre: `${p.nombre} — ${[v.color, v.talle].filter(Boolean).join(' / ') || '(sin nombre)'}`,
            tipo: 'producto' as const,
            stock: v.stock,
            minimo: p.stockMinimo,
            costo: p.costo,
            unidadAbrev: unidadAbrev(p.unidadVenta),
            productoId: p.id,
            varianteId: v.id,
            rubroId: p.rubroId,
            codigo: p.codigo,
            codigoBarras: p.codigoBarras,
          }))
        }
        return [
          {
            id: p.id,
            nombre: p.nombre,
            tipo: 'producto' as const,
            stock: p.stock,
            minimo: p.stockMinimo,
            costo: p.costo,
            unidadAbrev: unidadAbrev(p.unidadVenta),
            rubroId: p.rubroId,
            codigo: p.codigo,
            codigoBarras: p.codigoBarras,
          },
        ]
      })

    // Fase 34+ (fix): los insumos vinculados a un producto (productoVinculadoId)
    // son un espejo -- misma existencia física que su producto, no un ítem
    // aparte. Se excluyen acá para no listarlos ni contarlos dos veces
    // (antes aparecían como fila "Producto" Y fila "Insumo" con el mismo
    // stock, duplicando también el KPI de Valor del inventario). Siguen
    // apareciendo en la pestaña Insumos (con el badge "vinculado a
    // producto") para poder elegirse en Formular Producto.
    const fromInsumos: StockItem[] = state.insumos
      .filter((i) => !i.productoVinculadoId)
      .map((i) => ({
        id: i.id,
        nombre: i.nombre,
        tipo: 'insumo' as const,
        stock: i.stock,
        minimo: i.stockMinimo,
        costo: i.costo,
        unidadAbrev: unidadAbrev(i.unidad),
        rubroId: i.rubroId,
      }))

    return [...fromProductos, ...fromInsumos]
  }, [state.productos, state.insumos])

  // KPIs
  const kpis = useMemo(() => {
    const total = items.length
    const agotados = items.filter((i) => i.stock <= 0).length
    const stockBajo = items.filter((i) => i.stock > 0 && i.stock < i.minimo).length
    const valorInventario = items.reduce((sum, i) => sum + i.stock * i.costo, 0)
    return { total, agotados, stockBajo, valorInventario }
  }, [items])

  // Rubros que efectivamente tienen algun item en Stock, para no listar en el
  // filtro rubros vacios (ej. rubros usados solo en Servicios).
  const rubrosMap = useMemo(() => new Map(state.rubros.map((r) => [r.id, r.nombre])), [state.rubros])
  const rubrosDisponibles = useMemo(() => {
    const idsUsados = new Set(items.map((i) => i.rubroId).filter(Boolean))
    return state.rubros
      .filter((r) => idsUsados.has(r.id))
      .sort((a, b) => a.nombre.localeCompare(b.nombre))
  }, [items, state.rubros])

  // Filtered list
  const filteredItems = useMemo(() => {
    const q = search.trim().toLowerCase()
    return items.filter((i) => {
      if (soloAlertas && !(i.stock <= 0 || i.stock < i.minimo)) return false
      if (rubroFilter && i.rubroId !== rubroFilter) return false
      if (
        q &&
        !(
          i.nombre.toLowerCase().includes(q) ||
          (i.codigo ?? '').toLowerCase().includes(q) ||
          (i.codigoBarras ?? '').toLowerCase().includes(q)
        )
      )
        return false
      return true
    })
  }, [items, soloAlertas, rubroFilter, search])

  // Handlers
  async function handleRecibir() {
    if (!recibirItem || recibirCantidad <= 0 || guardandoRecibir) return
    if (!cliente?.id) {
      setErrorRecibir('No se pudo identificar la cuenta -- probá recargar la página.')
      return
    }
    setErrorRecibir('')
    setGuardandoRecibir(true)
    const res = await recibirStockConfirmado(
      {
        itemTipo: recibirItem.tipo,
        itemId: recibirItem.varianteId ? recibirItem.productoId! : recibirItem.id,
        varianteId: recibirItem.varianteId,
        cantidad: recibirCantidad,
        costoUnitario: recibirCosto > 0 ? recibirCosto : undefined,
      },
      cliente.id,
    )
    setGuardandoRecibir(false)
    if (!res.ok) {
      setErrorRecibir(res.error)
      return
    }
    dispatch({ type: 'CONFIRM_STOCK_SYNC', payload: res.data })
    setRecibirItem(null)
  }

  async function handleAjustar() {
    if (!ajustarItem || ajustarCantidad === 0 || guardandoAjustar) return
    if (!cliente?.id) {
      setErrorAjustar('No se pudo identificar la cuenta -- probá recargar la página.')
      return
    }
    setErrorAjustar('')
    setGuardandoAjustar(true)
    const res = await ajustarStockConfirmado(
      {
        itemTipo: ajustarItem.tipo,
        itemId: ajustarItem.varianteId ? ajustarItem.productoId! : ajustarItem.id,
        varianteId: ajustarItem.varianteId,
        cantidad: ajustarCantidad,
        motivo: ajustarMotivo,
        nota: ajustarNota || undefined,
      },
      cliente.id,
    )
    setGuardandoAjustar(false)
    if (!res.ok) {
      setErrorAjustar(res.error)
      return
    }
    dispatch({ type: 'CONFIRM_STOCK_SYNC', payload: res.data })
    setAjustarItem(null)
  }

  function openRecibir(item: StockItem) {
    setRecibirCantidad(0)
    setRecibirCosto(0)
    setErrorRecibir('')
    setRecibirItem(item)
  }

  function openAjustar(item: StockItem) {
    setAjustarCantidad(0)
    setAjustarMotivo('conteo_fisico')
    setAjustarNota('')
    setErrorAjustar('')
    setAjustarItem(item)
  }

  return (
    <div className="space-y-6">
      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiCard
          title="Items con control"
          value={String(kpis.total)}
          accent="primary"
          icon={ClipboardCheck}
        />
        <KpiCard
          title="Agotados"
          value={String(kpis.agotados)}
          accent="expense"
          icon={XCircle}
        />
        <KpiCard
          title="Stock bajo"
          value={String(kpis.stockBajo)}
          accent="warning"
          icon={AlertTriangle}
        />
        <KpiCard
          title="Valor del inventario"
          value={formatARS(kpis.valorInventario)}
          accent="income"
          icon={DollarSign}
        />
      </div>

      {/* Filter toggle */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative flex-1 w-full sm:max-w-xs">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <input
            className={cn(inputClass, 'pl-9')}
            placeholder="Buscar por nombre, codigo o cód. de barras..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <label className="flex items-center gap-2 text-sm cursor-pointer select-none">
          <input
            type="checkbox"
            checked={soloAlertas}
            onChange={(e) => setSoloAlertas(e.target.checked)}
            className="rounded border-input"
          />
          Solo alertas
        </label>
        <select
          className={cn(inputClass, 'w-auto')}
          value={rubroFilter}
          onChange={(e) => setRubroFilter(e.target.value)}
        >
          <option value="">Todos los rubros</option>
          {rubrosDisponibles.map((r) => (
            <option key={r.id} value={r.id}>
              {r.nombre}
            </option>
          ))}
        </select>
        <span className="text-xs text-muted-foreground">
          {filteredItems.length} items
        </span>
      </div>

      {/* Table */}
      {filteredItems.length === 0 ? (
        <EmptyState
          icon={ClipboardCheck}
          title="Sin items"
          description={
            soloAlertas
              ? 'No hay items con alertas de stock.'
              : 'No hay productos con control de stock ni insumos registrados.'
          }
        />
      ) : (
        <div className="rounded-lg border bg-card shadow-sm overflow-x-auto scroll-shadow-x">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-left text-muted-foreground">
                <th className="px-4 py-3 font-medium">Item</th>
                <th className="px-4 py-3 font-medium">Tipo</th>
                <th className="px-4 py-3 font-medium">Rubro</th>
                <th className="px-4 py-3 font-medium text-right">Stock</th>
                <th className="px-4 py-3 font-medium text-right">Minimo</th>
                <th className="px-4 py-3 font-medium text-right">Costo</th>
                <th className="px-4 py-3 font-medium text-right">Valor</th>
                <th className="px-4 py-3 font-medium text-right">Acciones</th>
              </tr>
            </thead>
            <tbody>
              {filteredItems.map((item) => (
                <tr key={`${item.tipo}-${item.id}`} className="border-b last:border-0">
                  <td className="px-4 py-3 font-medium">{item.nombre}</td>
                  <td className="px-4 py-3">
                    <span
                      className={cn(
                        'inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium',
                        item.tipo === 'producto'
                          ? 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400'
                          : 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400',
                      )}
                    >
                      {item.tipo === 'producto' ? 'Producto' : 'Insumo'}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">
                    {item.rubroId ? (rubrosMap.get(item.rubroId) ?? '—') : '—'}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <span className="tabular-nums mr-1">
                      {item.stock} {item.unidadAbrev}
                    </span>
                    <StockBadge stock={item.stock} minimo={item.minimo} />
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums">
                    {item.minimo} {item.unidadAbrev}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <Amount value={item.costo} />
                  </td>
                  <td className="px-4 py-3 text-right">
                    <Amount value={item.stock * item.costo} />
                  </td>
                  <td className="px-4 py-3 text-right">
                    <div className="flex items-center justify-end gap-1">
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-7 text-xs"
                        onClick={() => openRecibir(item)}
                      >
                        <PackagePlus className="h-3.5 w-3.5 mr-1" />
                        Recibir
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-7 text-xs"
                        onClick={() => openAjustar(item)}
                      >
                        <SlidersHorizontal className="h-3.5 w-3.5 mr-1" />
                        Ajustar
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* ── Dialog: Recibir stock ───────────────────────────────────────────── */}
      <Dialog open={!!recibirItem} onOpenChange={(open) => !open && !guardandoRecibir && setRecibirItem(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Recibir stock</DialogTitle>
            <DialogDescription>
              Ingreso de stock para: {recibirItem?.nombre}
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-4 py-4">
            <div className="rounded-md bg-muted px-4 py-3">
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Stock actual</span>
                <span className="font-medium">
                  {recibirItem?.stock} {recibirItem?.unidadAbrev}
                </span>
              </div>
            </div>

            <div className="grid gap-1.5">
              <label className="text-sm font-medium">Cantidad a recibir</label>
              <input
                className={inputClass}
                type="number"
                min={0}
                step={0.01}
                value={recibirCantidad || ''}
                onChange={(e) => setRecibirCantidad(parseFloat(e.target.value) || 0)}
                placeholder="Ej: 50"
              />
            </div>

            <div className="grid gap-1.5">
              <label className="text-sm font-medium">Costo unitario (opcional)</label>
              <input
                className={inputClass}
                type="number"
                min={0}
                step={0.01}
                value={recibirCosto || ''}
                onChange={(e) => setRecibirCosto(parseFloat(e.target.value) || 0)}
                placeholder="Deja vacio para mantener el actual"
              />
            </div>

            {recibirCantidad > 0 && (
              <div className="rounded-md bg-muted px-4 py-3">
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Stock proyectado</span>
                  <span className="font-medium">
                    {(recibirItem?.stock ?? 0) + recibirCantidad} {recibirItem?.unidadAbrev}
                  </span>
                </div>
              </div>
            )}

            {errorRecibir && (
              <div className="rounded-md bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-900 px-3 py-2 text-sm text-red-700 dark:text-red-400">
                {errorRecibir}
              </div>
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setRecibirItem(null)} disabled={guardandoRecibir}>
              Cancelar
            </Button>
            <Button onClick={handleRecibir} disabled={recibirCantidad <= 0 || guardandoRecibir}>
              {guardandoRecibir && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Confirmar recepcion
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Dialog: Ajustar stock ──────────────────────────────────────────── */}
      <Dialog open={!!ajustarItem} onOpenChange={(open) => !open && !guardandoAjustar && setAjustarItem(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Ajustar stock</DialogTitle>
            <DialogDescription>
              Ajuste manual para: {ajustarItem?.nombre}
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-4 py-4">
            <div className="rounded-md bg-muted px-4 py-3">
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Stock actual</span>
                <span className="font-medium">
                  {ajustarItem?.stock} {ajustarItem?.unidadAbrev}
                </span>
              </div>
            </div>

            <div className="grid gap-1.5">
              <label className="text-sm font-medium">
                Cantidad (positivo = ingreso, negativo = egreso)
              </label>
              <input
                className={inputClass}
                type="number"
                step={0.01}
                value={ajustarCantidad || ''}
                onChange={(e) => setAjustarCantidad(parseFloat(e.target.value) || 0)}
                placeholder="Ej: 10 o -5"
              />
            </div>

            <div className="rounded-md bg-muted px-4 py-3">
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Stock proyectado</span>
                <span
                  className={cn(
                    'font-medium',
                    (ajustarItem?.stock ?? 0) + ajustarCantidad < 0
                      ? 'text-red-500'
                      : 'text-foreground',
                  )}
                >
                  {(ajustarItem?.stock ?? 0) + ajustarCantidad} {ajustarItem?.unidadAbrev}
                </span>
              </div>
            </div>

            <div className="grid gap-1.5">
              <label className="text-sm font-medium">Motivo</label>
              <select
                className={inputClass}
                value={ajustarMotivo}
                onChange={(e) => setAjustarMotivo(e.target.value as MotivoAjuste)}
              >
                {MOTIVOS_AJUSTE.map((m) => (
                  <option key={m.value} value={m.value}>
                    {m.label}
                  </option>
                ))}
              </select>
            </div>

            <div className="grid gap-1.5">
              <label className="text-sm font-medium">Nota (opcional)</label>
              <input
                className={inputClass}
                value={ajustarNota}
                onChange={(e) => setAjustarNota(e.target.value)}
                placeholder="Detalle adicional"
              />
            </div>

            {errorAjustar && (
              <div className="rounded-md bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-900 px-3 py-2 text-sm text-red-700 dark:text-red-400">
                {errorAjustar}
              </div>
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setAjustarItem(null)} disabled={guardandoAjustar}>
              Cancelar
            </Button>
            <Button onClick={handleAjustar} disabled={ajustarCantidad === 0 || guardandoAjustar}>
              {guardandoAjustar && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Aplicar ajuste
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
