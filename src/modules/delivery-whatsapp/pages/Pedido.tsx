import { useNavigate, useParams } from 'react-router-dom'
import { ArrowLeft, ClipboardList, ShieldCheck, QrCode } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { useClienteActual } from '@/hooks/useClienteActual'
import { EstadoOrdenBadge } from '@/modules/ventas/components/ventas/display'
import { usePedidoDelivery, useDeliveryWhatsapp } from '../data/store'
import { formatARS, formatFecha } from '../lib/format'
import { useCatalogoDelivery } from '../lib/catalogoDelivery'

// Detalle de un pedido: solo lectura + cancelar (mientras todavía no
// arrancó en Comandas). Fase 22b: el resto del ciclo -- iniciar
// preparación, terminado, facturar (con descuento de stock/activación
// de garantía si hay ítems vinculados al catálogo), entregado y
// despacho -- se gestiona desde Comandas (Ordenes.tsx) sobre esta
// misma orden, no acá. Este módulo solo capta el pedido y lo empuja a
// `ordenes_venta` como 'pendiente'.
//
// Fase 7b: si el pedido llegó solo desde el Menú QR (origen ===
// 'menu_qr'), se muestra la etiqueta acá también.
export default function Pedido() {
  const { pedidoId } = useParams<{ pedidoId: string }>()
  const navigate = useNavigate()
  const { cliente } = useClienteActual()
  const { dispatch } = useDeliveryWhatsapp()
  const pedido = usePedidoDelivery(pedidoId ?? '')
  const { porId: catalogoPorId } = useCatalogoDelivery(cliente?.id, cliente?.lista_precio_delivery_id)

  if (!pedido) {
    return (
      <div className="flex flex-col items-center gap-3 py-12 text-center">
        <p className="text-muted-foreground">No se encontró el pedido.</p>
        <Button variant="outline" onClick={() => navigate('/m/ventas-online')}>
          <ArrowLeft className="mr-1.5 h-4 w-4" />
          Volver
        </Button>
      </div>
    )
  }

  function cancelarPedido() {
    if (!pedido) return
    if (!window.confirm('¿Cancelar este pedido?')) return
    dispatch({ type: 'CANCELAR_PEDIDO', payload: { pedidoId: pedido.id } })
    navigate('/m/ventas-online')
  }

  // Cancelar solo tiene sentido antes de que arranque en Comandas --
  // mismo criterio que el botón Cancelar de Ordenes.tsx (gateado a
  // 'pendiente').
  const puedeCancelar = pedido.estado === 'pendiente'

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-start justify-between">
        <div>
          <Button variant="ghost" size="sm" onClick={() => navigate('/m/ventas-online')} className="mb-1 -ml-2">
            <ArrowLeft className="mr-1.5 h-4 w-4" />
            Ventas Online
          </Button>
          <h1 className="flex items-center gap-2 text-2xl font-bold tracking-tight">
            {pedido.clienteNombre}
            {pedido.origen === 'menu_qr' && (
              <span className="inline-flex items-center gap-1 rounded bg-indigo-50 px-1.5 py-0.5 text-xs font-medium text-indigo-700">
                <QrCode className="h-3 w-3" />
                Desde Menú QR
              </span>
            )}
          </h1>
          <p className="text-muted-foreground text-sm">
            {pedido.direccion}
            {pedido.telefono ? ` · ${pedido.telefono}` : ''}
          </p>
        </div>
        <div className="text-right">
          <EstadoOrdenBadge estado={pedido.estado} tipo="pedido" />
          <p className="text-muted-foreground mt-1 text-xs">{formatFecha(pedido.fecha)}</p>
        </div>
      </div>

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

      {/* Fase 22b: el ciclo (preparación, facturar, entregado, despacho)
          se gestiona desde Comandas -- acá solo queda la opción de
          cancelar mientras el pedido todavía no arrancó. */}
      <Card>
        <CardContent className="flex flex-col gap-3 py-4">
          <p className="text-muted-foreground flex items-center gap-2 text-sm">
            <ClipboardList className="h-4 w-4" />
            Este pedido ya es una comanda -- gestioná preparación, facturación y despacho desde
            Comandas.
          </p>
          <Button variant="outline" onClick={() => navigate('/m/ventas/ordenes')} className="w-fit">
            Ir a Comandas
          </Button>
          {puedeCancelar && (
            <Button variant="outline" className="w-fit text-red-600" onClick={cancelarPedido}>
              Cancelar pedido
            </Button>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
