import { crearSupabaseAdmin, autenticarAgente } from './_lib/agenteAuth.js'

// Fase 63 (30/08) -- "agente conversacional en Ventas", escenario 2
// (ambiguo / con condición pegada, ej. "sí, pero me hacen un
// descuento?"). El agente ya le contestó al cliente con el mensaje de
// cortesía (eso lo hace n8n con el flujo normal) -- este endpoint deja
// registrada la PAUSA de esa conversación puntual (por teléfono, no
// global: puede haber varios clientes en pausa al mismo tiempo, ver
// migración 0111) para que el agente deje de autoresponderle a ese
// número hasta que el supervisor la retome.
//
//   POST /.netlify/functions/agente-conversacion-pausar
//   Header: X-Api-Key: <api key del tenant>
//   Body:   {
//     "telefono": "5492954464634",
//     "numeroDocumento": "PRE-00009",   // opcional, solo referencia
//     "motivo": "descuento"             // opcional, texto libre
//   }
//
// Idempotente: si ya había una pausa activa para ese teléfono, no crea
// una segunda fila (el índice único parcial de la migración 0111 lo
// evita a nivel de base igual, pero se chequea antes para no depender
// del código de error de Postgres).

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
  const numeroDocumento = body.numeroDocumento ? String(body.numeroDocumento).trim() : null
  const motivo = body.motivo ? String(body.motivo).trim() : null

  if (!telefono) {
    return new Response(JSON.stringify({ ok: false, error: 'Falta telefono' }), { status: 400 })
  }

  const { data: pausaActiva, error: errCheck } = await supabaseAdmin
    .from('agente_conversaciones_pausadas')
    .select('id, pausado_en')
    .eq('cliente_id', agente.clienteId)
    .eq('telefono', telefono)
    .is('despausado_en', null)
    .maybeSingle()

  if (errCheck) {
    console.error('agente-conversacion-pausar: error chequeando pausa existente', errCheck)
    return new Response(JSON.stringify({ ok: false, error: 'No se pudo consultar el estado de la conversación' }), { status: 500 })
  }

  if (pausaActiva) {
    return new Response(JSON.stringify({ ok: true, yaEstabaPausada: true, pausadoEn: pausaActiva.pausado_en }), { status: 200 })
  }

  const { error: insertError } = await supabaseAdmin.from('agente_conversaciones_pausadas').insert({
    cliente_id: agente.clienteId,
    telefono,
    numero_documento_referencia: numeroDocumento,
    motivo,
  })

  if (insertError) {
    console.error('agente-conversacion-pausar: error insertando la pausa', insertError)
    return new Response(JSON.stringify({ ok: false, error: 'No se pudo pausar la conversación' }), { status: 500 })
  }

  const ultimosDigitos = telefono.slice(-4)
  return new Response(
    JSON.stringify({
      ok: true,
      yaEstabaPausada: false,
      ultimosDigitos,
      instruccionSupervisor: `Para retomar: escribile "CONTINUAR-${ultimosDigitos}" en privado a este número, o mandale un presupuesto nuevo desde el sistema.`,
    }),
    { status: 200 },
  )
}
