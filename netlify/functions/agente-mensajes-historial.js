import { crearSupabaseAdmin, autenticarAgente } from './_lib/agenteAuth.js'

// Fase 50, Capa 4 -- consultar el historial de una conversación bajo
// demanda.
//
//   POST /.netlify/functions/agente-mensajes-historial
//   Header: X-Api-Key: <api key del tenant>
//   Body:   { "telefono": "5491122334455", "limite": 20 }   // limite opcional, default 20, tope 100
//
// agente-webhook.js (Capa 1) ya devuelve el historial reciente como
// parte de la respuesta al guardar el mensaje entrante -- este
// endpoint es para los casos en que n8n necesita reconsultarlo sin
// mandar un mensaje nuevo (ej. retomar contexto tras un timeout, o una
// futura pantalla "ver conversación" en el panel).

const HISTORIAL_LIMITE_DEFAULT = 20
const HISTORIAL_LIMITE_TOPE = 100

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
  if (!telefono) {
    return new Response(JSON.stringify({ ok: false, error: 'Falta telefono' }), { status: 400 })
  }

  let limite = Number(body.limite) || HISTORIAL_LIMITE_DEFAULT
  if (limite <= 0) limite = HISTORIAL_LIMITE_DEFAULT
  if (limite > HISTORIAL_LIMITE_TOPE) limite = HISTORIAL_LIMITE_TOPE

  const { data, error } = await supabaseAdmin
    .from('chat_messages')
    .select('sender, content, created_at')
    .eq('cliente_id', agente.clienteId)
    .eq('phone_number', telefono)
    .order('created_at', { ascending: false })
    .limit(limite)

  if (error) {
    console.error('agente-mensajes-historial: error leyendo historial', error)
    return new Response(JSON.stringify({ ok: false, error: 'No se pudo leer el historial' }), { status: 500 })
  }

  return new Response(
    JSON.stringify({
      ok: true,
      telefono,
      // Orden cronológico (más viejo primero), igual que agente-webhook.js.
      historial: (data || []).slice().reverse(),
    }),
    { status: 200 },
  )
}
