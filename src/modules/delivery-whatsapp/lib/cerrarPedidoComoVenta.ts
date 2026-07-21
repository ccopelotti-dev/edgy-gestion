// ============================================================
// Entrega de pedido de delivery -> Venta real
// Edgy Gestión · Ventas Online (antes "Delivery por WhatsApp")
//
// Al marcar un pedido como entregado (cobro confirmado) se genera el
// Comprobante real en Ventas (tipo 'factura', origenModulo:
// 'ventas-online', origenId: pedido.id) y se refleja el cobro en
// Tesorería vía registrarMovimientoTesoreria -- mismo patrón que
// cerrarComandaVenta.ts en comandas-cocina. Se escribe directo contra
// Supabase, sin pasar por VentasProvider ni TesoreriaProvider
// (ninguno está montado en este módulo).
//
// Los ítems del pedido pueden ser texto libre (llegan por WhatsApp, no
// siempre corresponden a productos reales del catálogo) o estar
// vinculados a un producto real del catálogo (Fase 6d del refactor de
// Productos, mismo selector que ya tiene Ventas desde la Fase 6c) --
// para los vinculados se usa el producto_id real en vez de null. La
// alícuota de IVA sigue siendo una única por defecto (IVA_DEFAULT) para
// todos los ítems -- mismo criterio que ya usa Ventas/PuntoDeVenta.tsx
// (config.ivaDefault aplicado parejo, no hay IVA por producto en
// ningún canal todavía).
//
// Fase 6d también agrega, después de generar el comprobante:
// - Descuento real de stock (descontarStockPorVenta, reusada de
//   Ventas) para los ítems vinculados al catálogo. La validación
//   bloqueante ("¿hay stock suficiente?") se hace ANTES desde
//   Pedido.tsx vía validarStockPedidoDelivery, mismo criterio que
//   Ventas (Fase 6c): un faltante de stock es un desvío operativo
//   humano, no un error del sistema, y bloquea la entrega.
// - Activación automática de garantía (activarGarantiasPorVenta,
//   reusada de Ventas) para los ítems vinculados a un producto con
//   plantilla de garantía asignada -- el teléfono de contacto es
//   obligatorio para cargar un ítem con garantía en Index.tsx, así que
//   acá siempre hay datos de contacto disponibles (pedido.clienteNombre
//   / pedido.telefono).
//
// El cliente de la venta es el cliente_venta_id del pedido si el
// operador eligió uno registrado, o Consumidor Final si no.
// ============================================================

import { supabase } from '@/lib/supabase'
import { registrarMovimientoTesoreria } from '@/lib/tesoreriaSync'
import { CONSUMIDOR_FINAL_ID, type MedioPago } from '@/modules/ventas/types'
import { descontarStockPorVenta, type LineaStock } from '@/modules/ventas/lib/descontarStockVenta'
import { activarGarantiasPorVenta, type LineaGarantia } from '@/modules/ventas/lib/activarGarantiasVenta'
import type { PedidoDelivery } from '../types'
import { todayISO } from './format'
import type { ProductoCatalogoDelivery } from './catalogoDelivery'

const IVA_DEFAULT = 21

export interface ErrorStockDelivery {
  nombre: string
  solicitado: number
  disponible: number
}

// Se llama ANTES de entregar -- bloquea la entrega si falta stock de
// algún ítem vinculado al catálogo. Mismo criterio y mismo mensaje que
// validarStockDisponible() en Ventas/PuntoDeVenta.tsx (Fase 6c).
export async function validarStockPedidoDelivery(pedido: PedidoDelivery): Promise<ErrorStockDelivery[]> {
  const pedidoAgrupado = new Map<
    string,
    { productoId: string; varianteId?: string; cantidad: number; nombre: string }
  >()
  for (const i of pedido.items) {
    if (!i.productoId) continue
    const key = `${i.productoId}::${i.varianteId ?? ''}`
    const prev = pedidoAgrupado.get(key)
    if (prev) prev.cantidad += i.cantidad
    else pedidoAgrupado.set(key, { productoId: i.productoId, varianteId: i.varianteId, cantidad: i.cantidad, nombre: i.descripcion })
  }

  const errores: ErrorStockDelivery[] = []
  for (const { productoId, varianteId, cantidad, nombre } of pedidoAgrupado.values()) {
    const { data: producto } = await supabase
      .from('productos')
      .select('stock, controla_stock')
      .eq('id', productoId)
      .maybeSingle()
    if (!producto || !producto.controla_stock) continue

    let disponible = Number(producto.stock)
    let etiqueta = nombre
    if (varianteId) {
      const { data: variante } = await supabase
        .from('producto_variantes')
        .select('stock, color, talle')
        .eq('id', varianteId)
        .maybeSingle()
      if (variante) {
        disponible = Number(variante.stock)
        const partes = [variante.color, variante.talle].filter(Boolean).join(' / ')
        if (partes) etiqueta = `${nombre} (${partes})`
      }
    }

    if (disponible < cantidad) {
      errores.push({ nombre: etiqueta, solicitado: cantidad, disponible })
    }
  }
  return errores
}

export async function cerrarPedidoComoVenta(
  pedido: PedidoDelivery,
  clienteId: string,
  medioPago: MedioPago,
  catalogoPorId: Map<string, ProductoCatalogoDelivery>,
): Promise<string | null> {
  if (pedido.items.length === 0) return null

  const items = pedido.items.map((i) => {
    const subtotal = i.cantidad * i.precioUnitario
    const montoIva = subtotal * (IVA_DEFAULT / 100)
    return {
      id: crypto.randomUUID(),
      producto_id: i.productoId ?? null,
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
    cliente_venta_id: pedido.clienteVentaId ?? null,
    orden_id: pedido.ordenVentaId,
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
    origen_modulo: 'ventas-online',
    origen_id: pedido.id,
  })

  if (errComprobante) {
    console.error('Ventas Online · error creando el comprobante de Ventas al entregar el pedido:', errComprobante)
    return null
  }

  const { error: errItems } = await supabase.from('comprobante_venta_items').insert(items)
  if (errItems) {
    console.error('Ventas Online · error cargando los ítems del comprobante al entregar el pedido:', errItems)
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

  // Descuento de stock (Fase 6d, mismo criterio que 6c en Ventas) --
  // fire-and-forget, ya se validó que había stock suficiente unos
  // instantes antes vía validarStockPedidoDelivery.
  const itemsCatalogo = pedido.items.filter((i) => i.productoId)
  if (itemsCatalogo.length > 0) {
    const lineasStock: LineaStock[] = itemsCatalogo.map((i) => ({
      productoId: i.productoId,
      varianteId: i.varianteId,
      cantidad: i.cantidad,
    }))
    descontarStockPorVenta(lineasStock, clienteId, numero, fecha).catch(() => {
      // eslint-disable-next-line no-console
      console.error('No se pudo descontar el stock del pedido de delivery', numero)
    })
  }

  // Activación de garantía (Fase 6d, mismo criterio que 6b en Ventas).
  const itemsConGarantia = itemsCatalogo.filter((i) => catalogoPorId.get(i.productoId!)?.plantillaGarantia)
  if (itemsConGarantia.length > 0) {
    const lineasGarantia: LineaGarantia[] = itemsConGarantia.map((i) => {
      const producto = catalogoPorId.get(i.productoId!)!
      const pg = producto.plantillaGarantia!
      return {
        productoId: i.productoId!,
        varianteId: i.varianteId,
        cantidad: i.cantidad,
        productoNombre: producto.nombre,
        plantillaGarantiaId: pg.id,
        nombrePlantilla: pg.nombre,
        duracionMeses: pg.duracionMeses,
        cobertura: pg.cobertura,
      }
    })
    activarGarantiasPorVenta(
      lineasGarantia,
      clienteId,
      numero,
      fecha,
      pedido.clienteNombre,
      pedido.telefono ?? '',
    ).catch(() => {
      // eslint-disable-next-line no-console
      console.error('No se pudo activar la garantía del pedido de delivery', numero)
    })
  }

  return comprobanteId
}
