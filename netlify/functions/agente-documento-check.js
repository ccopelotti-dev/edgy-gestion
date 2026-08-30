import { crearSupabaseAdmin, autenticarAgente } from './_lib/agenteAuth.js'

// Fase 51 (28/08, a pedido de Carlos) -- "el agente como canal de
// salida" ya manda documentos reales (Presupuesto, Factura, Cotización,
// Orden de Compra, Recibo, Comprobante de Pago, Confirmación de pedido,
// Ficha de medida) por WhatsApp. Cuando el destinatario responde, n8n
// necesita saber si ese teléfono le está contestando a un documento
// concreto ANTES de dejar que el agente de consultas conteste solo --
// una respuesta como "sí, dale, lo apruebo" no la puede interpretar ni
// ejecutar la IA, tiene que llegar a un humano.
//
// Este endpoint es de solo lectura + un marcado liviano: no decide nada
// de negocio, solo le contesta a n8n "¿este teléfono tiene un envío
// reciente sin resolver, y a qué número hay que escalarle la
// respuesta?". La decisión de cortar el flujo normal y reenviar el
// mensaje la toma el workflow de n8n con esta respuesta.
//
//   POST /.netlify/functions/agente-documento-check
//   Header: X-Api-Key: <api key del tenant>
//   Body:   { "telefono": "5492954464634" }
//
// Ventana de correlación: 30 días -- después de eso se asume que
// cualquier respuesta nueva de ese teléfono ya no es sobre aquel
// documento (arbitrario pero razonable para el volumen de hoy; se puede
// ajustar sin tocar el resto del flujo).
//
// Fase 52 (29/08, a pedido de Carlos) -- "estructura conversacional":
// numeroSupervisor/evolutionInstance* ahora se devuelven SIEMPRE, tenga
// o no un envío reciente. Antes solo viajaban cuando tieneEnvioReciente
// era true, porque era el único motivo de escalamiento que existía. Con
// la Función 2 ampliada (reclamo, pedido de condición especial,
// producto no encontrado) el workflow necesita el número del
// responsable en TODOS los casos de escalamiento, no solo cuando hay un
// documento de por medio -- así que esta llamada, que n8n ya hace
// siempre al principio del mensaje, queda como el único lugar que
// resuelve ese dato.
//
// Fase 63 (30/08, a pedido de Carlos) -- "agente conversacional en
// Ventas": además de chequear el envío reciente, esta función ahora
// también resuelve si ESE teléfono tiene una conversación en pausa
// (escenario 2 del diseño -- ver migración 0111). Se devuelve
// `pausado: true` para que n8n corte el flujo entero y NO conteste nada
// (el supervisor está atendiendo a mano desde la misma línea) -- salvo
// que ya se haya mandado un documento nuevo a ese mismo teléfono
// DESPUÉS de que se pausó, en cuyo caso la pausa quedó obsoleta y se
// resuelve sola acá mismo (despausado_por = 'documento_nuevo'), sin que
// el supervisor tenga que escribir ningún comando.
const VENTANA_DIAS = 30

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

  const desde = new Date(Date.now() - VENTANA_DIAS * 24 * 60 * 60 * 1000).toISOString()

  const { data: envio, error: errEnvio } = await supabaseAdmin
    .from('documentos_enviados_agente')
    .select('id, tipo_documento, numero_documento, created_at, escalado_at')
    .eq('cliente_id', agente.clienteId)
    .eq('telefono', telefono)
    .gte('created_at', desde)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (errEnvio) {
    console.error('agente-documento-check: error consultando documentos_enviados_agente', errEnvio)
    return new Response(JSON.stringify({ ok: false, error: 'No se pudo consultar el historial de envíos' }), { status: 500 })
  }

  // Marca la primera vez que se detecta esta respuesta -- no bloquea ni
  // cambia la respuesta si falla, es solo para tener el dato en la base.
  if (envio && !envio.escalado_at) {
    await supabaseAdmin
      .from('documentos_enviados_agente')
      .update({ escalado_at: new Date().toISOString() })
      .eq('id', envio.id)
  }

  // Fase 63: ¿este teléfono tiene una conversación en pausa? (ver
  // comentario arriba). `envio` ya es el envío MÁS RECIENTE a este
  // teléfono -- si es posterior a cuando se pausó, la pausa quedó
  // obsoleta sola (el vendedor le mandó algo nuevo) y se cierra acá.
  let pausado = false
  const { data: pausaActiva, error: errPausa } = await supabaseAdmin
    .from('agente_conversaciones_pausadas')
    .select('id, pausado_en, numero_documento_referencia')
    .eq('cliente_id', agente.clienteId)
    .eq('telefono', telefono)
    .is('despausado_en', null)
    .maybeSingle()

  if (errPausa) {
    console.error('agente-documento-check: error consultando pausas', errPausa)
    // No corta el flujo -- si esto falla, mejor tratar como "no
    // pausado" (el agente sigue respondiendo) que dejar al cliente sin
    // respuesta por un problema de infraestructura ajeno a su mensaje.
  } else if (pausaActiva) {
    const huboEnvioPosterior = envio && new Date(envio.created_at) > new Date(pausaActiva.pausado_en)
    if (huboEnvioPosterior) {
      await supabaseAdmin
        .from('agente_conversaciones_pausadas')
        .update({ despausado_en: new Date().toISOString(), despausado_por: 'documento_nuevo' })
        .eq('id', pausaActiva.id)
    } else {
      pausado = true
    }
  }

  const { data: config, error: errConfig } = await supabaseAdmin
    .from('clientes_agente_config')
    .select('numero_supervisor, evolution_instance_nombre, evolution_instance_apikey')
    .eq('cliente_id', agente.clienteId)
    .maybeSingle()

  if (errConfig) {
    console.error('agente-documento-check: error consultando clientes_agente_config', errConfig)
    return new Response(JSON.stringify({ ok: false, error: 'No se pudo leer la configuración del tenant' }), { status: 500 })
  }

  return new Response(
    JSON.stringify({
      ok: true,
      pausado,
      tieneEnvioReciente: Boolean(envio),
      documento: envio
        ? { tipoDocumento: envio.tipo_documento, numeroDocumento: envio.numero_documento, enviadoAt: envio.created_at }
        : null,
      numeroSupervisor: config?.numero_supervisor || null,
      // Se devuelven también acá -- n8n ya tiene la instancia cargada en
      // el nodo de turno, pero mandarla resuelta evita un segundo golpe
      // a la base solo para reenviar el aviso al supervisor.
      evolutionInstanceNombre: config?.evolution_instance_nombre || null,
      evolutionInstanceApikey: config?.evolution_instance_apikey || null,
    }),
    { status: 200 },
  )
}
