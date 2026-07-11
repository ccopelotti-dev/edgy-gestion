// ============================================================
// Llamar mozo -- Realtime
// Edgy Gestión · Mesas y Salón · Fase 13c (Mejoras de Salón)
//
// Primera vez que el repo usa Supabase Realtime (ver 0042_fase13_
// llamar_mozo.sql): el resto de los módulos vive de fetch-al-montar +
// fire-and-forget, pero un llamado a mozo necesita empujarse al panel
// de Salón apenas se crea -- no tiene sentido que el mozo tenga que
// refrescar la pantalla para enterarse.
//
// Dos orígenes (misma tabla, mismo canal): 'cliente' desde el Menú QR
// de su mesa (vía el RPC público crear_llamado_mozo_publico, ver
// src/pages/MenuPublico.tsx) y 'personal' insertado directo por staff
// autenticado (ver crearLlamadoPersonal, usado desde
// comandas-cocina/pages/Mesa.tsx).
// ============================================================

import { supabase } from '@/lib/supabase'

export interface LlamadoMozo {
  id: string
  mesaId: string
  mesaNumero?: number
  origen: 'cliente' | 'personal'
  motivo?: string
  estado: 'pendiente' | 'atendido'
  createdAt: string
}

function mapRow(r: any): LlamadoMozo {
  return {
    id: r.id,
    mesaId: r.mesa_id,
    mesaNumero: r.mesas?.numero ?? r.mesa_numero ?? undefined,
    origen: r.origen,
    motivo: r.motivo ?? undefined,
    estado: r.estado,
    createdAt: r.created_at,
  }
}

/** Llamados pendientes al momento de entrar al panel de Salón (antes de que arranque la suscripción). */
export async function listarLlamadosPendientes(clienteId: string): Promise<LlamadoMozo[]> {
  const { data, error } = await supabase
    .from('llamados_mozo')
    .select('id, mesa_id, origen, motivo, estado, created_at, mesas(numero)')
    .eq('cliente_id', clienteId)
    .eq('estado', 'pendiente')
    .order('created_at')

  if (error) {
    console.error('Llamar mozo · error listando pendientes:', error)
    return []
  }
  return (data ?? []).map(mapRow)
}

/**
 * Se suscribe a nuevos llamados de este cliente en tiempo real.
 * Devuelve una función para cancelar la suscripción (llamarla en el
 * cleanup del useEffect).
 */
export function suscribirLlamadosMozo(
  clienteId: string,
  onNuevoLlamado: (llamado: LlamadoMozo) => void,
): () => void {
  const channel = supabase
    .channel(`llamados-mozo-${clienteId}`)
    .on(
      'postgres_changes',
      {
        event: 'INSERT',
        schema: 'edgy_gestion',
        table: 'llamados_mozo',
        filter: `cliente_id=eq.${clienteId}`,
      },
      (payload: { new: any }) => onNuevoLlamado(mapRow(payload.new)),
    )
    .subscribe()

  return () => {
    supabase.removeChannel(channel)
  }
}

export async function marcarLlamadoAtendido(id: string): Promise<boolean> {
  const { error } = await supabase
    .from('llamados_mozo')
    .update({ estado: 'atendido', atendido_at: new Date().toISOString() })
    .eq('id', id)

  if (error) {
    console.error('Llamar mozo · error marcando atendido:', error)
    return false
  }
  return true
}

/** Alta desde el panel interno (staff), no desde el Menú QR del cliente. */
export async function crearLlamadoPersonal(clienteId: string, mesaId: string, motivo?: string): Promise<boolean> {
  const { error } = await supabase
    .from('llamados_mozo')
    .insert({ cliente_id: clienteId, mesa_id: mesaId, origen: 'personal', motivo: motivo || null })

  if (error) {
    console.error('Llamar mozo · error creando llamado interno:', error)
    return false
  }
  return true
}
