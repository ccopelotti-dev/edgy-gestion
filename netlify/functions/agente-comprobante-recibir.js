import { crearSupabaseAdmin, autenticarAgente } from './_lib/agenteAuth.js'

// Fase 50c -- rama administrativa del agente de WhatsApp (whitelist +
// documentos recibidos, ver migración 0100 y el diagrama acordado con
// Carlos el 27/08). A diferencia de agente-webhook.js (Capa 1 de
// Ventas, que acepta cualquier número), este endpoint es el punto de
// entrada de "mandame la factura por WhatsApp" -- por eso primero
// valida que el remitente esté en la whitelist del tenant
// (clientes_agente_admins) antes de aceptar el documento.
//
//   POST /.netlify/functions/agente-comprobante-recibir
//   Header: X-Api-Key: <api key del tenant>
//   Body:   {
//     "telefono": "5492954610221",     // quién mandó la imagen
//     "imagenUrl": "https://...",      // URL ya resuelta del lado de n8n
//                                       // (Evolution entrega el archivo
//                                       // encriptado -- la decodificación
//                                       // y el guardado en algún storage
//                                       // público/firmado es responsabilidad
//                                       // del flujo de n8n, no de este
//                                       // endpoint)
//     "tipo": "factura",                // opcional, texto libre
//     "datosExtraidos": { ... },        // opcional -- lo que haya sacado
//                                       // Claude Vision (proveedor, CUIT,
//                                       // fecha, ítems, total, etc.)
//     "notas": "..."                    // opcional
//   }
//
// Si el número NO está en la whitelist, igual se deja el registro (con
// estado 'rechazado_no_autorizado', sin admin_id) para que Carlos vea
// si alguien intentó mandar algo sin estar autorizado -- pero se le
// avisa al llamador vía `autorizado: false` para que el flujo de n8n
// decida qué contestarle a ese número (ej. "no estás autorizado,
// contactá a Carlos"), sin intentar procesar el documento como si
// fuera válido.
//
// Todavía NO intenta cargar nada automático en Compras (comprobantes
// de compra, actualización de stock, etc.) -- eso es responsabilidad
// de una etapa siguiente, una vez que se perfile en detalle el agente
// administrativo. Por ahora es solo una bandeja de entrada para que un
// humano revise.

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
  const imagenUrl = String(body.imagenUrl || '').trim()
  const tipo = body.tipo ? String(body.tipo).trim() : null
  const notas = body.notas ? String(body.notas).trim() : null
  const datosExtraidos = body.datosExtraidos && typeof body.datosExtraidos === 'object' ? body.datosExtraidos : null

  if (!telefono || !imagenUrl) {
    return new Response(JSON.stringify({ ok: false, error: 'Falta telefono o imagenUrl' }), { status: 400 })
  }

  const { data: admin, error: adminError } = await supabaseAdmin
    .from('clientes_agente_admins')
    .select('id, nombre')
    .eq('cliente_id', agente.clienteId)
    .eq('numero_whatsapp', telefono)
    .eq('activo', true)
    .maybeSingle()

  if (adminError) {
    console.error('agente-comprobante-recibir: error consultando whitelist', adminError)
    return new Response(JSON.stringify({ ok: false, error: 'No se pudo validar el remitente' }), { status: 500 })
  }

  const autorizado = Boolean(admin)

  const { data: comprobante, error: insertError } = await supabaseAdmin
    .from('comprobantes_recibidos')
    .insert([{
      cliente_id: agente.clienteId,
      numero_whatsapp_remitente: telefono,
      admin_id: admin?.id ?? null,
      tipo,
      imagen_url: imagenUrl,
      datos_extraidos: datosExtraidos,
      estado: autorizado ? 'pendiente_revision' : 'rechazado_no_autorizado',
      notas,
    }])
    .select('id, estado')
    .single()

  if (insertError) {
    console.error('agente-comprobante-recibir: error guardando el documento', insertError)
    return new Response(JSON.stringify({ ok: false, error: 'No se pudo guardar el documento' }), { status: 500 })
  }

  return new Response(
    JSON.stringify({
      ok: true,
      autorizado,
      remitenteNombre: admin?.nombre ?? null,
      comprobanteId: comprobante.id,
      estado: comprobante.estado,
    }),
    { status: 200 },
  )
}
