import { createClient } from '@supabase/supabase-js'

// Recibe las notificaciones Webhook de Talo para pagos por transferencia
// (ver crear-pago-talo.js) y actualiza ordenes_venta.pago_estado -- mismo
// rol que mp-webhook.js para Mercado Pago.
//
// Multi-tenant: mismo mecanismo que mp-webhook.js -- la webhook_url se
// arma con `?cliente=<id>` al crear el pago, porque hace falta saber a
// qué negocio corresponde la notificación para poder buscar sus
// credenciales antes de poder validar/consultar nada.
//
// Diferencia importante con Mercado Pago -- SIN firma todavía: el
// payload que manda Talo a este webhook es minimalista por diseño
// ({message, paymentId, externalId}) y, a la fecha de esta integración
// (docs.talo.com.ar/transfers/webhooks), Talo NO firma sus notificaciones
// (su documentación dice "Pronto: firma HMAC... prepara tu endpoint para
// validar con tu client_secret"). Esto es una superficie de ataque real
// -- cualquiera que adivine/filtre un paymentId podría pegarle a esta URL.
// Se mitiga en parte porque igual SIEMPRE se hace un GET autenticado
// (Bearer) a Talo para confirmar el estado real antes de tocar la orden
// -- nunca se confía en el status implícito de la notificación en sí --
// pero si Talo publica la firma HMAC más adelante, hay que sumarla acá
// (mismo patrón que verificarFirma() en mp-webhook.js).
//
// Talo espera un ack rápido (<3s) y sugiere procesar de forma asíncrona
// -- por eso, igual que con MP, siempre se responde 200 una vez leído el
// body, incluso si la orden no se encuentra (se loguea en vez de dejar
// que Talo reintente indefinidamente).

const ESTADO_TALO_A_INTERNO = {
  PENDING: 'en_proceso',
  SUCCESS: 'aprobado',
  OVERPAID: 'aprobado',
  UNDERPAID: 'en_proceso',
  EXPIRED: 'rechazado',
}

const TALO_API = {
  test: 'https://sandbox-api.talo.com.ar',
  produccion: 'https://api.talo.com.ar',
}

export default async (req) => {
  const url = new URL(req.url)
  const clienteId = url.searchParams.get('cliente')

  let body = {}
  try {
    body = await req.json()
  } catch (e) {
    // Ack igual -- ver criterio en mp-webhook.js.
  }

  const paymentId = body.paymentId
  const externalId = body.externalId

  if (!clienteId || !paymentId) {
    return new Response('ok', { status: 200 })
  }

  const supabaseAdmin = createClient(
    process.env.VITE_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    { db: { schema: 'edgy_gestion' } },
  )

  const { data: config, error: configError } = await supabaseAdmin
    .from('clientes_pago_config')
    .select('access_token, modo')
    .eq('cliente_id', clienteId)
    .eq('proveedor', 'talo')
    .maybeSingle()

  if (configError || !config?.access_token) {
    console.error('talo-webhook: no hay configuración de Talo para este cliente', clienteId, configError)
    return new Response('ok', { status: 200 })
  }

  // Nunca se confía en el status que implique la notificación en sí --
  // se confirma siempre contra la API de Talo (mismo criterio que MP).
  const apiBase = TALO_API[config.modo] || TALO_API.test
  let pago
  try {
    const res = await fetch(`${apiBase}/payments/${paymentId}`, {
      headers: { Authorization: `Bearer ${config.access_token}` },
    })
    const respuesta = await res.json()
    if (!res.ok) {
      console.error('talo-webhook: error consultando el pago', respuesta)
      return new Response('ok', { status: 200 })
    }
    pago = respuesta.data || respuesta
  } catch (err) {
    console.error('talo-webhook: error de red consultando el pago', err)
    return new Response('ok', { status: 200 })
  }

  const ordenId = externalId || pago.external_id
  const pagoEstado = ESTADO_TALO_A_INTERNO[pago.payment_status] || 'en_proceso'

  if (ordenId) {
    const { error: updateError } = await supabaseAdmin
      .from('ordenes_venta')
      .update({
        pago_estado: pagoEstado,
        pago_payment_id: String(pago.id || paymentId),
        pago_monto: pago.price?.amount,
      })
      .eq('id', ordenId)
      .eq('cliente_id', clienteId)

    if (updateError) {
      console.error('talo-webhook: error actualizando la orden', updateError)
    }
  }

  return new Response('ok', { status: 200 })
}
