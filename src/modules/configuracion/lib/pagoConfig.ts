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

// Fase 12b: Talo se suma como segundo proveedor (transferencias
// bancarias, docs.talo.com.ar) sobre la misma arquitectura factorizada.
// Fase 12d: Getnet se suma como tercero (Get Checkout, cobro online --
// docs.globalgetnet.com; la terminal física de Getnet queda afuera).
export type ProveedorPago = 'mercadopago' | 'talo' | 'getnet'

export interface EstadoPago {
  configurado: boolean
  habilitado: boolean
  proveedor?: ProveedorPago
  modo?: 'test' | 'produccion'
  tieneAccessToken?: boolean
  tieneWebhookSecret?: boolean
  // Identificador público de cuenta (Talo lo llama `user_id`) -- no es
  // un secreto, así que viaja el valor real, no solo un booleano.
  merchantId?: string
  // Fase 12c: Mercado Pago Point -- cobro presencial con terminal
  // física, sobre la misma cuenta que Checkout Pro (proveedor
  // 'mercadopago'). Ninguno de estos campos es sensible.
  pointHabilitado?: boolean
  pointTerminalId?: string
  pointTerminalLabel?: string
  pointStoreId?: string
  pointPosId?: string
  pointTieneWebhookSecret?: boolean
  // Fase 12d: Getnet Get Checkout -- client_id/client_secret son
  // secretos (solo booleano si están cargados); seller_id no lo es
  // (identificador de cuenta), así que viaja el valor real.
  getnetTieneClientId?: boolean
  getnetTieneClientSecret?: boolean
  getnetSellerId?: string
  getnetConfigTecnicaOk?: boolean
}

export interface TerminalPoint {
  id: string
  posId?: string
  storeId?: string
  externalPosId?: string
  operatingMode: string
}

export interface GuardarConfigPagoInput {
  clienteId: string
  proveedor: ProveedorPago
  modo: 'test' | 'produccion'
  habilitado: boolean
  accessToken?: string
  webhookSecret?: string
  merchantId?: string
  // Fase 12c: se guarda junto con el resto de 'mercadopago' -- ver
  // point_webhook_secret en clientes_pago_config.
  pointWebhookSecret?: string
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

// ── Fase 12d: Getnet Get Checkout ─────────────────────────────
// Función aparte de guardarConfigPago() porque, a diferencia de MP/
// Talo, guardar credenciales de Getnet dispara una llamada real a la
// API de Getnet (configuración técnica del webhook) -- getnet-guardar-
// config.js puede devolver `advertencia` si esa llamada falló aunque
// las credenciales sí se hayan guardado (ver comentarios en esa función).

export interface GuardarConfigGetnetInput {
  clienteId: string
  modo: 'test' | 'produccion'
  habilitado: boolean
  clientId?: string
  clientSecret?: string
  sellerId?: string
}

export async function guardarConfigGetnet(input: GuardarConfigGetnetInput): Promise<{ advertencia?: string }> {
  return llamarFuncion<{ advertencia?: string }>('getnet-guardar-config', input)
}

// ── Fase 12c: Mercado Pago Point ──────────────────────────────

export async function listarTerminalesPoint(clienteId: string): Promise<TerminalPoint[]> {
  const resultado = await llamarFuncion<{ terminales: TerminalPoint[] }>('point-listar-terminales', { clienteId })
  return resultado.terminales
}

export interface VincularTerminalPointInput {
  clienteId: string
  terminalId: string
  terminalLabel?: string
  storeId?: string
  posId?: string
}

export async function vincularTerminalPoint(input: VincularTerminalPointInput): Promise<void> {
  await llamarFuncion('point-vincular-terminal', input)
}
