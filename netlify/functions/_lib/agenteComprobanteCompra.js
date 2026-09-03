// Fase 54 -- lógica compartida entre agente-comprobante-recibir.js
// (cuando llega la imagen) y agente-comprobante-resolver.js (cuando
// llega la respuesta del admin a la pregunta de forma de pago).
//
// Reglas acordadas con Carlos el 29/08, antes de tocar código:
//  - Nunca se inventa un proveedor: si el CUIT extraído no matchea
//    EXACTO contra un proveedor ya cargado, el comprobante se queda en
//    la bandeja (comprobantes_recibidos) para completar a mano.
//  - La forma de pago es binaria: 'efectivo' (Contado) o
//    'cuenta_corriente' (Cta Cte) -- si ni la IA ni la respuesta del
//    admin la resuelven, tampoco se carga nada en Compras.
//  - Lo que sí se carga, se crea en estado 'pendiente' (nunca
//    'pagado'): marcar un comprobante como pagado dispara en la
//    pantalla un movimiento de egreso en Tesorería (ver
//    src/modules/compras/data/store.tsx, syncToSupabase) que este
//    endpoint no replica -- eso queda para una siguiente etapa, cuando
//    se sume el cruce contra cajas/cuentas bancarias. Por ahora el
//    pago se confirma a mano desde Compras, como cualquier otro
//    comprobante.
//  - Nunca toca stock (`stock_actualizado` queda false) -- combustible
//    y servicios no son insumos de inventario.

const TIPOS_VALIDOS = ['factura', 'nota_credito', 'nota_debito']

function soloDigitos(s) {
  return String(s || '').replace(/\D/g, '')
}

function normalizarFormaPago(valor) {
  const v = String(valor || '').trim().toLowerCase()
  if (!v) return null
  if (v.includes('cuenta') || v.includes('cta')) return 'cuenta_corriente'
  if (v.includes('contado') || v.includes('efectivo') || v.includes('cash')) return 'efectivo'
  return null
}

function numero(n, fallback = 0) {
  const x = Number(n)
  return Number.isFinite(x) ? x : fallback
}

// Fase 56 -- Home Keep vive bajo el MISMO cliente_id que el negocio
// real, no en un tenant aparte (eso fue la Fase 55, dada de baja). Lo
// único que cambia según `destino` es el SET DE TABLAS donde se lee y
// se escribe: Compras real (de siempre) vs. las tablas propias de
// Home Keep (proveedores_hogar / comprobantes_hogar /
// comprobante_hogar_items), para que un gasto personal nunca pueda
// colarse en un reporte o dashboard del negocio real.
const TABLAS_POR_DESTINO = {
  compras: {
    proveedores: 'proveedores',
    comprobantes: 'comprobantes_compra',
    items: 'comprobante_compra_items',
  },
  hogar: {
    proveedores: 'proveedores_hogar',
    comprobantes: 'comprobantes_hogar',
    items: 'comprobante_hogar_items',
  },
}

// Fase 68c -- cuando el ticket recibido es un comprobante de PAGO (no
// una factura), tratamos de vincularlo a un crédito pendiente de Fase
// 67 (creditos_pendientes: reintegros/promos bancarias que Carlos ya
// carga a mano desde Compras/Home Keep -- ver src/lib/creditos.ts).
//
// Mismo criterio conservador que el resto del agente (Fase 54/68a):
// solo se marca "acreditado" automáticamente si hay UN ÚNICO crédito
// pendiente, del mismo módulo (compras/home_keep) y cliente, cuyo
// monto esperado coincide (redondeado al peso) con el monto del
// ticket. Si hay cero o más de un candidato, no se adivina -- queda
// pendiente para que Carlos lo vincule a mano desde Tesorería >
// Créditos y Reintegros.
async function intentarVincularTicketPagoACredito({ supabaseAdmin, clienteId, destino, montoTicket, fechaTicket }) {
  const modulo = destino === 'hogar' ? 'home_keep' : 'compras'

  const { data: pendientes, error } = await supabaseAdmin
    .from('creditos_pendientes')
    .select('id, proveedor_id, concepto, monto_esperado')
    .eq('cliente_id', clienteId)
    .eq('modulo', modulo)
    .eq('estado', 'pendiente')

  if (error) {
    console.error('intentarVincularTicketPagoACredito: error consultando creditos_pendientes', error)
    return { vinculado: false, pendientesCount: null }
  }

  const lista = pendientes || []
  if (montoTicket == null || !Number.isFinite(montoTicket)) {
    return { vinculado: false, pendientesCount: lista.length }
  }

  const candidatos = lista.filter((c) => Math.round(Number(c.monto_esperado)) === Math.round(montoTicket))
  if (candidatos.length !== 1) {
    return { vinculado: false, pendientesCount: lista.length, candidatosPorMonto: candidatos.length }
  }

  const credito = candidatos[0]
  const fechaAcreditacion = fechaTicket || new Date().toISOString().slice(0, 10)
  const { error: updateError } = await supabaseAdmin
    .from('creditos_pendientes')
    .update({ estado: 'acreditado', monto_acreditado: montoTicket, fecha_acreditacion: fechaAcreditacion })
    .eq('id', credito.id)

  if (updateError) {
    console.error('intentarVincularTicketPagoACredito: error marcando acreditado', updateError)
    return { vinculado: false, pendientesCount: lista.length }
  }

  let proveedorNombre = null
  if (credito.proveedor_id) {
    const tablas = TABLAS_POR_DESTINO[destino] || TABLAS_POR_DESTINO.compras
    const { data: proveedor } = await supabaseAdmin
      .from(tablas.proveedores)
      .select('nombre, nombre_fantasia')
      .eq('id', credito.proveedor_id)
      .maybeSingle()
    proveedorNombre = proveedor?.nombre_fantasia || proveedor?.nombre || null
  }

  return {
    vinculado: true,
    creditoId: credito.id,
    concepto: credito.concepto,
    proveedorNombre,
    montoAcreditado: montoTicket,
  }
}

// Fase 68c (extensión, 01/09) -- sintaxis de caption acordada con Carlos
// para registrar, en un solo mensaje de WhatsApp, un PAGO NUEVO contra el
// saldo pendiente de una factura YA cargada, más el reintegro esperado de
// esa tarjeta/promo (ej. "Promo Pampa"): el admin manda la foto del
// ticket de pago (tarjeta/MP) con el pie de foto:
//   "factura 123 reintegro 5000"   (reintegro en pesos)
//   "factura 123 reintegro 10%"    (reintegro como % del monto del ticket)
// Si el caption no matchea este patrón (o falta alguna de las dos
// partes), se sigue el camino viejo de Fase 68c: vincular el ticket a un
// crédito YA existente por coincidencia exacta de monto.
function parsearMontoArg(s) {
  let str = String(s || '').trim()
  if (str.includes(',') && str.includes('.')) {
    str = str.replace(/\./g, '').replace(',', '.')
  } else if (str.includes(',')) {
    str = str.replace(',', '.')
  } else {
    const partes = str.split('.')
    if (partes.length > 2) str = partes.slice(0, -1).join('') + '.' + partes[partes.length - 1]
  }
  return Number(str)
}

function parseCaptionPagoFactura(captionTexto) {
  const texto = String(captionTexto || '')
  // Fase 68c (economía de caracteres, 02/09) -- "factura"/"reintegro"
  // completos siguen andando, pero también se acepta la forma corta
  // "F449 R25000" para escribir menos en el caption de WhatsApp. \b
  // (límite de palabra) antes de la f/r para no matchear en medio de
  // otra palabra cualquiera.
  const matchFactura = texto.match(/\bf(?:actura)?\.?\s*n?[°ºo]?\.?\s*#?\s*(\d+)/i)
  if (!matchFactura) return null
  const numeroFactura = parseInt(matchFactura[1], 10)
  if (!Number.isFinite(numeroFactura)) return null

  // El reintegro es OPCIONAL -- un pago sin promo/reintegro asociado
  // (ej. la parte de Mercado Pago de una compra mixta) también se puede
  // registrar solo con "F449" (o "factura 449") en el caption. Si
  // "reintegro"/"r" está pero el valor no es un número real (ej. alguien
  // puso "reintegro x" como placeholder sin completar), se ignora el
  // reintegro en vez de descartar todo el caption -- mejor cargar el
  // pago sin reintegro que no cargarlo por un dato incompleto que no
  // afecta el monto del pago.
  const matchReintegro = texto.match(/\br(?:eintegro)?\.?\s*(?:de|del)?\s*\$?\s*([\d.,]+)\s*(%)?/i)
  let reintegroValor = 0
  let reintegroEsPorcentaje = false
  if (matchReintegro) {
    const valor = parsearMontoArg(matchReintegro[1])
    if (Number.isFinite(valor)) {
      reintegroValor = valor
      reintegroEsPorcentaje = Boolean(matchReintegro[2])
    }
  }
  return { numeroFactura, reintegroValor, reintegroEsPorcentaje }
}

// El numero de factura que un humano lee y tipea es el "numero de
// comprobante del proveedor" (ej. 449 de "0026-00000449"), no
// comprobantes_compra.numero (correlativo interno 1,2,3... que nunca se
// muestra). Se matchea contra el sufijo numerico despues del ultimo '-'
// (o el numero completo si no hay guion), sin ceros a la izquierda -- y
// tambien contra el numero interno, por si algun dia se usa ese.
function numeroFacturaCoincide(comprobante, numeroBuscado) {
  if (Number(comprobante.numero) === numeroBuscado) return true
  const ncp = String(comprobante.numero_comprobante_proveedor || '')
  if (!ncp) return false
  const sufijo = ncp.includes('-') ? ncp.split('-').pop() : ncp
  const limpio = sufijo.replace(/\D/g, '').replace(/^0+/, '') || '0'
  return Number(limpio) === numeroBuscado
}

const TABLAS_PAGOS_POR_DESTINO = {
  compras: { pagos: 'pagos_compra', imputaciones: 'pago_compra_imputaciones' },
  hogar: { pagos: 'pagos_hogar', imputaciones: 'pago_hogar_imputaciones' },
}

// Registra el pago nuevo + el crédito de reintegro esperado. Replica a
// mano, con supabaseAdmin, la misma cascada que dispara CONFIRMAR_PAGO en
// src/modules/compras/data/store.tsx (y su espejo en Home Keep):
// comprobante (monto_pagado/saldo_pendiente/estado, tolerancia $0.01),
// saldo_cuenta_corriente del proveedor, y el movimiento de egreso en
// Tesorería (ver src/lib/tesoreriaSync.ts -- no se puede importar ese
// archivo acá porque usa el cliente de supabase del browser con RLS, así
// que el movimiento de caja se inserta directo). Mismo criterio
// conservador de siempre: si la factura no existe, o el ticket supera el
// saldo pendiente (tolerancia $1 por redondeo), no se carga nada.
async function intentarRegistrarPagoConReintegro({
  supabaseAdmin,
  clienteId,
  destino,
  numeroFactura,
  montoTicket,
  fechaTicket,
  reintegroValor,
  reintegroEsPorcentaje,
  ticketImagenUrl,
}) {
  const tablas = TABLAS_POR_DESTINO[destino] || TABLAS_POR_DESTINO.compras
  const tablasPago = TABLAS_PAGOS_POR_DESTINO[destino] || TABLAS_PAGOS_POR_DESTINO.compras
  const modulo = destino === 'hogar' ? 'home_keep' : 'compras'

  if (montoTicket == null || !Number.isFinite(montoTicket) || montoTicket <= 0) {
    return { creado: false, motivo: 'monto_ticket_invalido' }
  }

  // El numero que Carlos va a escribir en el caption es el que VE -- el
  // numero de comprobante del proveedor (ej. "449" de "0026-00000449",
  // que es justamente lo que se muestra como "Numero" en el listado de
  // Comprobantes) -- no nuestro correlativo interno (comprobantes_compra.numero,
  // que es un contador propio 1,2,3... por cliente+tipo y nunca se le
  // muestra). Se matchea contra los dos por las dudas, pero el criterio
  // real es el sufijo numerico de numero_comprobante_proveedor.
  const { data: facturas, error: errComprobante } = await supabaseAdmin
    .from(tablas.comprobantes)
    .select('id, numero, numero_comprobante_proveedor, proveedor_id, total, monto_pagado, saldo_pendiente, estado')
    .eq('cliente_id', clienteId)
    .eq('tipo', 'factura')

  if (errComprobante) {
    console.error('intentarRegistrarPagoConReintegro: error buscando factura', errComprobante)
    return { creado: false, motivo: 'error_buscando_factura', error: errComprobante.message }
  }

  const candidatas = (facturas || []).filter((f) => numeroFacturaCoincide(f, numeroFactura))
  if (candidatas.length === 0) {
    return { creado: false, motivo: 'factura_no_encontrada', numeroFactura }
  }
  if (candidatas.length > 1) {
    // Mismo criterio conservador de siempre: si hay mas de una factura que
    // matchea ese numero (ej. mismo numero de comprobante en dos puntos de
    // venta distintos), no se adivina.
    return { creado: false, motivo: 'factura_ambigua', numeroFactura, candidatas: candidatas.length }
  }
  const comprobante = candidatas[0]

  const TOLERANCIA = 1 // $1 de margen por redondeo (mismo criterio que el resto de Fase 68c)
  if (montoTicket > Number(comprobante.saldo_pendiente) + TOLERANCIA) {
    return {
      creado: false,
      motivo: 'saldo_insuficiente',
      numeroFactura,
      saldoPendiente: Number(comprobante.saldo_pendiente),
      montoTicket,
    }
  }

  const { data: proveedor } = await supabaseAdmin
    .from(tablas.proveedores)
    .select('id, nombre, nombre_fantasia, saldo_cuenta_corriente')
    .eq('id', comprobante.proveedor_id)
    .maybeSingle()

  const { data: maxPago } = await supabaseAdmin
    .from(tablasPago.pagos)
    .select('numero')
    .eq('cliente_id', clienteId)
    .order('numero', { ascending: false })
    .limit(1)
    .maybeSingle()
  const nuevoNumeroPago = numero(maxPago?.numero, 0) + 1

  const fecha = fechaTicket || new Date().toISOString().slice(0, 10)
  const reintegroMonto = reintegroEsPorcentaje ? montoTicket * (reintegroValor / 100) : reintegroValor
  const proveedorNombre = proveedor?.nombre_fantasia || proveedor?.nombre || 'Proveedor'
  const notaTrazabilidad = 'Cargado automáticamente por el agente de WhatsApp (ticket de pago con reintegro, Fase 68c).'

  // 'otro' -- mismo criterio que la UI de Compras: tarjeta/MercadoPago no
  // son un medioPago propio de LineaPago (ver MedioPagoCompra), quedan
  // como 'otro' y tesoreriaSync.mapMedioPago los cae a 'efectivo' en Caja.
  const lineaPago = {
    id: crypto.randomUUID(),
    medioPago: 'otro',
    monto: montoTicket,
    imagenUrl: ticketImagenUrl || undefined,
    ...(reintegroMonto > 0
      ? { reintegroConcepto: `Reintegro tarjeta - Factura N.º ${numeroFactura}`, reintegroMonto }
      : {}),
  }

  const { data: pago, error: errPago } = await supabaseAdmin
    .from(tablasPago.pagos)
    .insert([{
      cliente_id: clienteId,
      numero: nuevoNumeroPago,
      proveedor_id: comprobante.proveedor_id,
      fecha,
      estado: 'pagada',
      monto: montoTicket,
      medio_pago: 'otro',
      lineas_pago: [lineaPago],
      fecha_confirmacion: fecha,
      notas: notaTrazabilidad,
    }])
    .select('id, numero')
    .single()

  if (errPago) {
    console.error('intentarRegistrarPagoConReintegro: error creando pago', errPago)
    return { creado: false, motivo: 'error_al_crear_pago', error: errPago.message }
  }

  const { error: errImputacion } = await supabaseAdmin
    .from(tablasPago.imputaciones)
    .insert([{ pago_id: pago.id, comprobante_id: comprobante.id, monto_imputado: montoTicket }])
  if (errImputacion) {
    console.error('intentarRegistrarPagoConReintegro: error creando imputación', errImputacion)
  }

  const nuevoMontoPagado = Number(comprobante.monto_pagado) + montoTicket
  const nuevoSaldoPendiente = Math.max(0, Number(comprobante.total) - nuevoMontoPagado)
  let nuevoEstado = comprobante.estado
  if (comprobante.estado !== 'anulado') {
    if (nuevoSaldoPendiente <= 0.01) nuevoEstado = 'pagado'
    else if (nuevoMontoPagado > 0) nuevoEstado = 'pagado_parcial'
  }
  const { error: errUpdateComprobante } = await supabaseAdmin
    .from(tablas.comprobantes)
    .update({ monto_pagado: nuevoMontoPagado, saldo_pendiente: nuevoSaldoPendiente, estado: nuevoEstado })
    .eq('id', comprobante.id)
  if (errUpdateComprobante) {
    console.error('intentarRegistrarPagoConReintegro: error actualizando comprobante', errUpdateComprobante)
  }

  if (proveedor) {
    const { error: errProveedor } = await supabaseAdmin
      .from(tablas.proveedores)
      .update({ saldo_cuenta_corriente: Number(proveedor.saldo_cuenta_corriente) - montoTicket })
      .eq('id', proveedor.id)
    if (errProveedor) {
      console.error('intentarRegistrarPagoConReintegro: error actualizando saldo del proveedor', errProveedor)
    }
  }

  // Tesorería -- reimplementación server-side de registrarMovimientoTesoreria
  // (src/lib/tesoreriaSync.ts usa el cliente de supabase del browser, no
  // sirve en un contexto de Netlify Function con service_role). 'otro'
  // mapea a 'efectivo' -- no genera espejo bancario, solo caja.
  const { error: errCaja } = await supabaseAdmin.from('movimientos_caja').insert([{
    cliente_id: clienteId,
    fecha,
    tipo: 'egreso',
    concepto: `Pago N.º ${pago.numero} — ${proveedorNombre}`,
    categoria: 'Pago a proveedores',
    medio_pago: 'efectivo',
    monto: montoTicket,
    cuenta_id: null,
    link_id: crypto.randomUUID(),
    punto_venta_id: null,
  }])
  if (errCaja) {
    console.error('intentarRegistrarPagoConReintegro: error registrando movimiento de caja', errCaja)
  }

  // Fase 67 -- crédito esperado (reintegro), a la espera de que el banco lo
  // acredite. Solo si el pago realmente tiene un reintegro asociado -- un
  // pago sin promo (ej. Mercado Pago sin reintegro) no debe dejar un
  // crédito de $0 dando vueltas en Tesorería > Créditos y Reintegros.
  if (reintegroMonto > 0) {
    const { error: errCredito } = await supabaseAdmin.from('creditos_pendientes').insert([{
      cliente_id: clienteId,
      modulo,
      pago_id: pago.id,
      proveedor_id: comprobante.proveedor_id,
      concepto: `Reintegro tarjeta - Factura N.º ${numeroFactura}`,
      monto_esperado: reintegroMonto,
    }])
    if (errCredito) {
      console.error('intentarRegistrarPagoConReintegro: error creando credito pendiente', errCredito)
    }
  }

  return {
    creado: true,
    pagoId: pago.id,
    pagoNumero: pago.numero,
    numeroFactura,
    montoTicket,
    saldoPendienteRestante: nuevoSaldoPendiente,
    proveedorNombre,
    reintegroMonto,
  }
}

// ─── Fase 69b -- matcheo de items de factura contra items de una OC ───
//
// Cuando el agente ya encontró UNA sola Orden de Compra pendiente/parcial
// del mismo proveedor (ver intentarCargarComprobante), hay que chequear
// si lo que dice la factura coincide con lo que se había pedido en esa
// OC antes de cerrarla y cargar stock solo. El problema es que la
// factura llega con la descripción "cruda" tal cual la escribió el
// proveedor (ej. "PULPA CUARTO MAYORISTA"), mientras que la OC ya tiene
// el insumo real vinculado (ej. "Pulpa de Cuarto Trasero de Cerdo") --
// no hay ningún id en común para matchear directo, así que se compara
// por similitud de texto (intersección de palabras significativas).

const PALABRAS_FILLER_MATCH = new Set([
  'de', 'la', 'el', 'los', 'las', 'un', 'una', 'y', 'del', 'al', 'en', 'con',
  'mayorista', 'minorista', 'kg', 'grs', 'gr', 'gramo', 'gramos', 'kilo', 'kilos',
  'unidad', 'unidades', 'unid', 'pack', 'caja',
])

function normalizarTextoMatch(s) {
  return String(s || '')
    .toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '') // saca acentos
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter((t) => t.length >= 3 && !PALABRAS_FILLER_MATCH.has(t))
}

/** 0..1 -- proporción de palabras en común respecto al texto más corto. */
function scoreMatchDescripcion(a, b) {
  const tokensA = normalizarTextoMatch(a)
  const tokensB = normalizarTextoMatch(b)
  if (!tokensA.length || !tokensB.length) return 0
  const setB = new Set(tokensB)
  const comunes = tokensA.filter((t) => setB.has(t)).length
  return comunes / Math.min(tokensA.length, tokensB.length)
}

// ±10% por línea, a pedido de Carlos (03/09) -- la carne varía por
// venderse al peso, así que un cierre "casi exacto" no debería frenar la
// carga automática, pero cualquier cosa más allá de eso sí amerita
// preguntarle antes de tocar stock.
const TOLERANCIA_CANTIDAD_OC = 0.10
const UMBRAL_MATCH_DESCRIPCION = 0.5

/**
 * Devuelve un resultado por cada ítem de la factura: a qué ítem de la OC
 * matcheó (o null si ninguno superó el umbral de similitud) y si la
 * cantidad entregada cae dentro de la tolerancia de la pedida. Cada ítem
 * de la OC se usa como match una sola vez (no puede "explicar" dos
 * líneas distintas de la misma factura).
 */
function matchearItemsFacturaConOc(itemsFactura, itemsOc) {
  const ocDisponibles = itemsOc.map((oc) => ({ ...oc, usado: false }))
  return itemsFactura.map((itemFactura) => {
    let mejor = null
    let mejorScore = 0
    for (const oc of ocDisponibles) {
      if (oc.usado) continue
      const score = scoreMatchDescripcion(itemFactura.descripcion, oc.descripcion)
      if (score > mejorScore) {
        mejorScore = score
        mejor = oc
      }
    }
    if (!mejor || mejorScore < UMBRAL_MATCH_DESCRIPCION) {
      return { itemFactura, ocItem: null, dentroDeTolerancia: false }
    }
    mejor.usado = true
    const cantidadOc = Number(mejor.cantidad) || 0
    const cantidadFactura = Number(itemFactura.cantidad) || 0
    const diferenciaPct = cantidadOc > 0 ? Math.abs(cantidadFactura - cantidadOc) / cantidadOc : 1
    return {
      itemFactura,
      ocItem: mejor,
      cantidadOc,
      cantidadFactura,
      diferenciaPct,
      dentroDeTolerancia: diferenciaPct <= TOLERANCIA_CANTIDAD_OC,
    }
  })
}

/**
 * Espejo server-side (service_role) de actualizarStockPorCompra en
 * src/modules/compras/lib/actualizarStockCompra.ts -- ese archivo usa el
 * cliente browser de Supabase (RLS), no sirve en un contexto de Netlify
 * Function. No maneja multi-local (punto_venta_id null) -- mismo
 * criterio simplificado que ya se usa en el resto de este archivo para
 * los movimientos de caja de los pagos (ver más arriba).
 */
async function actualizarStockPorCompraServer(supabaseAdmin, { clienteId, proveedorNombre, fecha, numeroComprobante, lineas }) {
  const recepcionId = crypto.randomUUID()
  const { error: errRecepcion } = await supabaseAdmin.from('recepciones').insert({
    id: recepcionId,
    cliente_id: clienteId,
    fecha,
    proveedor: proveedorNombre,
    numero_remito: numeroComprobante,
    estado: 'confirmada',
    notas: `Generada automáticamente por el agente de WhatsApp -- comprobante ${numeroComprobante}, cantidades verificadas contra la Orden de Compra (Fase 69b).`,
  })
  if (errRecepcion) {
    console.error('actualizarStockPorCompraServer: error creando recepción', errRecepcion)
    return { ok: false, error: errRecepcion.message }
  }

  const recepcionLineas = lineas.map((l) => ({
    id: crypto.randomUUID(),
    recepcion_id: recepcionId,
    item_tipo: 'insumo',
    item_id: l.insumoId,
    cantidad: l.cantidad,
    costo_unitario: l.costoUnitario,
    fecha_vencimiento: null,
  }))
  const { error: errLineas } = await supabaseAdmin.from('recepcion_lineas').insert(recepcionLineas)
  if (errLineas) console.error('actualizarStockPorCompraServer: error creando recepcion_lineas', errLineas)

  const movimientos = recepcionLineas.map((l) => ({
    id: crypto.randomUUID(),
    cliente_id: clienteId,
    tipo: 'ingreso',
    item_tipo: 'insumo',
    item_id: l.item_id,
    cantidad: l.cantidad,
    costo_unitario: l.costo_unitario,
    fecha,
    origen: 'recepcion',
    origen_id: recepcionId,
    punto_venta_id: null,
  }))
  const { error: errMov } = await supabaseAdmin.from('movimientos_stock').insert(movimientos)
  if (errMov) console.error('actualizarStockPorCompraServer: error creando movimientos_stock', errMov)

  // Secuencial (no en paralelo) por si una misma fórmula/factura repite
  // el mismo insumo en más de una línea -- mismo criterio que la versión
  // frontend.
  for (const l of lineas) {
    const { data: insumoRow } = await supabaseAdmin.from('insumos').select('stock').eq('id', l.insumoId).single()
    const stockActual = Number(insumoRow?.stock ?? 0)
    const update = { stock: stockActual + l.cantidad }
    if (l.costoUnitario > 0) update.costo = l.costoUnitario
    await supabaseAdmin.from('insumos').update(update).eq('id', l.insumoId)
  }

  return { ok: true, recepcionId }
}

// Intenta cargar el comprobante en Compras (o en Home Keep, según
// `destino`) a partir de lo que se pudo extraer de la imagen. Devuelve
// siempre un resultado -- nunca lanza por datos incompletos, eso es
// justamente lo que decide si se carga o se deja pendiente.
export async function intentarCargarComprobante({
  supabaseAdmin,
  clienteId,
  comprobanteRecibidoId,
  datosExtraidos,
  formaPagoRespuesta, // si viene de la respuesta del admin (texto libre)
  cuitManual, // Fase 68a -- si viene de la respuesta del admin a la aclaración de CUIT
  esPrueba,
  destino = 'compras', // 'compras' (default) | 'hogar' (Fase 56, Home Keep)
  captionTexto, // Fase 68c (extensión) -- pie de foto de WhatsApp, ver parseCaptionPagoFactura
  ticketImagenUrl, // path en el bucket del ticket recién subido (comprobantes_recibidos.imagen_url)
}) {
  if (!datosExtraidos || typeof datosExtraidos !== 'object') {
    return { creado: false, motivo: 'sin_datos_extraidos' }
  }

  // Fase 68b -- la IA de visión ahora clasifica la imagen ANTES de que
  // lleguemos acá (ver prompt de "Extraer Datos Comprobante {Tenant}" en
  // n8n, campo tipoDocumento). Si es un ticket de pago (transferencia,
  // Mercado Pago, etc.) en vez de una factura de un proveedor, NUNCA hay
  // que intentar cargarlo como comprobante de compra -- eso fue
  // justamente el bug del 01/09 (un ticket de pago QR de MP se cargó
  // como si fuera una factura nueva, con un "proveedor" inventado a
  // partir del número de operación). Se deja marcado en la bandeja para
  // que la Fase 68c lo vincule a un pago existente.
  if (datosExtraidos.tipoDocumento === 'ticket_pago') {
    const montoTicket = numero(datosExtraidos.montoTicketPago, null)
    const fechaTicket = datosExtraidos.fechaTicketPago || null

    // Fase 68c (extensión) -- si el admin puso "factura N reintegro M"
    // en el pie de foto, es un PAGO NUEVO contra esa factura puntual (no
    // un intento de vincular a un crédito ya existente). Se prueba este
    // camino primero porque es una instrucción explícita del admin.
    const captionParseado = parseCaptionPagoFactura(captionTexto)
    if (captionParseado) {
      const resultadoPago = await intentarRegistrarPagoConReintegro({
        supabaseAdmin,
        clienteId,
        destino,
        numeroFactura: captionParseado.numeroFactura,
        montoTicket,
        fechaTicket,
        reintegroValor: captionParseado.reintegroValor,
        reintegroEsPorcentaje: captionParseado.reintegroEsPorcentaje,
        ticketImagenUrl,
      })
      if (resultadoPago.creado) {
        // OJO: el spread va ANTES de creado/motivo -- si van antes, el
        // creado:true de resultadoPago pisa el creado:false de acá (bug
        // real detectado en la prueba en vivo del 02/09: el WhatsApp
        // devolvió el mensaje generico de "comprobante cargado" en vez
        // del detalle del pago, porque cargaCompras.creado quedaba true).
        return { ...resultadoPago, creado: false, motivo: 'pago_registrado_con_reintegro' }
      }
      // La instrucción del caption era explícita y no se pudo cumplir
      // (factura inexistente, saldo insuficiente, error) -- se informa
      // el motivo puntual en vez de caer silenciosamente al camino viejo,
      // para que Carlos vea exactamente qué faltó resolver.
      return { creado: false, motivo: resultadoPago.motivo, ...resultadoPago }
    }

    // Fase 68c -- intentamos vincular el ticket a un crédito pendiente
    // de Fase 67 (ver src/lib/creditos.ts / tabla creditos_pendientes).
    // Mismo criterio conservador que el matcheo de proveedor por CUIT
    // (Fase 54/68a): si no hay UN ÚNICO crédito pendiente cuyo monto
    // esperado coincida con el monto del ticket, no se adivina --
    // queda pendiente para vincular a mano desde Tesorería.
    const resultadoVinculo = await intentarVincularTicketPagoACredito({
      supabaseAdmin,
      clienteId,
      destino,
      montoTicket,
      fechaTicket,
    })
    if (resultadoVinculo.vinculado) {
      return { creado: false, motivo: 'ticket_pago_vinculado', ...resultadoVinculo }
    }
    // tipo_documento ya quedó guardado en el alta (agente-comprobante-recibir.js);
    // acá solo cortamos el flujo antes de tocar proveedores/comprobantes.
    return { creado: false, motivo: 'es_ticket_pago', ...resultadoVinculo }
  }

  const tablas = TABLAS_POR_DESTINO[destino] || TABLAS_POR_DESTINO.compras
  const esHogar = destino === 'hogar'

  const formaPago = normalizarFormaPago(formaPagoRespuesta) || normalizarFormaPago(datosExtraidos.formaPagoDetectada)

  // Fase 68a -- el CUIT manual (respuesta del admin a la aclaración) pisa
  // al extraído por la IA: si el admin lo escribe a mano es porque la
  // extracción falló o matcheó mal.
  const cuitOriginalExtraido = soloDigitos(datosExtraidos.proveedorCuit)
  const cuit = soloDigitos(cuitManual) || cuitOriginalExtraido
  let proveedor = null
  if (cuit) {
    const { data: proveedores, error } = await supabaseAdmin
      .from(tablas.proveedores)
      .select('id, nombre, nombre_fantasia, cuit')
      .eq('cliente_id', clienteId)
    if (error) {
      console.error('intentarCargarComprobante: error consultando proveedores', error)
    } else {
      proveedor = (proveedores || []).find((p) => soloDigitos(p.cuit) === cuit) || null
    }
  }

  // Fase 68a (fix) -- si el proveedor se resolvió gracias a un CUIT
  // manual (el admin lo tipeó porque la IA lo leyó mal o no lo vio), hay
  // que PERSISTIR esa corrección en datos_extraidos ya mismo. Si no se
  // hace, el próximo llamado a este mismo comprobante (p.ej. cuando el
  // admin responde la forma de pago) vuelve a leer datos_extraidos tal
  // cual estaba guardado -- con el CUIT viejo/mal leído -- y repite el
  // mismo fallo de matcheo, haciendo que pendiente_aclaracion vuelva a
  // 'cuit' en loop aunque el admin ya lo haya corregido.
  if (cuitManual && proveedor && cuitOriginalExtraido !== cuit) {
    const datosCorregidos = { ...datosExtraidos, proveedorCuit: cuit }
    const { error: fixError } = await supabaseAdmin
      .from('comprobantes_recibidos')
      .update({ datos_extraidos: datosCorregidos })
      .eq('id', comprobanteRecibidoId)
    if (fixError) {
      console.error('intentarCargarComprobante: error persistiendo CUIT corregido', fixError)
    } else {
      datosExtraidos = datosCorregidos
    }
  }

  // Sin proveedor identificado: se deja pendiente, no se carga nada. Se
  // marca pendienteAclaracion='cuit' para que el próximo mensaje de
  // TEXTO del admin (ver agente-comprobante-resolver.js) se interprete
  // como el CUIT correcto, en vez de perderse.
  if (!proveedor) {
    await marcarPendiente(supabaseAdmin, comprobanteRecibidoId, {
      pendienteAclaracion: 'cuit',
      notaExtra: cuit
        ? `El agente extrajo/recibió el CUIT ${cuit} pero no matchea ningún proveedor cargado -- completar a mano.`
        : 'El agente no pudo leer el CUIT del proveedor en la imagen -- completar a mano.',
    })
    return { creado: false, motivo: 'proveedor_no_encontrado', cuitDetectado: Boolean(cuitOriginalExtraido) }
  }

  // Proveedor sí, pero falta la forma de pago: se le pregunta al admin
  // y se deja pendiente hasta que responda.
  if (!formaPago) {
    await marcarPendiente(supabaseAdmin, comprobanteRecibidoId, {
      pendienteAclaracion: 'forma_pago',
    })
    return { creado: false, motivo: 'forma_pago_pendiente', proveedorNombre: proveedor.nombre_fantasia || proveedor.nombre }
  }

  // Todo resuelto -- se carga el comprobante.
  const tipo = TIPOS_VALIDOS.includes(datosExtraidos.tipo) ? datosExtraidos.tipo : 'factura'

  // Categoría de gasto (Fase 55, tenant Hogar) -- si la IA sugirió una y
  // matchea EXACTO (por nombre) contra las categorías cargadas para este
  // cliente, se la asigna a todos los ítems. Si el cliente no tiene
  // categorías (caso normal de Punto Tex/Charcutería) o no hay match,
  // queda null -- no bloquea la carga, es solo un dato extra.
  let categoriaGastoId = null
  if (datosExtraidos.categoriaSugerida) {
    const { data: categorias } = await supabaseAdmin
      .from('categorias_gasto')
      .select('id, nombre')
      .eq('cliente_id', clienteId)
    const buscado = String(datosExtraidos.categoriaSugerida).trim().toLowerCase()
    const match = (categorias || []).find((c) => c.nombre.toLowerCase() === buscado)
    categoriaGastoId = match ? match.id : null
  }

  const { data: maxRow } = await supabaseAdmin
    .from(tablas.comprobantes)
    .select('numero')
    .eq('cliente_id', clienteId)
    .eq('tipo', tipo)
    .order('numero', { ascending: false })
    .limit(1)
    .maybeSingle()
  const nuevoNumero = numero(maxRow?.numero, 0) + 1

  const itemsExtraidos = Array.isArray(datosExtraidos.items) && datosExtraidos.items.length
    ? datosExtraidos.items
    : [{ descripcion: datosExtraidos.tipo ? 'Ítem sin detalle (extracción automática)' : 'Combustible / servicio', cantidad: 1, precioUnitario: numero(datosExtraidos.total) }]

  const items = itemsExtraidos.map((it) => {
    const cantidad = numero(it.cantidad, 1) || 1
    const precioUnitario = numero(it.precioUnitario, 0)
    const alicuotaIva = numero(it.alicuotaIva, 21)
    const subtotalItem = cantidad * precioUnitario
    const montoIvaItem = subtotalItem * (alicuotaIva / 100)
    const base = {
      // Fase 69b -- id propio (no el default de la DB) para poder pisar
      // el insumo_id de la fila puntual después del insert, si el
      // matcheo contra la OC resuelve a qué insumo corresponde.
      id: crypto.randomUUID(),
      descripcion: String(it.descripcion || 'Ítem sin detalle').slice(0, 500),
      cantidad,
      precio_unitario: precioUnitario,
      descuento: 0,
      alicuota_iva: alicuotaIva,
      subtotal: subtotalItem,
      monto_iva: montoIvaItem,
      categoria_gasto_id: categoriaGastoId,
      unidad: null,
    }
    // comprobante_hogar_items (Home Keep) no tiene columnas producto_id
    // ni insumo_id -- no hay catálogo de productos en ese módulo.
    return esHogar ? base : { ...base, producto_id: null, insumo_id: null }
  })

  const subtotal = numero(datosExtraidos.subtotal, items.reduce((a, i) => a + i.subtotal, 0))
  const montoIva = numero(datosExtraidos.montoIva, items.reduce((a, i) => a + i.monto_iva, 0))
  const otrosImpuestos = Array.isArray(datosExtraidos.otrosImpuestos)
    ? datosExtraidos.otrosImpuestos
        .filter((o) => o && o.concepto)
        .map((o) => ({ id: crypto.randomUUID(), concepto: String(o.concepto).slice(0, 200), monto: numero(o.monto, 0) }))
    : []
  const totalOtros = otrosImpuestos.reduce((a, o) => a + o.monto, 0)
  const total = numero(datosExtraidos.total, subtotal + montoIva + totalOtros)

  const notaTrazabilidad = `Cargado automáticamente por el agente de WhatsApp a partir de comprobantes_recibidos#${comprobanteRecibidoId}.`

  // Fase 69b (a pedido de Carlos, 03/09) -- caso real: la carne del 22/08
  // se compró contra la OC N.º 2, pero la factura llegó por WhatsApp sin
  // ningún vínculo hacia esa OC, que quedó "pendiente" para siempre aunque
  // la mercadería se recibió y se pagó. Acá, si hay UNA sola Orden de
  // Compra pendiente/parcial de este mismo proveedor, se linkea
  // automáticamente (mismo criterio conservador de siempre: 0 o 2+
  // matches, no se adivina, queda sin vincular para hacerlo a mano desde
  // Órdenes de Compra). Solo aplica a Compras real -- Home Keep no tiene
  // Órdenes de Compra.
  let ordenCompraId = null
  let itemsOc = []
  if (!esHogar) {
    const { data: ocsPendientes, error: errOcs } = await supabaseAdmin
      .from('ordenes_compra')
      .select('id, estado')
      .eq('cliente_id', clienteId)
      .eq('proveedor_id', proveedor.id)
      .in('estado', ['pendiente', 'parcial'])
    if (errOcs) {
      console.error('intentarCargarComprobante: error buscando OC pendiente para vincular', errOcs)
    } else if (ocsPendientes && ocsPendientes.length === 1) {
      ordenCompraId = ocsPendientes[0].id
      const { data: ocItemsRows, error: errOcItems } = await supabaseAdmin
        .from('orden_compra_items')
        .select('id, descripcion, cantidad, insumo_id')
        .eq('orden_compra_id', ordenCompraId)
      if (errOcItems) {
        console.error('intentarCargarComprobante: error leyendo items de la OC', errOcItems)
      } else {
        itemsOc = ocItemsRows || []
      }
    }
  }

  // Fase 69b (03/09, a pedido de Carlos) -- encontrar la OC no alcanza:
  // antes de cerrarla y cargar stock solo, hay que chequear que las
  // cantidades de la factura cierren contra lo pedido en esa OC. La
  // carne varía por venderse al peso, así que se tolera ±10% por línea
  // (TOLERANCIA_CANTIDAD_OC) -- dentro de ese margen se carga solo, fuera
  // de eso se le pregunta a Carlos por WhatsApp (SI/NO) en vez de
  // adivinar. El matcheo item-por-item usa similitud de texto porque la
  // factura llega con la descripción "cruda" del proveedor (ej. "PULPA
  // CUARTO MAYORISTA") mientras que la OC ya tiene el insumo real
  // vinculado (ej. "Pulpa de Cuarto Trasero de Cerdo") -- ver
  // matchearItemsFacturaConOc más abajo en este archivo.
  let matchesOc = []
  let autoCierreOc = false
  if (ordenCompraId && itemsOc.length && !esHogar) {
    matchesOc = matchearItemsFacturaConOc(items, itemsOc)
    autoCierreOc = matchesOc.length > 0 && matchesOc.every((m) => m.ocItem && m.dentroDeTolerancia)
    if (autoCierreOc) {
      // Todo matcheó y cierra dentro de tolerancia -- se resuelve el
      // insumo_id de cada línea ACÁ, antes del insert, para no tener que
      // pisarlo después.
      for (const m of matchesOc) {
        m.itemFactura.insumo_id = m.ocItem.insumo_id
      }
    }
  }

  const filaComprobante = {
    cliente_id: clienteId,
    tipo,
    numero: nuevoNumero,
    proveedor_id: proveedor.id,
    fecha: datosExtraidos.fecha || new Date().toISOString().slice(0, 10),
    subtotal,
    monto_iva: montoIva,
    otros_impuestos: otrosImpuestos,
    total,
    estado: 'pendiente',
    medio_pago: formaPago,
    monto_pagado: 0,
    saldo_pendiente: total,
    numero_comprobante_proveedor: datosExtraidos.numeroComprobanteProveedor || null,
    notas: notaTrazabilidad,
    es_prueba: Boolean(esPrueba),
  }
  // comprobantes_hogar (Home Keep) no tiene remito/stock/tipo de
  // comprobante fiscal -- no aplica un flujo de recepción de mercadería.
  if (!esHogar) {
    filaComprobante.control_remision = 'no'
    filaComprobante.tipo_comprobante_codigo = datosExtraidos.tipoComprobanteCodigo || null
    filaComprobante.stock_actualizado = false
    filaComprobante.orden_compra_id = ordenCompraId
  }

  const { data: comprobante, error: insertError } = await supabaseAdmin
    .from(tablas.comprobantes)
    .insert([filaComprobante])
    .select('id')
    .single()

  if (insertError) {
    console.error('intentarCargarComprobante: error creando comprobante', insertError)
    return { creado: false, motivo: 'error_al_crear', error: insertError.message }
  }

  const { error: itemsError } = await supabaseAdmin
    .from(tablas.items)
    .insert(items.map((i) => ({ ...i, comprobante_id: comprobante.id })))

  if (itemsError) {
    console.error('intentarCargarComprobante: error creando items', itemsError)
  }

  // Fase 69b -- una vez insertados factura + items, se resuelve qué pasa
  // con la OC vinculada (si hay una): cerrarla y cargar stock solo si
  // cerró dentro de tolerancia, o dejar la pregunta pendiente para
  // WhatsApp si no.
  let ordenCompraVinculada = Boolean(ordenCompraId)
  let ocCerradaAutomaticamente = false
  let confirmacionOcPendiente = null

  if (ordenCompraId && autoCierreOc) {
    const resultadoStock = await actualizarStockPorCompraServer(supabaseAdmin, {
      clienteId,
      proveedorNombre: proveedor.nombre_fantasia || proveedor.nombre,
      fecha: filaComprobante.fecha,
      numeroComprobante: `FC-${String(nuevoNumero).padStart(5, '0')}`,
      lineas: matchesOc.map((m) => ({
        insumoId: m.ocItem.insumo_id,
        cantidad: m.cantidadFactura,
        costoUnitario: m.itemFactura.precio_unitario,
      })),
    })
    if (resultadoStock.ok) {
      await supabaseAdmin
        .from('comprobantes_compra')
        .update({ stock_actualizado: true, recepcion_id: resultadoStock.recepcionId })
        .eq('id', comprobante.id)

      // ¿Esta factura cubrió TODOS los insumos de la OC, o solo una
      // parte (ej. la carne de una OC que también tenía aditivos de otro
      // proveedor)? Se mira el total de insumos ya facturados contra
      // esta OC (entre ésta y cualquier factura anterior), no solo los de
      // esta factura puntual -- así una OC que se completa en 2 compras
      // separadas sí termina en "recibida" con la segunda.
      const { data: comprobantesDeEstaOc } = await supabaseAdmin
        .from('comprobantes_compra')
        .select('comprobante_compra_items(insumo_id)')
        .eq('orden_compra_id', ordenCompraId)
      const insumosFacturados = new Set(
        (comprobantesDeEstaOc || [])
          .flatMap((c) => c.comprobante_compra_items || [])
          .map((i) => i.insumo_id)
          .filter(Boolean),
      )
      const insumosOc = new Set(itemsOc.map((i) => i.insumo_id).filter(Boolean))
      const cobertoCompleto = [...insumosOc].every((id) => insumosFacturados.has(id))

      const { error: errUpdateOc } = await supabaseAdmin
        .from('ordenes_compra')
        .update({ estado: cobertoCompleto ? 'recibida' : 'parcial' })
        .eq('id', ordenCompraId)
      if (errUpdateOc) {
        console.error('intentarCargarComprobante: error actualizando estado de la OC', errUpdateOc)
      }
      ocCerradaAutomaticamente = true
    } else {
      console.error('intentarCargarComprobante: error cargando stock desde OC verificada', resultadoStock.error)
    }
  } else if (ordenCompraId && matchesOc.length) {
    // No cerró exacto (o no matcheó algún ítem) -- se le pregunta a
    // Carlos por WhatsApp antes de tocar stock/OC. Se guardan solo los
    // ids (no el detalle del matcheo) porque el resolver re-lee
    // comprobante_compra_items + orden_compra_items y recalcula el mismo
    // matcheo de forma determinística -- no hace falta duplicar datos.
    datosExtraidos = {
      ...datosExtraidos,
      _recepcionOcPendiente: { comprobanteId: comprobante.id, ordenCompraId },
    }
    confirmacionOcPendiente = {
      ordenCompraId,
      detalle: matchesOc.map((m) => ({
        descripcion: m.itemFactura.descripcion,
        cantidadFactura: m.cantidadFactura,
        cantidadOc: m.ocItem ? m.cantidadOc : null,
        matcheo: Boolean(m.ocItem),
      })),
    }
    await marcarPendiente(supabaseAdmin, comprobanteRecibidoId, { pendienteAclaracion: 'confirmar_recepcion_oc' })
  }

  // comprobante_compra_id tiene FK a comprobantes_compra -- para
  // destino='hogar' el id va en su columna hermana (Fase 56c).
  const updateRecibido = {
    estado: 'revisado',
    // Fase 69b -- si quedó pendiente la confirmación de la OC, no se
    // pisa acá (marcarPendiente ya lo dejó en 'confirmar_recepcion_oc'
    // arriba); en cualquier otro caso, se limpia como siempre.
    pendiente_aclaracion: confirmacionOcPendiente ? 'confirmar_recepcion_oc' : null,
    datos_extraidos: datosExtraidos,
  }
  if (esHogar) {
    updateRecibido.comprobante_hogar_id = comprobante.id
  } else {
    updateRecibido.comprobante_compra_id = comprobante.id
  }

  await supabaseAdmin
    .from('comprobantes_recibidos')
    .update(updateRecibido)
    .eq('id', comprobanteRecibidoId)

  return {
    creado: true,
    comprobanteId: comprobante.id,
    proveedorNombre: proveedor.nombre_fantasia || proveedor.nombre,
    total,
    numero: nuevoNumero,
    tipo,
    ordenCompraVinculada,
    ocCerradaAutomaticamente,
    confirmacionOcPendiente,
  }
}

/**
 * Fase 69b -- se llama desde agente-comprobante-resolver.js cuando Carlos
 * responde SI/NO por WhatsApp a la pregunta de "¿cierro esta OC con esta
 * factura aunque no cerró exacto?". Re-lee los items de la factura y de
 * la OC desde cero (no se confía en nada cacheado en datos_extraidos) y
 * repite el mismo matcheo de intentarCargarComprobante -- es
 * determinístico, así que no hace falta duplicar el detalle del cálculo
 * en ningún lado, alcanza con guardar comprobanteId + ordenCompraId.
 *
 * Con "NO": no se toca nada más -- la factura y la OC quedan como
 * estaban, para resolverlo a mano desde la app (elección explícita de
 * Carlos, no un default nuestro).
 *
 * Con "SI": se cargan al inventario únicamente los ítems de la factura
 * que matchearon por texto contra algún ítem de la OC -- los que no
 * matchearon ninguno quedan sin insumo_id, igual que si la factura se
 * hubiera cargado sin ninguna OC vinculada. Nunca se inventa un
 * insumo_id para un ítem que no matcheó.
 */
export async function resolverConfirmacionRecepcionOc(supabaseAdmin, { comprobanteId, ordenCompraId, confirmar }) {
  if (!confirmar) {
    return { ok: true, cerrada: false }
  }

  const { data: itemsFacturaRows, error: errItemsFactura } = await supabaseAdmin
    .from('comprobante_compra_items')
    .select('id, descripcion, cantidad, precio_unitario, insumo_id')
    .eq('comprobante_id', comprobanteId)
  if (errItemsFactura) {
    console.error('resolverConfirmacionRecepcionOc: error leyendo items de la factura', errItemsFactura)
    return { ok: false, error: errItemsFactura.message }
  }

  const { data: itemsOcRows, error: errItemsOc } = await supabaseAdmin
    .from('orden_compra_items')
    .select('id, descripcion, cantidad, insumo_id')
    .eq('orden_compra_id', ordenCompraId)
  if (errItemsOc) {
    console.error('resolverConfirmacionRecepcionOc: error leyendo items de la OC', errItemsOc)
    return { ok: false, error: errItemsOc.message }
  }

  const matches = matchearItemsFacturaConOc(itemsFacturaRows || [], itemsOcRows || [])
  const usables = matches.filter((m) => m.ocItem && m.ocItem.insumo_id)

  if (!usables.length) {
    return { ok: false, error: 'ningun_item_matcheo' }
  }

  const { data: comprobanteRow, error: errComprobante } = await supabaseAdmin
    .from('comprobantes_compra')
    .select('id, cliente_id, proveedor_id, fecha, numero')
    .eq('id', comprobanteId)
    .single()
  if (errComprobante || !comprobanteRow) {
    console.error('resolverConfirmacionRecepcionOc: error leyendo el comprobante', errComprobante)
    return { ok: false, error: errComprobante?.message || 'comprobante_no_encontrado' }
  }

  const { data: proveedorRow } = await supabaseAdmin
    .from('proveedores')
    .select('nombre, nombre_fantasia')
    .eq('id', comprobanteRow.proveedor_id)
    .maybeSingle()
  const proveedorNombre = proveedorRow?.nombre_fantasia || proveedorRow?.nombre || 'Proveedor'

  const resultadoStock = await actualizarStockPorCompraServer(supabaseAdmin, {
    clienteId: comprobanteRow.cliente_id,
    proveedorNombre,
    fecha: comprobanteRow.fecha,
    numeroComprobante: `FC-${String(comprobanteRow.numero).padStart(5, '0')}`,
    lineas: usables.map((m) => ({
      insumoId: m.ocItem.insumo_id,
      cantidad: m.cantidadFactura,
      costoUnitario: Number(m.itemFactura.precio_unitario) || 0,
    })),
  })
  if (!resultadoStock.ok) {
    console.error('resolverConfirmacionRecepcionOc: error cargando stock', resultadoStock.error)
    return { ok: false, error: resultadoStock.error }
  }

  // Deja registrado en cada ítem de la factura a qué insumo quedó
  // vinculado -- para que se vea en el detalle del comprobante, igual
  // que si hubiera cerrado automático.
  for (const m of usables) {
    await supabaseAdmin
      .from('comprobante_compra_items')
      .update({ insumo_id: m.ocItem.insumo_id })
      .eq('id', m.itemFactura.id)
  }

  await supabaseAdmin
    .from('comprobantes_compra')
    .update({ stock_actualizado: true, recepcion_id: resultadoStock.recepcionId })
    .eq('id', comprobanteId)

  const { data: comprobantesDeEstaOc } = await supabaseAdmin
    .from('comprobantes_compra')
    .select('comprobante_compra_items(insumo_id)')
    .eq('orden_compra_id', ordenCompraId)
  const insumosFacturados = new Set(
    (comprobantesDeEstaOc || [])
      .flatMap((c) => c.comprobante_compra_items || [])
      .map((i) => i.insumo_id)
      .filter(Boolean),
  )
  const insumosOc = new Set((itemsOcRows || []).map((i) => i.insumo_id).filter(Boolean))
  const cobertoCompleto = [...insumosOc].every((id) => insumosFacturados.has(id))

  const { error: errUpdateOc } = await supabaseAdmin
    .from('ordenes_compra')
    .update({ estado: cobertoCompleto ? 'recibida' : 'parcial' })
    .eq('id', ordenCompraId)
  if (errUpdateOc) {
    console.error('resolverConfirmacionRecepcionOc: error actualizando estado de la OC', errUpdateOc)
  }

  return {
    ok: true,
    cerrada: true,
    estadoOc: cobertoCompleto ? 'recibida' : 'parcial',
    itemsCargados: usables.length,
    itemsSinMatch: matches.length - usables.length,
  }
}

async function marcarPendiente(supabaseAdmin, comprobanteRecibidoId, { pendienteAclaracion = null, notaExtra = null } = {}) {
  const update = { pendiente_aclaracion: pendienteAclaracion }
  if (notaExtra) update.notas = notaExtra
  const { error } = await supabaseAdmin
    .from('comprobantes_recibidos')
    .update(update)
    .eq('id', comprobanteRecibidoId)
  // Fase 68a -- antes este error se tragaba en silencio (un CHECK
  // constraint que rechazaba un valor nuevo de pendienteAclaracion podía
  // dejar el comprobante mudo, sin ninguna pista de por qué). Ahora
  // queda logueado para poder diagnosticarlo desde Netlify.
  if (error) {
    console.error('marcarPendiente: error actualizando comprobantes_recibidos', comprobanteRecibidoId, error)
  }
}

export { normalizarFormaPago }
