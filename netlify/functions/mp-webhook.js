import { createClient } from '@supabase/supabase-js'
import { createHmac, timingSafeEqual } from 'node:crypto'

// Recibe las notificaciones Webhook de Mercado Pago para pagos de
// Checkout Pro (ver crear-preferencia-pago.js) y actualiza
// ordenes_venta.pago_estado.
//
// Multi-tenant: cada negocio tiene su PROPIA cuenta/credenciales de
// Mercado Pago (ver clientes_pago_config), así que el secreto para
// validar la firma y el access_token para consultar el pago son
// distintos por negocio. Para saber a qué negocio corresponde una
// notificación ANTES de poder siquiera validar su firma, la
// notification_url se arma con `?cliente=<id>` -- el mismo mecanismo
// que la propia documentación de Mercado Pago sugiere para identificar
// múltiples cuentas ("agrega el parámetro ?cliente=(nombredelvendedor)
// al final de la URL").
//
// Validación de firma (HMAC-SHA256), formato documentado por Mercado
// Pago: header `x-signature: ts=<timestamp>,v1=<hmac>`, manifest a
// firmar = `id:<data.id>;request-id:<x-request-id>;ts:<ts>;`.
//
// Mercado Pago espera una respuesta 200/201 dentro de los 22 segundos
// -- por eso siempre se responde 200 una vez pasada la validación de
// firma, incluso si la orden no se encuentra (se loguea el caso en vez
// de hacer que Mercado Pago reintente indefinidamente).

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

const ESTADO_MP_A_INTERNO = {
  approved: 'aprobado',
  rejected: 'rechazado',
  pending: 'en_proceso',
  in_process: 'en_proceso',
  cancelled: 'rechazado',
  refunded: 'rechazado',
  charged_back: 'rechazado',
}

export default async (req) => {
  const url = new URL(req.url)
  const clienteId = url.searchParams.get('cliente')

  let body = {}
  try {
    body = await req.json()
  } catch (e) {
    // Algunas notificaciones legacy (IPN) llegan sin body JSON -- se
    // resuelve todo por query string más abajo.
  }

  const tipo = body.type || url.searchParams.get('type') || url.searchParams.get('topic')
  const dataId = body.data?.id || url.searchParams.get('data.id') || url.searchParams.get('id')

  if (!clienteId || !dataId) {
    // Ack igual -- no hay nada que podamos procesar sin esto, pero no
    // tiene sentido que Mercado Pago reintente.
    return new Response('ok', { status: 200 })
  }

  if (tipo && tipo !== 'payment') {
    // No nos interesan otros tópicos (merchant_order, chargebacks,
    // etc.) para esta primera versión de cobro online.
    return new Response('ok', { status: 200 })
  }

  const supabaseAdmin = createClient(
    process.env.VITE_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    { db: { schema: 'edgy_gestion' } },
  )

  const { data: config, error: configError } = await supabaseAdmin
    .from('clientes_pago_config')
    .select('access_token, webhook_secret')
    .eq('cliente_id', clienteId)
    .eq('proveedor', 'mercadopago')
    .maybeSingle()

  if (configError || !config?.access_token) {
    console.error('mp-webhook: no hay configuración de Mercado Pago para este cliente', clienteId, configError)
    return new Response('ok', { status: 200 })
  }

  // Validar firma -- si el negocio todavía no cargó su webhook_secret
  // (opcional al guardar la config), no podemos validar y preferimos
  // no procesar en vez de confiar ciegamente en la notificación.
  if (config.webhook_secret) {
    const firmaValida = verificarFirma({
      xSignature: req.headers.get('x-signature'),
      xRequestId: req.headers.get('x-request-id'),
      dataId,
      secret: config.webhook_secret,
    })
    if (!firmaValida) {
      console.error('mp-webhook: firma inválida para cliente', clienteId)
      return new Response(JSON.stringify({ ok: false, error: 'Firma inválida' }), { status: 401 })
    }
  }

  // Consultar el pago real contra la API de Mercado Pago (nunca se
  // confía en el monto/estado que venga en la notificación en sí).
  let pago
  try {
    const res = await fetch(`https://api.mercadopago.com/v1/payments/${dataId}`, {
      headers: { Authorization: `Bearer ${config.access_token}` },
    })
    pago = await res.json()
    if (!res.ok) {
      console.error('mp-webhook: error consultando el pago', pago)
      return new Response('ok', { status: 200 })
    }
  } catch (err) {
    console.error('mp-webhook: error de red consultando el pago', err)
    return new Response('ok', { status: 200 })
  }

  const ordenId = pago.external_reference
  const pagoEstado = ESTADO_MP_A_INTERNO[pago.status] || 'en_proceso'

  if (ordenId) {
    const { error: updateError } = await supabaseAdmin
      .from('ordenes_venta')
      .update({
        pago_estado: pagoEstado,
        pago_payment_id: String(pago.id),
        pago_monto: pago.transaction_amount,
      })
      .eq('id', ordenId)
      .eq('cliente_id', clienteId)

    if (updateError) {
      console.error('mp-webhook: error actualizando la orden', updateError)
    }
  }

  return new Response('ok', { status: 200 })
}
