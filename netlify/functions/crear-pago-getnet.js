import { createClient } from '@supabase/supabase-js'

// Crea un "payment intent" en Getnet Web Checkout ("Get Checkout") para
// una orden ya creada desde el Menú Público (crear_orden_venta_publica,
// ver MenuPublico.tsx) y devuelve el link de checkout (redirect_url)
// para redirigir al comprador -- mismo rol que crear-preferencia-pago.js
// (Mercado Pago) y crear-pago-talo.js (Talo).
//
// Fase 12d: tercer proveedor sobre la arquitectura ya factorizada por
// proveedor (clientes_pago_config.proveedor) -- ver
// 0097_fase12d_getnet_pago_online.sql.
//
// Alcance: SOLO Get Checkout (redirect a un formulario hosteado por
// Getnet). La terminal física de Getnet ("App2App") queda afuera --
// decisión explícita de Carlos, no de esta función.
//
// Diferencia clave con Mercado Pago/Talo: Getnet no usa un token de
// larga duración guardado en la tabla -- usa OAuth2 client_credentials
// (client_id + client_secret -> access_token Bearer que vence en ~1h).
// Por eso acá se pide un access_token nuevo en cada pago, no se
// reutiliza ninguno guardado.
//
// NOTA para cuando Carlos tenga credenciales reales de Getnet: los
// hosts de producción (`GETNET_API.produccion` / ver getnet-webhook.js
// y getnet-guardar-config.js) están inferidos por el mismo patrón que
// el host de sandbox documentado (`api-sbx.pre.` -> `api.`) porque la
// documentación de Getnet no publica explícitamente el host de
// producción de esta API -- conviene confirmarlo con el primer pago de
// prueba en modo producción antes de darlo por bueno.

const GETNET_API = {
  test: 'https://api-sbx.pre.globalgetnet.com',
  produccion: 'https://api.globalgetnet.com',
}

async function obtenerAccessTokenGetnet(apiBase, clientId, clientSecret) {
  const res = await fetch(`${apiBase}/authentication/oauth2/access_token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' },
    body: new URLSearchParams({
      grant_type: 'client_credentials',
      client_id: clientId,
      client_secret: clientSecret,
    }),
  })
  const respuesta = await res.json()
  if (!res.ok || !respuesta.access_token) {
    throw new Error(respuesta.error_description || respuesta.error || 'Getnet rechazó las credenciales')
  }
  return respuesta.access_token
}

export default async (req) => {
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ ok: false, error: 'Método no permitido' }), { status: 405 })
  }

  let body
  try {
    body = await req.json()
  } catch (e) {
    return new Response(JSON.stringify({ ok: false, error: 'Body inválido' }), { status: 400 })
  }

  const slug = String(body.slug || '')
  const ordenId = String(body.ordenId || '')
  if (!slug || !ordenId) {
    return new Response(JSON.stringify({ ok: false, error: 'Falta slug u ordenId' }), { status: 400 })
  }

  const supabaseAdmin = createClient(
    process.env.VITE_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    { db: { schema: 'edgy_gestion' } },
  )

  // 1) Resolver cliente por slug (negocio activo)
  const { data: cliente, error: clienteError } = await supabaseAdmin
    .from('clientes')
    .select('id, nombre')
    .eq('slug', slug)
    .eq('estado', 'activo')
    .maybeSingle()

  if (clienteError || !cliente) {
    return new Response(JSON.stringify({ ok: false, error: 'Negocio no encontrado' }), { status: 404 })
  }

  // 2) Config de cobro online (tiene que estar habilitada y con la
  // configuración técnica ya aplicada contra la API de Getnet -- ver
  // getnet-guardar-config.js).
  const { data: config, error: configError } = await supabaseAdmin
    .from('clientes_pago_config')
    .select('getnet_client_id, getnet_client_secret, getnet_seller_id, modo, habilitado, getnet_config_tecnica_ok')
    .eq('cliente_id', cliente.id)
    .eq('proveedor', 'getnet')
    .maybeSingle()

  if (configError) {
    console.error('crear-pago-getnet: error leyendo config', configError)
    return new Response(JSON.stringify({ ok: false, error: 'No se pudo leer la configuración de cobro online' }), { status: 500 })
  }
  if (!config || !config.habilitado || !config.getnet_client_id || !config.getnet_client_secret || !config.getnet_seller_id) {
    return new Response(JSON.stringify({ ok: false, error: 'Este negocio no tiene cobro online con Getnet habilitado' }), { status: 409 })
  }

  // 3) Orden (tiene que ser de este mismo negocio)
  const { data: orden, error: ordenError } = await supabaseAdmin
    .from('ordenes_venta')
    .select('id, cliente_id, numero, total, contacto_nombre, contacto_telefono, pago_estado')
    .eq('id', ordenId)
    .eq('cliente_id', cliente.id)
    .maybeSingle()

  if (ordenError || !orden) {
    return new Response(JSON.stringify({ ok: false, error: 'Pedido no encontrado' }), { status: 404 })
  }
  if (orden.pago_estado === 'aprobado') {
    return new Response(JSON.stringify({ ok: false, error: 'Este pedido ya está pagado' }), { status: 409 })
  }

  const siteUrl = process.env.URL || process.env.DEPLOY_PRIME_URL || new URL(req.url).origin
  const volverAlMenu = `${siteUrl}/menu/${slug}`
  const apiBase = GETNET_API[config.modo] || GETNET_API.test

  // 4) OAuth2 client_credentials -- access_token nuevo en cada pago,
  // no hay nada de esto para cachear en la tabla (vence en ~1h).
  let accessToken
  try {
    accessToken = await obtenerAccessTokenGetnet(apiBase, config.getnet_client_id, config.getnet_client_secret)
  } catch (err) {
    console.error('crear-pago-getnet: error obteniendo access_token', err)
    return new Response(JSON.stringify({ ok: false, error: 'No se pudo autenticar contra Getnet' }), { status: 502 })
  }

  // 5) Crear el payment intent. El nombre del comprador se parte de
  // contacto_nombre (campo libre, ver ordenes_venta) -- si no viene
  // nada usable se manda un genérico, igual que hace el Menú Público
  // para otros datos opcionales del comprador.
  const nombreCompleto = (orden.contacto_nombre || 'Cliente').trim()
  const [firstName, ...resto] = nombreCompleto.split(/\s+/)
  const lastName = resto.join(' ') || firstName

  const paymentIntentBody = {
    mode: 'instant',
    order_id: ordenId,
    configurations: {
      '3ds': true,
      preauthorization: false,
      card_verification: false,
      success_url: `${volverAlMenu}?pago=exito`,
      error_url: `${volverAlMenu}?pago=error`,
    },
    payment: {
      currency: 'ARS',
      // Getnet espera el monto como entero con los últimos 2 dígitos
      // como centavos (ej: $925.00 -> 92500).
      amount: Math.round(Number(orden.total) * 100),
    },
    customer: {
      customer_id: ordenId,
      first_name: firstName,
      last_name: lastName,
      name: nombreCompleto,
      document_type: 'dni',
      // Sin documento real del comprador en el flujo del Menú Público
      // -- se manda un valor placeholder porque Getnet lo marca como
      // requerido. A confirmar si el sandbox de Argentina lo acepta
      // así o si hace falta pedirlo en el checkout del Menú Público.
      document_number: '00000000',
      phone_number: orden.contacto_telefono || undefined,
    },
    expires_at: '1h',
  }

  let intent
  try {
    const res = await fetch(`${apiBase}/dpy/web-checkout/v1/payment-intent`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken}` },
      body: JSON.stringify(paymentIntentBody),
    })
    intent = await res.json()
    if (!res.ok) {
      console.error('crear-pago-getnet: Getnet rechazó el payment intent', intent)
      return new Response(JSON.stringify({ ok: false, error: 'Getnet rechazó la solicitud de pago' }), { status: 502 })
    }
  } catch (err) {
    console.error('crear-pago-getnet: error llamando a Getnet', err)
    return new Response(JSON.stringify({ ok: false, error: 'No se pudo contactar a Getnet' }), { status: 502 })
  }

  const initPoint = intent?.redirect_url
  if (!initPoint || !intent?.payment_intent_id) {
    console.error('crear-pago-getnet: Getnet no devolvió redirect_url/payment_intent_id', intent)
    return new Response(JSON.stringify({ ok: false, error: 'Getnet no devolvió el link de pago' }), { status: 502 })
  }

  // 6) Guardar referencia en la orden -- mismas columnas genéricas que
  // usan Mercado Pago y Talo (ver 0043_fase12_pago_online.sql).
  const { error: updateError } = await supabaseAdmin
    .from('ordenes_venta')
    .update({
      pago_proveedor: 'getnet',
      pago_estado: 'pendiente',
      pago_preference_id: intent.payment_intent_id,
      pago_init_point: initPoint,
      pago_monto: orden.total,
    })
    .eq('id', ordenId)

  if (updateError) {
    console.error('crear-pago-getnet: error guardando referencia en la orden', updateError)
    // No frenamos el flujo por esto -- el link de pago ya es válido,
    // se puede reconciliar más tarde vía el webhook (order_id).
  }

  return new Response(JSON.stringify({ ok: true, initPoint }), { status: 200 })
}
