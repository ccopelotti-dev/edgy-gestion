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
import { useSearchParams, useNavigate } from 'react-router-dom'
import { Factory, Boxes, CalendarClock, FlaskConical, Loader2, Ruler, AlertTriangle, ClipboardCheck, ShoppingCart } from 'lucide-react'
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
import { formatDate, formatARS, todayISO } from '../lib/format'
import { sanitizarDecimal, parsearDecimal } from '@/lib/decimal'
import {
  unidadAbrev,
  calcularCantidadesAMedida,
  calcularNecesidadInsumos,
  type InsumoParaNecesidad,
} from '../types'
import { guardarColaOcBorrador, type OcBorrador } from '@/modules/compras/types'

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
  // Fase 43p (Charcutería, "Lectura A"): en qué unidad está tipeando el
  // operador el rendimiento del lote -- la nativa de la fórmula
  // (unidadProducida) o la alternativa opcional (unidadSecundaria), si la
  // fórmula la tiene configurada. Se convierte a unidadProducida recién
  // al registrar (ver handleRegistrar) -- el stock del producto sigue
  // siendo un solo número, en su unidad de siempre.
  const [modoUnidad, setModoUnidad] = useState<'primaria' | 'secundaria'>('primaria')
  const [fecha, setFecha] = useState(todayISO())
  const [notas, setNotas] = useState('')
  const [guardando, setGuardando] = useState(false)
  const [errorGuardado, setErrorGuardado] = useState('')

  const formulaSeleccionada = useMemo(
    () => state.formulas.find((f) => f.productoId === selectedProductoId) ?? null,
    [state.formulas, selectedProductoId],
  )

  // ── Verificar disponibilidad antes de producir (Fase 44) ───────────────
  // Carlos (Charcutería, 21/08): antes de lanzar un lote grande (ej. 40 kg
  // de Salame) quiere saber si el stock de insumos alcanza ANTES de
  // producir. Reusa exactamente la misma conversión de unidades que el
  // registro real (ver calcularNecesidadInsumos en types/index.ts) para que
  // el chequeo previo nunca diga "alcanza" y después el registro falle (o
  // al revés) por una diferencia de lógica entre los dos lugares.
  const navigate = useNavigate()
  const insumosPorId = useMemo(() => {
    const m = new Map<string, InsumoParaNecesidad>()
    for (const i of state.insumos) {
      m.set(i.id, {
        id: i.id,
        nombre: i.nombre,
        unidad: i.unidad,
        stock: i.stock,
        anchoRollo: i.anchoRollo,
        rubroId: i.rubroId,
        costo: i.costo,
      })
    }
    return m
  }, [state.insumos])
  const rubrosMap = useMemo(
    () => new Map(state.rubros.map((r) => [r.id, r.nombre])),
    [state.rubros],
  )
  const necesidadesResult = useMemo(() => {
    if (!formulaSeleccionada || factor <= 0) return null
    return calcularNecesidadInsumos(formulaSeleccionada.lineas, factor, insumosPorId)
  }, [formulaSeleccionada, factor, insumosPorId])
  const necesidadesOrdenadas = useMemo(() => {
    if (!necesidadesResult?.ok) return []
    return [...necesidadesResult.necesidades].sort((a, b) => {
      const rubroA = rubrosMap.get(a.rubroId) ?? ''
      const rubroB = rubrosMap.get(b.rubroId) ?? ''
      return rubroA.localeCompare(rubroB) || a.nombre.localeCompare(b.nombre)
    })
  }, [necesidadesResult, rubrosMap])
  const faltantes = useMemo(
    () => necesidadesOrdenadas.filter((n) => !n.alcanza),
    [necesidadesOrdenadas],
  )
  // Fase 45g: cuántos rubros distintos hay entre los faltantes -- define
  // si "Generar Orden de Compra" va a armar una sola OC o varias (una por
  // rubro, ver handleGenerarOC más abajo).
  const rubrosFaltantesCount = useMemo(
    () => new Set(faltantes.map((n) => n.rubroId)).size,
    [faltantes],
  )

  // Fase 45g (Etapa 1 del split de OC, 21/08 a pedido de Carlos): en vez
  // de un solo borrador con todos los faltantes mezclados, se agrupan por
  // rubro -- un lote grande suele faltarle tanto una carne como un
  // insumo de envasado, casi seguro de proveedores distintos, así que
  // conviene una OC por rubro desde el arranque. `necesidadesOrdenadas`
  // (no `faltantes`) ya viene ordenado por rubro, así que agrupar acá es
  // simplemente ir cortando por cada vez que cambia el rubro.
  function handleGenerarOC() {
    if (!formulaSeleccionada || faltantes.length === 0) return
    const productoNombre = productosConFormula.find((p) => p.id === selectedProductoId)?.nombre

    const porRubro = new Map<string, typeof faltantes>()
    for (const n of faltantes) {
      const lista = porRubro.get(n.rubroId)
      if (lista) lista.push(n)
      else porRubro.set(n.rubroId, [n])
    }

    const cola: OcBorrador[] = [...porRubro.entries()].map(([rubroId, items]) => ({
      origen: 'produccion',
      productoNombre,
      rubroNombre: rubrosMap.get(rubroId) ?? 'Sin rubro',
      items: items.map((n) => ({
        insumoId: n.insumoId,
        descripcion: n.nombre,
        cantidad: Math.round(n.faltante * 100) / 100,
        unidad: n.unidadNativa,
        precioUnitario: n.costoUnitario,
      })),
    }))

    guardarColaOcBorrador(cola)
    navigate('/m/compras/ordenes-compra?borrador=1')
  }

  const tieneUnidadSecundaria = !!(
    formulaSeleccionada?.unidadSecundaria && formulaSeleccionada.equivalenciaSecundaria
  )

  const cantidadTeorica = formulaSeleccionada
    ? formulaSeleccionada.cantidadProducida * factor
    : 0

  // Convierte lo que haya tipeado el operador (en la unidad activa) a
  // unidadProducida -- la única que el resto del sistema (stock,
  // historial, cantidadTeorica) entiende.
  const cantidadRealEnUnidadProducida = useMemo(() => {
    if (cantidadReal === '') return cantidadTeorica
    if (modoUnidad === 'secundaria' && formulaSeleccionada?.equivalenciaSecundaria) {
      return cantidadReal * formulaSeleccionada.equivalenciaSecundaria
    }
    return cantidadReal
  }, [cantidadReal, modoUnidad, formulaSeleccionada, cantidadTeorica])

  async function handleRegistrar() {
    if (!formulaSeleccionada || guardando) return
    const real = cantidadRealEnUnidadProducida
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
    setModoUnidad('primaria')
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
                    setModoUnidad('primaria')
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
                    <div className="flex items-center justify-between mb-1">
                      <label className="text-xs text-muted-foreground">
                        Rendimiento real (
                        {unidadAbrev(
                          modoUnidad === 'secundaria' && formulaSeleccionada.unidadSecundaria
                            ? formulaSeleccionada.unidadSecundaria
                            : formulaSeleccionada.unidadProducida,
                        )}
                        )
                      </label>
                      {tieneUnidadSecundaria && (
                        <div className="flex rounded-md border overflow-hidden text-[11px]">
                          <button
                            type="button"
                            className={cn(
                              'px-2 py-0.5',
                              modoUnidad === 'primaria' ? 'bg-primary text-primary-foreground' : 'bg-background',
                            )}
                            onClick={() => {
                              setModoUnidad('primaria')
                              setCantidadReal('')
                              setCantidadRealTexto('')
                            }}
                          >
                            {unidadAbrev(formulaSeleccionada.unidadProducida)}
                          </button>
                          <button
                            type="button"
                            className={cn(
                              'px-2 py-0.5',
                              modoUnidad === 'secundaria' ? 'bg-primary text-primary-foreground' : 'bg-background',
                            )}
                            onClick={() => {
                              setModoUnidad('secundaria')
                              setCantidadReal('')
                              setCantidadRealTexto('')
                            }}
                          >
                            {unidadAbrev(formulaSeleccionada.unidadSecundaria!)}
                          </button>
                        </div>
                      )}
                    </div>
                    <input
                      className={cn(inputClass, 'text-right')}
                      type="text"
                      inputMode="decimal"
                      placeholder={(modoUnidad === 'secundaria' && formulaSeleccionada.equivalenciaSecundaria
                        ? cantidadTeorica / formulaSeleccionada.equivalenciaSecundaria
                        : cantidadTeorica
                      ).toFixed(2)}
                      value={cantidadRealTexto}
                      onChange={(e) => {
                        const texto = sanitizarDecimal(e.target.value)
                        setCantidadRealTexto(texto)
                        setCantidadReal(texto === '' ? '' : parsearDecimal(texto))
                      }}
                    />
                    {tieneUnidadSecundaria && cantidadReal !== '' && (
                      <p className="text-[11px] text-muted-foreground mt-1">
                        {modoUnidad === 'secundaria' ? (
                          <>
                            ≈ {cantidadRealEnUnidadProducida.toFixed(2)} {unidadAbrev(formulaSeleccionada.unidadProducida)}
                          </>
                        ) : (
                          <>
                            ≈ {(cantidadReal / formulaSeleccionada.equivalenciaSecundaria!).toFixed(2)}{' '}
                            {unidadAbrev(formulaSeleccionada.unidadSecundaria!)}
                          </>
                        )}
                      </p>
                    )}
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

                {/* Verificar disponibilidad (Fase 44) */}
                {necesidadesResult && !necesidadesResult.ok ? (
                  <div className="rounded-md bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-900 px-3 py-2 text-sm text-red-700 dark:text-red-400 mb-3">
                    {necesidadesResult.error}
                  </div>
                ) : necesidadesOrdenadas.length > 0 ? (
                  <div className="rounded-md border mb-3 overflow-hidden">
                    <div className="flex items-center gap-2 px-3 py-2 border-b bg-muted/30">
                      <ClipboardCheck className="h-3.5 w-3.5 text-muted-foreground" />
                      <span className="text-xs font-semibold">
                        Disponibilidad para {factor} {factor === 1 ? 'lote' : 'lotes'}
                      </span>
                      {faltantes.length === 0 ? (
                        <span className="ml-auto text-xs text-emerald-600 font-medium">
                          Alcanza el stock de todos los insumos
                        </span>
                      ) : (
                        <span className="ml-auto text-xs text-red-600 font-medium">
                          Faltan {faltantes.length} insumo{faltantes.length === 1 ? '' : 's'}
                        </span>
                      )}
                    </div>
                    <div className="max-h-64 overflow-y-auto">
                      <table className="w-full text-xs">
                        <thead>
                          <tr className="border-b text-left text-muted-foreground bg-muted/10">
                            <th className="px-3 py-1.5 font-medium">Insumo</th>
                            <th className="px-3 py-1.5 font-medium">Rubro</th>
                            <th className="px-3 py-1.5 font-medium text-right">Necesario</th>
                            <th className="px-3 py-1.5 font-medium text-right">Stock actual</th>
                            <th className="px-3 py-1.5 font-medium text-right">Faltante</th>
                          </tr>
                        </thead>
                        <tbody>
                          {necesidadesOrdenadas.map((n) => (
                            <tr key={n.lineaId} className={cn('border-b last:border-0', !n.alcanza && 'bg-red-50 dark:bg-red-950/20')}>
                              <td className="px-3 py-1.5">{n.nombre}</td>
                              <td className="px-3 py-1.5 text-muted-foreground">{rubrosMap.get(n.rubroId) ?? '-'}</td>
                              <td className="px-3 py-1.5 text-right tabular-nums">
                                {n.cantidadNecesaria.toFixed(2)} {unidadAbrev(n.unidadNativa)}
                              </td>
                              <td className="px-3 py-1.5 text-right tabular-nums">
                                {n.stockActual.toFixed(2)} {unidadAbrev(n.unidadNativa)}
                              </td>
                              <td className={cn('px-3 py-1.5 text-right tabular-nums font-medium', !n.alcanza && 'text-red-600')}>
                                {n.alcanza ? '—' : `${n.faltante.toFixed(2)} ${unidadAbrev(n.unidadNativa)}`}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                    {faltantes.length > 0 && (
                      <div className="flex items-center justify-between gap-3 px-3 py-2 border-t bg-muted/20">
                        <span className="text-xs text-muted-foreground">
                          Estimado de compra: {formatARS(faltantes.reduce((s, n) => s + n.faltante * n.costoUnitario, 0))}
                        </span>
                        <Button type="button" size="sm" variant="outline" onClick={handleGenerarOC}>
                          <ShoppingCart className="h-3.5 w-3.5 mr-1.5" />
                          {rubrosFaltantesCount > 1
                            ? `Generar ${rubrosFaltantesCount} Órdenes de Compra (por rubro)`
                            : 'Generar Orden de Compra'}
                        </Button>
                      </div>
                    )}
                  </div>
                ) : null}
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
                      {formula?.unidadSecundaria && formula.equivalenciaSecundaria ? (
                        <span className="block text-[11px] font-normal text-muted-foreground">
                          ≈ {(p.cantidadRealProducida / formula.equivalenciaSecundaria).toFixed(2)}{' '}
                          {unidadAbrev(formula.unidadSecundaria)}
                        </span>
                      ) : null}
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
