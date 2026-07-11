import { createClient } from '@supabase/supabase-js'

// Devuelve el estado NO sensible de la configuración de Cobro Online
// de un cliente (habilitado, modo, si hay credenciales cargadas) --
// nunca access_token ni webhook_secret. Lo puede pedir cualquier
// usuario logueado DEL PROPIO cliente (mismo criterio que
// arca-estado-config.js).

export default async (req) => {
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ ok: false, error: 'Método no permitido' }), { status: 405 })
  }

  const auth = req.headers.get('authorization') || ''
  const token = auth.replace(/^Bearer\s+/i, '')
  if (!token) {
    return new Response(JSON.stringify({ ok: false, error: 'Falta sesión' }), { status: 401 })
  }

  let body
  try {
    body = await req.json()
  } catch (e) {
    return new Response(JSON.stringify({ ok: false, error: 'Body inválido' }), { status: 400 })
  }

  const clienteId = String(body.clienteId || '')
  if (!clienteId) {
    return new Response(JSON.stringify({ ok: false, error: 'Falta clienteId' }), { status: 400 })
  }
  const proveedor = String(body.proveedor || 'mercadopago')

  const supabaseAdmin = createClient(
    process.env.VITE_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    { db: { schema: 'edgy_gestion' } },
  )

  const { data: userData, error: userError } = await supabaseAdmin.auth.getUser(token)
  if (userError || !userData?.user) {
    return new Response(JSON.stringify({ ok: false, error: 'Sesión inválida' }), { status: 401 })
  }

  const { data: usuarioCliente } = await supabaseAdmin
    .from('usuarios_cliente')
    .select('cliente_id')
    .eq('user_id', userData.user.id)
    .eq('cliente_id', clienteId)
    .maybeSingle()

  if (!usuarioCliente) {
    return new Response(JSON.stringify({ ok: false, error: 'No autorizado' }), { status: 403 })
  }

  const { data: config, error: configError } = await supabaseAdmin
    .from('clientes_pago_config')
    .select('proveedor, modo, habilitado, access_token, webhook_secret')
    .eq('cliente_id', clienteId)
    .eq('proveedor', proveedor)
    .maybeSingle()

  if (configError) {
    console.error('pago-estado-config: error consultando config', configError)
    return new Response(JSON.stringify({ ok: false, error: 'No se pudo leer la configuración' }), { status: 500 })
  }

  if (!config) {
    return new Response(JSON.stringify({ ok: true, configurado: false, habilitado: false }), { status: 200 })
  }

  return new Response(
    JSON.stringify({
      ok: true,
      configurado: true,
      habilitado: config.habilitado,
      proveedor: config.proveedor,
      modo: config.modo,
      tieneAccessToken: Boolean(config.access_token),
      tieneWebhookSecret: Boolean(config.webhook_secret),
    }),
    { status: 200 },
  )
}
