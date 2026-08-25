import { createClient } from '@supabase/supabase-js'
import { randomUUID } from 'node:crypto'

// Fase 12c: crea una orden de cobro en la terminal Point vinculada del
// cliente -- se llama desde Ventas > Punto de Venta al elegir "Cobrar
// con Point" con medio de pago tarjeta. La orden queda cargada en la
// terminal para que el comprador pague ahí mismo; el resultado real
// llega después por Webhook (ver point-orden-webhook.js) y se
// consulta desde el frontend leyendo edgy_gestion.point_ordenes
// (nunca haciendo polling directo contra la API de Mercado Pago --
// la propia documentación de Point lo desaconseja, tiene rate limit).
//
// POST https://api.mercadopago.com/v1/orders {type:"point", ...}
//
// Auth: cualquier usuario logueado DEL cliente puede cobrar (ya pasó
// el gate de la app para llegar a Punto de Venta) -- a diferencia de
// point-listar-terminales/point-vincular-terminal, que sí piden admin
// porque tocan la configuración de la cuenta de Mercado Pago.

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
  const monto = Number(body.monto)
  const descripcion = body.descripcion ? String(body.descripcion).slice(0, 100) : 'Venta Punto de Venta'
  if (!clienteId || !Number.isFinite(monto) || monto <= 0) {
    return new Response(JSON.stringify({ ok: false, error: 'Falta clienteId o el monto es inválido' }), { status: 400 })
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

  const { data: config, error: configError } = await supabaseAdmin
    .from('clientes_pago_config')
    .select('access_token, point_habilitado, point_terminal_id')
    .eq('cliente_id', clienteId)
    .eq('proveedor', 'mercadopago')
    .maybeSingle()

  if (configError) {
    console.error('point-crear-orden: error leyendo config', configError)
    return new Response(JSON.stringify({ ok: false, error: 'No se pudo leer la configuración' }), { status: 500 })
  }
  if (!config?.point_habilitado || !config?.point_terminal_id || !config?.access_token) {
    return new Response(
      JSON.stringify({ ok: false, error: 'Este negocio no tiene una terminal Point vinculada (Configuración > Empresa)' }),
      { status: 409 },
    )
  }

  const externalReference = `pdv-${randomUUID()}`
  const idempotencyKey = randomUUID()

  const ordenBody = {
    type: 'point',
    external_reference: externalReference,
    expiration_time: String(body.expirationTime || 'PT5M'),
    transactions: { payments: [{ amount: monto.toFixed(2) }] },
    config: {
      point: { terminal_id: config.point_terminal_id, print_on_terminal: 'no_ticket' },
      payment_method: { default_type: 'credit_card' },
    },
    description: descripcion,
  }

  let orden
  try {
    const res = await fetch('https://api.mercadopago.com/v1/orders', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Idempotency-Key': idempotencyKey,
        Authorization: `Bearer ${config.access_token}`,
      },
      body: JSON.stringify(ordenBody),
    })
    orden = await res.json()
    if (!res.ok) {
      console.error('point-crear-orden: Mercado Pago rechazó la orden', orden)
      return new Response(
        JSON.stringify({ ok: false, error: orden?.message || 'Mercado Pago rechazó la orden de cobro' }),
        { status: 502 },
      )
    }
  } catch (err) {
    console.error('point-crear-orden: error de red', err)
    return new Response(JSON.stringify({ ok: false, error: 'No se pudo contactar a Mercado Pago' }), { status: 502 })
  }

  const { error: insertError } = await supabaseAdmin.from('point_ordenes').insert({
    id: orden.id,
    cliente_id: clienteId,
    external_reference: externalReference,
    terminal_id: config.point_terminal_id,
    monto,
    estado: orden.status || 'created',
    status_detail: orden.status_detail || null,
    payment_id: orden.transactions?.payments?.[0]?.id || null,
  })

  if (insertError) {
    console.error('point-crear-orden: error guardando el tracking local', insertError)
    // La orden ya se creó y está cargada en la terminal -- no tiene
    // sentido cancelarla por esto, pero el polling del frontend no va
    // a encontrar la fila. Se devuelve igual (el webhook, cuando
    // llegue, va a fallar el upsert también -- conviene revisar logs).
  }

  return new Response(JSON.stringify({ ok: true, ordenId: orden.id, externalReference }), { status: 200 })
}
