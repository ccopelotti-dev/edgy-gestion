// ============================================================
// Cliente frontend para las Netlify Functions de Cobro Online (Fase 12)
// Edgy Gestión · Configuración > Empresa
//
// Mismo patrón que arcaConfig.ts: fetch a /.netlify/functions/<nombre>
// con el access_token de la sesión actual en el header Authorization.
// Nunca se manda ni se lee el access_token/webhook_secret de Mercado
// Pago más que en el momento puntual de guardarlos --
// pago-estado-config.js jamás los devuelve.
//
// 'proveedor' ya viaja como parámetro (no hardcodeado) para poder
// sumar otros proveedores más adelante sin tocar este archivo --
// pedido explícito del usuario de dejar la factorización terminada.
// ============================================================

import { supabase } from '@/lib/supabase'

export type ProveedorPago = 'mercadopago'

export interface EstadoPago {
  configurado: boolean
  habilitado: boolean
  proveedor?: ProveedorPago
  modo?: 'test' | 'produccion'
  tieneAccessToken?: boolean
  tieneWebhookSecret?: boolean
}

export interface GuardarConfigPagoInput {
  clienteId: string
  proveedor: ProveedorPago
  modo: 'test' | 'produccion'
  habilitado: boolean
  accessToken?: string
  webhookSecret?: string
}

async function tokenSesion(): Promise<string> {
  const { data } = await supabase.auth.getSession()
  const token = data.session?.access_token
  if (!token) throw new Error('No hay sesión activa')
  return token
}

async function llamarFuncion<T>(nombre: string, body: object): Promise<T> {
  const token = await tokenSesion()
  const res = await fetch(`/.netlify/functions/${nombre}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify(body),
  })
  const resultado = await res.json()
  if (!res.ok || !resultado.ok) {
    throw new Error(resultado.error || `Error llamando a ${nombre}`)
  }
  return resultado as T
}

export async function obtenerEstadoPago(clienteId: string, proveedor: ProveedorPago = 'mercadopago'): Promise<EstadoPago> {
  return llamarFuncion<EstadoPago>('pago-estado-config', { clienteId, proveedor })
}

export async function guardarConfigPago(input: GuardarConfigPagoInput): Promise<void> {
  await llamarFuncion('pago-guardar-config', input)
}
