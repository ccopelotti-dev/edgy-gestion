import { crearSupabaseAdmin, autenticarAgente } from './_lib/agenteAuth.js'

// Fase 50, Capa 3 -- herramienta "cargar el pedido" para el agente.
//
//   POST /.netlify/functions/agente-ordenes-crear
//   Header: X-Api-Key: <api key del tenant>
//   Body:   {
//     "telefono": "5491122334455",
//     "nombre": "Juana Pérez",              // opcional -- solo se usa si hay que dar de alta al cliente
//     "canalCumplimiento": "retiro",         // "retiro" | "delivery"
//     "direccion": "Av. Siempreviva 742",    // requerida siempre (igual que el Menú Público)
//     "notas": "sin cebolla",                // opcional
//     "items": [ { "productoId": "<uuid>", "cantidad": 2 } ]
//   }
//
// Decisión de Carlos (26/08): el pedido creado por el agente SIEMPRE
// usa un cliente identificado (clientes_venta real) -- no el circuito
// anónimo que ya usa el Menú Público. Si no existe un clientes_venta
// con ese teléfono para este tenant, se crea uno con valores por
// defecto razonables (ver migración 0099_fase50_crear_orden_venta_agente.sql).
//
// Toda la lógica (alta de cliente si hace falta, resolución de precio
// por lista, numeración del pedido, inserts en ordenes_venta +
// orden_venta_items + pedidos_delivery) vive en la función SQL
// crear_orden_venta_agente -- no acá -- porque necesita ser atómica
// (varias tablas relacionadas + un numero secuencial que no puede
// pisarse entre llamadas concurrentes). Mismo patrón que
// crear_orden_venta_publica, que ya resuelve esto mismo para el Menú
// Público.

export default async (req) => {
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ ok: false, error: 'Método no permitido' }), { status: 405 })
  }

  const supabaseAdmin = crearSupabaseAdmin()
  const agente = await autenticarAgente(req, supabaseAdmin)
  if (!agente) {
    return new Response(JSON.stringify({ ok: false, error: 'API key inválida' }), { status: 401 })
  }

  let body
  try {
    body = await req.json()
  } catch (e) {
    return new Response(JSON.stringify({ ok: false, error: 'Body inválido' }), { status: 400 })
  }

  const telefono = String(body.telefono || '').trim()
  const nombre = body.nombre ? String(body.nombre).trim() : null
  const canalCumplimiento = String(body.canalCumplimiento || '').trim()
  const direccion = body.direccion ? String(body.direccion).trim() : null
  const notas = body.notas ? String(body.notas).trim() : null
  const items = Array.isArray(body.items) ? body.items : null

  if (!telefono) {
    return new Response(JSON.stringify({ ok: false, error: 'Falta telefono' }), { status: 400 })
  }
  if (!['retiro', 'delivery'].includes(canalCumplimiento)) {
    return new Response(JSON.stringify({ ok: false, error: 'canalCumplimiento debe ser "retiro" o "delivery"' }), { status: 400 })
  }
  if (!direccion) {
    return new Response(JSON.stringify({ ok: false, error: 'Falta direccion' }), { status: 400 })
  }
  if (!items || items.length === 0) {
    return new Response(JSON.stringify({ ok: false, error: 'Falta items (el pedido no tiene ítems)' }), { status: 400 })
  }

  const itemsRpc = items.map((it) => ({
    productoId: it.productoId,
    cantidad: it.cantidad,
  }))

  const { data, error } = await supabaseAdmin.rpc('crear_orden_venta_agente', {
    p_cliente_id: agente.clienteId,
    p_telefono: telefono,
    p_nombre: nombre,
    p_canal_cumplimiento: canalCumplimiento,
    p_direccion: direccion,
    p_notas: notas,
    p_items: itemsRpc,
  })

  if (error) {
    console.error('agente-ordenes-crear: error creando el pedido', error)
    // El mensaje de la excepción SQL (ej. "Un producto del pedido ya no
    // está disponible") es útil tal cual para que el agente se lo pueda
    // explicar al cliente -- no hace falta un catálogo de códigos acá.
    return new Response(JSON.stringify({ ok: false, error: error.message || 'No se pudo crear el pedido' }), { status: 400 })
  }

  // Nota en el historial de la conversación -- para que quien revise el
  // chat desde el panel (cuando exista esa pantalla) vea en contexto
  // que ahí se generó un pedido, sin tener que cruzar con Ventas.
  const { error: notaError } = await supabaseAdmin.from('chat_messages').insert([
    {
      cliente_id: agente.clienteId,
      phone_number: telefono,
      sender: 'system',
      content: `Pedido #${data.numero} creado por $${data.total}`,
    },
  ])
  if (notaError) {
    console.error('agente-ordenes-crear: no se pudo guardar la nota del pedido en chat_messages', notaError)
  }

  return new Response(
    JSON.stringify({
      ok: true,
      ordenId: data.ordenId,
      numero: data.numero,
      total: data.total,
      clienteVentaId: data.clienteVentaId,
      clienteCreado: data.clienteCreado,
    }),
    { status: 200 },
  )
}
