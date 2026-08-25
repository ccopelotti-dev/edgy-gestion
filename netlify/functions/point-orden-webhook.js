import { createClient } from '@supabase/supabase-js'
import { createHmac, timingSafeEqual } from 'node:crypto'

// Fase 12c: recibe las notificaciones Webhook de Mercado Pago Point
// (topic "order", ver point-crear-orden.js) y actualiza
// edgy_gestion.point_ordenes -- el FRONTEND lee esa tabla (polling
// liviano), nunca la API de Mercado Pago directo.
//
// A diferencia de mp-webhook.js (Checkout Pro, donde notification_url
// se manda por API al crear cada preferencia y ahí se le puede sumar
// `?cliente=<id>`), el webhook de Point/Orders API se configura UNA
// SOLA VEZ a mano en el panel de Mercado Pago de CADA cliente ("Tus
// integraciones" > la app usada para Point > "Webhooks > Configurar
// notificaciones" > evento "Order"). Como cada negocio (La Charcutería,
// Punto Tex) tiene su PROPIA cuenta/aplicación de Mercado Pago, cuando
// se configure ahí hay que pegar la URL con el mismo `?cliente=<id>`
// que ya usan mp-webhook.js/talo-webhook.js -- mismo mecanismo,
// distinto momento en el que se define.
//
// Firma HMAC: mismo formato que mp-webhook.js (x-signature:
// ts=...,v1=...; manifest = "id:<data.id>;request-id:<x-request-id>;ts:<ts>;").
// El secreto es el que Mercado Pago genera al configurar ese Webhook
// (independiente del webhook_secret de Checkout Pro -- ver
// clientes_pago_config, columna point_webhook_secret).

function verificarFirma({ xSignature, xRequestId, dataId, secret }) {
  if (!xSignature || !secret) return false
  const partes = Object.fromEntries(
    xSignature.split(',').map((p) => {
      const [k, v] = p.split('=')
      return [k?.trim(), v?.trim()]
    }),
  )
  const ts = partes.ts
  const v1 = partes.v1
  if (!ts || !v1) return false

  const manifest = `id:${String(dataId).toLowerCase()};request-id:${xRequestId || ''};ts:${ts};`
  const firmaEsperada = createHmac('sha256', secret).update(manifest).digest('hex')

  const bufEsperado = Buffer.from(firmaEsperada, 'hex')
  const bufRecibido = Buffer.from(v1, 'hex')
  if (bufEsperado.length !== bufRecibido.length) return false
  return timingSafeEqual(bufEsperado, bufRecibido)
}

// Los estados que devuelve GET /v1/orders/{id} (order.status) ya
// coinciden 1:1 con el check constraint de point_ordenes.estado (se
// diseñó así a propósito) -- no hace falta un mapa de traducción como
// en mp-webhook.js/talo-webhook.js.
const ESTADOS_VALIDOS = ['created', 'at_terminal', 'processed', 'action_required', 'canceled', 'refunded', 'failed', 'expired']

export default async (req) => {
  const url = new URL(req.url)
  const clienteId = url.searchParams.get('cliente')

  let body = {}
  try {
    body = await req.json()
  } catch (e) {
    // Ack igual -- ver criterio en mp-webhook.js.
  }

  const tipo = body.type || url.searchParams.get('type')
  const ordenId = body.data?.id || url.searchParams.get('data.id')

  if (!clienteId || !ordenId) {
    return new Response('ok', { status: 200 })
  }
  if (tipo && tipo !== 'order') {
    return new Response('ok', { status: 200 })
  }

  const supabaseAdmin = createClient(
    process.env.VITE_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    { db: { schema: 'edgy_gestion' } },
  )

  const { data: config, error: configError } = await supabaseAdmin
    .from('clientes_pago_config')
    .select('access_token, point_webhook_secret')
    .eq('cliente_id', clienteId)
    .eq('proveedor', 'mercadopago')
    .maybeSingle()

  if (configError || !config?.access_token) {
    console.error('point-orden-webhook: no hay configuración de Mercado Pago para este cliente', clienteId, configError)
    return new Response('ok', { status: 200 })
  }

  if (config.point_webhook_secret) {
    const firmaValida = verificarFirma({
      xSignature: req.headers.get('x-signature'),
      xRequestId: req.headers.get('x-request-id'),
      dataId: ordenId,
      secret: config.point_webhook_secret,
    })
    if (!firmaValida) {
      console.error('point-orden-webhook: firma inválida para cliente', clienteId)
      return new Response(JSON.stringify({ ok: false, error: 'Firma inválida' }), { status: 401 })
    }
  }

  // Nunca se confía en el status que venga en la notificación en sí --
  // se reconfirma siempre contra la API (mismo criterio que MP/Talo).
  let orden
  try {
    const res = await fetch(`https://api.mercadopago.com/v1/orders/${ordenId}`, {
      headers: { Authorization: `Bearer ${config.access_token}` },
    })
    orden = await res.json()
    if (!res.ok) {
      console.error('point-orden-webhook: error consultando la orden', orden)
      return new Response('ok', { status: 200 })
    }
  } catch (err) {
    console.error('point-orden-webhook: error de red consultando la orden', err)
    return new Response('ok', { status: 200 })
  }

  const estado = ESTADOS_VALIDOS.includes(orden.status) ? orden.status : 'action_required'
  const pago = orden.transactions?.payments?.[0]

  const { error: updateError } = await supabaseAdmin
    .from('point_ordenes')
    .update({
      estado,
      status_detail: orden.status_detail || null,
      payment_id: pago?.id || null,
      payment_method_tipo: pago?.payment_method?.type || null,
      updated_at: new Date().toISOString(),
    })
    .eq('id', ordenId)
    .eq('cliente_id', clienteId)

  if (updateError) {
    console.error('point-orden-webhook: error actualizando point_ordenes', updateError)
  }

  return new Response('ok', { status: 200 })
}
