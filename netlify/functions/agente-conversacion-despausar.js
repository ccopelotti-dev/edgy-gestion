import { crearSupabaseAdmin, autenticarAgente } from './_lib/agenteAuth.js'

// Fase 63 (30/08) -- contraparte de agente-conversacion-pausar.js.
// Dos caminos posibles para despausar una conversación (ver migración
// 0111), ambos terminan acá:
//
//  a) Comando privado del supervisor: n8n detecta que el remitente es
//     el numero_supervisor del tenant y que el texto matchea
//     /CONTINUAR-(\d+)/ -- manda esos últimos dígitos acá.
//  b) Automático: se llama con el teléfono completo del cliente cuando
//     el vendedor le manda un documento nuevo desde el sistema (ese
//     llamador todavía no existe -- hoy el despause automático se
//     resuelve solo-lectura desde agente-documento-check.js comparando
//     fechas; este endpoint es la vía EXPLÍCITA para el comando de
//     texto, que si necesita escribir sí o sí).
//
//   POST /.netlify/functions/agente-conversacion-despausar
//   Header: X-Api-Key: <api key del tenant>
//   Body:   { "ultimosDigitos": "4634" }             -- o bien
//           { "telefono": "5492954464634" }
//
// Si "ultimosDigitos" matchea más de una conversación pausada al mismo
// tiempo (dos clientes distintos cuyo teléfono termina igual -- muy
// improbable pero posible), se despausa la más reciente y se avisa la
// ambigüedad en la respuesta para que n8n se lo aclare al supervisor.

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

  const telefono = body.telefono ? String(body.telefono).trim() : null
  const ultimosDigitos = body.ultimosDigitos ? String(body.ultimosDigitos).trim() : null

  if (!telefono && !ultimosDigitos) {
    return new Response(JSON.stringify({ ok: false, error: 'Falta telefono o ultimosDigitos' }), { status: 400 })
  }

  let query = supabaseAdmin
    .from('agente_conversaciones_pausadas')
    .select('id, telefono, pausado_en')
    .eq('cliente_id', agente.clienteId)
    .is('despausado_en', null)
    .order('pausado_en', { ascending: false })

  query = telefono ? query.eq('telefono', telefono) : query.like('telefono', `%${ultimosDigitos}`)

  const { data: pausas, error: errBuscar } = await query
  if (errBuscar) {
    console.error('agente-conversacion-despausar: error buscando la pausa', errBuscar)
    return new Response(JSON.stringify({ ok: false, error: 'No se pudo buscar la conversación pausada' }), { status: 500 })
  }

  if (!pausas || pausas.length === 0) {
    return new Response(JSON.stringify({ ok: true, encontrada: false }), { status: 200 })
  }

  const objetivo = pausas[0]
  const { error: updateError } = await supabaseAdmin
    .from('agente_conversaciones_pausadas')
    .update({ despausado_en: new Date().toISOString(), despausado_por: 'comando_supervisor' })
    .eq('id', objetivo.id)

  if (updateError) {
    console.error('agente-conversacion-despausar: error actualizando la pausa', updateError)
    return new Response(JSON.stringify({ ok: false, error: 'No se pudo despausar la conversación' }), { status: 500 })
  }

  return new Response(
    JSON.stringify({
      ok: true,
      encontrada: true,
      telefono: objetivo.telefono,
      ambiguo: pausas.length > 1,
    }),
    { status: 200 },
  )
}
