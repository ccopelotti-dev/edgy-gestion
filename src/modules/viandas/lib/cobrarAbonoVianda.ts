// ============================================================
// Cobro de abono de Vianda
// Edgy Gestión · Viandas (Fase 24d)
//
// Rediseño: antes esto generaba un Cobro "suelto" (sin Comprobante,
// imputaciones vacías) porque Viandas no facturaba nada -- desde la
// Fase 24b/24c cada entrega SÍ genera una Factura real en cta. cte.
// (ver generarEntregaVianda.ts + handleCambiarEstado en
// ventas/pages/Ordenes.tsx), así que el cobro del abono ahora tiene que
// imputarse contra esas facturas pendientes como un cobro clásico de
// cuenta corriente -- no puede seguir siendo un Cobro sin destino.
//
// Imputación FIFO: se ordenan las facturas pendientes de este plan por
// fecha (las entregas más viejas primero) y se les va aplicando el
// monto cobrado hasta agotarlo. Si el monto cobrado supera lo pendiente
// (ej. el cliente paga el abono completo antes de que se generen todas
// las entregas del período), el sobrante queda sin imputar -- reduce
// igual el saldo de cta. cte. del cliente (queda "a favor", mismo
// criterio que un Cobro de Ventas con imputaciones parciales).
//
// Se escribe directo contra Supabase, sin pasar por VentasProvider (no
// está montado en este módulo) -- mismo criterio cross-módulo que
// cerrarComandaComoVenta en comandas-cocina y crearOrdenParaEntregaVianda
// acá mismo. El número de cobro y la distribución de imputaciones
// espejan exactamente lo que hace ADD_COBRO en ventas/data/store.tsx.
// ============================================================

import { supabase } from '@/lib/supabase'
import { registrarMovimientoTesoreria } from '@/lib/tesoreriaSync'
import type { MedioPago } from '@/modules/ventas/types'
import type { PlanVianda } from '../types'
import { todayISO } from './format'

interface ComprobantePendiente {
  id: string
  total: number
  montoCobrado: number
  saldoPendiente: number
}

export async function cobrarAbonoVianda(
  plan: PlanVianda,
  clienteId: string,
  medioPago: MedioPago,
): Promise<boolean> {
  const monto = plan.precioAbono
  const fecha = todayISO()

  // 1) Facturas generadas por las entregas de este plan, todavía con
  // saldo pendiente, más viejas primero (FIFO).
  const { data: entregasDelPlan } = await supabase
    .from('entregas_vianda')
    .select('comprobante_id')
    .eq('plan_id', plan.id)
    .not('comprobante_id', 'is', null)

  const comprobanteIds = Array.from(
    new Set((entregasDelPlan ?? []).map((e: any) => e.comprobante_id as string)),
  )

  let pendientes: ComprobantePendiente[] = []
  if (comprobanteIds.length > 0) {
    const { data: comprobantes } = await supabase
      .from('comprobantes_venta')
      .select('id, total, monto_cobrado, saldo_pendiente, estado, fecha')
      .in('id', comprobanteIds)
      .neq('estado', 'anulado')
      .order('fecha', { ascending: true })

    pendientes = (comprobantes ?? [])
      .filter((c: any) => Number(c.saldo_pendiente) > 0.01)
      .map((c: any) => ({
        id: c.id,
        total: Number(c.total),
        montoCobrado: Number(c.monto_cobrado),
        saldoPendiente: Number(c.saldo_pendiente),
      }))
  }

  // 2) Distribuir el monto cobrado entre las facturas pendientes.
  let restante = monto
  const imputaciones: { comprobanteId: string; montoImputado: number }[] = []
  for (const c of pendientes) {
    if (restante <= 0.01) break
    const aImputar = Math.min(restante, c.saldoPendiente)
    if (aImputar <= 0) continue
    imputaciones.push({ comprobanteId: c.id, montoImputado: aImputar })
    restante -= aImputar
  }

  // 3) Numeración del cobro (mismo criterio de MAX(numero)+1 ya usado acá).
  const { data: ultimo } = await supabase
    .from('cobros')
    .select('numero')
    .eq('cliente_id', clienteId)
    .order('numero', { ascending: false })
    .limit(1)
  const numero = (ultimo?.[0]?.numero ?? 0) + 1

  const cobroId = crypto.randomUUID()

  const { error } = await supabase.from('cobros').insert({
    id: cobroId,
    cliente_id: clienteId,
    numero,
    cliente_venta_id: plan.clienteVentaId,
    fecha,
    monto,
    medio_pago: medioPago,
    notas: `Abono de vianda — plan del ${plan.fechaInicio} al ${plan.fechaVencimiento}`,
  })

  if (error) {
    console.error('Viandas · error registrando el cobro del abono:', error)
    return false
  }

  // 4) Imputaciones + actualización de cada factura afectada.
  if (imputaciones.length > 0) {
    const { error: errorImp } = await supabase.from('cobro_imputaciones').insert(
      imputaciones.map((imp) => ({
        id: crypto.randomUUID(),
        cobro_id: cobroId,
        comprobante_id: imp.comprobanteId,
        monto_imputado: imp.montoImputado,
      })),
    )
    if (errorImp) console.error('Viandas · error registrando imputaciones del cobro:', errorImp)

    for (const imp of imputaciones) {
      const c = pendientes.find((x) => x.id === imp.comprobanteId)
      if (!c) continue
      const nuevoMontoCobrado = c.montoCobrado + imp.montoImputado
      const nuevoSaldoPendiente = Math.max(0, c.total - nuevoMontoCobrado)
      // Misma tolerancia de 1 centavo que ADD_COBRO en ventas/data/store.tsx.
      const estado = nuevoSaldoPendiente <= 0.01 ? 'cobrado' : nuevoMontoCobrado > 0 ? 'cobrado_parcial' : 'emitido'
      await supabase
        .from('comprobantes_venta')
        .update({ monto_cobrado: nuevoMontoCobrado, saldo_pendiente: nuevoSaldoPendiente, estado })
        .eq('id', c.id)
    }
  }

  // 5) Saldo de cta. cte. del cliente -- se resta el monto total cobrado
  // (no solo lo imputado), mismo criterio que ADD_COBRO: si sobra, queda
  // a favor del cliente en vez de perderse.
  const { data: clienteVenta } = await supabase
    .from('clientes_venta')
    .select('saldo_cuenta_corriente')
    .eq('id', plan.clienteVentaId)
    .maybeSingle()
  if (clienteVenta) {
    const nuevoSaldo = Number((clienteVenta as any).saldo_cuenta_corriente) - monto
    await supabase
      .from('clientes_venta')
      .update({ saldo_cuenta_corriente: nuevoSaldo })
      .eq('id', plan.clienteVentaId)
  }

  // 6) Un cobro siempre representa dinero real entrando (salvo cuenta
  // corriente, que la UI ni siquiera ofrece acá -- ver Plan.tsx).
  // origenModulo acepta únicamente 'ventas' | 'compras' (distingue el
  // lado de la operación en Tesorería, no el módulo puntual) -- el
  // detalle de que es un abono de Viandas ya queda en `categoria`.
  if (medioPago !== 'cuenta_corriente') {
    await registrarMovimientoTesoreria({
      clienteId,
      tipo: 'ingreso',
      medioPago,
      monto,
      concepto: `Cobro N.º ${numero} — Abono de vianda`,
      categoria: 'Viandas',
      fecha,
      origenModulo: 'ventas',
    })
  }

  return true
}
