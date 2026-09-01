import { randomUUID } from 'crypto'
import { crearSupabaseAdmin, autenticarAgente } from './_lib/agenteAuth.js'
import { intentarCargarComprobante } from './_lib/agenteComprobanteCompra.js'

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
//     "telefono": "5492954610221",       // quién mandó la imagen
//     "imagenBase64": "iVBORw0KG...",     // base64 crudo (sin el prefijo
//                                         // data:...;base64,) tal cual lo
//                                         // devuelve Evolution API en
//                                         // /chat/getBase64FromMediaMessage
//     "mimeType": "image/jpeg",           // opcional, default image/jpeg
//     "tipo": "factura",                  // opcional, texto libre
//     "datosExtraidos": { ... },          // opcional -- lo que haya sacado
//                                         // Claude Vision (proveedor, CUIT,
//                                         // fecha, ítems, total, etc.)
//     "notas": "..."                      // opcional
//   }
//
// El upload a Supabase Storage se hace ACÁ (con service_role), no del
// lado de n8n -- así el n8n workflow nunca necesita tener la
// service_role key de Supabase, solo la X-Api-Key del tenant (mismo
// criterio de seguridad que el resto de los endpoints /agente-*).
// Reutiliza el bucket privado "comprobantes-gastos" (mismo patrón que
// src/modules/gastos-fijos/lib/comprobantesGastos.ts): se guarda el
// PATH en `comprobantes_recibidos.imagen_url` -- no es una URL pública,
// hay que resolverla con createSignedUrl cuando se quiera ver (lo mismo
// que ya hace `obtenerUrlComprobanteGasto`).
//
// Si el número NO está en la whitelist, no se sube la imagen (para no
// gastar storage con intentos no autorizados) pero igual se deja el
// registro (con estado 'rechazado_no_autorizado', sin admin_id ni
// imagen) para que Carlos vea si alguien intentó mandar algo sin estar
// autorizado -- y se le avisa al llamador vía `autorizado: false` para
// que el flujo de n8n decida qué contestarle a ese número.
//
// Todavía NO intenta cargar nada automático en Compras (comprobantes
// de compra, actualización de stock, etc.) ni corre extracción por
// Claude Vision -- eso es responsabilidad de una etapa siguiente, una
// vez que se perfile en detalle el agente administrativo. Por ahora es
// una bandeja de entrada (con la imagen ya guardada) para que un humano
// revise.

const BUCKET_COMPROBANTES = 'comprobantes-gastos'

const EXTENSION_POR_MIME = {
  'image/jpeg': 'jpg',
  'image/jpg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'application/pdf': 'pdf',
}

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
  const imagenBase64 = String(body.imagenBase64 || '').trim()
  const mimeType = body.mimeType ? String(body.mimeType).trim() : 'image/jpeg'
  const tipo = body.tipo ? String(body.tipo).trim() : null
  const notas = body.notas ? String(body.notas).trim() : null
  const datosExtraidos = body.datosExtraidos && typeof body.datosExtraidos === 'object' ? body.datosExtraidos : null
  // Fase 56 -- si el admin mandó la foto con "hogar" de pie de foto
  // (ver n8n), n8n manda destino:"hogar" acá. El documento en sí se
  // guarda igual (mismo cliente_id, misma whitelist, mismo storage) --
  // lo único que cambia es a qué SET DE TABLAS se carga el comprobante
  // (Home Keep: comprobantes_hogar/proveedores_hogar, en vez de las de
  // Compras real). Antes (Fase 55) esto cambiaba de cliente_id a un
  // tenant aparte; se dejó de lado por la fricción de manejar un login
  // separado -- ver agenteComprobanteCompra.js.
  const destino = body.destino ? String(body.destino).trim().toLowerCase() : null

  if (!telefono || !imagenBase64) {
    return new Response(JSON.stringify({ ok: false, error: 'Falta telefono o imagenBase64' }), { status: 400 })
  }

  const { data: admin, error: adminError } = await supabaseAdmin
    .from('clientes_agente_admins')
    .select('id, nombre, solo_prueba')
    .eq('cliente_id', agente.clienteId)
    .eq('numero_whatsapp', telefono)
    .eq('activo', true)
    .maybeSingle()

  if (adminError) {
    console.error('agente-comprobante-recibir: error consultando whitelist', adminError)
    return new Response(JSON.stringify({ ok: false, error: 'No se pudo validar el remitente' }), { status: 500 })
  }

  const autorizado = Boolean(admin)
  let imagenPath = null

  if (autorizado) {
    let buffer
    try {
      buffer = Buffer.from(imagenBase64, 'base64')
    } catch (e) {
      return new Response(JSON.stringify({ ok: false, error: 'imagenBase64 inválido' }), { status: 400 })
    }
    if (!buffer.length) {
      return new Response(JSON.stringify({ ok: false, error: 'imagenBase64 vacío' }), { status: 400 })
    }

    const extension = EXTENSION_POR_MIME[mimeType] || 'jpg'
    const path = `whatsapp-admin/${agente.clienteId}/${randomUUID()}.${extension}`

    const { error: uploadError } = await supabaseAdmin.storage
      .from(BUCKET_COMPROBANTES)
      .upload(path, buffer, { contentType: mimeType, upsert: false })

    if (uploadError) {
      console.error('agente-comprobante-recibir: error subiendo la imagen', uploadError)
      return new Response(JSON.stringify({ ok: false, error: 'No se pudo guardar la imagen' }), { status: 500 })
    }
    imagenPath = path
  }

  const esPrueba = admin?.solo_prueba ?? false

  // Fase 56 -- destino='hogar' solo decide el SET DE TABLAS (Home Keep
  // vs. Compras real) dentro del MISMO cliente_id del admin -- no hace
  // falta resolver ningún otro tenant. Se persiste igual en la bandeja
  // para que agente-comprobante-resolver.js (segundo llamado, cuando
  // responde la forma de pago) sepa a qué tablas seguir apuntando.
  const destinoValido = destino === 'hogar' ? 'hogar' : null

  // Fase 68b -- la IA de visión ya viene clasificando la imagen (ver
  // prompt de "Extraer Datos Comprobante {Tenant}" en n8n, campo
  // tipoDocumento: 'factura' | 'ticket_pago' | 'otro'). Se persiste acá
  // mismo, en el alta, para que quede visible en la bandeja aunque el
  // intento de carga automática (más abajo) todavía no haya corrido o
  // haya fallado por otro motivo.
  const TIPOS_DOCUMENTO_VALIDOS = ['factura', 'ticket_pago', 'otro']
  const tipoDocumentoDetectado = TIPOS_DOCUMENTO_VALIDOS.includes(datosExtraidos?.tipoDocumento)
    ? datosExtraidos.tipoDocumento
    : null

  const { data: comprobante, error: insertError } = await supabaseAdmin
    .from('comprobantes_recibidos')
    .insert([{
      cliente_id: agente.clienteId,
      destino: destinoValido,
      numero_whatsapp_remitente: telefono,
      admin_id: admin?.id ?? null,
      tipo,
      tipo_documento: tipoDocumentoDetectado,
      imagen_url: imagenPath,
      datos_extraidos: datosExtraidos,
      estado: autorizado ? 'pendiente_revision' : 'rechazado_no_autorizado',
      notas,
      // Fase 53 -- si el número está dado de alta como "solo prueba"
      // (clientes_agente_admins.solo_prueba), este documento y todo lo
      // que se genere a partir de él quedan marcados es_prueba=true
      // para poder simular sin ensuciar datos reales (ver migración
      // 0102, a pedido de Carlos antes de perfilar la Tarea #149).
      es_prueba: esPrueba,
    }])
    .select('id, estado')
    .single()

  if (insertError) {
    console.error('agente-comprobante-recibir: error guardando el documento', insertError)
    return new Response(JSON.stringify({ ok: false, error: 'No se pudo guardar el documento' }), { status: 500 })
  }

  // Fase 54 -- si vino datosExtraidos (la IA de visión ya corrió del
  // lado de n8n antes de llamar acá), intentamos cargar directo en
  // Compras. Si falta proveedor o forma de pago, queda pendiente en la
  // bandeja -- ver _lib/agenteComprobanteCompra.js.
  let resultadoCarga = { creado: false, motivo: 'sin_intento' }
  if (autorizado && datosExtraidos) {
    resultadoCarga = await intentarCargarComprobante({
      supabaseAdmin,
      clienteId: agente.clienteId,
      comprobanteRecibidoId: comprobante.id,
      datosExtraidos,
      esPrueba,
      destino: destinoValido || 'compras',
    })
  }

  return new Response(
    JSON.stringify({
      ok: true,
      autorizado,
      remitenteNombre: admin?.nombre ?? null,
      comprobanteId: comprobante.id,
      estado: comprobante.estado,
      esPrueba,
      cargaCompras: resultadoCarga,
    }),
    { status: 200 },
  )
}
