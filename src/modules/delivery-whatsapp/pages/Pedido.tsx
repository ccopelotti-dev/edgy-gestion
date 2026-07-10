import { useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { ArrowLeft, Truck, CheckCircle2, AlertTriangle, ShieldCheck } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Label } from '@/components/ui/label'
import { useClienteActual } from '@/hooks/useClienteActual'
import { MEDIO_PAGO_LABEL, type MedioPago } from '@/modules/ventas/types'
import { usePedidoDelivery, useDeliveryWhatsapp } from '../data/store'
import { formatARS, formatFecha } from '../lib/format'
import { ESTADO_PEDIDO_DELIVERY_LABEL } from '../types'
import {
  cerrarPedidoComoVenta,
  validarStockPedidoDelivery,
  type ErrorStockDelivery,
} from '../lib/cerrarPedidoComoVenta'
import { useCatalogoDelivery } from '../lib/catalogoDelivery'

// Detalle de un pedido: marcar en camino, entregar (cobrando -- acá
// se genera la Venta real) y cancelar. Mismo criterio de reutilizar
// el flujo de Ventas/Tesorería que ya usamos en Viandas y en el cierre
// de comandas -- no se inventa un circuito de facturación nuevo.
//
// Fase 6d del refactor de Productos: si algún ítem del pedido está
// vinculado a un producto real del catálogo (cargado en Index.tsx), al
// entregar se valida stock (bloqueante, mismo criterio que Ventas 6c)
// y se descuenta stock + activa garantía (mismo criterio que Ventas 6b)
// automáticamente.
export default function Pedido() {
  const { pedidoId } = useParams<{ pedidoId: string }>()
  const navigate = useNavigate()
  const { cliente } = useClienteActual()
  const { dispatch } = useDeliveryWhatsapp()
  const pedido = usePedidoDelivery(pedidoId ?? '')
  const { porId: catalogoPorId } = useCatalogoDelivery(cliente?.id, cliente?.lista_precio_delivery_id)

  const [medioPago, setMedioPago] = useState<MedioPago>('efectivo')
  const [entregando, setEntregando] = useState(false)
  const [erroresStock, setErroresStock] = useState<ErrorStockDelivery[] | null>(null)

  if (!pedido) {
    return (
      <div className="flex flex-col items-center gap-3 py-12 text-center">
        <p className="text-muted-foreground">No se encontró el pedido.</p>
        <Button variant="outline" onClick={() => navigate('/m/delivery-whatsapp')}>
          <ArrowLeft className="mr-1.5 h-4 w-4" />
          Volver
        </Button>
      </div>
    )
  }

  function marcarEnCamino() {
    if (!pedido) return
    dispatch({ type: 'MARCAR_EN_CAMINO', payload: { pedidoId: pedido.id } })
  }

  async function marcarEntregado() {
    if (!pedido || !cliente?.id) return
    setEntregando(true)
    setErroresStock(null)

    const itemsCatalogo = pedido.items.filter((i) => i.productoId)
    if (itemsCatalogo.length > 0) {
      const errores = await validarStockPedidoDelivery(pedido)
      if (errores.length > 0) {
        setErroresStock(errores)
        setEntregando(false)
        return
      }
    }

    const comprobanteId = await cerrarPedidoComoVenta(pedido, cliente.id, medioPago, catalogoPorId)
    if (!comprobanteId) {
      window.alert('No se pudo registrar la venta. Revisá la consola e intentá de nuevo.')
      setEntregando(false)
      return
    }
    dispatch({
      type: 'MARCAR_ENTREGADO',
      payload: { pedidoId: pedido.id, medioPago, comprobanteId },
    })
    setEntregando(false)
  }

  function cancelarPedido() {
    if (!pedido) return
    if (!window.confirm('¿Cancelar este pedido?')) return
    dispatch({ type: 'CANCELAR_PEDIDO', payload: { pedidoId: pedido.id } })
    navigate('/m/delivery-whatsapp')
  }

  const activo = pedido.estado === 'pendiente' || pedido.estado === 'en_camino'

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-start justify-between">
        <div>
          <Button variant="ghost" size="sm" onClick={() => navigate('/m/delivery-whatsapp')} className="mb-1 -ml-2">
            <ArrowLeft className="mr-1.5 h-4 w-4" />
            Delivery
          </Button>
          <h1 className="text-2xl font-bold tracking-tight">{pedido.clienteNombre}</h1>
          <p className="text-muted-foreground text-sm">
            {pedido.direccion}
            {pedido.telefono ? ` · ${pedido.telefono}` : ''}
          </p>
        </div>
        <div className="text-right">
          <span
            className={
              pedido.estado === 'entregado'
                ? 'rounded-full bg-green-100 px-3 py-1 text-xs font-medium text-green-800'
                : pedido.estado === 'en_camino'
                  ? 'rounded-full bg-blue-100 px-3 py-1 text-xs font-medium text-blue-800'
                  : pedido.estado === 'cancelado'
                    ? 'rounded-full bg-gray-100 px-3 py-1 text-xs font-medium text-gray-600'
                    : 'rounded-full bg-yellow-100 px-3 py-1 text-xs font-medium text-yellow-800'
            }
          >
            {ESTADO_PEDIDO_DELIVERY_LABEL[pedido.estado]}
          </span>
          <p className="text-muted-foreground mt-1 text-xs">{formatFecha(pedido.fecha)}</p>
        </div>
      </div>

      {/* Bloqueo por stock insuficiente -- Fase 6d, mismo criterio que
          Ventas (Fase 6c): un faltante de stock es un desvío operativo
          humano, no un error del sistema, y bloquea la entrega hasta
          que se corrija el stock a mano en Productos. */}
      {erroresStock && erroresStock.length > 0 && (
        <div className="rounded-lg border-2 border-red-300 bg-red-50 px-4 py-3">
          <div className="flex items-center gap-2 text-sm font-bold text-red-800">
            <AlertTriangle className="h-5 w-5" />
            No se pudo entregar: stock insuficiente
          </div>
          <ul className="mt-2 space-y-1 text-sm text-red-800">
            {erroresStock.map((e, i) => (
              <li key={i}>
                <span className="font-semibold">{e.nombre}</span>: pedido {e.solicitado}, disponible{' '}
                {e.disponible}
              </li>
            ))}
          </ul>
          <p className="mt-2 text-xs font-medium text-red-700">
            Esto refleja un desvío en el control de stock, no un error del sistema. Corregí el
            stock manualmente en Productos antes de volver a intentar entregar.
          </p>
        </div>
      )}

      <Card>
        <CardContent className="flex flex-col gap-2 py-4">
          <h3 className="font-medium">Ítems</h3>
          {pedido.items.map((item, idx) => {
            const producto = item.productoId ? catalogoPorId.get(item.productoId) : undefined
            return (
              <div key={idx} className="flex items-center justify-between text-sm">
                <span className="flex items-center gap-1.5">
                  {item.cantidad} × {item.descripcion}
                  {producto?.plantillaGarantia && (
                    <ShieldCheck className="h-3.5 w-3.5 text-emerald-600" />
                  )}
                </span>
                <span>{formatARS(item.cantidad * item.precioUnitario)}</span>
              </div>
            )
          })}
          <div className="mt-2 flex items-center justify-between border-t pt-2 font-semibold">
            <span>Total</span>
            <span>{formatARS(pedido.total)}</span>
          </div>
          {pedido.notas && (
            <p className="text-muted-foreground mt-1 text-xs">Notas: {pedido.notas}</p>
          )}
        </CardContent>
      </Card>

      {activo && (
        <Card>
          <CardContent className="flex flex-col gap-4 py-4">
            {pedido.estado === 'pendiente' && (
              <Button onClick={marcarEnCamino} variant="outline">
                <Truck className="mr-1.5 h-4 w-4" />
                Marcar en camino
              </Button>
            )}

            <div className="flex flex-col gap-1.5">
              <Label htmlFor="medio-pago">Medio de pago (al entregar)</Label>
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
            <Button onClick={marcarEntregado} disabled={entregando}>
              <CheckCircle2 className="mr-1.5 h-4 w-4" />
              {entregando ? 'Registrando…' : `Entregar y cobrar ${formatARS(pedido.total)}`}
            </Button>

            <Button variant="outline" className="text-red-600" onClick={cancelarPedido}>
              Cancelar pedido
            </Button>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
