// ============================================================
// Cliente frontend para arca-autorizar-comprobante.js (Fase 11)
// Edgy Gestión · Módulo Ventas
// ============================================================

import { supabase } from '@/lib/supabase'
import type { DatosAfip } from '../types'

export interface ResultadoAutorizarArca {
  ok: boolean
  afip?: DatosAfip
  error?: string
  yaAutorizado?: boolean
}

/**
 * Pide a ARCA el CAE para un comprobante ya guardado (modoEmision =
 * 'electronica'). No lanza excepción ante un rechazo de ARCA (`ok:
 * false` con `error`) -- eso es un resultado de negocio válido (por
 * ejemplo, ARCA no habilitado todavía, o un rechazo real del
 * comprobante), no una falla técnica. Sí puede lanzar si no hay sesión
 * activa o la red falla.
 */
export async function autorizarComprobanteArca(
  clienteId: string,
  comprobanteId: string,
): Promise<ResultadoAutorizarArca> {
  const { data } = await supabase.auth.getSession()
  const token = data.session?.access_token
  if (!token) throw new Error('No hay sesión activa')

  const res = await fetch('/.netlify/functions/arca-autorizar-comprobante', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ clienteId, comprobanteId }),
  })
  return (await res.json()) as ResultadoAutorizarArca
}
