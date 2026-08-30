import { crearSupabaseAdmin, autenticarAgente } from './_lib/agenteAuth.js'

// Fase 63 (30/08, a pedido de Carlos) -- "agente conversacional en
// Ventas", escenario 1 (confirmación clara). Cuando la clasificación IA
// de n8n detecta que la respuesta del cliente a un Presupuesto es una
// confirmación inequívoca (ej. "sí, dale, lo apruebo"), este endpoint
// ejecuta la MISMA acción que hoy dispara un click humano en "Aprobar y
// crear orden" (Presupuestos.tsx / CONVERTIR_PRESUPUESTO_A_ORDEN):
// crea la Orden de venta a partir del Presupuesto y deja este último en
// estado 'aprobado'. Toda la lógica de negocio (numeración, copia de
// ítems, idempotencia) vive en la función SQL aprobar_presupuesto_agente
// (migración 0111) -- mismo criterio que agente-ordenes-crear.js.
//
//   POST /.netlify/functions/agente-presupuesto-aprobar
//   Header: X-Api-Key: <api key del tenant>
//   Body:   { "telefono": "5492954464634", "numeroDocumento": "PRE-00009" }
//
// Nota deliberada (30/08): a diferencia del flujo humano, acá NO se
// genera ni se manda el PDF de "Confirmación de pedido" -- ese motor
// (generarComprobantePdf) usa APIs de navegador (canvas/Image) para el
// logo, que no existen en una Netlify Function. Se devuelve el texto ya
// armado para que n8n se lo mande al cliente como mensaje de WhatsApp
// (mismo canal, sin adjunto); el vendedor humano puede mandar el PDF
// prolijo después con un clic desde Órdenes de Venta (botón ya
// existente, Fase 51) si hace falta. Si más adelante Carlos quiere el
// PDF automático también acá, hace falta un generador de PDF aparte que
// no dependa de DOM (rediseño, no un ajuste chico).

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
  const numeroDocumento = String(body.numeroDocumento || '').trim()
  if (!telefono) {
    return new Response(JSON.stringify({ ok: false, error: 'Falta telefono' }), { status: 400 })
  }
  if (!numeroDocumento) {
    return new Response(JSON.stringify({ ok: false, error: 'Falta numeroDocumento' }), { status: 400 })
  }

  const { data, error } = await supabaseAdmin.rpc('aprobar_presupuesto_agente', {
    p_cliente_id: agente.clienteId,
    p_numero_documento: numeroDocumento,
  })

  if (error) {
    console.error('agente-presupuesto-aprobar: error aprobando el presupuesto', error)
    // El mensaje de la excepción SQL (ej. "El presupuesto PRE-00009 está
    // cancelado") es útil tal cual para que n8n se lo pueda explicar al
    // supervisor -- no hace falta un catálogo de códigos acá.
    return new Response(JSON.stringify({ ok: false, error: error.message || 'No se pudo aprobar el presupuesto' }), { status: 400 })
  }

  // Fix (30/08, reportado por Carlos): data.total es el neto guardado en
  // presupuestos.total -- igual que hace el flujo humano (Presupuestos.tsx
  // / CONVERTIR_PRESUPUESTO_A_ORDEN, ver store.tsx), que también crea la
  // Orden con el total neto. Pero el precio que el cliente vio en el
  // Presupuesto (pantalla y PDF) es CON IVA incluido (conIvaIncluido() en
  // ventas/lib/format.ts, Fase 42) -- por eso el monto que le mencionamos
  // acá tiene que ser el mismo, o el cliente lee un número que no reconoce.
  // ivaDefault hoy es un valor fijo (SEED_STATE.config.ivaDefault = 21,
  // ventas/data/seed.ts) -- UPDATE_CONFIG ni siquiera persiste en Supabase
  // todavía, así que 21 es efectivamente la única alícuota que existe en
  // todo el sistema por ahora. Si eso cambia (config real por tenant), hay
  // que traer ese valor acá en vez de este literal.
  const IVA_DEFAULT = 21
  const totalConIva = Math.round(Number(data.total) * (1 + IVA_DEFAULT / 100) * 100) / 100

  // Nota en el historial de la conversación -- mismo criterio que
  // agente-ordenes-crear.js.
  const { error: notaError } = await supabaseAdmin.from('chat_messages').insert([
    {
      cliente_id: agente.clienteId,
      phone_number: telefono,
      sender: 'system',
      content: data.yaAprobado
        ? `Presupuesto ${numeroDocumento} ya estaba aprobado (Orden ${data.numeroOrden})`
        : `Presupuesto ${numeroDocumento} confirmado por el cliente -- Orden ${data.numeroOrden} generada por $${totalConIva}`,
    },
  ])
  if (notaError) {
    console.error('agente-presupuesto-aprobar: no se pudo guardar la nota en chat_messages', notaError)
  }

  const nombre = data.clienteNombre ? String(data.clienteNombre).split(' ')[0] : ''
  const mensajeCliente =
    `Hola${nombre ? ` ${nombre}` : ''}, ¡gracias por confirmar! ` +
    `Tu pedido ${data.numeroOrden} ya quedó generado en el sistema. ` +
    `Cualquier consulta, quedamos a disposición.`

  return new Response(
    JSON.stringify({
      ok: true,
      yaAprobado: Boolean(data.yaAprobado),
      presupuestoId: data.presupuestoId,
      ordenId: data.ordenId,
      numeroOrden: data.numeroOrden,
      total: data.total,
      totalConIva,
      clienteNombre: data.clienteNombre,
      mensajeCliente,
      mensajeSupervisor: `${numeroDocumento} confirmado por el cliente -- pedido ${data.numeroOrden} generado por $${totalConIva}.`,
    }),
    { status: 200 },
  )
}
