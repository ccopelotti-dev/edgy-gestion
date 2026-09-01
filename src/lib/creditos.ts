// ============================================================
// Créditos y Reintegros — Fase 67 (01/09, a pedido de Carlos)
// ============================================================
//
// Origen: promociones bancarias tipo "Promo Pampa" (reintegro % con
// tope, acreditado DESPUÉS en el resumen de la tarjeta -- no lo da el
// proveedor, así que nunca debe tocar el total del comprobante ni el
// costo del insumo/producto comprado, ver migración 0114).
//
// Vive en src/lib (no dentro de modules/compras) porque es un
// concepto COMPARTIDO: Carlos lo va a usar en Compras y también mucho
// en Home Keep (gastos personales) -- mismo criterio que
// imagenComprobanteAgente.ts, que ya es cruzado entre esos dos
// módulos.

import { supabase } from '@/lib/supabase';

export type ModuloCredito = 'compras' | 'home_keep';
export type EstadoCredito = 'pendiente' | 'acreditado' | 'perdido';

export interface CreditoPendiente {
  id: string;
  clienteId: string;
  modulo: ModuloCredito;
  /** Id de pagos_compra o pagos_hogar según `modulo` -- ver comentario
   * de la migración 0114 (referencia polimórfica, sin FK real). */
  pagoId: string;
  proveedorId?: string;
  concepto: string;
  montoEsperado: number;
  montoAcreditado?: number;
  fechaEsperada?: string;
  fechaAcreditacion?: string;
  estado: EstadoCredito;
  notas?: string;
  createdAt: string;
  updatedAt: string;
}

export interface NuevoCreditoPendiente {
  clienteId: string;
  modulo: ModuloCredito;
  pagoId: string;
  proveedorId?: string;
  concepto: string;
  montoEsperado: number;
  fechaEsperada?: string;
  notas?: string;
}

function fromDb(r: any): CreditoPendiente {
  return {
    id: r.id,
    clienteId: r.cliente_id,
    modulo: r.modulo,
    pagoId: r.pago_id,
    proveedorId: r.proveedor_id ?? undefined,
    concepto: r.concepto,
    montoEsperado: Number(r.monto_esperado),
    montoAcreditado: r.monto_acreditado != null ? Number(r.monto_acreditado) : undefined,
    fechaEsperada: r.fecha_esperada ?? undefined,
    fechaAcreditacion: r.fecha_acreditacion ?? undefined,
    estado: r.estado,
    notas: r.notas ?? undefined,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

/** Trae todos los créditos del cliente actual (Compras + Home Keep
 * mezclados -- el que llama filtra por `modulo` si solo quiere los
 * suyos, ver `listarCreditosPorModulo`). Pensado para la vista de
 * Tesorería "Créditos y Reintegros". */
export async function listarCreditosPendientes(clienteId: string): Promise<CreditoPendiente[]> {
  if (!clienteId) return [];
  const { data, error } = await supabase
    .from('creditos_pendientes')
    .select('*')
    .eq('cliente_id', clienteId)
    .order('fecha_esperada', { ascending: true, nullsFirst: false });

  if (error) {
    console.error('listarCreditosPendientes: error consultando creditos_pendientes', error);
    return [];
  }
  return (data ?? []).map(fromDb);
}

/** Créditos de un `pago_id` puntual -- para mostrar, dentro del propio
 * listado de Pagos de Compras/Home Keep, si ese pago ya tiene un
 * crédito cargado (evita duplicar el alta si el usuario reabre el
 * formulario). */
export async function listarCreditosPorPago(pagoId: string): Promise<CreditoPendiente[]> {
  if (!pagoId) return [];
  const { data, error } = await supabase.from('creditos_pendientes').select('*').eq('pago_id', pagoId);
  if (error) {
    console.error('listarCreditosPorPago: error consultando creditos_pendientes', error);
    return [];
  }
  return (data ?? []).map(fromDb);
}

/** Alta de un crédito esperado -- se llama al guardar un Pago (Compras
 * u Home Keep) cuando el usuario marcó que una línea de pago genera
 * reintegro. */
export async function crearCreditoPendiente(nuevo: NuevoCreditoPendiente): Promise<CreditoPendiente | null> {
  const { data, error } = await supabase
    .from('creditos_pendientes')
    .insert({
      cliente_id: nuevo.clienteId,
      modulo: nuevo.modulo,
      pago_id: nuevo.pagoId,
      proveedor_id: nuevo.proveedorId ?? null,
      concepto: nuevo.concepto,
      monto_esperado: nuevo.montoEsperado,
      fecha_esperada: nuevo.fechaEsperada ?? null,
      notas: nuevo.notas ?? null,
    })
    .select('*')
    .maybeSingle();

  if (error || !data) {
    console.error('crearCreditoPendiente: error insertando creditos_pendientes', error);
    return null;
  }
  return fromDb(data);
}

/** Confirma que el banco acreditó el reintegro -- desde la vista de
 * Tesorería. `montoAcreditado` puede diferir del esperado (el banco a
 * veces acredita de menos si hubo algún tope adicional no previsto). */
export async function marcarCreditoAcreditado(
  id: string,
  montoAcreditado: number,
  fechaAcreditacion: string,
): Promise<boolean> {
  const { error } = await supabase
    .from('creditos_pendientes')
    .update({ estado: 'acreditado', monto_acreditado: montoAcreditado, fecha_acreditacion: fechaAcreditacion })
    .eq('id', id);

  if (error) {
    console.error('marcarCreditoAcreditado: error actualizando creditos_pendientes', error);
    return false;
  }
  return true;
}

/** El banco nunca lo acreditó (venció el plazo, no cumplía la
 * condición, etc.) -- se deja registrado igual, no se borra, para no
 * perder el historial de que se esperaba y no llegó. */
export async function marcarCreditoPerdido(id: string, notas?: string): Promise<boolean> {
  const { error } = await supabase
    .from('creditos_pendientes')
    .update({ estado: 'perdido', notas: notas ?? undefined })
    .eq('id', id);

  if (error) {
    console.error('marcarCreditoPerdido: error actualizando creditos_pendientes', error);
    return false;
  }
  return true;
}

export async function eliminarCreditoPendiente(id: string): Promise<boolean> {
  const { error } = await supabase.from('creditos_pendientes').delete().eq('id', id);
  if (error) {
    console.error('eliminarCreditoPendiente: error borrando creditos_pendientes', error);
    return false;
  }
  return true;
}

export const ESTADO_CREDITO_LABEL: Record<EstadoCredito, string> = {
  pendiente: 'Pendiente',
  acreditado: 'Acreditado',
  perdido: 'Perdido',
};

export const MODULO_CREDITO_LABEL: Record<ModuloCredito, string> = {
  compras: 'Compras',
  home_keep: 'Home Keep',
};
