import { createClient } from '@supabase/supabase-js'
import { autenticarWsaa, ticketVigente } from './lib/arca-wsaa.js'
import {
  CBTE_TIPO,
  DOC_TIPO,
  CONDICION_IVA_RECEPTOR,
  ALIC_IVA_ID,
  obtenerUltimoAutorizado,
  construirFeCaeReq,
  solicitarCae,
} from './lib/arca-wsfev1.js'

// Orquesta la autorización ARCA de UN comprobante ya guardado en
// comprobantes_venta con modoEmision='electronica': autentica contra
// WSAA (con cache de TA), pregunta a WSFEv1 el próximo número
// habilitado para el punto de venta, pide el CAE, y guarda el
// resultado (aprobado con CAE, o rechazado con el motivo) en
// comprobantes_venta.afip.
//
// Lo dispara el frontend (Comprobantes.tsx) justo después de guardar
// un comprobante electrónico -- ver Fase 11 en el histórico de
// tareas. No hace rollback del comprobante si ARCA lo rechaza: el
// comprobante interno de Edgy ya existe (con su numeración propia),
// simplemente queda marcado afip.resultado='R' con la observación de
// ARCA, para que el operador decida si corrige y reintenta.

// Consumidor Final es un cliente "virtual" (no existe fila real en
// clientes_venta -- ver CONSUMIDOR_FINAL_ID en el dominio de Ventas).
const CONSUMIDOR_FINAL_ID = '__consumidor_final__'
const CONSUMIDOR_FINAL = {
  tipo_documento: 'dni',
  documento: '0',
  condicion_iva: 'consumidor_final',
}

function letraComprobante(condicionEmisor, condicionReceptor) {
  if (condicionEmisor === 'responsable_inscripto') {
    return condicionReceptor === 'responsable_inscripto' ? 'A' : 'B'
  }
  // Monotributista y Exento emiten siempre C.
  return 'C'
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
  const comprobanteId = String(body.comprobanteId || '')
  if (!clienteId || !comprobanteId) {
    return new Response(JSON.stringify({ ok: false, error: 'Falta clienteId o comprobanteId' }), { status: 400 })
  }

  const supabaseAdmin = createClient(
    process.env.VITE_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    { db: { schema: 'edgy_gestion' } },
  )

  const { data: userData, error: userError } = await supabaseAdmin.auth.getUser(token)
  if (userError || !userData?.user) {
    return new Response(JSON.stringify({ ok: false, error: 'Sesión inválida' }), { status: 401 })
  }

  const { data: usuarioCliente } = await supabaseAdmin
    .from('usuarios_cliente')
    .select('cliente_id')
    .eq('user_id', userData.user.id)
    .eq('cliente_id', clienteId)
    .maybeSingle()

  if (!usuarioCliente) {
    return new Response(JSON.stringify({ ok: false, error: 'No autorizado' }), { status: 403 })
  }

  // ── 1) Config ARCA del cliente ──────────────────────────────────
  const [{ data: config, error: configError }, { data: clienteRow, error: clienteRowError }] = await Promise.all([
    supabaseAdmin.from('clientes_arca_config').select('*').eq('cliente_id', clienteId).maybeSingle(),
    supabaseAdmin.from('clientes').select('cuit').eq('id', clienteId).maybeSingle(),
  ])

  if (configError) {
    console.error('arca-autorizar-comprobante: error leyendo config', configError)
    return new Response(JSON.stringify({ ok: false, error: 'No se pudo leer la configuración ARCA' }), { status: 500 })
  }
  if (!config || !config.habilitado) {
    return new Response(
      JSON.stringify({ ok: false, error: 'ARCA no está habilitado para este negocio todavía' }),
      { status: 409 },
    )
  }
  if (!config.certificado_pem || !config.clave_privada_pem) {
    return new Response(
      JSON.stringify({ ok: false, error: 'Falta cargar el certificado o la clave privada de ARCA' }),
      { status: 409 },
    )
  }
  if (clienteRowError || !clienteRow?.cuit) {
    return new Response(
      JSON.stringify({ ok: false, error: 'Este negocio todavía no tiene CUIT cargado' }),
      { status: 409 },
    )
  }
  const cuit = clienteRow.cuit

  // ── 2) Comprobante + items ──────────────────────────────────────
  // El frontend dispara esta función justo después de despachar
  // ADD_COMPROBANTE, pero el INSERT real a Supabase es fire-and-forget
  // (ver syncToSupabase en ventas/data/store.tsx) -- puede no estar
  // confirmado todavía en el instante en que llega esta request. Se
  // reintenta unas pocas veces con espera corta antes de rendirse, en
  // vez de asumir que "no encontrado" significa que no existe.
  let comprobante = null
  for (let intento = 0; intento < 5 && !comprobante; intento++) {
    if (intento > 0) await new Promise((r) => setTimeout(r, 400))
    const { data } = await supabaseAdmin
      .from('comprobantes_venta')
      .select('*')
      .eq('id', comprobanteId)
      .eq('cliente_id', clienteId)
      .maybeSingle()
    comprobante = data
  }

  if (!comprobante) {
    return new Response(JSON.stringify({ ok: false, error: 'Comprobante no encontrado' }), { status: 404 })
  }
  if (comprobante.modo_emision !== 'electronica') {
    return new Response(
      JSON.stringify({ ok: false, error: 'Este comprobante no es de emisión electrónica' }),
      { status: 400 },
    )
  }
  if (comprobante.afip?.resultado === 'A' && comprobante.afip?.cae) {
    // Idempotencia -- si ya tiene CAE, devolvemos lo que ya está en
    // vez de volver a pedirle a ARCA (que además rechazaría el
    // duplicado).
    return new Response(JSON.stringify({ ok: true, afip: comprobante.afip, yaAutorizado: true }), { status: 200 })
  }
  if (!['factura', 'nota_credito', 'nota_debito'].includes(comprobante.tipo)) {
    return new Response(
      JSON.stringify({ ok: false, error: `Los comprobantes de tipo "${comprobante.tipo}" no se autorizan ante ARCA` }),
      { status: 400 },
    )
  }

  const { data: items, error: itemsError } = await supabaseAdmin
    .from('comprobante_venta_items')
    .select('*')
    .eq('comprobante_id', comprobanteId)

  if (itemsError || !items || items.length === 0) {
    return new Response(JSON.stringify({ ok: false, error: 'El comprobante no tiene ítems' }), { status: 400 })
  }

  // ── 3) Receptor (cliente_venta, o Consumidor Final) ─────────────
  let receptor
  if (comprobante.cliente_venta_id === CONSUMIDOR_FINAL_ID) {
    receptor = CONSUMIDOR_FINAL
  } else {
    const { data: clienteVenta, error: clienteError } = await supabaseAdmin
      .from('clientes_venta')
      .select('tipo_documento, documento, condicion_iva')
      .eq('id', comprobante.cliente_venta_id)
      .maybeSingle()
    if (clienteError || !clienteVenta) {
      return new Response(JSON.stringify({ ok: false, error: 'No se encontró el cliente del comprobante' }), { status: 404 })
    }
    receptor = clienteVenta
  }

  // ── 4) Mapeo a códigos AFIP ──────────────────────────────────────
  const letra = letraComprobante(config.condicion_iva, receptor.condicion_iva)
  const cbteTipo = CBTE_TIPO[comprobante.tipo]?.[letra]
  if (!cbteTipo) {
    return new Response(JSON.stringify({ ok: false, error: `No hay código AFIP para ${comprobante.tipo} tipo ${letra}` }), { status: 400 })
  }

  const esConsumidorFinalSinDoc = receptor.documento === '0'
  const docTipo = esConsumidorFinalSinDoc ? 99 : (DOC_TIPO[receptor.tipo_documento] ?? 99)
  const docNro = esConsumidorFinalSinDoc ? 0 : Number(receptor.documento)
  const condicionIvaReceptorId = CONDICION_IVA_RECEPTOR[receptor.condicion_iva]
  if (!condicionIvaReceptorId) {
    return new Response(JSON.stringify({ ok: false, error: `Condición de IVA de receptor desconocida: ${receptor.condicion_iva}` }), { status: 400 })
  }

  // Agrupar items por alícuota para armar el array Iva de FECAESolicitar.
  const porAlicuota = new Map()
  for (const it of items) {
    const alic = Number(it.alicuota_iva)
    const acc = porAlicuota.get(alic) ?? { baseImponible: 0, importe: 0 }
    acc.baseImponible += Number(it.subtotal)
    acc.importe += Number(it.monto_iva)
    porAlicuota.set(alic, acc)
  }
  const alicuotas = []
  for (const [alic, acc] of porAlicuota) {
    const id = ALIC_IVA_ID[alic]
    if (!id) {
      return new Response(JSON.stringify({ ok: false, error: `Alícuota de IVA sin código AFIP: ${alic}%` }), { status: 400 })
    }
    alicuotas.push({ id, baseImponible: acc.baseImponible, importe: acc.importe })
  }

  // NOTA: se asume Concepto=1 (Productos) para todos los comprobantes.
  // Si en algún momento se factura un servicio (Concepto=2 o 3), ARCA
  // exige además informar fecha de servicio desde/hasta -- no
  // contemplado todavía, hay que sumarlo cuando haga falta.
  const concepto = 1
  const importeExento = 0 // simplificación: alicuotaIva=0 se trata como gravado al 0%, no exento

  // ── 5) WSAA -- reusar TA cacheado si sigue vigente ──────────────
  let ta = { token: config.ta_token, sign: config.ta_sign, expiracion: config.ta_expiracion }
  if (!ticketVigente(ta.expiracion)) {
    try {
      ta = await autenticarWsaa({
        servicio: 'wsfe',
        modo: config.modo,
        certificadoPem: config.certificado_pem,
        clavePrivadaPem: config.clave_privada_pem,
      })
    } catch (err) {
      console.error('arca-autorizar-comprobante: fallo WSAA', err)
      return new Response(JSON.stringify({ ok: false, error: 'No se pudo autenticar contra ARCA: ' + err.message }), { status: 502 })
    }
    await supabaseAdmin
      .from('clientes_arca_config')
      .update({ ta_token: ta.token, ta_sign: ta.sign, ta_expiracion: ta.expiracion })
      .eq('cliente_id', clienteId)
  }

  // ── 6) WSFEv1 -- numeración + CAE ────────────────────────────────
  let cbteNro
  try {
    const ultimo = await obtenerUltimoAutorizado({
      modo: config.modo,
      token: ta.token,
      sign: ta.sign,
      cuit,
      puntoVenta: config.punto_venta,
      cbteTipo,
    })
    cbteNro = ultimo + 1
  } catch (err) {
    console.error('arca-autorizar-comprobante: fallo FECompUltimoAutorizado', err)
    return new Response(JSON.stringify({ ok: false, error: 'No se pudo consultar la numeración ARCA: ' + err.message }), { status: 502 })
  }

  const feCaeReq = construirFeCaeReq({
    puntoVenta: config.punto_venta,
    cbteTipo,
    concepto,
    docTipo,
    docNro,
    cbteNro,
    fechaComprobante: comprobante.fecha,
    importeTotal: Number(comprobante.total),
    importeNeto: Number(comprobante.subtotal),
    importeExento,
    importeIva: Number(comprobante.monto_iva),
    condicionIvaReceptorId,
    alicuotas,
  })

  let resultadoCae
  try {
    resultadoCae = await solicitarCae({
      modo: config.modo,
      token: ta.token,
      sign: ta.sign,
      cuit,
      feCaeReq,
    })
  } catch (err) {
    console.error('arca-autorizar-comprobante: fallo FECAESolicitar', err)
    return new Response(JSON.stringify({ ok: false, error: 'No se pudo solicitar el CAE: ' + err.message }), { status: 502 })
  }

  // ── 7) Guardar resultado en comprobantes_venta.afip ─────────────
  const afip = {
    puntoVenta: config.punto_venta,
    tipoFiscal: letra,
    tipoComprobanteAfip: cbteTipo,
    numeroComprobante: resultadoCae.cbteNro,
    docTipoReceptor: docTipo,
    cae: resultadoCae.cae,
    vencimientoCae: resultadoCae.vencimientoCae,
    fechaEmisionAfip: new Date().toISOString().slice(0, 10),
    resultado: resultadoCae.resultado,
    observaciones: resultadoCae.observaciones,
  }

  const { error: updateError } = await supabaseAdmin
    .from('comprobantes_venta')
    .update({ afip })
    .eq('id', comprobanteId)

  if (updateError) {
    console.error('arca-autorizar-comprobante: error guardando afip', updateError)
    return new Response(JSON.stringify({ ok: false, error: 'ARCA respondió pero no se pudo guardar el resultado' }), { status: 500 })
  }

  return new Response(JSON.stringify({ ok: true, afip }), { status: 200 })
}
