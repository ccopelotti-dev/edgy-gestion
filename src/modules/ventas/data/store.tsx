'use client'

import { useState, useMemo, useCallback } from 'react'
import {
  Plus,
  Trash2,
  FlaskConical,
  Save,
  PackageOpen,
  Wrench,
  Cog,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { useProductosStock } from '../data/store'
import { Amount, EmptyState } from '../components/productos/display'
import { formatARS } from '../lib/format'
import {
  UNIDADES,
  unidadAbrev,
  unidadLabel,
  type UnidadMedida,
  type TipoLineaFormula,
  type LineaFormula,
  type Formula,
} from '../types'

// ─── Helpers ──────────────────────────────────────────────────────────────────

const inputClass =
  'flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm'

// Este id se usa tanto de key de React como, al guardar, de id real de la
// fila en la tabla `formula_lineas` de Supabase (columna tipo uuid). El
// formato anterior (`line-<timestamp>-<seq>-<random>`) no era un UUID
// válido: el INSERT fallaba en silencio (error 22P02) y la fórmula se
// guardaba sin ninguna de sus líneas. crypto.randomUUID() es válido para
// ambos usos.
function lineUid(): string {
  return crypto.randomUUID()
}

// ─── Local state types ────────────────────────────────────────────────────────

interface LocalLinea {
  id: string
  tipo: TipoLineaFormula
  insumoId: string
  descripcion: string
  cantidad: number
  unidad: UnidadMedida
  costoUnitario: number
}

interface FormulaLocal {
  cantidadProducida: number
  unidadProducida: UnidadMedida
  lineas: LocalLinea[]
  notas: string
}

function emptyFormula(): FormulaLocal {
  return {
    cantidadProducida: 1,
    unidadProducida: 'unidad',
    lineas: [],
    notas: '',
  }
}

function formulaToLocal(f: Formula): FormulaLocal {
  return {
    cantidadProducida: f.cantidadProducida,
    unidadProducida: f.unidadProducida,
    lineas: f.lineas.map((l) => ({
      id: l.id,
      tipo: l.tipo,
      insumoId: l.insumoId ?? '',
      descripcion: l.descripcion,
      cantidad: l.cantidad,
      unidad: l.unidad,
      costoUnitario: l.costoUnitario,
    })),
    notas: f.notas,
  }
}

// ─── Section table component ──────────────────────────────────────────────────

interface SectionProps {
  title: string
  icon: React.ElementType
  tipo: TipoLineaFormula
  lineas: LocalLinea[]
  insumosOptions?: { id: string; nombre: string; costo: number; unidad: UnidadMedida }[]
  onAddLine: (tipo: TipoLineaFormula) => void
  onUpdateLine: (id: string, updates: Partial<LocalLinea>) => void
  onDeleteLine: (id: string) => void
  subtotal: number
}

function FormulaSection({
  title,
  icon: Icon,
  tipo,
  lineas,
  insumosOptions,
  onAddLine,
  onUpdateLine,
  onDeleteLine,
  subtotal,
}: SectionProps) {
  const isInsumo = tipo === 'insumo'

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Icon className="h-4 w-4 text-muted-foreground" />
          <h4 className="text-sm font-semibold">{title}</h4>
        </div>
        <Button variant="outline" size="sm" onClick={() => onAddLine(tipo)}>
          <Plus className="h-4 w-4 mr-1" />
          Agregar
        </Button>
      </div>

      {lineas.length === 0 ? (
        <p className="text-sm text-muted-foreground text-center py-4 border border-dashed rounded-md">
          Sin lineas. Agrega al menos una.
        </p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-left text-muted-foreground">
                <th className="px-3 py-2 font-medium">
                  {isInsumo ? 'Insumo' : 'Descripcion'}
                </th>
                <th className="px-3 py-2 font-medium text-right w-24">Cantidad</th>
                <th className="px-3 py-2 font-medium w-28">Unidad</th>
                <th className="px-3 py-2 font-medium text-right w-32">Costo unit.</th>
                <th className="px-3 py-2 font-medium text-right w-32">Subtotal</th>
                <th className="px-3 py-2 w-10" />
              </tr>
            </thead>
            <tbody>
              {lineas.map((l) => (
                <tr key={l.id} className="border-b last:border-0">
                  <td className="px-3 py-2">
                    {isInsumo ? (
                      <select
                        className={cn(inputClass, 'text-xs')}
                        value={l.insumoId}
                        onChange={(e) => {
                          const insumo = insumosOptions?.find(
                            (x) => x.id === e.target.value,
                          )
                          onUpdateLine(l.id, {
                            insumoId: e.target.value,
                            costoUnitario: insumo?.costo ?? l.costoUnitario,
                            unidad: insumo?.unidad ?? l.unidad,
                            descripcion: insumo?.nombre ?? '',
                          })
                        }}
                      >
                        <option value="">Seleccionar insumo...</option>
                        {insumosOptions?.map((ins) => (
                          <option key={ins.id} value={ins.id}>
                            {ins.nombre}
                          </option>
                        ))}
                      </select>
                    ) : (
                      <input
                        className={cn(inputClass, 'text-xs')}
                        value={l.descripcion}
                        onChange={(e) =>
                          onUpdateLine(l.id, { descripcion: e.target.value })
                        }
                        placeholder={
                          tipo === 'mano_de_obra'
                            ? 'Ej: Operario armado'
                            : 'Ej: Electricidad'
                        }
                      />
                    )}
                  </td>
                  <td className="px-3 py-2">
                    <input
                      className={cn(inputClass, 'text-xs text-right')}
                      type="number"
                      min={0}
                      step={0.01}
                      value={l.cantidad || ''}
                      onChange={(e) =>
                        onUpdateLine(l.id, {
                          cantidad: parseFloat(e.target.value) || 0,
                        })
                      }
                    />
                  </td>
                  <td className="px-3 py-2">
                    <select
                      className={cn(inputClass, 'text-xs')}
                      value={l.unidad}
                      onChange={(e) =>
                        onUpdateLine(l.id, {
                          unidad: e.target.value as UnidadMedida,
                        })
                      }
                    >
                      {UNIDADES.map((u) => (
                        <option key={u.value} value={u.value}>
                          {u.label}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td className="px-3 py-2">
                    <input
                      className={cn(inputClass, 'text-xs text-right')}
                      type="number"
                      min={0}
                      step={0.01}
                      value={l.costoUnitario || ''}
                      onChange={(e) =>
                        onUpdateLine(l.id, {
                          costoUnitario: parseFloat(e.target.value) || 0,
                        })
                      }
                    />
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums font-medium">
                    {formatARS(l.cantidad * l.costoUnitario)}
                  </td>
                  <td className="px-3 py-2">
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7 text-muted-foreground hover:text-red-500"
                      onClick={() => onDeleteLine(l.id)}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Section subtotal */}
      <div className="flex justify-end pr-12">
        <span className="text-xs text-muted-foreground mr-2">Subtotal:</span>
        <span className="text-sm font-semibold tabular-nums">{formatARS(subtotal)}</span>
      </div>
    </div>
  )
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function FormularProducto() {
  const { state, dispatch } = useProductosStock()

  const [selectedProductoId, setSelectedProductoId] = useState('')
  const [formula, setFormula] = useState<FormulaLocal | null>(null)
  const [dirty, setDirty] = useState(false)

  // Find existing formula for selected product
  const existingFormula = useMemo(
    () => state.formulas.find((f) => f.productoId === selectedProductoId) ?? null,
    [state.formulas, selectedProductoId],
  )

  const selectedProducto = useMemo(
    () => state.productos.find((p) => p.id === selectedProductoId) ?? null,
    [state.productos, selectedProductoId],
  )

  // Insumos options for dropdown
  const insumosOptions = useMemo(
    () =>
      state.insumos.map((i) => ({
        id: i.id,
        nombre: i.nombre,
        costo: i.costo,
        unidad: i.unidad,
      })),
    [state.insumos],
  )

  // When product changes, load existing formula or reset
  function handleProductoChange(prodId: string) {
    setSelectedProductoId(prodId)
    const existing = state.formulas.find((f) => f.productoId === prodId)
    if (existing) {
      setFormula(formulaToLocal(existing))
    } else {
      setFormula(null)
    }
    setDirty(false)
  }

  function handleCrearFormula() {
    setFormula(emptyFormula())
    setDirty(true)
  }

  // Line operations
  //
  // IMPORTANTE: estas tres funciones usan la forma funcional de setFormula
  // (setFormula(prev => ...)) en vez de leer `formula` directamente del
  // closure. Con clicks rápidos y consecutivos en "Agregar" (o ediciones
  // rápidas), React puede procesar varias llamadas a setFormula antes de
  // volver a renderizar; si cada llamada arma el nuevo estado a partir de la
  // variable `formula` capturada en el render viejo, cada actualización pisa
  // a la anterior en vez de acumularse — el resultado son líneas duplicadas,
  // líneas fantasma sin insumo, o clicks que no agregan nada. Usando `prev`
  // cada actualización parte siempre del estado más reciente, sin importar
  // cuántos clicks lleguen seguidos.
  function addLine(tipo: TipoLineaFormula) {
    setFormula((prev) => {
      if (!prev) return prev
      const newLine: LocalLinea = {
        id: lineUid(),
        tipo,
        insumoId: '',
        descripcion: '',
        cantidad: 0,
        unidad: tipo === 'mano_de_obra' ? 'hora' : 'unidad',
        costoUnitario: 0,
      }
      return { ...prev, lineas: [...prev.lineas, newLine] }
    })
    setDirty(true)
  }

  function updateLine(id: string, updates: Partial<LocalLinea>) {
    setFormula((prev) => {
      if (!prev) return prev
      return {
        ...prev,
        lineas: prev.lineas.map((l) => (l.id === id ? { ...l, ...updates } : l)),
      }
    })
    setDirty(true)
  }

  function deleteLine(id: string) {
    setFormula((prev) => {
      if (!prev) return prev
      return { ...prev, lineas: prev.lineas.filter((l) => l.id !== id) }
    })
    setDirty(true)
  }

  // Cost calculations
  const costos = useMemo(() => {
    if (!formula) return { insumos: 0, manoDeObra: 0, operativos: 0, total: 0, unitario: 0 }

    let insumos = 0
    let manoDeObra = 0
    let operativos = 0

    for (const l of formula.lineas) {
      const sub = l.cantidad * l.costoUnitario
      if (l.tipo === 'insumo') insumos += sub
      else if (l.tipo === 'mano_de_obra') manoDeObra += sub
      else operativos += sub
    }

    const total = insumos + manoDeObra + operativos
    const unitario =
      formula.cantidadProducida > 0
        ? total / formula.cantidadProducida
        : total

    return { insumos, manoDeObra, operativos, total, unitario }
  }, [formula])

  // Margin
  const margen = useMemo(() => {
    if (!selectedProducto || costos.unitario === 0) return null
    const pv = selectedProducto.precioVenta
    if (pv === 0) return null
    return ((pv - costos.unitario) / pv) * 100
  }, [selectedProducto, costos.unitario])

  // Save
  function handleSave() {
    if (!formula || !selectedProductoId) return

    const lineas: LineaFormula[] = formula.lineas.map((l) => ({
      id: l.id,
      tipo: l.tipo,
      insumoId: l.tipo === 'insumo' ? l.insumoId || undefined : undefined,
      descripcion: l.descripcion,
      cantidad: l.cantidad,
      unidad: l.unidad,
      costoUnitario: l.costoUnitario,
    }))

    if (existingFormula) {
      dispatch({
        type: 'UPDATE_FORMULA',
        payload: {
          ...existingFormula,
          cantidadProducida: formula.cantidadProducida,
          unidadProducida: formula.unidadProducida,
          lineas,
          notas: formula.notas,
        },
      })
    } else {
      dispatch({
        type: 'ADD_FORMULA',
        payload: {
          productoId: selectedProductoId,
          cantidadProducida: formula.cantidadProducida,
          unidadProducida: formula.unidadProducida,
          lineas,
          notas: formula.notas,
        },
      })
    }
    setDirty(false)
  }

  // Separate lines by type
  const lineasInsumo = formula?.lineas.filter((l) => l.tipo === 'insumo') ?? []
  const lineasManoDeObra = formula?.lineas.filter((l) => l.tipo === 'mano_de_obra') ?? []
  const lineasOperativos = formula?.lineas.filter((l) => l.tipo === 'costo_operativo') ?? []

  return (
    <div className="space-y-6">
      {/* Product selector */}
      <div className="rounded-lg border bg-card p-4 shadow-sm">
        <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3">
          <div className="flex items-center gap-2">
            <FlaskConical className="h-5 w-5 text-muted-foreground" />
            <label className="text-sm font-medium">Producto:</label>
          </div>
          <select
            className={cn(inputClass, 'flex-1 sm:max-w-sm')}
            value={selectedProductoId}
            onChange={(e) => handleProductoChange(e.target.value)}
          >
            <option value="">Seleccionar un producto...</option>
            {state.productos.map((p) => (
              <option key={p.id} value={p.id}>
                {p.nombre} ({p.codigo})
              </option>
            ))}
          </select>

          {selectedProductoId && !formula && !existingFormula && (
            <Button onClick={handleCrearFormula}>
              <Plus className="h-4 w-4 mr-1" />
              Crear formula
            </Button>
          )}
        </div>
      </div>

      {/* No product selected */}
      {!selectedProductoId && (
        <EmptyState
          icon={FlaskConical}
          title="Formular producto"
          description="Selecciona un producto para ver o crear su formula de composicion. Define insumos, mano de obra y costos operativos."
        />
      )}

      {/* Product selected but no formula */}
      {selectedProductoId && !formula && !existingFormula && (
        <EmptyState
          icon={FlaskConical}
          title="Sin formula"
          description="Este producto no tiene una formula definida. Crea una para calcular su costo de produccion automaticamente."
        >
          <Button onClick={handleCrearFormula}>
            <Plus className="h-4 w-4 mr-1" />
            Crear formula
          </Button>
        </EmptyState>
      )}

      {/* Formula editor */}
      {formula && selectedProducto && (
        <>
          {/* Header */}
          <div className="rounded-lg border bg-card p-4 shadow-sm">
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
              <h3 className="text-base font-semibold">
                Formula para: {selectedProducto.nombre}
              </h3>
              <div className="flex items-center gap-3">
                <label className="text-sm text-muted-foreground">Cantidad producida:</label>
                <input
                  className={cn(inputClass, 'w-20 text-right')}
                  type="number"
                  min={1}
                  step={1}
                  value={formula.cantidadProducida || ''}
                  onChange={(e) => {
                    const nuevaCantidad = parseFloat(e.target.value) || 1
                    setFormula((prev) =>
                      prev ? { ...prev, cantidadProducida: nuevaCantidad } : prev,
                    )
                    setDirty(true)
                  }}
                />
                <select
                  className={cn(inputClass, 'w-32')}
                  value={formula.unidadProducida}
                  onChange={(e) => {
                    const nuevaUnidad = e.target.value as UnidadMedida
                    setFormula((prev) =>
                      prev ? { ...prev, unidadProducida: nuevaUnidad } : prev,
                    )
                    setDirty(true)
                  }}
                >
                  {UNIDADES.map((u) => (
                    <option key={u.value} value={u.value}>
                      {u.label}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          </div>

          {/* Section 1: Insumos / Materiales */}
          <div className="rounded-lg border bg-card p-4 shadow-sm">
            <FormulaSection
              title="Insumos / Materiales"
              icon={PackageOpen}
              tipo="insumo"
              lineas={lineasInsumo}
              insumosOptions={insumosOptions}
              onAddLine={addLine}
              onUpdateLine={updateLine}
              onDeleteLine={deleteLine}
              subtotal={costos.insumos}
            />
          </div>

          {/* Section 2: Mano de obra */}
          <div className="rounded-lg border bg-card p-4 shadow-sm">
            <FormulaSection
              title="Mano de obra"
              icon={Wrench}
              tipo="mano_de_obra"
              lineas={lineasManoDeObra}
              onAddLine={addLine}
              onUpdateLine={updateLine}
              onDeleteLine={deleteLine}
              subtotal={costos.manoDeObra}
            />
          </div>

          {/* Section 3: Costos operativos */}
          <div className="rounded-lg border bg-card p-4 shadow-sm">
            <FormulaSection
              title="Costos operativos"
              icon={Cog}
              tipo="costo_operativo"
              lineas={lineasOperativos}
              onAddLine={addLine}
              onUpdateLine={updateLine}
              onDeleteLine={deleteLine}
              subtotal={costos.operativos}
            />
          </div>

          {/* Cost summary */}
          <div className="rounded-lg border bg-card p-4 shadow-sm">
            <h4 className="text-sm font-semibold mb-4">Resumen de costos</h4>
            <div className="space-y-2">
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Insumos</span>
                <span className="tabular-nums">{formatARS(costos.insumos)}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Mano de obra</span>
                <span className="tabular-nums">{formatARS(costos.manoDeObra)}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Costos operativos</span>
                <span className="tabular-nums">{formatARS(costos.operativos)}</span>
              </div>
              <div className="border-t pt-2 flex justify-between text-sm">
                <span className="font-bold">COSTO TOTAL</span>
                <span className="font-bold tabular-nums">{formatARS(costos.total)}</span>
              </div>
              {formula.cantidadProducida > 1 && (
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">
                    Costo unitario
                  </span>
                  <span className="tabular-nums">
                    {formatARS(costos.unitario)} / {unidadAbrev(formula.unidadProducida)}
                  </span>
                </div>
              )}
              {margen !== null && (
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">
                    Margen ({formatARS(selectedProducto.precioVenta)} - {formatARS(costos.unitario)}) / {formatARS(selectedProducto.precioVenta)}
                  </span>
                  <span
                    className={cn(
                      'tabular-nums font-medium',
                      margen >= 0 ? 'text-green-600' : 'text-red-600',
                    )}
                  >
                    {margen.toFixed(1)}%
                  </span>
                </div>
              )}
            </div>
          </div>

          {/* Notas */}
          <div className="rounded-lg border bg-card p-4 shadow-sm">
            <label className="text-sm font-medium mb-2 block">Notas</label>
            <textarea
              className={cn(inputClass, 'min-h-[80px] resize-y')}
              value={formula.notas}
              onChange={(e) => {
                const nuevasNotas = e.target.value
                setFormula((prev) => (prev ? { ...prev, notas: nuevasNotas } : prev))
                setDirty(true)
              }}
              placeholder="Notas sobre la formula, instrucciones de preparacion, observaciones..."
              rows={3}
            />
          </div>

          {/* Save button */}
          <div className="flex justify-end">
            <Button onClick={handleSave} disabled={!dirty} size="lg">
              <Save className="h-4 w-4 mr-2" />
              {existingFormula ? 'Guardar cambios' : 'Guardar formula'}
            </Button>
          </div>
        </>
      )}
    </div>
  )
}
