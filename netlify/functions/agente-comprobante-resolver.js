import { crearSupabaseAdmin, autenticarAgente } from './_lib/agenteAuth.js'
import { intentarCargarComprobante, normalizarFormaPago } from './_lib/agenteComprobanteCompra.js'

// Fase 54 -- segunda mitad del flujo de carga automática (Tarea #149).
// Cuando el agente no puede determinar la forma de pago (Contado /
// Cuenta Corriente) de una factura, le pregunta al admin por el mismo
// chat y queda esperando. Este endpoint es al que n8n llama con el
// PRÓXIMO mensaje de TEXTO de ese número, para ver si es la respuesta
// a esa pregunta -- si no hay nada pendiente, devuelve
// `huboPendiente:false` y n8n sigue con lo que ya hacía antes (hoy,
// nada -- Función 1 solo reacciona a imágenes).
//
//   POST /.netlify/functions/agente-comprobante-resolver
//   Header: X-Api-Key: <api key del tenant>
//   Body:   { "telefono": "5492954464634", "texto": "contado" }

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
  const texto = String(body.texto || '').trim()
  if (!telefono || !texto) {
    return new Response(JSON.stringify({ ok: false, error: 'Falta telefono o texto' }), { status: 400 })
  }

  const { data: admin, error: adminError } = await supabaseAdmin
    .from('clientes_agente_admins')
    .select('id, solo_prueba')
    .eq('cliente_id', agente.clienteId)
    .eq('numero_whatsapp', telefono)
    .eq('activo', true)
    .maybeSingle()

  if (adminError) {
    console.error('agente-comprobante-resolver: error consultando whitelist', adminError)
    return new Response(JSON.stringify({ ok: false, error: 'No se pudo validar el remitente' }), { status: 500 })
  }
  if (!admin) {
    return new Response(JSON.stringify({ ok: true, huboPendiente: false }), { status: 200 })
  }

  const { data: pendiente, error: pendienteError } = await supabaseAdmin
    .from('comprobantes_recibidos')
    .select('id, datos_extraidos, es_prueba')
    .eq('cliente_id', agente.clienteId)
    .eq('admin_id', admin.id)
    .eq('pendiente_aclaracion', 'forma_pago')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (pendienteError) {
    console.error('agente-comprobante-resolver: error buscando pendiente', pendienteError)
    return new Response(JSON.stringify({ ok: false, error: 'No se pudo consultar pendientes' }), { status: 500 })
  }

  if (!pendiente) {
    return new Response(JSON.stringify({ ok: true, huboPendiente: false }), { status: 200 })
  }

  const formaPago = normalizarFormaPago(texto)
  if (!formaPago) {
    // No se entendió la respuesta -- se le vuelve a preguntar, no se
    // toca nada del registro pendiente.
    return new Response(
      JSON.stringify({ ok: true, huboPendiente: true, entendido: false }),
      { status: 200 },
    )
  }

  const resultado = await intentarCargarComprobante({
    supabaseAdmin,
    clienteId: agente.clienteId,
    comprobanteRecibidoId: pendiente.id,
    datosExtraidos: pendiente.datos_extraidos,
    formaPagoRespuesta: formaPago,
    esPrueba: pendiente.es_prueba,
  })

  return new Response(
    JSON.stringify({ ok: true, huboPendiente: true, entendido: true, cargaCompras: resultado }),
    { status: 200 },
  )
}
