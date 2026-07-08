// ============================================================
// Cierre de comanda -> Venta real
// Edgy Gestión · Comandas y cocina
//
// Al cerrar una comanda (cobro confirmado) se genera el Comprobante
// real en Ventas (tipo 'factura', origenModulo:'comandas-cocina',
// origenId: comanda.id) y se refleja el cobro en Tesorería vía
// registrarMovimientoTesoreria (mismo helper que usa Ventas/Compras).
// Se escribe directo contra Supabase, sin pasar por VentasProvider ni
// TesoreriaProvider (ninguno está montado en este módulo) — mismo
// criterio cross-módulo que actualizarEstadoMesa en data/store.tsx o
// useTurnoActivo.
//
// El cliente de la venta siempre es "Consumidor Final": una mesa no
// pide datos de facturación, igual que el Punto de Venta.
//
// El número de comprobante se resuelve acá con un MAX(numero)+1 contra
// comprobantes_venta (mismo criterio que usa VentasProvider en memoria
// al levantar su estado) porque no hay una secuencia de Postgres para
// esto — riesgo de carrera mínimo, aceptable, ya existente en el resto
// de la app.
// ============================================================

import { supabase } from '@/lib/supabase'
import { registrarMovimientoTesoreria } from '@/lib/tesoreriaSync'
import { CONSUMIDOR_FINAL_ID, type MedioPago } from '@/modules/ventas/types'
import type { Comanda } from '../types'
import { todayISO } from './format'

const IVA_DEFAULT = 21

export async function cerrarComandaComoVenta(
  comanda: Comanda,
  clienteId: string,
  medioPago: MedioPago,
): Promise<string | null> {
  if (comanda.items.length === 0) return null

  // El item de la comanda no guarda la alícuota de IVA (solo Productos
  // y Stock la conoce), así que se consulta por producto_id acá.
  const productoIds = comanda.items
    .map((i) => i.productoId)
    .filter((id): id is string => Boolean(id))

  const ivaPorProducto = new Map<string, number>()
  if (productoIds.length) {
    const { data } = await supabase.from('productos').select('id, iva').in('id', productoIds)
    for (const p of data ?? []) ivaPorProducto.set(p.id, Number(p.iva))
  }

  const items = comanda.items.map((i) => {
    const alicuota = (i.productoId && ivaPorProducto.get(i.productoId)) ?? IVA_DEFAULT
    const montoIva = i.subtotal * (alicuota / 100)
    return {
      id: crypto.randomUUID(),
      producto_id: i.productoId ?? null,
      descripcion: i.descripcion,
      cantidad: i.cantidad,
      precio_unitario: i.precioUnitario,
      descuento: 0,
      alicuota_iva: alicuota,
      subtotal: i.subtotal,
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
    cliente_venta_id: CONSUMIDOR_FINAL_ID,
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
    origen_modulo: 'comandas-cocina',
    origen_id: comanda.id,
  })

  if (errComprobante) {
    console.error('Comandas y cocina · error creando el comprobante de Ventas al cerrar la comanda:', errComprobante)
    return null
  }

  const { error: errItems } = await supabase.from('comprobante_venta_items').insert(items)
  if (errItems) {
    console.error('Comandas y cocina · error cargando los ítems del comprobante al cerrar la comanda:', errItems)
  }

  await registrarMovimientoTesoreria({
    clienteId,
    tipo: 'ingreso',
    medioPago,
    monto: total,
    concepto: `Factura N.º ${numero} — Consumidor Final (mesa)`,
    categoria: 'Ventas gastronómicas',
    fecha,
    origenModulo: 'ventas',
  })

  return comprobanteId
}
