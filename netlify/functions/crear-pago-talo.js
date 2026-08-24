import { createClient } from '@supabase/supabase-js'

// Crea un pago en Talo (transferencias bancarias, docs.talo.com.ar)
// para una orden ya creada desde el Menú Público (crear_orden_venta_publica,
// ver MenuPublico.tsx) y devuelve el link de checkout (payment_url) para
// redirigir al comprador -- mismo rol que crear-preferencia-pago.js para
// Mercado Pago, mismo criterio de función pública sin sesión.
//
// Fase 12b: segundo proveedor sobre la arquitectura ya factorizada por
// proveedor (clientes_pago_config.proveedor) -- ver 0094_fase12b_talo_pago_online.sql.
//
// Diferencia clave con MP: crear un pago en Talo NO requiere Authorization
// -- el `user_id` (merchant_id acá) va en el body e identifica la cuenta
// del negocio. El Bearer token privado del negocio recién hace falta para
// CONSULTAR el pago (ver talo-webhook.js).

const TALO_API = {
  test: 'https://sandbox-api.talo.com.ar',
  produccion: 'https://api.talo.com.ar',
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

  // 2) Config de cobro online (tiene que estar habilitada)
  const { data: config, error: configError } = await supabaseAdmin
    .from('clientes_pago_config')
    .select('merchant_id, modo, habilitado')
    .eq('cliente_id', cliente.id)
    .eq('proveedor', 'talo')
    .maybeSingle()

  if (configError) {
    console.error('crear-pago-talo: error leyendo config', configError)
    return new Response(JSON.stringify({ ok: false, error: 'No se pudo leer la configuración de cobro online' }), { status: 500 })
  }
  if (!config || !config.habilitado || !config.merchant_id) {
    return new Response(JSON.stringify({ ok: false, error: 'Este negocio no tiene cobro online con Talo habilitado' }), { status: 409 })
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

  // 4) Armar y crear el pago en Talo
  const siteUrl = process.env.URL || process.env.DEPLOY_PRIME_URL || new URL(req.url).origin
  const volverAlMenu = `${siteUrl}/menu/${slug}`
  const apiBase = TALO_API[config.modo] || TALO_API.test

  const pagoBody = {
    user_id: config.merchant_id,
    price: { amount: Number(orden.total), currency: 'ARS' },
    payment_options: ['transfer'],
    external_id: ordenId,
    webhook_url: `${siteUrl}/.netlify/functions/talo-webhook?cliente=${cliente.id}`,
    redirect_url: `${volverAlMenu}?pago=exito`,
    motive: `Pedido #${orden.numero || ''} -- ${cliente.nombre}`.trim(),
    ...(orden.contacto_nombre ? { client_data: { first_name: orden.contacto_nombre, phone: orden.contacto_telefono || undefined } } : {}),
  }

  let pago
  try {
    const res = await fetch(`${apiBase}/payments/`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(pagoBody),
    })
    const respuesta = await res.json()
    if (!res.ok) {
      console.error('crear-pago-talo: Talo rechazó la solicitud', respuesta)
      return new Response(JSON.stringify({ ok: false, error: 'Talo rechazó la solicitud de pago' }), { status: 502 })
    }
    pago = respuesta.data || respuesta
  } catch (err) {
    console.error('crear-pago-talo: error llamando a Talo', err)
    return new Response(JSON.stringify({ ok: false, error: 'No se pudo contactar a Talo' }), { status: 502 })
  }

  const initPoint = pago?.payment_url
  if (!initPoint || !pago?.id) {
    console.error('crear-pago-talo: Talo no devolvió payment_url/id', pago)
    return new Response(JSON.stringify({ ok: false, error: 'Talo no devolvió el link de pago' }), { status: 502 })
  }

  // 5) Guardar referencia en la orden -- se reutilizan las mismas
  // columnas que Mercado Pago (ya genéricas: preference_id/init_point
  // no tienen nada de MP-específico en el nombre por diseño, ver
  // 0043_fase12_pago_online.sql).
  const { error: updateError } = await supabaseAdmin
    .from('ordenes_venta')
    .update({
      pago_proveedor: 'talo',
      pago_estado: 'pendiente',
      pago_preference_id: pago.id,
      pago_init_point: initPoint,
      pago_monto: orden.total,
    })
    .eq('id', ordenId)

  if (updateError) {
    console.error('crear-pago-talo: error guardando referencia en la orden', updateError)
    // No frenamos el flujo por esto -- el link de pago ya es válido,
    // se puede reconciliar más tarde vía el webhook (external_id).
  }

  return new Response(JSON.stringify({ ok: true, initPoint }), { status: 200 })
}
