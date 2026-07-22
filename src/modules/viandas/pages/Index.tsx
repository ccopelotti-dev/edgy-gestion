import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Plus, Soup } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { supabase } from '@/lib/supabase'
import { useClienteActual } from '@/hooks/useClienteActual'
import { usePlanesVianda, useEntregas, useViandas } from '../data/store'
import { formatARS, formatFecha, daysUntil, todayISO } from '../lib/format'
import { PERIODO_VIANDA_LABEL, ESTADO_PLAN_VIANDA_LABEL, type PeriodoVianda, type PlanVianda } from '../types'
import {
  obtenerProductosViandaDeHoy,
  crearOrdenParaEntregaVianda,
  type ProductoViandaCandidato,
} from '../lib/generarEntregaVianda'

interface ClienteVentaLite {
  id: string
  nombre: string
}

interface PendienteEleccion {
  plan: PlanVianda
  candidatos: ProductoViandaCandidato[]
}

// Listado de planes + alta inline (sin página separada, mismo criterio
// que Mesa.tsx en comandas-cocina para "abrir comanda"). El cliente se
// resuelve con una consulta directa a `clientes_venta` -- Ventas no
// está montado en este módulo, mismo criterio cross-módulo que el
// resto del pack gastronómico.
export default function Index() {
  const { cliente } = useClienteActual()
  const { dispatch } = useViandas()
  const planes = usePlanesVianda()
  const entregas = useEntregas()

  const [clientesVenta, setClientesVenta] = useState<ClienteVentaLite[]>([])
  const [mostrarForm, setMostrarForm] = useState(false)
  const [clienteVentaId, setClienteVentaId] = useState('')
  const [cantidadPeriodo, setCantidadPeriodo] = useState(5)
  const [periodo, setPeriodo] = useState<PeriodoVianda>('semanal')
  const [precioAbono, setPrecioAbono] = useState(0)
  const [fechaVencimiento, setFechaVencimiento] = useState('')

  // Fase 24c: generación diaria de entregas sobre catálogo real. Si hay 1
  // solo producto de Viandas disponible hoy (Fase 24a: dias_disponibles),
  // se genera la Orden automático para cada plan activo vigente. Si hay 2
  // o 3, queda pendiente de "elegir menú" -- el cliente decidió trabajar
  // con hasta ~3 menúes del día en vez de uno solo fijo (ver notas de la
  // Fase 24).
  const [generandoHoy, setGenerandoHoy] = useState(false)
  const [resumenHoy, setResumenHoy] = useState<{ generadas: number } | null>(null)
  const [pendientesEleccion, setPendientesEleccion] = useState<PendienteEleccion[]>([])
  const [eligiendoPlanId, setEligiendoPlanId] = useState<string | null>(null)

  async function generarEntregasDeHoy() {
    if (!cliente?.id) return
    setGenerandoHoy(true)
    setResumenHoy(null)
    setPendientesEleccion([])

    const hoy = todayISO()
    const candidatos = await obtenerProductosViandaDeHoy(cliente.id)
    const yaGeneradasHoy = new Set(entregas.filter((e) => e.fecha === hoy).map((e) => e.planId))
    const planesActivosHoy = planes.filter(
      (p) =>
        p.estado === 'activo' &&
        p.fechaInicio <= hoy &&
        p.fechaVencimiento >= hoy &&
        !yaGeneradasHoy.has(p.id),
    )

    let generadas = 0
    const pendientes: PendienteEleccion[] = []

    for (const plan of planesActivosHoy) {
      if (candidatos.length === 0) continue // nada configurado para hoy, se omite
      if (candidatos.length === 1) {
        const resultado = await crearOrdenParaEntregaVianda(cliente.id, plan, candidatos[0], hoy, 1)
        if (resultado) {
          dispatch({
            type: 'AGREGAR_ENTREGA',
            payload: {
              planId: plan.id,
              fecha: hoy,
              cantidad: 1,
              productoId: candidatos[0].id,
              productoNombre: candidatos[0].nombre,
              precioUnitario: resultado.precioUnitario,
              ordenId: resultado.ordenId,
            },
          })
          generadas++
        }
      } else {
        pendientes.push({ plan, candidatos })
      }
    }

    setResumenHoy({ generadas })
    setPendientesEleccion(pendientes)
    setGenerandoHoy(false)
  }

  async function elegirMenuDeHoy(plan: PlanVianda, producto: ProductoViandaCandidato) {
    if (!cliente?.id) return
    setEligiendoPlanId(plan.id)
    const hoy = todayISO()
    const resultado = await crearOrdenParaEntregaVianda(cliente.id, plan, producto, hoy, 1)
    if (resultado) {
      dispatch({
        type: 'AGREGAR_ENTREGA',
        payload: {
          planId: plan.id,
          fecha: hoy,
          cantidad: 1,
          productoId: producto.id,
          productoNombre: producto.nombre,
          precioUnitario: resultado.precioUnitario,
          ordenId: resultado.ordenId,
        },
      })
      setPendientesEleccion((prev) => prev.filter((p) => p.plan.id !== plan.id))
      setResumenHoy((prev) => ({ generadas: (prev?.generadas ?? 0) + 1 }))
    }
    setEligiendoPlanId(null)
  }

  useEffect(() => {
    if (!cliente?.id) return
    supabase
      .from('clientes_venta')
      .select('id, nombre')
      .eq('cliente_id', cliente.id)
      .eq('activo', true)
      .order('nombre')
      .then(({ data }) => setClientesVenta(data ?? []))
  }, [cliente?.id])

  const clienteSeleccionado = clientesVenta.find((c) => c.id === clienteVentaId)

  function crearPlan() {
    if (!clienteSeleccionado || !fechaVencimiento || precioAbono <= 0) return
    dispatch({
      type: 'CREAR_PLAN',
      payload: {
        clienteVentaId: clienteSeleccionado.id,
        clienteVentaNombre: clienteSeleccionado.nombre,
        cantidadPeriodo,
        periodo,
        precioAbono,
        fechaInicio: todayISO(),
        fechaVencimiento,
      },
    })
    setMostrarForm(false)
    setClienteVentaId('')
    setCantidadPeriodo(5)
    setPeriodo('semanal')
    setPrecioAbono(0)
    setFechaVencimiento('')
  }

  const planesOrdenados = [...planes].sort((a, b) => {
    if (a.estado !== b.estado) return a.estado === 'activo' ? -1 : 1
    return a.fechaVencimiento.localeCompare(b.fechaVencimiento)
  })

  // Fase 24e: widget de métricas -- todo se calcula sobre lo que ya está
  // cargado en memoria (planes + entregas de ViandasProvider), sin
  // pegarle a Supabase de nuevo: cada entrega ya guarda su propio
  // precioUnitario/cantidad (prorrateo del abono) y si tiene comprobanteId
  // asignado (Fase 24c: se completa cuando Ordenes.tsx la factura sola al
  // llegar a 'entregado'), así que "facturado" vs "pendiente de facturar"
  // sale directo de ahí.
  const hoy = todayISO()
  const mesActual = hoy.slice(0, 7) // 'YYYY-MM'
  const planesActivos = planes.filter((p) => p.estado === 'activo')
  const planesVencidos = planesActivos.filter((p) => daysUntil(p.fechaVencimiento) < 0)
  const entregasDelMes = entregas.filter((e) => e.fecha.slice(0, 7) === mesActual)
  const facturadoDelMes = entregasDelMes
    .filter((e) => e.comprobanteId)
    .reduce((s, e) => s + e.precioUnitario * e.cantidad, 0)
  const pendienteDeFacturar = entregas.filter((e) => !e.comprobanteId)
  const montoPendienteDeFacturar = pendienteDeFacturar.reduce((s, e) => s + e.precioUnitario * e.cantidad, 0)

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Viandas</h1>
          <p className="text-muted-foreground text-sm">Planes de vianda por abono y sus entregas.</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={generarEntregasDeHoy} disabled={generandoHoy}>
            <Soup className="mr-1.5 h-4 w-4" />
            {generandoHoy ? 'Generando…' : 'Generar entregas de hoy'}
          </Button>
          <Button onClick={() => setMostrarForm((v) => !v)}>
            <Plus className="mr-1.5 h-4 w-4" />
            Nuevo plan
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <MetricaCard label="Planes activos" value={String(planesActivos.length)} />
        <MetricaCard
          label="Planes vencidos"
          value={String(planesVencidos.length)}
          alerta={planesVencidos.length > 0}
        />
        <MetricaCard label="Entregas este mes" value={String(entregasDelMes.length)} />
        <MetricaCard label="Facturado este mes" value={formatARS(facturadoDelMes)} />
        <MetricaCard
          label="Pendiente de facturar"
          value={`${pendienteDeFacturar.length} · ${formatARS(montoPendienteDeFacturar)}`}
          alerta={pendienteDeFacturar.length > 0}
        />
      </div>

      {resumenHoy && (
        <Card>
          <CardContent className="py-4 text-sm">
            <p>
              Se generaron <span className="font-medium">{resumenHoy.generadas}</span> entregas de
              hoy ({formatFecha(todayISO())}).
            </p>
          </CardContent>
        </Card>
      )}

      {pendientesEleccion.length > 0 && (
        <Card>
          <CardContent className="flex flex-col gap-3 py-4">
            <h3 className="font-medium">Elegir menú de hoy</h3>
            <p className="text-muted-foreground text-xs">
              Hay más de un producto de Viandas disponible hoy -- elegí cuál le corresponde a
              cada plan.
            </p>
            <div className="flex flex-col gap-2">
              {pendientesEleccion.map(({ plan, candidatos }) => (
                <div
                  key={plan.id}
                  className="flex flex-col gap-2 rounded-md border p-2 sm:flex-row sm:items-center sm:justify-between"
                >
                  <span className="font-medium">{plan.clienteVentaNombre ?? 'Cliente'}</span>
                  <div className="flex flex-wrap gap-2">
                    {candidatos.map((c) => (
                      <Button
                        key={c.id}
                        size="sm"
                        variant="outline"
                        disabled={eligiendoPlanId === plan.id}
                        onClick={() => elegirMenuDeHoy(plan, c)}
                      >
                        {c.nombre}
                      </Button>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {mostrarForm && (
        <Card>
          <CardContent className="flex flex-col gap-3 py-4">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="cliente-venta">Cliente</Label>
                <Select value={clienteVentaId} onValueChange={setClienteVentaId}>
                  <SelectTrigger id="cliente-venta">
                    <SelectValue placeholder="Elegir cliente" />
                  </SelectTrigger>
                  <SelectContent>
                    {clientesVenta.map((c) => (
                      <SelectItem key={c.id} value={c.id}>
                        {c.nombre}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="cantidad-periodo">Viandas por período</Label>
                <Input
                  id="cantidad-periodo"
                  type="number"
                  min={1}
                  value={cantidadPeriodo}
                  onChange={(e) => setCantidadPeriodo(Number(e.target.value) || 1)}
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="periodo">Período</Label>
                <Select value={periodo} onValueChange={(v) => setPeriodo(v as PeriodoVianda)}>
                  <SelectTrigger id="periodo">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {(Object.keys(PERIODO_VIANDA_LABEL) as PeriodoVianda[]).map((p) => (
                      <SelectItem key={p} value={p}>
                        {PERIODO_VIANDA_LABEL[p]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="precio-abono">Precio del abono</Label>
                <Input
                  id="precio-abono"
                  type="number"
                  min={0}
                  value={precioAbono}
                  onChange={(e) => setPrecioAbono(Number(e.target.value) || 0)}
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="fecha-vencimiento">Vence el</Label>
                <Input
                  id="fecha-vencimiento"
                  type="date"
                  value={fechaVencimiento}
                  onChange={(e) => setFechaVencimiento(e.target.value)}
                />
              </div>
            </div>
            <div>
              <Button onClick={crearPlan} disabled={!clienteSeleccionado || !fechaVencimiento || precioAbono <= 0}>
                Crear plan
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      <div className="overflow-x-auto rounded-md border">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-left text-muted-foreground">
            <tr>
              <th className="px-3 py-2">Cliente</th>
              <th className="px-3 py-2">Plan</th>
              <th className="px-3 py-2 text-right">Abono</th>
              <th className="px-3 py-2">Vence</th>
              <th className="px-3 py-2">Estado</th>
            </tr>
          </thead>
          <tbody>
            {planesOrdenados.length === 0 ? (
              <tr>
                <td colSpan={5} className="text-muted-foreground px-3 py-6 text-center">
                  Todavía no hay planes de vianda cargados.
                </td>
              </tr>
            ) : (
              planesOrdenados.map((p) => {
                const dias = daysUntil(p.fechaVencimiento)
                const vencido = p.estado === 'activo' && dias < 0
                return (
                  <tr key={p.id} className="border-t">
                    <td className="px-3 py-2">
                      <Link to={p.id} className="font-medium hover:underline">
                        {p.clienteVentaNombre ?? 'Cliente'}
                      </Link>
                    </td>
                    <td className="px-3 py-2">
                      {p.cantidadPeriodo} viandas / {PERIODO_VIANDA_LABEL[p.periodo].toLowerCase()}
                    </td>
                    <td className="px-3 py-2 text-right">{formatARS(p.precioAbono)}</td>
                    <td className="px-3 py-2">
                      {formatFecha(p.fechaVencimiento)}
                      {vencido && <span className="ml-1.5 text-xs font-medium text-red-600">Vencido</span>}
                    </td>
                    <td className="px-3 py-2">
                      <span
                        className={
                          p.estado === 'activo'
                            ? 'rounded-full bg-green-100 px-2 py-0.5 text-xs font-medium text-green-800'
                            : 'rounded-full bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-600'
                        }
                      >
                        {ESTADO_PLAN_VIANDA_LABEL[p.estado]}
                      </span>
                    </td>
                  </tr>
                )
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function MetricaCard({ label, value, alerta }: { label: string; value: string; alerta?: boolean }) {
  return (
    <div className="rounded-lg border border-gray-200 p-4">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className={`text-lg font-semibold ${alerta ? 'text-amber-600' : 'text-gray-900'}`}>{value}</p>
    </div>
  )
}
