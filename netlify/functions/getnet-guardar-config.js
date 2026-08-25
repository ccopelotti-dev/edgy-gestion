import { createClient } from '@supabase/supabase-js'
import crypto from 'crypto'

// Guarda/actualiza la configuración de Cobro Online con Getnet ("Get
// Checkout") de un cliente -- mismo criterio de auth que
// pago-guardar-config.js (solo un admin DEL PROPIO cliente puede
// guardar esto), pero con un paso extra que esa función no tiene: la
// PRIMERA vez que se cargan client_id/client_secret/seller_id hay que
// avisarle a Getnet, vía API, adónde mandar los webhooks -- eso no es
// opcional, es requisito de Getnet para poder crear pagos (ver
// "Configuration by API" en docs.globalgetnet.com). Por eso esta
// función es "de escritura confirmada": si el PUT de configuración
// técnica contra Getnet falla, se guardan igual las credenciales
// (para no hacer perder lo que el admin ya tipeó) pero se devuelve un
// aviso -- el negocio queda "configurado" pero sin poder cobrar todavía
// hasta que se reintente con éxito.
//
// Getnet no entrega un webhook_secret propio (a diferencia de Mercado
// Pago) -- exige que el propio negocio le pase un usuario/contraseña
// para HTTP Basic Auth. Por eso ACÁ se generan (random, con crypto) y
// se le mandan a Getnet -- después getnet-webhook.js los usa para
// validar que cada notificación entrante viene realmente de Getnet.

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

  // 1) Validar sesión + admin DE ESE cliente (mismo patrón que
  // pago-guardar-config.js / point-vincular-terminal.js).
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
    console.error('getnet-guardar-config: error consultando usuarios_cliente', errUsuario)
  }

  const esAdmin = usuarioCliente?.roles?.es_admin === true
  if (!usuarioCliente || !esAdmin) {
    return new Response(
      JSON.stringify({ ok: false, error: 'No autorizado (se requiere un rol admin de este negocio)' }),
      { status: 403 },
    )
  }

  const modo = String(body.modo || 'test')
  if (!['test', 'produccion'].includes(modo)) {
    return new Response(JSON.stringify({ ok: false, error: 'Modo inválido' }), { status: 400 })
  }

  const clientId = typeof body.clientId === 'string' ? body.clientId.trim() : ''
  const clientSecret = typeof body.clientSecret === 'string' ? body.clientSecret.trim() : ''
  const sellerId = typeof body.sellerId === 'string' ? body.sellerId.trim() : ''

  // 2) Guardar lo básico ya -- así no se pierde lo tipeado aunque el
  // paso 3 (configuración técnica contra Getnet) falle.
  const fila = {
    cliente_id: clienteId,
    proveedor: 'getnet',
    modo,
    habilitado: Boolean(body.habilitado),
    updated_at: new Date().toISOString(),
  }
  if (clientId) fila.getnet_client_id = clientId
  if (clientSecret) fila.getnet_client_secret = clientSecret
  if (sellerId) fila.getnet_seller_id = sellerId

  const { error: upsertError } = await supabaseAdmin
    .from('clientes_pago_config')
    .upsert(fila, { onConflict: 'cliente_id,proveedor' })

  if (upsertError) {
    console.error('getnet-guardar-config: error guardando config', upsertError)
    return new Response(JSON.stringify({ ok: false, error: 'No se pudo guardar la configuración' }), { status: 500 })
  }

  // 3) Si vinieron las 3 credenciales (alta nueva o credenciales
  // nuevas), avisarle a Getnet dónde mandar los webhooks -- requisito
  // de Getnet, no un paso opcional de comodidad.
  if (clientId && clientSecret && sellerId) {
    const siteUrl = process.env.URL || process.env.DEPLOY_PRIME_URL || new URL(req.url).origin
    const apiBase = GETNET_API[modo] || GETNET_API.test
    const webhookUser = crypto.randomUUID()
    const webhookPassword = crypto.randomBytes(24).toString('hex')

    try {
      const accessToken = await obtenerAccessTokenGetnet(apiBase, clientId, clientSecret)

      // Success/error URL acá son solo el fallback -- crear-pago-getnet.js
      // siempre manda las suyas por payment intent, que tienen prioridad
      // (ver docs.globalgetnet.com, Configuration by API).
      const resTecnica = await fetch(`${apiBase}/dpy/web-checkout/v1/technical-configurations/${sellerId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken}` },
        body: JSON.stringify({
          success_url: `${siteUrl}/menu`,
          error_url: `${siteUrl}/menu`,
          notification: {
            url: `${siteUrl}/.netlify/functions/getnet-webhook?cliente=${clienteId}`,
            authentication_type: 'user_credentials',
            user_credentials: { user: webhookUser, password: webhookPassword },
          },
        }),
      })
      if (!resTecnica.ok) {
        const errTecnica = await resTecnica.json().catch(() => ({}))
        console.error('getnet-guardar-config: Getnet rechazó la configuración técnica', errTecnica)
        return new Response(
          JSON.stringify({
            ok: true,
            advertencia: 'Se guardaron las credenciales, pero Getnet rechazó la configuración del webhook -- revisá el Seller ID y reintentá.',
          }),
          { status: 200 },
        )
      }

      // Habilitar tarjeta de crédito/débito (los únicos métodos
      // relevantes para Argentina en este alcance -- sin bankslip/
      // instant_payment, que no aplican acá).
      const resComercial = await fetch(`${apiBase}/dpy/web-checkout/v1/business-configurations/${sellerId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken}` },
        body: JSON.stringify({
          instant_payment: { enable: false },
          bankslip: { enable: false },
          credit: { enable: true },
          debit: { enable: true },
        }),
      })
      if (!resComercial.ok) {
        const errComercial = await resComercial.json().catch(() => ({}))
        console.error('getnet-guardar-config: Getnet rechazó la configuración comercial', errComercial)
        return new Response(
          JSON.stringify({
            ok: true,
            advertencia: 'Se guardó el webhook, pero Getnet rechazó habilitar los medios de pago -- reintentá guardar.',
          }),
          { status: 200 },
        )
      }
    } catch (err) {
      console.error('getnet-guardar-config: error configurando contra Getnet', err)
      return new Response(
        JSON.stringify({
          ok: true,
          advertencia: 'Se guardaron las credenciales, pero no se pudo completar la configuración con Getnet -- reintentá en unos minutos.',
        }),
        { status: 200 },
      )
    }

    // 4) Todo salió bien -- recién ahora queda habilitado para cobrar.
    const { error: updateFinal } = await supabaseAdmin
      .from('clientes_pago_config')
      .update({
        getnet_webhook_user: webhookUser,
        getnet_webhook_password: webhookPassword,
        getnet_config_tecnica_ok: true,
        updated_at: new Date().toISOString(),
      })
      .eq('cliente_id', clienteId)
      .eq('proveedor', 'getnet')

    if (updateFinal) {
      console.error('getnet-guardar-config: error guardando el resultado de la config técnica', updateFinal)
    }
  }

  return new Response(JSON.stringify({ ok: true }), { status: 200 })
}
