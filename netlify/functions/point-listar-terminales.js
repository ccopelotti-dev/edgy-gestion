import { createClient } from '@supabase/supabase-js'

// Fase 12c: lista las terminales Mercado Pago Point asociadas a la
// cuenta del cliente (mismo access_token que ya usa Checkout Pro, ver
// clientes_pago_config.proveedor='mercadopago') -- se usa en
// Configuración > Empresa para que Carlos elija visualmente cuál
// terminal vincular en vez de tener que copiar/pegar el id a mano.
//
// GET https://api.mercadopago.com/terminals/v1/list -- API vigente a
// 2026 (Orders API), reemplaza la "Point Integration API" legacy
// (/point/integration-api/devices) que usaba device_id + payment
// intents y hoy figura como deprecada en la documentación oficial.
//
// Mismo patrón de auth que pago-guardar-config.js: solo un admin DEL
// PROPIO cliente puede listar terminales (implica ver parte de la
// estructura de cuenta del negocio en Mercado Pago).

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

  // 1) Validar sesión + admin DE ESE cliente (mismo criterio que
  // pago-guardar-config.js -- listar terminales ya es una acción de
  // configuración, no de solo lectura de estado).
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
    console.error('point-listar-terminales: error consultando usuarios_cliente', errUsuario)
  }

  const esAdmin = usuarioCliente?.roles?.es_admin === true
  if (!usuarioCliente || !esAdmin) {
    return new Response(
      JSON.stringify({ ok: false, error: 'No autorizado (se requiere un rol admin de este negocio)' }),
      { status: 403 },
    )
  }

  // 2) Traer el access_token ya cargado para Checkout Pro -- Point usa
  // la misma cuenta, no hace falta pedir credenciales de nuevo.
  const { data: config, error: configError } = await supabaseAdmin
    .from('clientes_pago_config')
    .select('access_token, point_store_id, point_pos_id')
    .eq('cliente_id', clienteId)
    .eq('proveedor', 'mercadopago')
    .maybeSingle()

  if (configError) {
    console.error('point-listar-terminales: error leyendo config', configError)
    return new Response(JSON.stringify({ ok: false, error: 'No se pudo leer la configuración' }), { status: 500 })
  }
  if (!config?.access_token) {
    return new Response(
      JSON.stringify({ ok: false, error: 'Primero cargá tu Access Token de Mercado Pago (sección Cobro online)' }),
      { status: 409 },
    )
  }

  // 3) Listar terminales -- se filtra por store_id/pos_id si ya hay
  // uno vinculado, como sugiere la documentación.
  const params = new URLSearchParams({ limit: '50', offset: '0' })
  if (config.point_store_id) params.set('store_id', config.point_store_id)
  if (config.point_pos_id) params.set('pos_id', config.point_pos_id)

  let terminales
  try {
    const res = await fetch(`https://api.mercadopago.com/terminals/v1/list?${params.toString()}`, {
      headers: { Authorization: `Bearer ${config.access_token}` },
    })
    const respuesta = await res.json()
    if (!res.ok) {
      console.error('point-listar-terminales: Mercado Pago rechazó la solicitud', respuesta)
      return new Response(
        JSON.stringify({ ok: false, error: respuesta?.message || 'Mercado Pago rechazó la solicitud' }),
        { status: 502 },
      )
    }
    terminales = respuesta?.data?.terminals || []
  } catch (err) {
    console.error('point-listar-terminales: error de red', err)
    return new Response(JSON.stringify({ ok: false, error: 'No se pudo contactar a Mercado Pago' }), { status: 502 })
  }

  return new Response(
    JSON.stringify({
      ok: true,
      terminales: terminales.map((t) => ({
        id: t.id,
        posId: t.pos_id,
        storeId: t.store_id,
        externalPosId: t.external_pos_id,
        operatingMode: t.operating_mode,
      })),
    }),
    { status: 200 },
  )
}
