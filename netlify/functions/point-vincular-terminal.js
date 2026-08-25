import { createClient } from '@supabase/supabase-js'

// Fase 12c: pone una terminal Point en modo PDV (integración por API,
// requisito de Mercado Pago antes de poder crear órdenes en ella --
// "STANDALONE" es el modo por defecto, para cobrar sin pasar por
// ninguna API) y guarda la selección en clientes_pago_config.
//
// PATCH https://api.mercadopago.com/terminals/v1/setup
// Solo admite terminales NEWLAND_N950 y PAX_A910 (restricción de
// Mercado Pago, no nuestra). Si el punto de venta ya tiene otra
// terminal en modo PDV/SUSPENDED, la API devuelve 412 -- se traduce
// a un mensaje entendible en vez de dejar pasar el error crudo.

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
  const terminalId = String(body.terminalId || '')
  const storeId = body.storeId ? String(body.storeId) : null
  const posId = body.posId ? String(body.posId) : null
  const terminalLabel = body.terminalLabel ? String(body.terminalLabel) : terminalId
  if (!clienteId || !terminalId) {
    return new Response(JSON.stringify({ ok: false, error: 'Falta clienteId o terminalId' }), { status: 400 })
  }

  const supabaseAdmin = createClient(
    process.env.VITE_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    { db: { schema: 'edgy_gestion' } },
  )

  const { data: userData, error: userError } = await supabaseAdmin.auth.getUser(token)
  if (userError || !userData?.user) {
    return new Response(JSON.stringify({ ok: false, error: 'Sesión inválida' }), { status: 401 })
  }

  const { data: usuarioCliente, error: errUsuario } = await supabaseAdmin
    .from('usuarios_cliente')
    .select('cliente_id, rol_id, roles(es_admin)')
    .eq('user_id', userData.user.id)
    .eq('cliente_id', clienteId)
    .maybeSingle()

  if (errUsuario) {
    console.error('point-vincular-terminal: error consultando usuarios_cliente', errUsuario)
  }

  const esAdmin = usuarioCliente?.roles?.es_admin === true
  if (!usuarioCliente || !esAdmin) {
    return new Response(
      JSON.stringify({ ok: false, error: 'No autorizado (se requiere un rol admin de este negocio)' }),
      { status: 403 },
    )
  }

  const { data: config, error: configError } = await supabaseAdmin
    .from('clientes_pago_config')
    .select('access_token')
    .eq('cliente_id', clienteId)
    .eq('proveedor', 'mercadopago')
    .maybeSingle()

  if (configError || !config?.access_token) {
    return new Response(
      JSON.stringify({ ok: false, error: 'Primero cargá tu Access Token de Mercado Pago (sección Cobro online)' }),
      { status: 409 },
    )
  }

  // 1) Poner la terminal en modo PDV.
  try {
    const res = await fetch('https://api.mercadopago.com/terminals/v1/setup', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${config.access_token}` },
      body: JSON.stringify({ terminals: [{ id: terminalId, operating_mode: 'PDV' }] }),
    })
    const respuesta = await res.json()
    if (!res.ok) {
      console.error('point-vincular-terminal: Mercado Pago rechazó el cambio de modo', respuesta)
      const mensaje =
        respuesta?.error === 'Only one pos-store with PDV mode ON or SUSPENDED is allowed'
          ? 'Este punto de venta ya tiene otra terminal vinculada en modo PDV -- desvinculala primero desde la app de Mercado Pago.'
          : respuesta?.message || 'Mercado Pago rechazó el cambio de modo de la terminal'
      return new Response(JSON.stringify({ ok: false, error: mensaje }), { status: 502 })
    }
  } catch (err) {
    console.error('point-vincular-terminal: error de red', err)
    return new Response(JSON.stringify({ ok: false, error: 'No se pudo contactar a Mercado Pago' }), { status: 502 })
  }

  // 2) Guardar la selección -- habilita Point para este negocio.
  const { error: updateError } = await supabaseAdmin
    .from('clientes_pago_config')
    .update({
      point_habilitado: true,
      point_terminal_id: terminalId,
      point_terminal_label: terminalLabel,
      point_store_id: storeId,
      point_pos_id: posId,
      updated_at: new Date().toISOString(),
    })
    .eq('cliente_id', clienteId)
    .eq('proveedor', 'mercadopago')

  if (updateError) {
    console.error('point-vincular-terminal: error guardando la selección', updateError)
    return new Response(JSON.stringify({ ok: false, error: 'La terminal quedó en modo PDV pero no se pudo guardar acá -- reintentá' }), { status: 500 })
  }

  return new Response(JSON.stringify({ ok: true }), { status: 200 })
}
