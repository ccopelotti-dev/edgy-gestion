'use client'

import { useState, useMemo } from 'react'
import {
  ClipboardCheck,
  AlertTriangle,
  XCircle,
  DollarSign,
  PackagePlus,
  SlidersHorizontal,
} from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { useProductosStock } from '../data/store'
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
}

// ─── Page ────────────────────────────────────────────────────────────────────

export default function Stock() {
  const { state, dispatch } = useProductosStock()

  const [soloAlertas, setSoloAlertas] = useState(false)

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
          },
        ]
      })

    const fromInsumos: StockItem[] = state.insumos.map((i) => ({
      id: i.id,
      nombre: i.nombre,
      tipo: 'insumo' as const,
      stock: i.stock,
      minimo: i.stockMinimo,
      costo: i.costo,
      unidadAbrev: unidadAbrev(i.unidad),
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

  // Filtered list
  const filteredItems = useMemo(() => {
    if (!soloAlertas) return items
    return items.filter((i) => i.stock <= 0 || i.stock < i.minimo)
  }, [items, soloAlertas])

  // Handlers
  function handleRecibir() {
    if (!recibirItem || recibirCantidad <= 0) return
    dispatch({
      type: 'RECIBIR_STOCK',
      payload: {
        itemTipo: recibirItem.tipo,
        itemId: recibirItem.varianteId ? recibirItem.productoId! : recibirItem.id,
        varianteId: recibirItem.varianteId,
        cantidad: recibirCantidad,
        costoUnitario: recibirCosto > 0 ? recibirCosto : undefined,
      },
    })
    setRecibirItem(null)
  }

  function handleAjustar() {
    if (!ajustarItem || ajustarCantidad === 0) return
    dispatch({
      type: 'AJUSTAR_STOCK',
      payload: {
        itemTipo: ajustarItem.tipo,
        itemId: ajustarItem.varianteId ? ajustarItem.productoId! : ajustarItem.id,
        varianteId: ajustarItem.varianteId,
        cantidad: ajustarCantidad,
        motivo: ajustarMotivo,
        nota: ajustarNota || undefined,
      },
    })
    setAjustarItem(null)
  }

  function openRecibir(item: StockItem) {
    setRecibirCantidad(0)
    setRecibirCosto(0)
    setRecibirItem(item)
  }

  function openAjustar(item: StockItem) {
    setAjustarCantidad(0)
    setAjustarMotivo('conteo_fisico')
    setAjustarNota('')
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
      <div className="flex items-center gap-3">
        <label className="flex items-center gap-2 text-sm cursor-pointer select-none">
          <input
            type="checkbox"
            checked={soloAlertas}
            onChange={(e) => setSoloAlertas(e.target.checked)}
            className="rounded border-input"
          />
          Solo alertas
        </label>
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
        <div className="rounded-lg border bg-card shadow-sm overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-left text-muted-foreground">
                <th className="px-4 py-3 font-medium">Item</th>
                <th className="px-4 py-3 font-medium">Tipo</th>
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
      <Dialog open={!!recibirItem} onOpenChange={(open) => !open && setRecibirItem(null)}>
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
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setRecibirItem(null)}>
              Cancelar
            </Button>
            <Button onClick={handleRecibir} disabled={recibirCantidad <= 0}>
              Confirmar recepcion
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Dialog: Ajustar stock ──────────────────────────────────────────── */}
      <Dialog open={!!ajustarItem} onOpenChange={(open) => !open && setAjustarItem(null)}>
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
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setAjustarItem(null)}>
              Cancelar
            </Button>
            <Button onClick={handleAjustar} disabled={ajustarCantidad === 0}>
              Aplicar ajuste
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
