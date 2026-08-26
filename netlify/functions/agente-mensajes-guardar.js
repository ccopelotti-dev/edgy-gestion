import { crearSupabaseAdmin, autenticarAgente } from './_lib/agenteAuth.js'

// Fase 50, Capa 4 -- guardar en el historial lo que contestó la IA (o
// una nota interna del propio flujo de n8n).
//
//   POST /.netlify/functions/agente-mensajes-guardar
//   Header: X-Api-Key: <api key del tenant>
//   Body:   { "telefono": "5491122334455", "mensaje": "texto", "sender": "assistant" }
//
// El mensaje del cliente ('user') NO se guarda acá -- eso ya lo hace
// agente-webhook.js en el mismo momento en que llega (Capa 1). Este
// endpoint es el paso siguiente: una vez que la IA del lado de n8n
// decide qué contestar (o el propio flujo quiere dejar una nota
// interna, ej. "no pudo resolver el pedido, deriva a un humano"), lo
// guarda acá para que el historial quede completo.
//
// sender acepta 'assistant' o 'system' -- 'user' se rechaza a
// propósito, para no duplicar la responsabilidad de agente-webhook.js.

const SENDERS_PERMITIDOS = ['assistant', 'system']

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
  const mensaje = String(body.mensaje || '').trim()
  const sender = String(body.sender || 'assistant').trim()

  if (!telefono || !mensaje) {
    return new Response(JSON.stringify({ ok: false, error: 'Falta telefono o mensaje' }), { status: 400 })
  }
  if (!SENDERS_PERMITIDOS.includes(sender)) {
    return new Response(
      JSON.stringify({ ok: false, error: `sender debe ser uno de: ${SENDERS_PERMITIDOS.join(', ')}` }),
      { status: 400 },
    )
  }

  const { error } = await supabaseAdmin
    .from('chat_messages')
    .insert([{ cliente_id: agente.clienteId, phone_number: telefono, sender, content: mensaje }])

  if (error) {
    console.error('agente-mensajes-guardar: error guardando el mensaje', error)
    return new Response(JSON.stringify({ ok: false, error: 'No se pudo guardar el mensaje' }), { status: 500 })
  }

  return new Response(JSON.stringify({ ok: true }), { status: 200 })
}
