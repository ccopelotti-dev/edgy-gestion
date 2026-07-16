'use client'

// ============================================================
// Fase 9 (cierre): pestaña "Producción" en Productos y Stock.
//
// Antes, "Registrar producción" vivía escondido al pie de Formular
// Producto, y solo era visible para una fórmula ya guardada mientras esa
// fórmula estaba abierta en pantalla. El usuario pidió más facilidad de
// acceso: un lugar propio, con selector de producto independiente e
// historial de lotes -- misma jerarquía que "Recepción" (entrada externa
// de stock) para "Producción" (entrada interna, por manufactura propia).
//
// El registro de UN lote sigue disparando la misma acción REGISTRAR_
// PRODUCCION del reducer (sin cambios de comportamiento: descuenta
// insumos, suma stock del producto terminado), pero ahora esa acción
// también inserta una fila en `producciones` (migración 0053) -- por eso
// acá se puede listar el historial completo, cosa que antes no existía.
// ============================================================

import { useState, useMemo } from 'react'
import { Factory, Boxes, CalendarClock, FlaskConical } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { useProductosStock } from '../data/store'
import { KpiCard, EmptyState } from '../components/productos/display'
import { formatDate, todayISO } from '../lib/format'
import { unidadAbrev } from '../types'

const inputClass =
  'flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm'

export default function Produccion() {
  const { state, dispatch } = useProductosStock()

  // Solo productos que tienen una fórmula guardada pueden producirse acá.
  // (producto.tieneFormula no es confiable -- ver comentario en
  // FormularProducto.tsx / data/store.tsx; el chequeo real es buscar en
  // state.formulas).
  const productosConFormula = useMemo(
    () =>
      state.productos.filter((p) => state.formulas.some((f) => f.productoId === p.id)),
    [state.productos, state.formulas],
  )

  const [selectedProductoId, setSelectedProductoId] = useState('')
  const [factor, setFactor] = useState(1)
  const [cantidadReal, setCantidadReal] = useState<number | ''>('')
  const [fecha, setFecha] = useState(todayISO())
  const [notas, setNotas] = useState('')

  const formulaSeleccionada = useMemo(
    () => state.formulas.find((f) => f.productoId === selectedProductoId) ?? null,
    [state.formulas, selectedProductoId],
  )

  const cantidadTeorica = formulaSeleccionada
    ? formulaSeleccionada.cantidadProducida * factor
    : 0

  function handleRegistrar() {
    if (!formulaSeleccionada) return
    const real = cantidadReal === '' ? cantidadTeorica : cantidadReal
    if (real <= 0 || factor <= 0) return

    dispatch({
      type: 'REGISTRAR_PRODUCCION',
      payload: {
        formulaId: formulaSeleccionada.id,
        factor,
        cantidadRealProducida: real,
        fecha,
        notas: notas || undefined,
      },
    })

    setSelectedProductoId('')
    setFactor(1)
    setCantidadReal('')
    setFecha(todayISO())
    setNotas('')
  }

  // KPIs
  const productosMap = useMemo(
    () => new Map(state.productos.map((p) => [p.id, p])),
    [state.productos],
  )
  const formulasMap = useMemo(
    () => new Map(state.formulas.map((f) => [f.id, f])),
    [state.formulas],
  )

  const kpis = useMemo(() => {
    const hoy = todayISO()
    const mesActual = hoy.slice(0, 7)
    const esteMes = state.producciones.filter((p) => p.fecha.slice(0, 7) === mesActual)
    return {
      total: state.producciones.length,
      esteMes: esteMes.length,
      productosDisponibles: productosConFormula.length,
    }
  }, [state.producciones, productosConFormula])

  // Historial, más reciente primero
  const historial = useMemo(
    () =>
      [...state.producciones].sort(
        (a, b) => b.fecha.localeCompare(a.fecha) || b.createdAt.localeCompare(a.createdAt),
      ),
    [state.producciones],
  )

  return (
    <div className="space-y-6">
      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <KpiCard
          title="Lotes producidos"
          value={String(kpis.total)}
          accent="primary"
          icon={Factory}
        />
        <KpiCard
          title="Este mes"
          value={String(kpis.esteMes)}
          accent="income"
          icon={CalendarClock}
        />
        <KpiCard
          title="Productos con fórmula"
          value={String(kpis.productosDisponibles)}
          accent="warning"
          icon={FlaskConical}
        />
      </div>

      {/* Registrar nueva producción */}
      <div className="rounded-lg border bg-card p-4 shadow-sm">
        <div className="flex items-center gap-2 mb-1">
          <Factory className="h-4 w-4 text-muted-foreground" />
          <h4 className="text-sm font-semibold">Registrar producción</h4>
        </div>
        <p className="text-xs text-muted-foreground mb-4">
          Ejecuta la fórmula de un producto como un lote real: descuenta el stock de los
          insumos consumidos y suma el stock del producto terminado. Solo aparecen acá los
          productos que ya tienen una fórmula guardada (pestaña "Formular Producto").
        </p>

        {productosConFormula.length === 0 ? (
          <EmptyState
            icon={FlaskConical}
            title="Sin productos formulados"
            description="Todavía no hay ningún producto con una fórmula/receta guardada. Andá a Formular Producto para crear una."
          />
        ) : (
          <>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-3">
              <div>
                <label className="text-xs text-muted-foreground block mb-1">Producto</label>
                <select
                  className={inputClass}
                  value={selectedProductoId}
                  onChange={(e) => {
                    setSelectedProductoId(e.target.value)
                    setCantidadReal('')
                  }}
                >
                  <option value="">Seleccionar un producto...</option>
                  {productosConFormula.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.nombre} ({p.codigo})
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-xs text-muted-foreground block mb-1">Fecha</label>
                <input
                  className={inputClass}
                  type="date"
                  value={fecha}
                  onChange={(e) => setFecha(e.target.value)}
                />
              </div>
            </div>

            {formulaSeleccionada && (
              <>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mb-3">
                  <div>
                    <label className="text-xs text-muted-foreground block mb-1">
                      Factor de lote
                    </label>
                    <input
                      className={cn(inputClass, 'text-right')}
                      type="number"
                      min={0.01}
                      step={0.5}
                      value={factor || ''}
                      onChange={(e) => setFactor(parseFloat(e.target.value) || 0)}
                    />
                  </div>
                  <div>
                    <label className="text-xs text-muted-foreground block mb-1">
                      Rendimiento real ({unidadAbrev(formulaSeleccionada.unidadProducida)})
                    </label>
                    <input
                      className={cn(inputClass, 'text-right')}
                      type="number"
                      min={0}
                      step={0.01}
                      placeholder={cantidadTeorica.toFixed(2)}
                      value={cantidadReal}
                      onChange={(e) =>
                        setCantidadReal(
                          e.target.value === '' ? '' : parseFloat(e.target.value) || 0,
                        )
                      }
                    />
                  </div>
                  <div>
                    <label className="text-xs text-muted-foreground block mb-1">
                      Notas (opcional)
                    </label>
                    <input
                      className={inputClass}
                      value={notas}
                      onChange={(e) => setNotas(e.target.value)}
                      placeholder="Ej: lote de prueba"
                    />
                  </div>
                </div>
                <p className="text-xs text-muted-foreground mb-3">
                  Teórico para este factor: {cantidadTeorica.toFixed(2)}{' '}
                  {unidadAbrev(formulaSeleccionada.unidadProducida)}. Si dejás el campo de
                  rendimiento vacío, se usa el teórico.
                </p>
              </>
            )}

            <div className="flex justify-end">
              <Button onClick={handleRegistrar} disabled={!formulaSeleccionada}>
                <Factory className="h-4 w-4 mr-2" />
                Registrar producción
              </Button>
            </div>
          </>
        )}
      </div>

      {/* Historial */}
      <div className="rounded-lg border bg-card shadow-sm overflow-x-auto">
        <div className="px-4 py-3 border-b">
          <h4 className="text-sm font-semibold">Historial de producción</h4>
        </div>
        {historial.length === 0 ? (
          <EmptyState
            icon={Boxes}
            title="Sin producciones registradas"
            description="Los lotes que registres van a aparecer acá, con fecha, factor y rendimiento."
          />
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-left text-muted-foreground">
                <th className="px-4 py-3 font-medium">Fecha</th>
                <th className="px-4 py-3 font-medium">Producto</th>
                <th className="px-4 py-3 font-medium text-right">Factor</th>
                <th className="px-4 py-3 font-medium text-right">Teórico</th>
                <th className="px-4 py-3 font-medium text-right">Real producido</th>
                <th className="px-4 py-3 font-medium">Notas</th>
              </tr>
            </thead>
            <tbody>
              {historial.map((p) => {
                const producto = productosMap.get(p.productoId)
                const formula = formulasMap.get(p.formulaId)
                const unidad = formula ? unidadAbrev(formula.unidadProducida) : ''
                return (
                  <tr key={p.id} className="border-b last:border-0">
                    <td className="px-4 py-3 tabular-nums">{formatDate(p.fecha)}</td>
                    <td className="px-4 py-3">{producto?.nombre ?? '(producto eliminado)'}</td>
                    <td className="px-4 py-3 text-right tabular-nums">{p.factor}</td>
                    <td className="px-4 py-3 text-right tabular-nums">
                      {p.cantidadTeorica.toFixed(2)} {unidad}
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums font-medium">
                      {p.cantidadRealProducida.toFixed(2)} {unidad}
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">{p.notas || '-'}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}
