import { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { ArrowLeft, Plus } from 'lucide-react'
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
import { useClienteActual } from '@/hooks/useClienteActual'
import { MEDIO_PAGO_LABEL, type MedioPago } from '@/modules/ventas/types'
import { usePlanVianda, useEntregasDePlan, useViandas } from '../data/store'
import { formatARS, formatFecha, daysUntil, todayISO } from '../lib/format'
import { PERIODO_VIANDA_LABEL, ESTADO_PLAN_VIANDA_LABEL } from '../types'
import { cobrarAbonoVianda } from '../lib/cobrarAbonoVianda'
import {
  obtenerProductosVianda,
  crearOrdenParaEntregaVianda,
  type ProductoViandaCandidato,
} from '../lib/generarEntregaVianda'

// Detalle de un plan: registrar entregas, cobrar el abono y cancelar.
// El cobro reutiliza el flujo de Cobro de Ventas (ver
// lib/cobrarAbonoVianda.ts) -- no hay Comprobante ni factura acá,
// mismo criterio de "no inventar un circuito de facturación nuevo"
// que ya charlamos para este módulo.
export default function Plan() {
  const { planId } = useParams<{ planId: string }>()
  const navigate = useNavigate()
  const { cliente } = useClienteActual()
  const { dispatch } = useViandas()
  const plan = usePlanVianda(planId ?? '')
  const entregas = useEntregasDePlan(planId ?? '')

  const [fechaEntrega, setFechaEntrega] = useState(todayISO())
  const [cantidadEntrega, setCantidadEntrega] = useState(1)
  const [productoId, setProductoId] = useState('')
  const [productos, setProductos] = useState<ProductoViandaCandidato[]>([])
  const [generando, setGenerando] = useState(false)
  const [medioPago, setMedioPago] = useState<MedioPago>('efectivo')
  const [cobrando, setCobrando] = useState(false)

  useEffect(() => {
    if (!cliente?.id) return
    obtenerProductosVianda(cliente.id).then(setProductos)
  }, [cliente?.id])

  if (!plan) {
    return (
      <div className="flex flex-col items-center gap-3 py-12 text-center">
        <p className="text-muted-foreground">No se encontró el plan.</p>
        <Button variant="outline" onClick={() => navigate('/m/viandas')}>
          <ArrowLeft className="mr-1.5 h-4 w-4" />
          Volver
        </Button>
      </div>
    )
  }

  const dias = daysUntil(plan.fechaVencimiento)
  const vencido = plan.estado === 'activo' && dias < 0

  async function agregarEntrega() {
    if (!plan || !cliente?.id || cantidadEntrega <= 0 || !productoId) return
    const producto = productos.find((p) => p.id === productoId)
    if (!producto) return

    setGenerando(true)
    const resultado = await crearOrdenParaEntregaVianda(
      cliente.id,
      plan,
      producto,
      fechaEntrega,
      cantidadEntrega,
    )
    setGenerando(false)

    if (!resultado) {
      window.alert('No se pudo generar la orden de la entrega. Revisá la consola e intentá de nuevo.')
      return
    }

    dispatch({
      type: 'AGREGAR_ENTREGA',
      payload: {
        planId: plan.id,
        fecha: fechaEntrega,
        cantidad: cantidadEntrega,
        productoId: producto.id,
        productoNombre: producto.nombre,
        precioUnitario: resultado.precioUnitario,
        ordenId: resultado.ordenId,
      },
    })
    setCantidadEntrega(1)
  }

  async function cobrarAbono() {
    if (!plan || !cliente?.id) return
    setCobrando(true)
    const ok = await cobrarAbonoVianda(plan, cliente.id, medioPago)
    if (!ok) {
      window.alert('No se pudo registrar el cobro. Revisá la consola e intentá de nuevo.')
    }
    setCobrando(false)
  }

  function cancelarPlan() {
    if (!plan) return
    if (!window.confirm('¿Cancelar este plan de vianda?')) return
    dispatch({ type: 'CANCELAR_PLAN', payload: { planId: plan.id } })
    navigate('/m/viandas')
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-start justify-between">
        <div>
          <Button variant="ghost" size="sm" onClick={() => navigate('/m/viandas')} className="mb-1 -ml-2">
            <ArrowLeft className="mr-1.5 h-4 w-4" />
            Viandas
          </Button>
          <h1 className="text-2xl font-bold tracking-tight">{plan.clienteVentaNombre ?? 'Cliente'}</h1>
          <p className="text-muted-foreground text-sm">
            {plan.cantidadPeriodo} viandas / {PERIODO_VIANDA_LABEL[plan.periodo].toLowerCase()} ·{' '}
            {formatARS(plan.precioAbono)}
          </p>
        </div>
        <div className="text-right">
          <span
            className={
              plan.estado === 'activo'
                ? 'rounded-full bg-green-100 px-3 py-1 text-xs font-medium text-green-800'
                : 'rounded-full bg-gray-100 px-3 py-1 text-xs font-medium text-gray-600'
            }
          >
            {ESTADO_PLAN_VIANDA_LABEL[plan.estado]}
          </span>
          <p className="text-muted-foreground mt-1 text-xs">
            Vence {formatFecha(plan.fechaVencimiento)}
            {vencido && <span className="ml-1 font-medium text-red-600">(vencido)</span>}
          </p>
        </div>
      </div>

      {plan.estado === 'activo' && (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <Card>
            <CardContent className="flex flex-col gap-3 py-4">
              <h3 className="font-medium">Registrar entrega</h3>
              <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="fecha-entrega">Fecha</Label>
                  <Input
                    id="fecha-entrega"
                    type="date"
                    value={fechaEntrega}
                    onChange={(e) => setFechaEntrega(e.target.value)}
                  />
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="cantidad-entrega">Cant.</Label>
                  <Input
                    id="cantidad-entrega"
                    type="number"
                    min={1}
                    value={cantidadEntrega}
                    onChange={(e) => setCantidadEntrega(Number(e.target.value) || 1)}
                    className="w-20"
                  />
                </div>
                <div className="flex flex-1 flex-col gap-1.5">
                  <Label htmlFor="producto-entrega">Producto</Label>
                  <Select value={productoId} onValueChange={setProductoId}>
                    <SelectTrigger id="producto-entrega">
                      <SelectValue placeholder="Elegir producto..." />
                    </SelectTrigger>
                    <SelectContent>
                      {productos.map((p) => (
                        <SelectItem key={p.id} value={p.id}>
                          {p.nombre}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <Button onClick={agregarEntrega} disabled={generando || !productoId}>
                  <Plus className="mr-1.5 h-4 w-4" />
                  {generando ? 'Generando…' : 'Agregar'}
                </Button>
              </div>
              {productos.length === 0 && (
                <p className="text-xs text-muted-foreground">
                  No hay productos en el rubro "Viandas" todavía -- creálos desde Productos y
                  Stock antes de registrar entregas.
                </p>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardContent className="flex flex-col gap-3 py-4">
              <h3 className="font-medium">Cobrar abono</h3>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="medio-pago">Medio de pago</Label>
                <Select value={medioPago} onValueChange={(v) => setMedioPago(v as MedioPago)}>
                  <SelectTrigger id="medio-pago">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {(Object.keys(MEDIO_PAGO_LABEL) as MedioPago[])
                      .filter((mp) => mp !== 'cuenta_corriente')
                      .map((mp) => (
                        <SelectItem key={mp} value={mp}>
                          {MEDIO_PAGO_LABEL[mp]}
                        </SelectItem>
                      ))}
                  </SelectContent>
                </Select>
              </div>
              <Button onClick={cobrarAbono} disabled={cobrando}>
                {cobrando ? 'Registrando…' : `Cobrar ${formatARS(plan.precioAbono)}`}
              </Button>
            </CardContent>
          </Card>
        </div>
      )}

      <div className="overflow-x-auto rounded-md border">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-left text-muted-foreground">
            <tr>
              <th className="px-3 py-2">Fecha</th>
              <th className="px-3 py-2 text-right">Cantidad</th>
              <th className="px-3 py-2">Producto</th>
              <th className="px-3 py-2 text-right">Precio</th>
              <th className="px-3 py-2">Facturación</th>
            </tr>
          </thead>
          <tbody>
            {entregas.length === 0 ? (
              <tr>
                <td colSpan={5} className="text-muted-foreground px-3 py-6 text-center">
                  Todavía no hay entregas registradas.
                </td>
              </tr>
            ) : (
              entregas.map((e) => (
                <tr key={e.id} className="border-t">
                  <td className="px-3 py-2">{formatFecha(e.fecha)}</td>
                  <td className="px-3 py-2 text-right">{e.cantidad}</td>
                  <td className="px-3 py-2">{e.productoNombre ?? '—'}</td>
                  <td className="px-3 py-2 text-right">{formatARS(e.precioUnitario * e.cantidad)}</td>
                  <td className="px-3 py-2">
                    {e.comprobanteId ? (
                      <span className="text-green-700">Facturada</span>
                    ) : (
                      <span className="text-muted-foreground">Pendiente</span>
                    )}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {plan.estado === 'activo' && (
        <div>
          <Button variant="outline" className="text-red-600" onClick={cancelarPlan}>
            Cancelar plan
          </Button>
        </div>
      )}
    </div>
  )
}
