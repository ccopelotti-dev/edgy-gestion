import { createClient } from '@supabase/supabase-js'

// Crea la Preference de Checkout Pro (Mercado Pago) para una orden ya
// creada desde el Menú Público (crear_orden_venta_publica, ver
// MenuPublico.tsx) y devuelve el link de checkout (init_point) para
// redirigir al comprador. Función pública (sin sesión, rol equivalente
// a anon) -- el cliente final del negocio nunca tiene una cuenta en
// Edgy Gestión, mismo criterio que crear_orden_venta_publica /
// crear_llamado_mozo_publico.
//
// No usamos el SDK oficial de Mercado Pago (mercadopago npm) para no
// sumar una dependencia nueva al build -- es una sola llamada REST
// (POST /checkout/preferences), y el resto del repo ya resuelve casos
// así con fetch nativo (ver agregar-dominio.js).
//
// Fase 12: "cobro online" primero, arquitectura factorizada por
// proveedor (clientes_pago_config.proveedor) para poder sumar otros
// más adelante sin tocar este flujo -- ver 0043_fase12_pago_online.sql.

const MP_API = 'https://api.mercadopago.com'

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

  // 2) Config de cobro online (tiene que estar habilitada)
  const { data: config, error: configError } = await supabaseAdmin
    .from('clientes_pago_config')
    .select('access_token, modo, habilitado')
    .eq('cliente_id', cliente.id)
    .eq('proveedor', 'mercadopago')
    .maybeSingle()

  if (configError) {
    console.error('crear-preferencia-pago: error leyendo config', configError)
    return new Response(JSON.stringify({ ok: false, error: 'No se pudo leer la configuración de cobro online' }), { status: 500 })
  }
  if (!config || !config.habilitado || !config.access_token) {
    return new Response(JSON.stringify({ ok: false, error: 'Este negocio no tiene cobro online habilitado' }), { status: 409 })
  }

  // 3) Orden + ítems (tiene que ser de este mismo negocio)
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

  const { data: items, error: itemsError } = await supabaseAdmin
    .from('orden_venta_items')
    .select('descripcion, cantidad, precio_unitario')
    .eq('orden_id', ordenId)

  if (itemsError || !items || items.length === 0) {
    return new Response(JSON.stringify({ ok: false, error: 'El pedido no tiene ítems' }), { status: 400 })
  }

  // 4) Armar y crear la Preference en Mercado Pago
  const siteUrl = process.env.URL || process.env.DEPLOY_PRIME_URL || new URL(req.url).origin
  const volverAlMenu = `${siteUrl}/menu/${slug}`

  const preferenceBody = {
    items: items.map((it) => ({
      title: it.descripcion,
      quantity: Number(it.cantidad),
      unit_price: Number(it.precio_unitario),
      currency_id: 'ARS',
    })),
    external_reference: ordenId,
    back_urls: {
      success: `${volverAlMenu}?pago=exito`,
      pending: `${volverAlMenu}?pago=pendiente`,
      failure: `${volverAlMenu}?pago=error`,
    },
    auto_return: 'approved',
    notification_url: `${siteUrl}/.netlify/functions/mp-webhook?cliente=${cliente.id}`,
  }

  let preference
  try {
    const res = await fetch(`${MP_API}/checkout/preferences`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${config.access_token}`,
      },
      body: JSON.stringify(preferenceBody),
    })
    preference = await res.json()
    if (!res.ok) {
      console.error('crear-preferencia-pago: Mercado Pago rechazó la preference', preference)
      return new Response(JSON.stringify({ ok: false, error: 'Mercado Pago rechazó la solicitud de pago' }), { status: 502 })
    }
  } catch (err) {
    console.error('crear-preferencia-pago: error llamando a Mercado Pago', err)
    return new Response(JSON.stringify({ ok: false, error: 'No se pudo contactar a Mercado Pago' }), { status: 502 })
  }

  const initPoint = config.modo === 'test' ? preference.sandbox_init_point : preference.init_point
  if (!initPoint) {
    console.error('crear-preferencia-pago: Mercado Pago no devolvió init_point', preference)
    return new Response(JSON.stringify({ ok: false, error: 'Mercado Pago no devolvió el link de pago' }), { status: 502 })
  }

  // 5) Guardar referencia en la orden
  const { error: updateError } = await supabaseAdmin
    .from('ordenes_venta')
    .update({
      pago_proveedor: 'mercadopago',
      pago_estado: 'pendiente',
      pago_preference_id: preference.id,
      pago_init_point: initPoint,
      pago_monto: orden.total,
    })
    .eq('id', ordenId)

  if (updateError) {
    console.error('crear-preferencia-pago: error guardando referencia en la orden', updateError)
    // No frenamos el flujo por esto -- el link de pago ya es válido,
    // se puede reconciliar más tarde vía el webhook (external_reference).
  }

  return new Response(JSON.stringify({ ok: true, initPoint }), { status: 200 })
}
