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

import { useState, useMemo, useEffect, useCallback, useRef } from 'react'
import { useSearchParams } from 'react-router-dom'
import { Factory, Boxes, CalendarClock, FlaskConical, Loader2, Ruler, AlertTriangle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import {
  useProductosStock,
  registrarProduccionConfirmada,
  fetchPedidosAMedidaPendientes,
  type PedidoAMedidaPendiente,
} from '../data/store'
import { useClienteActual } from '@/hooks/useClienteActual'
import { KpiCard, EmptyState } from '../components/productos/display'
import { formatDate, todayISO } from '../lib/format'
import { sanitizarDecimal, parsearDecimal } from '@/lib/decimal'
import { unidadAbrev, calcularCantidadesAMedida } from '../types'

const inputClass =
  'flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm'

export default function Produccion() {
  const { state, dispatch } = useProductosStock()
  const { cliente } = useClienteActual()

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
  const [factorTexto, setFactorTexto] = useState('1')
  const [cantidadReal, setCantidadReal] = useState<number | ''>('')
  const [cantidadRealTexto, setCantidadRealTexto] = useState('')
  const [fecha, setFecha] = useState(todayISO())
  const [notas, setNotas] = useState('')
  const [guardando, setGuardando] = useState(false)
  const [errorGuardado, setErrorGuardado] = useState('')

  const formulaSeleccionada = useMemo(
    () => state.formulas.find((f) => f.productoId === selectedProductoId) ?? null,
    [state.formulas, selectedProductoId],
  )

  const cantidadTeorica = formulaSeleccionada
    ? formulaSeleccionada.cantidadProducida * factor
    : 0

  async function handleRegistrar() {
    if (!formulaSeleccionada || guardando) return
    const real = cantidadReal === '' ? cantidadTeorica : cantidadReal
    if (real <= 0 || factor <= 0) return
    if (!cliente?.id) {
      setErrorGuardado('No se pudo identificar la cuenta -- probá recargar la página.')
      return
    }

    setErrorGuardado('')
    setGuardando(true)
    const res = await registrarProduccionConfirmada(
      {
        formulaId: formulaSeleccionada.id,
        factor,
        cantidadRealProducida: real,
        fecha,
        notas: notas || undefined,
      },
      formulaSeleccionada,
      cliente.id,
    )
    setGuardando(false)
    if (!res.ok) {
      setErrorGuardado(res.error)
      return
    }
    dispatch({ type: 'CONFIRM_STOCK_SYNC', payload: res.data })

    setSelectedProductoId('')
    setFactor(1)
    setFactorTexto('1')
    setCantidadReal('')
    setCantidadRealTexto('')
    setFecha(todayISO())
    setNotas('')
  }

  // ── Pedidos a medida (Fase 41) ────────────────────────────────────────
  // Fichas de medida con un ítem vinculado a un Producto real, sin
  // producción todavía y sin facturar -- ver fetchPedidosAMedidaPendientes
  // en data/store.tsx para el criterio exacto (todo derivado, sin estado
  // propio que se pueda desincronizar).
  const [pedidosAMedida, setPedidosAMedida] = useState<PedidoAMedidaPendiente[]>([])
  const [cargandoPedidos, setCargandoPedidos] = useState(false)
  const [pedidoSeleccionadoId, setPedidoSeleccionadoId] = useState('')
  const [fechaAMedida, setFechaAMedida] = useState(todayISO())
  const [notasAMedida, setNotasAMedida] = useState('')
  const [guardandoAMedida, setGuardandoAMedida] = useState(false)
  const [errorAMedida, setErrorAMedida] = useState('')

  const cargarPedidosAMedida = useCallback(async () => {
    if (!cliente?.id) return
    setCargandoPedidos(true)
    const pedidos = await fetchPedidosAMedidaPendientes(cliente.id)
    setPedidosAMedida(pedidos)
    setCargandoPedidos(false)
  }, [cliente?.id])

  useEffect(() => {
    cargarPedidosAMedida()
  }, [cargarPedidosAMedida])

  // Atajo "Ir a Producción" desde Fichas de medida (Fase 41.1): llega acá
  // con ?pedido=<itemId>, lo preselecciona en cuanto aparece en la lista de
  // pendientes y hace scroll a la sección -- mismo criterio de deep link
  // que Presupuestos.tsx (?presupuesto=<id>).
  const [searchParams, setSearchParams] = useSearchParams()
  const seccionPedidosRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const pedidoParam = searchParams.get('pedido')
    if (!pedidoParam) return
    if (!pedidosAMedida.some((p) => p.itemId === pedidoParam)) return

    setPedidoSeleccionadoId(pedidoParam)

    const next = new URLSearchParams(searchParams)
    next.delete('pedido')
    setSearchParams(next, { replace: true })

    requestAnimationFrame(() => {
      seccionPedidosRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams, pedidosAMedida])

  const pedidoSeleccionado = useMemo(
    () => pedidosAMedida.find((p) => p.itemId === pedidoSeleccionadoId) ?? null,
    [pedidosAMedida, pedidoSeleccionadoId],
  )
  const formulaAMedida = useMemo(
    () =>
      pedidoSeleccionado
        ? state.formulas.find((f) => f.productoId === pedidoSeleccionado.productoId) ?? null
        : null,
    [state.formulas, pedidoSeleccionado],
  )
  const productoAMedida = pedidoSeleccionado
    ? state.productos.find((p) => p.id === pedidoSeleccionado.productoId)
    : undefined

  // Preview de cantidades -- mismo cálculo que va a usar el store al
  // registrar, mostrado ANTES de confirmar para que el operador vea qué se
  // va a descontar (y el motivo exacto si falta una medida) sin tener que
  // adivinar.
  const previewAMedida = useMemo(() => {
    if (!pedidoSeleccionado || !formulaAMedida) return null
    return calcularCantidadesAMedida(formulaAMedida.lineas, pedidoSeleccionado.panos)
  }, [pedidoSeleccionado, formulaAMedida])

  async function handleRegistrarAMedida() {
    if (!pedidoSeleccionado || !formulaAMedida || guardandoAMedida) return
    if (!cliente?.id) {
      setErrorAMedida('No se pudo identificar la cuenta -- probá recargar la página.')
      return
    }
    setErrorAMedida('')
    setGuardandoAMedida(true)
    const res = await registrarProduccionConfirmada(
      {
        formulaId: formulaAMedida.id,
        factor: 1,
        cantidadRealProducida: formulaAMedida.cantidadProducida,
        fecha: fechaAMedida,
        notas: notasAMedida || undefined,
        fichaItem: {
          id: pedidoSeleccionado.itemId,
          panos: pedidoSeleccionado.panos,
          cantidadItem: pedidoSeleccionado.cantidadItem,
        },
      },
      formulaAMedida,
      cliente.id,
    )
    setGuardandoAMedida(false)
    if (!res.ok) {
      setErrorAMedida(res.error)
      return
    }
    dispatch({ type: 'CONFIRM_STOCK_SYNC', payload: res.data })
    setPedidoSeleccionadoId('')
    setNotasAMedida('')
    setFechaAMedida(todayISO())
    await cargarPedidosAMedida()
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
                    setCantidadRealTexto('')
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
                      type="text"
                      inputMode="decimal"
                      value={factorTexto}
                      onChange={(e) => {
                        const texto = sanitizarDecimal(e.target.value)
                        setFactorTexto(texto)
                        setFactor(parsearDecimal(texto))
                      }}
                    />
                  </div>
                  <div>
                    <label className="text-xs text-muted-foreground block mb-1">
                      Rendimiento real ({unidadAbrev(formulaSeleccionada.unidadProducida)})
                    </label>
                    <input
                      className={cn(inputClass, 'text-right')}
                      type="text"
                      inputMode="decimal"
                      placeholder={cantidadTeorica.toFixed(2)}
                      value={cantidadRealTexto}
                      onChange={(e) => {
                        const texto = sanitizarDecimal(e.target.value)
                        setCantidadRealTexto(texto)
                        setCantidadReal(texto === '' ? '' : parsearDecimal(texto))
                      }}
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

            {errorGuardado && (
              <div className="rounded-md bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-900 px-3 py-2 text-sm text-red-700 dark:text-red-400 mb-3">
                {errorGuardado}
              </div>
            )}

            <div className="flex justify-end">
              <Button onClick={handleRegistrar} disabled={!formulaSeleccionada || guardando}>
                {guardando ? (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                ) : (
                  <Factory className="h-4 w-4 mr-2" />
                )}
                Registrar producción
              </Button>
            </div>
          </>
        )}
      </div>

      {/* Pedidos a medida (Fase 41) */}
      <div ref={seccionPedidosRef} className="rounded-lg border bg-card p-4 shadow-sm">
        <div className="flex items-center gap-2 mb-1">
          <Ruler className="h-4 w-4 text-muted-foreground" />
          <h4 className="text-sm font-semibold">Pedidos a medida pendientes</h4>
        </div>
        <p className="text-xs text-muted-foreground mb-4">
          Ítems de Ficha de medida vinculados a un producto del catálogo, todavía sin producir.
          Acá las cantidades de cada línea salen de las medidas reales del pedido (m2/ML/unidad),
          no de un factor de lote -- y el lote no suma stock genérico: queda imputado a este
          pedido hasta que se facture.
        </p>

        {cargandoPedidos ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground py-4">
            <Loader2 className="h-4 w-4 animate-spin" /> Cargando pedidos...
          </div>
        ) : pedidosAMedida.length === 0 ? (
          <EmptyState
            icon={Ruler}
            title="Sin pedidos a medida pendientes"
            description="Cuando un ítem de una Ficha de medida esté vinculado a un producto del catálogo, va a aparecer acá para producir."
          />
        ) : (
          <>
            <div className="mb-3">
              <label className="text-xs text-muted-foreground block mb-1">Pedido</label>
              <select
                className={inputClass}
                value={pedidoSeleccionadoId}
                onChange={(e) => {
                  setPedidoSeleccionadoId(e.target.value)
                  setErrorAMedida('')
                }}
              >
                <option value="">Seleccionar un pedido...</option>
                {pedidosAMedida.map((p) => (
                  <option key={p.itemId} value={p.itemId}>
                    {p.clienteNombre} — {p.descripcion} (pedido {formatDate(p.fechaPedido)})
                  </option>
                ))}
              </select>
            </div>

            {/* Fase 41.7 (20/08, a pedido de Carlos): "el artículo esclavo
                que muestre la imagen real del catálogo" -- mismo criterio
                que Productos.tsx/Catalogo.tsx, acá ayuda a confirmar de
                un vistazo qué pedido está por producirse. */}
            {pedidoSeleccionado && productoAMedida?.imagenes?.[0] && (
              <div className="mb-3 flex items-center gap-2 rounded-md border bg-muted/20 px-3 py-2">
                <img
                  src={productoAMedida.imagenes[0]}
                  alt=""
                  className="h-10 w-10 shrink-0 rounded object-cover"
                />
                <span className="text-sm text-muted-foreground">{productoAMedida.nombre}</span>
              </div>
            )}

            {pedidoSeleccionado && !formulaAMedida && (
              <div className="rounded-md bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-900 px-3 py-2 text-sm text-amber-700 dark:text-amber-400 mb-3 flex items-start gap-2">
                <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
                <span>
                  {productoAMedida?.nombre ?? 'Este producto'} todavía no tiene una fórmula
                  guardada -- andá a Formular Producto para cargarla antes de producir este
                  pedido.
                </span>
              </div>
            )}

            {pedidoSeleccionado && formulaAMedida && (
              <>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-3">
                  <div>
                    <label className="text-xs text-muted-foreground block mb-1">Fecha</label>
                    <input
                      className={inputClass}
                      type="date"
                      value={fechaAMedida}
                      onChange={(e) => setFechaAMedida(e.target.value)}
                    />
                  </div>
                  <div>
                    <label className="text-xs text-muted-foreground block mb-1">
                      Notas (opcional)
                    </label>
                    <input
                      className={inputClass}
                      value={notasAMedida}
                      onChange={(e) => setNotasAMedida(e.target.value)}
                    />
                  </div>
                </div>

                {previewAMedida && !previewAMedida.ok ? (
                  <div className="rounded-md bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-900 px-3 py-2 text-sm text-red-700 dark:text-red-400 mb-3">
                    {previewAMedida.error}
                  </div>
                ) : previewAMedida ? (
                  <div className="rounded-md border overflow-x-auto mb-3">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b text-left text-muted-foreground bg-muted/30">
                          <th className="px-3 py-2 font-medium">Línea</th>
                          <th className="px-3 py-2 font-medium text-right">Cantidad a consumir</th>
                        </tr>
                      </thead>
                      <tbody>
                        {formulaAMedida.lineas
                          .filter((l) => l.tipo === 'insumo')
                          .map((l) => (
                            <tr key={l.id} className="border-b last:border-0">
                              <td className="px-3 py-2">{l.descripcion}</td>
                              <td className="px-3 py-2 text-right tabular-nums">
                                {(previewAMedida.cantidades.get(l.id) ?? 0).toFixed(2)}{' '}
                                {unidadAbrev(l.unidad)}
                              </td>
                            </tr>
                          ))}
                      </tbody>
                    </table>
                  </div>
                ) : null}

                {errorAMedida && (
                  <div className="rounded-md bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-900 px-3 py-2 text-sm text-red-700 dark:text-red-400 mb-3">
                    {errorAMedida}
                  </div>
                )}

                <div className="flex justify-end">
                  <Button
                    onClick={handleRegistrarAMedida}
                    disabled={guardandoAMedida || (previewAMedida ? !previewAMedida.ok : false)}
                  >
                    {guardandoAMedida ? (
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    ) : (
                      <Ruler className="h-4 w-4 mr-2" />
                    )}
                    Registrar producción a medida
                  </Button>
                </div>
              </>
            )}
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
