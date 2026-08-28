import { createClient } from '@supabase/supabase-js'

// Fase 50d (28/08) -- el agente de WhatsApp como CANAL DE SALIDA: manda
// un PDF ya armado del lado del panel (Presupuesto, Ficha, Comprobante,
// etc.) como documento adjunto real por WhatsApp, en vez del patrón
// viejo (`armarLinkWhatsapp`, src/lib/whatsapp.ts) que solo abría un
// link `wa.me` con texto y dejaba que el operador adjuntara el PDF a
// mano en WhatsApp Web.
//
// Lo dispara un click humano en el panel (no n8n) -- por eso usa el
// mismo patrón de auth por sesión (Bearer del login) que el resto de
// las Netlify Functions "normales" del repo, a diferencia de los
// endpoints /agente-* (Fase 50), que autentican con X-Api-Key porque
// los llama el VPS sin sesión de usuario.
//
//   POST /.netlify/functions/enviar-documento-whatsapp
//   Header: Authorization: Bearer <access_token de supabase.auth>
//   Body:   {
//     "clienteId": "uuid",
//     "telefono": "2945464634",       // como esté cargado en la ficha
//                                      // del cliente -- se normaliza acá
//     "pdfBase64": "JVBERi0...",       // sin el prefijo data:...;base64,
//     "nombreArchivo": "Presupuesto-PRE-00001", // sin extensión
//     "caption": "Te enviamos el presupuesto..." // opcional, texto que
//                                                  // acompaña el PDF
//     "tipoDocumento": "presupuesto",  // Fase 51 -- rótulo libre del
//                                      // tipo (ver DOC_ENVIADO abajo),
//                                      // para poder correlacionar una
//                                      // respuesta futura con lo que se
//                                      // mandó. Opcional por compat
//                                      // hacia atrás, pero todos los
//                                      // llamadores actuales ya lo pasan.
//     "numeroDocumento": "PRE-00006"   // mismo valor que nombreArchivo
//                                      // en la práctica -- se guarda
//                                      // aparte para no depender de que
//                                      // nombreArchivo no cambie de forma.
//   }
//
// Requiere que el tenant tenga cargado `evolution_instance_nombre` +
// `evolution_instance_apikey` en `clientes_agente_config` (migración
// 0101) -- si no los tiene, todavía no tiene un canal de WhatsApp de
// salida configurado (hoy solo Punto Tex).
//
// Fase 51 (28/08, a pedido de Carlos): además de mandar el documento,
// deja un registro en `documentos_enviados_agente` (tenant + teléfono +
// tipo + número + fecha). Es la base para que, cuando el destinatario
// responda por WhatsApp, n8n pueda preguntarle a `agente-documento-check`
// "¿a qué le está contestando este teléfono?" y reenviarle la respuesta
// a un supervisor humano en vez de dejar que el agente conteste solo --
// el agente nunca decide nada comercial por su cuenta, solo relaciona y
// escala. El registro se intenta guardar SIEMPRE que el envío a Evolution
// haya sido exitoso; si el insert falla no se corta la respuesta al
// panel (el documento ya salió, perder el log de correlación es un mal
// menor frente a hacerle creer al operador que el envío falló).

function normalizarTelefonoArgentina(telefonoRaw) {
  let d = String(telefonoRaw || '').replace(/\D/g, '')
  if (!d) return ''
  if (d.startsWith('0')) d = d.slice(1)
  // WhatsApp exige el "9" después del 54 para celulares de Argentina,
  // aunque para marcar normalmente no se use -- si ya viene con 549 se
  // deja igual, si viene con 54 (sin 9) se inserta, y si no tiene
  // código de país se asume Argentina + celular.
  if (d.startsWith('549')) return d
  if (d.startsWith('54')) return '549' + d.slice(2)
  return '549' + d
}

export default async (req) => {
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ ok: false, error: 'Método no permitido' }), { status: 405 })
  }

  const auth = req.headers.get('authorization') || ''
  const token = auth.replace(/^Bearer\s+/i, '')
  if (!token) {
    return new Response(JSON.stringify({ ok: false, error: 'Falta sesión' }), { status: 401 })
  }

  let body
  try {
    body = await req.json()
  } catch (e) {
    return new Response(JSON.stringify({ ok: false, error: 'Body inválido' }), { status: 400 })
  }

  const clienteId = String(body.clienteId || '')
  const telefonoRaw = String(body.telefono || '')
  const pdfBase64 = String(body.pdfBase64 || '')
  const nombreArchivo = String(body.nombreArchivo || 'documento').trim() || 'documento'
  const caption = body.caption ? String(body.caption) : undefined
  const tipoDocumento = body.tipoDocumento ? String(body.tipoDocumento) : null
  const numeroDocumento = body.numeroDocumento ? String(body.numeroDocumento) : nombreArchivo

  if (!clienteId || !telefonoRaw || !pdfBase64) {
    return new Response(JSON.stringify({ ok: false, error: 'Falta clienteId, telefono o pdfBase64' }), { status: 400 })
  }

  const supabaseAdmin = createClient(
    process.env.VITE_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    { db: { schema: 'edgy_gestion' } },
  )

  // 1) Validar sesión
  const { data: userData, error: userError } = await supabaseAdmin.auth.getUser(token)
  if (userError || !userData?.user) {
    return new Response(JSON.stringify({ ok: false, error: 'Sesión inválida' }), { status: 401 })
  }

  // 2) Confirmar que el usuario pertenece a ESE cliente (cualquier rol
  // -- mandar un documento no es una acción administrativa sensible
  // como guardar credenciales de cobro, cualquiera que opere Ventas
  // debería poder hacerlo).
  const { data: usuarioCliente, error: errUsuario } = await supabaseAdmin
    .from('usuarios_cliente')
    .select('cliente_id')
    .eq('user_id', userData.user.id)
    .eq('cliente_id', clienteId)
    .maybeSingle()

  if (errUsuario || !usuarioCliente) {
    return new Response(JSON.stringify({ ok: false, error: 'No autorizado' }), { status: 403 })
  }

  // 3) Canal de WhatsApp de este tenant
  const { data: config, error: configError } = await supabaseAdmin
    .from('clientes_agente_config')
    .select('evolution_instance_nombre, evolution_instance_apikey, activo')
    .eq('cliente_id', clienteId)
    .maybeSingle()

  if (configError) {
    console.error('enviar-documento-whatsapp: error consultando config', configError)
    return new Response(JSON.stringify({ ok: false, error: 'No se pudo leer la configuración del canal' }), { status: 500 })
  }

  if (!config || !config.activo || !config.evolution_instance_nombre || !config.evolution_instance_apikey) {
    return new Response(
      JSON.stringify({ ok: false, error: 'Este negocio todavía no tiene un canal de WhatsApp de salida configurado' }),
      { status: 400 },
    )
  }

  const telefono = normalizarTelefonoArgentina(telefonoRaw)
  if (telefono.length < 12) {
    return new Response(JSON.stringify({ ok: false, error: 'Número de teléfono inválido' }), { status: 400 })
  }

  // 4) Mandar el PDF por Evolution API
  const url = `https://evolution.edgysistemas.tech/message/sendMedia/${config.evolution_instance_nombre}`
  let evolutionRes
  try {
    evolutionRes = await fetch(url, {
      method: 'POST',
      headers: { apikey: config.evolution_instance_apikey, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        number: telefono,
        mediatype: 'document',
        mimetype: 'application/pdf',
        fileName: `${nombreArchivo}.pdf`,
        caption,
        media: pdfBase64,
      }),
    })
  } catch (e) {
    console.error('enviar-documento-whatsapp: error de red contra Evolution', e)
    return new Response(JSON.stringify({ ok: false, error: 'No se pudo contactar al servicio de WhatsApp' }), { status: 502 })
  }

  const evolutionBody = await evolutionRes.text()
  if (!evolutionRes.ok) {
    console.error('enviar-documento-whatsapp: Evolution respondió error', evolutionRes.status, evolutionBody)
    return new Response(
      JSON.stringify({ ok: false, error: `Evolution API respondió ${evolutionRes.status}`, detalle: evolutionBody }),
      { status: 502 },
    )
  }

  // 5) Fase 51: dejar registro para poder correlacionar la respuesta.
  if (tipoDocumento) {
    const { error: logError } = await supabaseAdmin.from('documentos_enviados_agente').insert({
      cliente_id: clienteId,
      telefono,
      tipo_documento: tipoDocumento,
      numero_documento: numeroDocumento,
    })
    if (logError) {
      console.error('enviar-documento-whatsapp: no se pudo loguear documentos_enviados_agente', logError)
    }
  }

  return new Response(JSON.stringify({ ok: true }), { status: 200 })
}
