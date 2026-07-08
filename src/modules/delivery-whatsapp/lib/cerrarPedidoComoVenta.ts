// ============================================================
// Entrega de pedido de delivery -> Venta real
// Edgy Gestión · Delivery por WhatsApp
//
// Al marcar un pedido como entregado (cobro confirmado) se genera el
// Comprobante real en Ventas (tipo 'factura', origenModulo:
// 'delivery-whatsapp', origenId: pedido.id) y se refleja el cobro en
// Tesorería vía registrarMovimientoTesoreria -- mismo patrón que
// cerrarComandaVenta.ts en comandas-cocina. Se escribe directo contra
// Supabase, sin pasar por VentasProvider ni TesoreriaProvider
// (ninguno está montado en este módulo).
//
// Los ítems del pedido son texto libre (llegan por WhatsApp, no
// siempre corresponden a productos reales del catálogo), así que acá
// no hay forma de resolver la alícuota de IVA por producto como hace
// Comandas -- se usa una alícuota por defecto (21%) para todos los
// ítems.
//
// El cliente de la venta es el cliente_venta_id del pedido si el
// operador eligió uno registrado, o Consumidor Final si no.
// ============================================================

import { supabase } from '@/lib/supabase'
import { registrarMovimientoTesoreria } from '@/lib/tesoreriaSync'
import { CONSUMIDOR_FINAL_ID, type MedioPago } from '@/modules/ventas/types'
import type { PedidoDelivery } from '../types'
import { todayISO } from './format'

const IVA_DEFAULT = 21

export async function cerrarPedidoComoVenta(
  pedido: PedidoDelivery,
  clienteId: string,
  medioPago: MedioPago,
): Promise<string | null> {
  if (pedido.items.length === 0) return null

  const items = pedido.items.map((i) => {
    const subtotal = i.cantidad * i.precioUnitario
    const montoIva = subtotal * (IVA_DEFAULT / 100)
    return {
      id: crypto.randomUUID(),
      producto_id: null,
      descripcion: i.descripcion,
      cantidad: i.cantidad,
      precio_unitario: i.precioUnitario,
      descuento: 0,
      alicuota_iva: IVA_DEFAULT,
      subtotal,
      monto_iva: montoIva,
    }
  })

  const subtotal = items.reduce((sum, i) => sum + i.subtotal, 0)
  const montoIvaTotal = items.reduce((sum, i) => sum + i.monto_iva, 0)
  const total = subtotal + montoIvaTotal

  const { data: ultimo } = await supabase
    .from('comprobantes_venta')
    .select('numero')
    .eq('cliente_id', clienteId)
    .eq('tipo', 'factura')
    .order('numero', { ascending: false })
    .limit(1)
  const numero = (ultimo?.[0]?.numero ?? 0) + 1

  const comprobanteId = crypto.randomUUID()
  const fecha = todayISO()

  const { error: errComprobante } = await supabase.from('comprobantes_venta').insert({
    id: comprobanteId,
    cliente_id: clienteId,
    tipo: 'factura',
    modo_emision: 'interno',
    numero,
    cliente_venta_id: pedido.clienteVentaId ?? CONSUMIDOR_FINAL_ID,
    orden_id: null,
    fecha,
    subtotal,
    descuento_general: 0,
    monto_iva: montoIvaTotal,
    total,
    estado: 'cobrado',
    medio_pago: medioPago,
    monto_cobrado: total,
    saldo_pendiente: 0,
    afip: null,
    notas: null,
    origen_modulo: 'delivery-whatsapp',
    origen_id: pedido.id,
  })

  if (errComprobante) {
    console.error('Delivery WhatsApp · error creando el comprobante de Ventas al entregar el pedido:', errComprobante)
    return null
  }

  const { error: errItems } = await supabase.from('comprobante_venta_items').insert(items)
  if (errItems) {
    console.error('Delivery WhatsApp · error cargando los ítems del comprobante al entregar el pedido:', errItems)
  }

  await registrarMovimientoTesoreria({
    clienteId,
    tipo: 'ingreso',
    medioPago,
    monto: total,
    concepto: `Factura N.º ${numero} — Delivery (${pedido.clienteNombre})`,
    categoria: 'Ventas gastronómicas',
    fecha,
    origenModulo: 'ventas',
  })

  return comprobanteId
}
