import { crearSupabaseAdmin, autenticarAgente } from './_lib/agenteAuth.js'

// Fase 50, Capa 1 -- "El Portal". Punto de entrada único para mensajes
// de WhatsApp entrantes, ya normalizados por el VPS/n8n (todavía no
// existe -- Carlos lo arma después, a medida, una vez que este
// contrato esté firme). Por eso ACÁ NO se parsea ningún formato crudo
// de Meta Cloud API ni de Baileys -- eso es responsabilidad de lo que
// llame a este endpoint. Lo único que espera este endpoint es:
//
//   POST /.netlify/functions/agente-webhook
//   Header: X-Api-Key: <api key del tenant>
//   Body:   { "telefono": "5491122334455", "mensaje": "texto del cliente" }
//
// El tenant se identifica por la API key (Capa 2), no hace falta mandar
// ningún identificador de negocio en el body -- cada negocio de Carlos
// va a tener su propia key en su propio flujo de n8n.
//
// Lo único que hace por ahora: valida la key, guarda el mensaje
// entrante en chat_messages (sender='user') y devuelve el historial
// reciente de esa conversación -- para que el orquestador (n8n) tenga
// contexto antes de decidir qué herramienta de Capa 3 llamar y qué
// contestarle al cliente. Guardar la respuesta del asistente es un paso
// aparte -- ver agente-mensajes-guardar.js -- porque quien decide esa
// respuesta es la IA del lado de n8n, no este endpoint.

const HISTORIAL_LIMITE = 20

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
  if (!telefono || !mensaje) {
    return new Response(JSON.stringify({ ok: false, error: 'Falta telefono o mensaje' }), { status: 400 })
  }

  const { error: insertError } = await supabaseAdmin
    .from('chat_messages')
    .insert([{ cliente_id: agente.clienteId, phone_number: telefono, sender: 'user', content: mensaje }])

  if (insertError) {
    console.error('agente-webhook: error guardando el mensaje entrante', insertError)
    return new Response(JSON.stringify({ ok: false, error: 'No se pudo guardar el mensaje' }), { status: 500 })
  }

  const { data: historial, error: historialError } = await supabaseAdmin
    .from('chat_messages')
    .select('sender, content, created_at')
    .eq('cliente_id', agente.clienteId)
    .eq('phone_number', telefono)
    .order('created_at', { ascending: false })
    .limit(HISTORIAL_LIMITE)

  if (historialError) {
    console.error('agente-webhook: error leyendo historial', historialError)
  }

  return new Response(
    JSON.stringify({
      ok: true,
      clienteId: agente.clienteId,
      telefono,
      // Se devuelve en orden cronológico (más viejo primero) -- más
      // cómodo para armar el contexto de la IA que al revés.
      historial: (historial || []).slice().reverse(),
    }),
    { status: 200 },
  )
}
