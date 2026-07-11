import { createClient } from '@supabase/supabase-js'

// Devuelve el estado NO sensible de la configuración ARCA de un
// cliente (habilitado, modo, punto de venta, condición de IVA, cuit
// del cliente ya cargado en clientes.cuit, si hay certificado
// cargado) -- nunca certificado_pem ni clave_privada_pem. Lo puede
// pedir cualquier usuario logueado DEL PROPIO cliente (no hace falta
// ser admin: un cajero necesita saber si ARCA está habilitado para
// decidir si puede emitir electrónica).

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

  const [{ data: clienteRow }, { data: config, error: configError }] = await Promise.all([
    supabaseAdmin.from('clientes').select('cuit').eq('id', clienteId).maybeSingle(),
    supabaseAdmin
      .from('clientes_arca_config')
      .select('punto_venta, condicion_iva, modo, habilitado, certificado_pem')
      .eq('cliente_id', clienteId)
      .maybeSingle(),
  ])

  if (configError) {
    console.error('arca-estado-config: error consultando config', configError)
    return new Response(JSON.stringify({ ok: false, error: 'No se pudo leer la configuración' }), { status: 500 })
  }

  if (!config) {
    return new Response(
      JSON.stringify({ ok: true, configurado: false, habilitado: false, cuit: clienteRow?.cuit ?? null }),
      { status: 200 },
    )
  }

  return new Response(
    JSON.stringify({
      ok: true,
      configurado: true,
      habilitado: config.habilitado,
      modo: config.modo,
      puntoVenta: config.punto_venta,
      condicionIva: config.condicion_iva,
      cuit: clienteRow?.cuit ?? null,
      tieneCertificado: Boolean(config.certificado_pem),
    }),
    { status: 200 },
  )
}
