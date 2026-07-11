// ============================================================
// Cliente frontend para las Netlify Functions de ARCA (Fase 11)
// Edgy Gestión · Configuración > Empresa
//
// Mismo patrón que agregar-dominio.js / invitar-admin.js en el
// onboarding (NuevoProyecto.tsx): fetch a /.netlify/functions/<nombre>
// con el access_token de la sesión actual en el header Authorization.
// Nunca se manda ni se lee certificado/clave privada más que en el
// momento puntual de guardarlos -- arca-estado-config.js jamás los
// devuelve.
// ============================================================

import { supabase } from '@/lib/supabase'

export interface EstadoArca {
  configurado: boolean
  habilitado: boolean
  modo?: 'homologacion' | 'produccion'
  puntoVenta?: number
  condicionIva?: 'responsable_inscripto' | 'monotributista' | 'exento'
  cuit?: string | null
  tieneCertificado?: boolean
}

export interface GuardarConfigArcaInput {
  clienteId: string
  puntoVenta: number
  condicionIva: 'responsable_inscripto' | 'monotributista' | 'exento'
  modo: 'homologacion' | 'produccion'
  habilitado: boolean
  certificadoPem?: string
  clavePrivadaPem?: string
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

export async function obtenerEstadoArca(clienteId: string): Promise<EstadoArca> {
  return llamarFuncion<EstadoArca>('arca-estado-config', { clienteId })
}

export async function guardarConfigArca(input: GuardarConfigArcaInput): Promise<void> {
  await llamarFuncion('arca-guardar-config', input)
}
