// ============================================================
// Cobro de abono de Vianda
// Edgy Gestión · Viandas
//
// Reutiliza el flujo de Cobro de Ventas (tabla `cobros`, sin
// comprobante asociado -- imputaciones vacías) en vez de inventar un
// circuito de facturación nuevo, mismo criterio decidido para todo el
// pack gastronómico. Se escribe directo contra Supabase, sin pasar
// por VentasProvider (no está montado en este módulo) -- mismo
// criterio cross-módulo que cerrarComandaComoVenta en comandas-cocina.
//
// El número de cobro se resuelve acá con un MAX(numero)+1 contra
// `cobros` (mismo criterio que usa VentasProvider en memoria al
// levantar su estado) porque no hay una secuencia de Postgres para
// esto — riesgo de carrera mínimo, aceptable, ya existente en el resto
// de la app.
// ============================================================

import { supabase } from '@/lib/supabase'
import { registrarMovimientoTesoreria } from '@/lib/tesoreriaSync'
import type { MedioPago } from '@/modules/ventas/types'
import type { PlanVianda } from '../types'
import { todayISO } from './format'

export async function cobrarAbonoVianda(
  plan: PlanVianda,
  clienteId: string,
  medioPago: MedioPago,
): Promise<boolean> {
  const { data: ultimo } = await supabase
    .from('cobros')
    .select('numero')
    .eq('cliente_id', clienteId)
    .order('numero', { ascending: false })
    .limit(1)
  const numero = (ultimo?.[0]?.numero ?? 0) + 1

  const fecha = todayISO()

  const { error } = await supabase.from('cobros').insert({
    id: crypto.randomUUID(),
    cliente_id: clienteId,
    numero,
    cliente_venta_id: plan.clienteVentaId,
    fecha,
    monto: plan.precioAbono,
    medio_pago: medioPago,
    notas: `Abono de vianda — plan del ${plan.fechaInicio} al ${plan.fechaVencimiento}`,
  })

  if (error) {
    console.error('Viandas · error registrando el cobro del abono:', error)
    return false
  }

  // Un cobro siempre representa dinero real entrando (salvo cuenta
  // corriente, que la UI ni siquiera ofrece acá -- ver Plan.tsx).
  if (medioPago !== 'cuenta_corriente') {
    await registrarMovimientoTesoreria({
      clienteId,
      tipo: 'ingreso',
      medioPago,
      monto: plan.precioAbono,
      concepto: `Cobro N.º ${numero} — Abono de vianda`,
      categoria: 'Viandas',
      fecha,
      origenModulo: 'ventas',
    })
  }

  return true
}
