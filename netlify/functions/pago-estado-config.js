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
    .select(
      'proveedor, modo, habilitado, access_token, webhook_secret, merchant_id, ' +
        'point_habilitado, point_terminal_id, point_terminal_label, point_store_id, point_pos_id, point_webhook_secret, ' +
        'getnet_client_id, getnet_client_secret, getnet_seller_id, getnet_config_tecnica_ok',
    )
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
      // merchant_id no es un secreto (es el identificador público de
      // cuenta que Talo espera en el body al crear un pago) -- se
      // devuelve el valor real para no obligar a recargarlo cada vez.
      merchantId: config.merchant_id || undefined,
      // Fase 12c: estado de Mercado Pago Point -- ninguno de estos
      // campos es sensible (terminal_id/store_id/pos_id son
      // identificadores públicos de la cuenta, no credenciales).
      pointHabilitado: config.point_habilitado ?? false,
      pointTerminalId: config.point_terminal_id || undefined,
      pointTerminalLabel: config.point_terminal_label || undefined,
      pointStoreId: config.point_store_id || undefined,
      pointPosId: config.point_pos_id || undefined,
      pointTieneWebhookSecret: Boolean(config.point_webhook_secret),
      // Fase 12d: estado de Getnet -- seller_id no es secreto (es un
      // identificador de cuenta, no una credencial), se devuelve el
      // valor real para no obligar a recargarlo cada vez.
      getnetTieneClientId: Boolean(config.getnet_client_id),
      getnetTieneClientSecret: Boolean(config.getnet_client_secret),
      getnetSellerId: config.getnet_seller_id || undefined,
      getnetConfigTecnicaOk: Boolean(config.getnet_config_tecnica_ok),
    }),
    { status: 200 },
  )
}
