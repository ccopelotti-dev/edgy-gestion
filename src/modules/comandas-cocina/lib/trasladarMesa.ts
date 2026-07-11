// ============================================================
// Traslado de una comanda de salón a otra mesa
// Edgy Gestión · Comandas y cocina · Fase 13a (Mejoras de Salón)
//
// Se persiste con el RPC `trasladar_comanda` (ver
// 0040_fase13_traslado_mesas.sql): en una sola transacción libera la
// mesa origen, ocupa la mesa destino y repunta comanda.mesa_id --
// mismo criterio que crear_orden_venta_publica (0036), para no dejar
// el traslado a mitad de camino si falla algo entre medio.
//
// El llamador (Mesa.tsx) debe esperar `ok:true` ANTES de despachar
// TRASLADAR_COMANDA al store local -- mismo patrón que
// cerrarComandaComoVenta con el comprobanteId ya resuelto.
// ============================================================

import { supabase } from '@/lib/supabase'

export interface MesaLibre {
  id: string
  numero: number
  sectorNombre: string
}

/** Mesas libres del cliente actual, para elegir destino del traslado. */
export async function listarMesasLibres(mesaOrigenId: string): Promise<MesaLibre[]> {
  const { data, error } = await supabase
    .from('mesas')
    .select('id, numero, sectores(nombre)')
    .eq('estado', 'libre')
    .neq('id', mesaOrigenId)
    .order('numero')

  if (error) {
    console.error('Traslado de mesa · error listando mesas libres:', error)
    return []
  }

  return (data ?? []).map((r: any) => ({
    id: r.id,
    numero: r.numero,
    sectorNombre: r.sectores?.nombre ?? '',
  }))
}

export interface ResultadoTraslado {
  ok: boolean
  error?: string
}

export async function trasladarComanda(comandaId: string, mesaDestinoId: string): Promise<ResultadoTraslado> {
  const { error } = await supabase.rpc('trasladar_comanda', {
    p_comanda_id: comandaId,
    p_mesa_destino_id: mesaDestinoId,
  })

  if (error) {
    console.error('Traslado de mesa · error en trasladar_comanda:', error)
    return { ok: false, error: error.message || 'No se pudo trasladar la comanda de salón.' }
  }

  return { ok: true }
}
