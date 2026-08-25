import { createClient } from '@supabase/supabase-js'

// Recibe las notificaciones Webhook de Getnet Web Checkout ("Get
// Checkout") para pagos online y actualiza ordenes_venta.pago_estado --
// mismo rol que mp-webhook.js (Mercado Pago) y talo-webhook.js (Talo).
//
// Multi-tenant: mismo mecanismo que los otros dos webhooks -- la
// webhook_url se configura UNA VEZ por cliente (ver
// getnet-guardar-config.js, PUT a technical-configurations) con
// `?cliente=<id>` en la URL, porque hace falta saber a qué negocio
// corresponde la notificación antes de poder validar nada.
//
// Diferencia importante con Mercado Pago (HMAC) y Talo (sin firma,
// reconfirmado siempre vía GET): Getnet autentica sus notificaciones
// con HTTP Basic Auth -- el `user`/`password` que el propio negocio le
// pasó a Getnet al configurar el webhook (ver technical-configurations
// en getnet-guardar-config.js). Acá se valida el header Authorization
// entrante contra lo guardado en clientes_pago_config. La documentación
// de Get Checkout consultada en esta integración no expone un endpoint
// público de "consultar estado de un payment intent" (a diferencia de
// Mercado Pago/Talo) -- por eso, a diferencia de esos dos webhooks,
// ACÁ SÍ se confía en el status que manda el payload una vez que la
// autenticación Basic Auth es válida. Si más adelante aparece un
// endpoint de consulta en la documentación de Getnet, conviene sumar
// una reconfirmación como la de mp-webhook.js/talo-webhook.js.

const ESTADO_GETNET_A_INTERNO = {
  Authorized: 'aprobado',
  Denied: 'rechazado',
  Canceled: 'rechazado',
  Refunded: 'rechazado',
  Pending: 'en_proceso',
}

function credencialesValidas(req, webhookUser, webhookPassword) {
  const auth = req.headers.get('authorization') || ''
  const match = auth.match(/^Basic\s+(.+)$/i)
  if (!match) return false
  let decoded
  try {
    decoded = Buffer.from(match[1], 'base64').toString('utf8')
  } catch (e) {
    return false
  }
  const separador = decoded.indexOf(':')
  if (separador === -1) return false
  const user = decoded.slice(0, separador)
  const password = decoded.slice(separador + 1)
  return user === webhookUser && password === webhookPassword
}

export default async (req) => {
  const url = new URL(req.url)
  const clienteId = url.searchParams.get('cliente')

  let body = {}
  try {
    body = await req.json()
  } catch (e) {
    // Ack igual -- mismo criterio que mp-webhook.js/talo-webhook.js.
  }

  if (!clienteId) {
    return new Response('ok', { status: 200 })
  }

  const supabaseAdmin = createClient(
    process.env.VITE_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    { db: { schema: 'edgy_gestion' } },
  )

  const { data: config, error: configError } = await supabaseAdmin
    .from('clientes_pago_config')
    .select('getnet_webhook_user, getnet_webhook_password')
    .eq('cliente_id', clienteId)
    .eq('proveedor', 'getnet')
    .maybeSingle()

  if (configError || !config?.getnet_webhook_user || !config?.getnet_webhook_password) {
    console.error('getnet-webhook: no hay configuración de Getnet para este cliente', clienteId, configError)
    return new Response('ok', { status: 200 })
  }

  // Autenticación Basic Auth -- si no matchea, se rechaza (a diferencia
  // de MP/Talo, acá es la ÚNICA validación de que la notificación es
  // legítima, no hay una reconfirmación posterior vía GET).
  if (!credencialesValidas(req, config.getnet_webhook_user, config.getnet_webhook_password)) {
    console.error('getnet-webhook: Basic Auth inválido para cliente', clienteId)
    return new Response('unauthorized', { status: 401 })
  }

  const ordenId = body.order_id
  const resultado = body.payment?.result
  const pagoEstado = ESTADO_GETNET_A_INTERNO[resultado?.status] || 'en_proceso'

  if (ordenId) {
    const { error: updateError } = await supabaseAdmin
      .from('ordenes_venta')
      .update({
        pago_estado: pagoEstado,
        pago_payment_id: resultado?.payment_id ? String(resultado.payment_id) : undefined,
        // Getnet manda el monto en centavos (últimos 2 dígitos), igual
        // que se lo mandamos nosotros al crear el payment intent -- ver
        // crear-pago-getnet.js.
        pago_monto: typeof body.payment?.amount === 'number' ? body.payment.amount / 100 : undefined,
      })
      .eq('id', ordenId)
      .eq('cliente_id', clienteId)

    if (updateError) {
      console.error('getnet-webhook: error actualizando la orden', updateError)
    }
  }

  return new Response('ok', { status: 200 })
}
