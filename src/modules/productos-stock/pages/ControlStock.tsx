'use client'

import { useState, useMemo } from 'react'
import {
  ShieldCheck,
  Plus,
  ClipboardList,
  AlertCircle,
  CheckCircle2,
  Clock,
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
import { KpiCard, EmptyState } from '../components/productos/display'
import { formatDate, todayISO } from '../lib/format'
import { unidadAbrev } from '../types'

// ─── Input class ─────────────────────────────────────────────────────────────

const inputClass =
  'flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm'

// ─── Helpers ─────────────────────────────────────────────────────────────────

function daysBetween(dateA: string, dateB: string): number {
  const a = new Date(dateA + 'T00:00:00')
  const b = new Date(dateB + 'T00:00:00')
  return Math.floor((b.getTime() - a.getTime()) / (1000 * 60 * 60 * 24))
}

// ─── Control status types ────────────────────────────────────────────────────

type ControlStatus = 'sin_control' | 'al_dia' | 'vencido'

interface ControlItem {
  id: string
  nombre: string
  tipo: 'producto' | 'insumo'
  stock: number
  unidadAbrev: string
  rubroId: string
  ultimoControl: string | null
  estado: ControlStatus
}

// ─── Page ────────────────────────────────────────────────────────────────────

export default function ControlStock() {
  const { state, dispatch } = useProductosStock()

  // Dialog states - Regla
  const [reglaDialogOpen, setReglaDialogOpen] = useState(false)
  const [reglaNombre, setReglaNombre] = useState('')
  const [reglaRubroId, setReglaRubroId] = useState('')
  const [reglaFrecuencia, setReglaFrecuencia] = useState(30)

  // Dialog states - Registro control
  const [controlItem, setControlItem] = useState<ControlItem | null>(null)
  const [stockContado, setStockContado] = useState(0)

  const today = todayISO()

  // Build control items list
  const controlItems = useMemo<ControlItem[]>(() => {
    const items: ControlItem[] = []

    // Productos with controlaStock
    for (const p of state.productos) {
      if (!p.controlaStock) continue

      // Find applicable rule
      const rule = state.reglasControl.find(
        (r) => !r.rubroId || r.rubroId === p.rubroId,
      )

      // Find last control registro
      const lastRegistro = state.registrosControl
        .filter((rc) => rc.itemTipo === 'producto' && rc.itemId === p.id)
        .sort((a, b) => b.fecha.localeCompare(a.fecha))[0]

      let estado: ControlStatus = 'sin_control'
      if (rule) {
        if (!lastRegistro) {
          estado = 'vencido'
        } else {
          const dias = daysBetween(lastRegistro.fecha, today)
          estado = dias >= rule.frecuenciaDias ? 'vencido' : 'al_dia'
        }
      }

      items.push({
        id: p.id,
        nombre: p.nombre,
        tipo: 'producto',
        stock: p.stock,
        unidadAbrev: unidadAbrev(p.unidadVenta),
        rubroId: p.rubroId,
        ultimoControl: lastRegistro?.fecha ?? null,
        estado,
      })
    }

    // All insumos
    for (const i of state.insumos) {
      const rule = state.reglasControl.find(
        (r) => !r.rubroId || r.rubroId === i.rubroId,
      )

      const lastRegistro = state.registrosControl
        .filter((rc) => rc.itemTipo === 'insumo' && rc.itemId === i.id)
        .sort((a, b) => b.fecha.localeCompare(a.fecha))[0]

      let estado: ControlStatus = 'sin_control'
      if (rule) {
        if (!lastRegistro) {
          estado = 'vencido'
        } else {
          const dias = daysBetween(lastRegistro.fecha, today)
          estado = dias >= rule.frecuenciaDias ? 'vencido' : 'al_dia'
        }
      }

      items.push({
        id: i.id,
        nombre: i.nombre,
        tipo: 'insumo',
        stock: i.stock,
        unidadAbrev: unidadAbrev(i.unidad),
        rubroId: i.rubroId,
        ultimoControl: lastRegistro?.fecha ?? null,
        estado,
      })
    }

    return items
  }, [state.productos, state.insumos, state.reglasControl, state.registrosControl, today])

  // Rubros map for display
  const rubrosMap = useMemo(
    () => new Map(state.rubros.map((r) => [r.id, r.nombre])),
    [state.rubros],
  )

  // Handlers
  function handleAddRegla() {
    if (!reglaNombre.trim() || reglaFrecuencia <= 0) return
    dispatch({
      type: 'ADD_REGLA_CONTROL',
      payload: {
        nombre: reglaNombre.trim(),
        rubroId: reglaRubroId || undefined,
        frecuenciaDias: reglaFrecuencia,
      },
    })
    setReglaDialogOpen(false)
    setReglaNombre('')
    setReglaRubroId('')
    setReglaFrecuencia(30)
  }

  function openRegistroControl(item: ControlItem) {
    setStockContado(item.stock)
    setControlItem(item)
  }

  function handleRegistroControl() {
    if (!controlItem) return

    // Find applicable rule
    const rule = state.reglasControl.find(
      (r) => !r.rubroId || r.rubroId === controlItem.rubroId,
    )
    if (!rule) return

    const diferencia = stockContado - controlItem.stock

    dispatch({
      type: 'ADD_REGISTRO_CONTROL',
      payload: {
        reglaId: rule.id,
        itemTipo: controlItem.tipo,
        itemId: controlItem.id,
        stockSistema: controlItem.stock,
        stockContado,
        diferencia,
        fecha: today,
      },
    })
    setControlItem(null)
  }

  // Status badge
  const statusConfig: Record<ControlStatus, { label: string; classes: string }> = {
    sin_control: {
      label: 'Sin control',
      classes: 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400',
    },
    al_dia: {
      label: 'Al dia',
      classes: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400',
    },
    vencido: {
      label: 'Vencido',
      classes: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400',
    },
  }

  return (
    <div className="space-y-8">
      {/* ═══ Section 1: Reglas de control ════════════════════════════════════ */}
      <section className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold">Reglas de control</h2>
          <Button
            size="sm"
            onClick={() => setReglaDialogOpen(true)}
          >
            <Plus className="h-4 w-4 mr-1" />
            Nueva regla
          </Button>
        </div>

        {state.reglasControl.length === 0 ? (
          <EmptyState
            icon={ShieldCheck}
            title="Sin reglas de control"
            description="Crea reglas para definir la frecuencia de conteo fisico de tus productos e insumos."
          >
            <Button
              variant="outline"
              size="sm"
              onClick={() => setReglaDialogOpen(true)}
            >
              Crear primera regla
            </Button>
          </EmptyState>
        ) : (
          <div className="rounded-lg border bg-card shadow-sm overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left text-muted-foreground">
                  <th className="px-4 py-3 font-medium">Nombre</th>
                  <th className="px-4 py-3 font-medium">Rubro</th>
                  <th className="px-4 py-3 font-medium text-right">Frecuencia</th>
                </tr>
              </thead>
              <tbody>
                {state.reglasControl.map((r) => (
                  <tr key={r.id} className="border-b last:border-0">
                    <td className="px-4 py-3 font-medium">{r.nombre}</td>
                    <td className="px-4 py-3 text-muted-foreground">
                      {r.rubroId
                        ? rubrosMap.get(r.rubroId) ?? 'Rubro eliminado'
                        : 'Todos'}
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums">
                      Cada {r.frecuenciaDias} dias
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* ═══ Section 2: Estado del control ══════════════════════════════════ */}
      <section className="space-y-4">
        <h2 className="text-lg font-semibold">Estado del control</h2>

        {controlItems.length === 0 ? (
          <EmptyState
            icon={ClipboardList}
            title="Sin items controlables"
            description="No hay productos con control de stock ni insumos registrados."
          />
        ) : (
          <div className="rounded-lg border bg-card shadow-sm overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left text-muted-foreground">
                  <th className="px-4 py-3 font-medium">Item</th>
                  <th className="px-4 py-3 font-medium">Tipo</th>
                  <th className="px-4 py-3 font-medium text-right">Stock actual</th>
                  <th className="px-4 py-3 font-medium">Ultimo control</th>
                  <th className="px-4 py-3 font-medium">Estado</th>
                  <th className="px-4 py-3 font-medium text-right">Accion</th>
                </tr>
              </thead>
              <tbody>
                {controlItems.map((item) => {
                  const cfg = statusConfig[item.estado]
                  return (
                    <tr
                      key={`${item.tipo}-${item.id}`}
                      className="border-b last:border-0"
                    >
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
                      <td className="px-4 py-3 text-right tabular-nums">
                        {item.stock} {item.unidadAbrev}
                      </td>
                      <td className="px-4 py-3 text-muted-foreground">
                        {item.ultimoControl ? formatDate(item.ultimoControl) : 'Nunca'}
                      </td>
                      <td className="px-4 py-3">
                        <span
                          className={cn(
                            'inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium',
                            cfg.classes,
                          )}
                        >
                          {cfg.label}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right">
                        {item.estado !== 'sin_control' && (
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-7 text-xs"
                            onClick={() => openRegistroControl(item)}
                          >
                            <ClipboardList className="h-3.5 w-3.5 mr-1" />
                            Registrar control
                          </Button>
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* ── Dialog: Nueva regla ────────────────────────────────────────────── */}
      <Dialog open={reglaDialogOpen} onOpenChange={setReglaDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Nueva regla de control</DialogTitle>
            <DialogDescription>
              Define la frecuencia de conteo fisico para un rubro o para todos.
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-4 py-4">
            <div className="grid gap-1.5">
              <label className="text-sm font-medium">Nombre *</label>
              <input
                className={inputClass}
                value={reglaNombre}
                onChange={(e) => setReglaNombre(e.target.value)}
                placeholder="Ej: Conteo semanal de bebidas"
              />
            </div>

            <div className="grid gap-1.5">
              <label className="text-sm font-medium">Rubro (opcional)</label>
              <select
                className={inputClass}
                value={reglaRubroId}
                onChange={(e) => setReglaRubroId(e.target.value)}
              >
                <option value="">Todos los rubros</option>
                {state.rubros.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.nombre}
                  </option>
                ))}
              </select>
              <p className="text-xs text-muted-foreground">
                Si no seleccionas rubro, la regla aplica a todos los items.
              </p>
            </div>

            <div className="grid gap-1.5">
              <label className="text-sm font-medium">Frecuencia (dias)</label>
              <input
                className={inputClass}
                type="number"
                min={1}
                value={reglaFrecuencia || ''}
                onChange={(e) => setReglaFrecuencia(parseInt(e.target.value) || 0)}
                placeholder="Ej: 7 para semanal"
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setReglaDialogOpen(false)}>
              Cancelar
            </Button>
            <Button
              onClick={handleAddRegla}
              disabled={!reglaNombre.trim() || reglaFrecuencia <= 0}
            >
              Crear regla
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Dialog: Registrar control ──────────────────────────────────────── */}
      <Dialog
        open={!!controlItem}
        onOpenChange={(open) => !open && setControlItem(null)}
      >
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Registrar control</DialogTitle>
            <DialogDescription>
              Conteo fisico de: {controlItem?.nombre}
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-4 py-4">
            <div className="rounded-md bg-muted px-4 py-3">
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Stock en sistema</span>
                <span className="font-medium">
                  {controlItem?.stock} {controlItem?.unidadAbrev}
                </span>
              </div>
            </div>

            <div className="grid gap-1.5">
              <label className="text-sm font-medium">Stock contado</label>
              <input
                className={inputClass}
                type="number"
                min={0}
                step={0.01}
                value={stockContado || ''}
                onChange={(e) => setStockContado(parseFloat(e.target.value) || 0)}
                placeholder="Cantidad contada fisicamente"
              />
            </div>

            {controlItem && (
              <div className="rounded-md bg-muted px-4 py-3 space-y-1">
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Diferencia</span>
                  <span
                    className={cn(
                      'font-medium',
                      stockContado - controlItem.stock < 0
                        ? 'text-red-500'
                        : stockContado - controlItem.stock > 0
                          ? 'text-green-500'
                          : 'text-foreground',
                    )}
                  >
                    {stockContado - controlItem.stock > 0 ? '+' : ''}
                    {stockContado - controlItem.stock} {controlItem.unidadAbrev}
                  </span>
                </div>
              </div>
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setControlItem(null)}>
              Cancelar
            </Button>
            <Button onClick={handleRegistroControl}>
              Registrar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
