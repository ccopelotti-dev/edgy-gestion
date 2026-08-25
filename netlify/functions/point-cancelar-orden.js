import { createClient } from '@supabase/supabase-js'
import { randomUUID } from 'node:crypto'

// Fase 12c: cancela una orden Point creada por error o que el cajero
// decide no cobrar (ej. el cliente se arrepintió) mientras todavía
// está en estado 'created' -- si ya pasó a 'at_terminal' (la terminal
// ya la recibió), Mercado Pago exige cancelarla desde el propio
// dispositivo, no por API (ver payment-processing.md).

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
  const ordenId = String(body.ordenId || '')
  if (!clienteId || !ordenId) {
    return new Response(JSON.stringify({ ok: false, error: 'Falta clienteId u ordenId' }), { status: 400 })
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

  const { data: config } = await supabaseAdmin
    .from('clientes_pago_config')
    .select('access_token')
    .eq('cliente_id', clienteId)
    .eq('proveedor', 'mercadopago')
    .maybeSingle()

  if (!config?.access_token) {
    return new Response(JSON.stringify({ ok: false, error: 'No se encontró la configuración de Mercado Pago' }), { status: 409 })
  }

  try {
    const res = await fetch(`https://api.mercadopago.com/v1/orders/${ordenId}/cancel`, {
      method: 'POST',
      headers: { 'X-Idempotency-Key': randomUUID(), Authorization: `Bearer ${config.access_token}` },
    })
    const respuesta = await res.json()
    if (!res.ok) {
      console.error('point-cancelar-orden: Mercado Pago rechazó la cancelación', respuesta)
      return new Response(
        JSON.stringify({ ok: false, error: respuesta?.message || 'No se pudo cancelar (¿ya está en la terminal? cancelala ahí)' }),
        { status: 502 },
      )
    }
  } catch (err) {
    console.error('point-cancelar-orden: error de red', err)
    return new Response(JSON.stringify({ ok: false, error: 'No se pudo contactar a Mercado Pago' }), { status: 502 })
  }

  await supabaseAdmin
    .from('point_ordenes')
    .update({ estado: 'canceled', updated_at: new Date().toISOString() })
    .eq('id', ordenId)
    .eq('cliente_id', clienteId)

  return new Response(JSON.stringify({ ok: true }), { status: 200 })
}
