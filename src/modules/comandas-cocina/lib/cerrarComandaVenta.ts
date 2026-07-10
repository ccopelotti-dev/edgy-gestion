// ============================================================
// Cierre de comanda -> Venta real
// Edgy Gestión · Comandas y cocina · Fase 7a (auditoría de conexiones
// Ventas↔Productos)
//
// Al cerrar una comanda (cobro confirmado) se genera el Comprobante
// real en Ventas (tipo 'factura', origenModulo:'comandas-cocina',
// origenId: comanda.id). Se escribe directo contra Supabase, sin pasar
// por VentasProvider ni TesoreriaProvider (ninguno está montado en este
// módulo) — mismo criterio cross-módulo que actualizarEstadoMesa en
// data/store.tsx o useTurnoActivo.
//
// El cliente de la venta es el cliente_venta_id de la comanda si el
// mozo eligió uno registrado (Fase 7a), o "Consumidor Final" si no --
// mismo criterio que Delivery.
//
// Medio de pago: "cuenta_corriente" es ahora una opción real (antes se
// filtraba del selector). Si es cuenta corriente, el comprobante queda
// 'emitido' con saldo pendiente -- no se genera recibo ni movimiento de
// caja, se cobra más adelante desde Ventas → Cobranzas, mismo criterio
// que el resto de la app. Si es cualquier otro medio (de contado), el
// comprobante queda 'cobrado' y además se genera un recibo real (fila
// en `cobros` + `cobro_imputaciones`, mismo mecanismo que ya usa
// Ventas/PuntoDeVenta.tsx al cobrar en efectivo) con el medio de pago
// elegido, y se refleja el movimiento en Tesorería.
//
// Fase 7a también agrega, después de generar el comprobante:
// - Validación de stock BLOQUEANTE (validarStockComanda, se llama ANTES
//   desde Mesa.tsx) y descuento real de stock (descontarStockPorVenta,
//   reusada de Ventas) para los ítems vinculados al catálogo -- mismo
//   criterio que Ventas (6c) y Delivery (6d): un faltante de stock es
//   un desvío operativo humano, no un error del sistema.
// - Activación automática de garantía (activarGarantiasPorVenta,
//   reusada de Ventas) para los ítems vinculados a un producto con
//   plantilla de garantía asignada -- el nombre/teléfono de contacto
//   los resuelve Mesa.tsx (del cliente registrado, o del mini-
//   formulario que pide cuando hace falta) y llegan acá ya resueltos.
// ============================================================

import { supabase } from '@/lib/supabase'
import { registrarMovimientoTesoreria } from '@/lib/tesoreriaSync'
import { CONSUMIDOR_FINAL_ID, type MedioPago } from '@/modules/ventas/types'
import { descontarStockPorVenta, type LineaStock } from '@/modules/ventas/lib/descontarStockVenta'
import { activarGarantiasPorVenta, type LineaGarantia } from '@/modules/ventas/lib/activarGarantiasVenta'
import type { Comanda } from '../types'
import { todayISO } from './format'
import type { ProductoCatalogoComanda } from './catalogoComandas'

const IVA_DEFAULT = 21

export interface ErrorStockComanda {
  nombre: string
  solicitado: number
  disponible: number
}

// Se llama ANTES de cerrar -- bloquea el cierre si falta stock de algún
// ítem vinculado al catálogo. Mismo criterio y mismo mensaje que
// validarStockDisponible() en Ventas/PuntoDeVenta.tsx (Fase 6c).
export async function validarStockComanda(comanda: Comanda): Promise<ErrorStockComanda[]> {
  const pedido = new Map<string, { productoId: string; cantidad: number; nombre: string }>()
  for (const i of comanda.items) {
    if (!i.productoId) continue
    const prev = pedido.get(i.productoId)
    if (prev) prev.cantidad += i.cantidad
    else pedido.set(i.productoId, { productoId: i.productoId, cantidad: i.cantidad, nombre: i.descripcion })
  }

  const errores: ErrorStockComanda[] = []
  for (const { productoId, cantidad, nombre } of pedido.values()) {
    const { data: producto } = await supabase
      .from('productos')
      .select('stock, controla_stock')
      .eq('id', productoId)
      .maybeSingle()
    if (!producto || !producto.controla_stock) continue

    const disponible = Number(producto.stock)
    if (disponible < cantidad) {
      errores.push({ nombre, solicitado: cantidad, disponible })
    }
  }
  return errores
}

export async function cerrarComandaComoVenta(
  comanda: Comanda,
  clienteId: string,
  medioPago: MedioPago,
  catalogoPorId: Map<string, ProductoCatalogoComanda>,
  contactoNombre: string,
  contactoTelefono: string,
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
    const alicuota = i.productoId ? (ivaPorProducto.get(i.productoId) ?? IVA_DEFAULT) : IVA_DEFAULT
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
  const clienteVentaId = comanda.clienteVentaId ?? CONSUMIDOR_FINAL_ID

  // Fase 7a: cuenta corriente es ahora un medio de pago real -- si se
  // elige, el comprobante queda emitido con saldo pendiente (se cobra
  // después desde Cobranzas). Cualquier otro medio se trata como pago
  // de contado -- mismo criterio que el resto de la app.
  const esContado = medioPago !== 'cuenta_corriente'

  const { error: errComprobante } = await supabase.from('comprobantes_venta').insert({
    id: comprobanteId,
    cliente_id: clienteId,
    tipo: 'factura',
    modo_emision: 'interno',
    numero,
    cliente_venta_id: clienteVentaId,
    orden_id: null,
    fecha,
    subtotal,
    descuento_general: 0,
    monto_iva: montoIvaTotal,
    total,
    estado: esContado ? 'cobrado' : 'emitido',
    medio_pago: medioPago,
    monto_cobrado: esContado ? total : 0,
    saldo_pendiente: esContado ? 0 : total,
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

  if (esContado) {
    // Recibo real (Fase 7a): mismo mecanismo que usa Ventas/Cobranzas --
    // una fila en `cobros` con el medio de pago elegido, imputada por
    // completo a este comprobante.
    const { data: ultimoCobro } = await supabase
      .from('cobros')
      .select('numero')
      .eq('cliente_id', clienteId)
      .order('numero', { ascending: false })
      .limit(1)
    const numeroCobro = (ultimoCobro?.[0]?.numero ?? 0) + 1
    const cobroId = crypto.randomUUID()

    const { error: errCobro } = await supabase.from('cobros').insert({
      id: cobroId,
      cliente_id: clienteId,
      numero: numeroCobro,
      cliente_venta_id: clienteVentaId,
      fecha,
      monto: total,
      medio_pago: medioPago,
      notas: `Recibo — Factura N.º ${numero} (mesa)`,
    })
    if (errCobro) {
      console.error('Comandas y cocina · error generando el recibo al cerrar la comanda:', errCobro)
    } else {
      const { error: errImputacion } = await supabase.from('cobro_imputaciones').insert({
        id: crypto.randomUUID(),
        cobro_id: cobroId,
        comprobante_id: comprobanteId,
        monto_imputado: total,
      })
      if (errImputacion) {
        console.error('Comandas y cocina · error imputando el recibo al comprobante:', errImputacion)
      }
    }

    await registrarMovimientoTesoreria({
      clienteId,
      tipo: 'ingreso',
      medioPago,
      monto: total,
      concepto: `Factura N.º ${numero} — ${comanda.clienteVentaNombre ?? 'Consumidor Final'} (mesa)`,
      categoria: 'Ventas gastronómicas',
      fecha,
      origenModulo: 'ventas',
    })
  }
  // Si es cuenta corriente, no se genera recibo ni movimiento de caja --
  // queda como saldo pendiente del cliente, a cobrar después.

  // Descuento de stock (Fase 7a, mismo criterio que 6c en Ventas) --
  // fire-and-forget, ya se validó que había stock suficiente unos
  // instantes antes vía validarStockComanda.
  const itemsCatalogo = comanda.items.filter((i) => i.productoId)
  if (itemsCatalogo.length > 0) {
    const lineasStock: LineaStock[] = itemsCatalogo.map((i) => ({
      productoId: i.productoId,
      cantidad: i.cantidad,
    }))
    descontarStockPorVenta(lineasStock, clienteId, numero, fecha).catch(() => {
      // eslint-disable-next-line no-console
      console.error('No se pudo descontar el stock de la comanda', numero)
    })
  }

  // Activación de garantía (Fase 7a, mismo criterio que 6b en Ventas).
  const itemsConGarantia = itemsCatalogo.filter((i) => catalogoPorId.get(i.productoId!)?.plantillaGarantia)
  if (itemsConGarantia.length > 0) {
    const lineasGarantia: LineaGarantia[] = itemsConGarantia.map((i) => {
      const producto = catalogoPorId.get(i.productoId!)!
      const pg = producto.plantillaGarantia!
      return {
        productoId: i.productoId!,
        cantidad: i.cantidad,
        productoNombre: producto.nombre,
        plantillaGarantiaId: pg.id,
        nombrePlantilla: pg.nombre,
        duracionMeses: pg.duracionMeses,
        cobertura: pg.cobertura,
      }
    })
    activarGarantiasPorVenta(lineasGarantia, clienteId, numero, fecha, contactoNombre, contactoTelefono).catch(() => {
      // eslint-disable-next-line no-console
      console.error('No se pudo activar la garantía de la comanda', numero)
    })
  }

  return comprobanteId
}
