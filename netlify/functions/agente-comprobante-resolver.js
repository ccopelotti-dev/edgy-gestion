import { crearSupabaseAdmin, autenticarAgente } from './_lib/agenteAuth.js'
import { intentarCargarComprobante, normalizarFormaPago, resolverConfirmacionRecepcionOc } from './_lib/agenteComprobanteCompra.js'

// Fase 69b -- parser mínimo de SI/NO para la rama 'confirmar_recepcion_oc'.
// Mismo criterio conservador que el resto del archivo: si la respuesta no
// es clara, se devuelve null y se le vuelve a preguntar en vez de asumir.
function parseSiNo(texto) {
  const t = texto.trim().toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
  if (/^(si|s|dale|ok|confirmo|confirmar|correcto|listo)\b/.test(t)) return true
  if (/^(no|n|cancelar|cancela)\b/.test(t)) return false
  return null
}

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
    .select('id, datos_extraidos, es_prueba, destino, pendiente_aclaracion')
    .eq('cliente_id', agente.clienteId)
    .eq('admin_id', admin.id)
    .in('pendiente_aclaracion', ['forma_pago', 'cuit', 'confirmar_recepcion_oc'])
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

  const tipoAclaracion = pendiente.pendiente_aclaracion

  // Fase 68a -- rama CUIT: el admin responde con el CUIT del proveedor
  // (11 dígitos, con o sin guiones/puntos) para completar un comprobante
  // que se había quedado pendiente por "proveedor_no_encontrado".
  if (tipoAclaracion === 'cuit') {
    const cuitTexto = texto.replace(/\D/g, '')
    if (cuitTexto.length !== 11) {
      // No parece un CUIT -- se le vuelve a preguntar, no se toca nada.
      return new Response(
        JSON.stringify({ ok: true, huboPendiente: true, entendido: false, pendienteAclaracion: 'cuit' }),
        { status: 200 },
      )
    }

    const resultado = await intentarCargarComprobante({
      supabaseAdmin,
      clienteId: agente.clienteId,
      comprobanteRecibidoId: pendiente.id,
      datosExtraidos: pendiente.datos_extraidos,
      cuitManual: cuitTexto,
      esPrueba: pendiente.es_prueba,
      destino: pendiente.destino === 'hogar' ? 'hogar' : 'compras',
    })

    return new Response(
      JSON.stringify({ ok: true, huboPendiente: true, entendido: true, pendienteAclaracion: 'cuit', cargaCompras: resultado }),
      { status: 200 },
    )
  }

  // Fase 69b -- rama "confirmar_recepcion_oc": el admin responde SI/NO a
  // la pregunta de si cierra una Orden de Compra que no coincidió exacto
  // contra la factura cargada (ver intentarCargarComprobante). Acá no hay
  // CUIT ni forma de pago de por medio, solo un sí/no directo.
  if (tipoAclaracion === 'confirmar_recepcion_oc') {
    const confirmar = parseSiNo(texto)
    if (confirmar === null) {
      // No se entendió -- se le vuelve a preguntar, no se toca nada.
      return new Response(
        JSON.stringify({ ok: true, huboPendiente: true, entendido: false, pendienteAclaracion: 'confirmar_recepcion_oc' }),
        { status: 200 },
      )
    }

    const datosOc = pendiente.datos_extraidos?._recepcionOcPendiente
    if (!datosOc?.comprobanteId || !datosOc?.ordenCompraId) {
      console.error('agente-comprobante-resolver: falta _recepcionOcPendiente en datos_extraidos', pendiente.id)
      await supabaseAdmin.from('comprobantes_recibidos').update({ pendiente_aclaracion: null }).eq('id', pendiente.id)
      return new Response(
        JSON.stringify({
          ok: true,
          huboPendiente: true,
          entendido: true,
          pendienteAclaracion: 'confirmar_recepcion_oc',
          cargaCompras: { ok: false, error: 'datos_incompletos' },
        }),
        { status: 200 },
      )
    }

    const resultado = await resolverConfirmacionRecepcionOc(supabaseAdmin, {
      comprobanteId: datosOc.comprobanteId,
      ordenCompraId: datosOc.ordenCompraId,
      confirmar,
    })

    // Se resuelva bien o mal, la pregunta ya fue respondida -- se limpia
    // el pendiente para no volver a preguntar lo mismo. Si algo falló del
    // lado del stock (resultado.ok === false con confirmar:true), queda
    // para resolver a mano desde la app, con el motivo logueado arriba.
    await supabaseAdmin.from('comprobantes_recibidos').update({ pendiente_aclaracion: null }).eq('id', pendiente.id)

    return new Response(
      JSON.stringify({
        ok: true,
        huboPendiente: true,
        entendido: true,
        pendienteAclaracion: 'confirmar_recepcion_oc',
        confirmar,
        cargaCompras: resultado,
      }),
      { status: 200 },
    )
  }

  // Rama forma de pago (comportamiento original, Fase 54).
  const formaPago = normalizarFormaPago(texto)
  if (!formaPago) {
    // No se entendió la respuesta -- se le vuelve a preguntar, no se
    // toca nada del registro pendiente.
    return new Response(
      JSON.stringify({ ok: true, huboPendiente: true, entendido: false, pendienteAclaracion: 'forma_pago' }),
      { status: 200 },
    )
  }

  const resultado = await intentarCargarComprobante({
    supabaseAdmin,
    // Fase 56 -- siempre el mismo cliente_id del admin (Home Keep no es
    // un tenant aparte); si el comprobante original se desvió a Home
    // Keep (ver agente-comprobante-recibir.js), este segundo llamado
    // tiene que seguir escribiendo en esas tablas, no en las de Compras.
    clienteId: agente.clienteId,
    comprobanteRecibidoId: pendiente.id,
    datosExtraidos: pendiente.datos_extraidos,
    formaPagoRespuesta: formaPago,
    esPrueba: pendiente.es_prueba,
    destino: pendiente.destino === 'hogar' ? 'hogar' : 'compras',
  })

  return new Response(
    JSON.stringify({ ok: true, huboPendiente: true, entendido: true, pendienteAclaracion: 'forma_pago', cargaCompras: resultado }),
    { status: 200 },
  )
}
