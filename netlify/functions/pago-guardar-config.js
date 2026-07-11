import { createClient } from '@supabase/supabase-js'

// Guarda/actualiza la configuración de Cobro Online de un cliente,
// para un proveedor dado (hoy solo 'mercadopago', pero la tabla ya
// está factorizada por proveedor -- Fase 12 punto "1 y 2 para dejar
// la factorizacion terminada"). El negocio pega SU PROPIO access_token
// de Mercado Pago (cuenta propia, sin OAuth) y SU PROPIO webhook_secret
// (lo genera Mercado Pago en "Tus integraciones" > Webhooks, dentro de
// la cuenta del cliente) -- mismo criterio que ARCA con el certificado
// digital: nunca se expone esta tabla directo al frontend.
//
// Mismo patrón de auth que arca-guardar-config.js: solo un admin
// (es_admin=true) DEL PROPIO cliente puede guardar esto.

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
  if (!['mercadopago'].includes(proveedor)) {
    return new Response(JSON.stringify({ ok: false, error: 'Proveedor de pago no soportado' }), { status: 400 })
  }

  const supabaseAdmin = createClient(
    process.env.VITE_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    { db: { schema: 'edgy_gestion' } },
  )

  // 1) Validar sesión
  const { data: userData, error: userError } = await supabaseAdmin.auth.getUser(token)
  if (userError || !userData?.user) {
    return new Response(JSON.stringify({ ok: false, error: 'Sesión inválida' }), { status: 401 })
  }

  // 2) Confirmar que es admin DE ESE cliente
  const { data: usuarioCliente, error: errUsuario } = await supabaseAdmin
    .from('usuarios_cliente')
    .select('cliente_id, rol_id, roles(es_admin)')
    .eq('user_id', userData.user.id)
    .eq('cliente_id', clienteId)
    .maybeSingle()

  if (errUsuario) {
    console.error('pago-guardar-config: error consultando usuarios_cliente', errUsuario)
  }

  const esAdmin = usuarioCliente?.roles?.es_admin === true
  if (!usuarioCliente || !esAdmin) {
    return new Response(
      JSON.stringify({ ok: false, error: 'No autorizado (se requiere un rol admin de este negocio)' }),
      { status: 403 },
    )
  }

  // 3) Validar campos
  const modo = String(body.modo || 'test')
  if (!['test', 'produccion'].includes(modo)) {
    return new Response(JSON.stringify({ ok: false, error: 'Modo inválido' }), { status: 400 })
  }

  // 4) Upsert -- access_token/webhook_secret solo se pisan si vienen
  // en el body (así se puede cambiar modo/habilitado sin tener que
  // volver a pegar las credenciales cada vez).
  const fila = {
    cliente_id: clienteId,
    proveedor,
    modo,
    habilitado: Boolean(body.habilitado),
    updated_at: new Date().toISOString(),
  }
  if (typeof body.accessToken === 'string' && body.accessToken.trim()) {
    fila.access_token = body.accessToken.trim()
  }
  if (typeof body.webhookSecret === 'string' && body.webhookSecret.trim()) {
    fila.webhook_secret = body.webhookSecret.trim()
  }

  const { error: upsertError } = await supabaseAdmin
    .from('clientes_pago_config')
    .upsert(fila, { onConflict: 'cliente_id,proveedor' })

  if (upsertError) {
    console.error('pago-guardar-config: error guardando config', upsertError)
    return new Response(JSON.stringify({ ok: false, error: 'No se pudo guardar la configuración' }), { status: 500 })
  }

  return new Response(JSON.stringify({ ok: true }), { status: 200 })
}
