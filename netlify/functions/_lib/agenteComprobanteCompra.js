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
  const matchFactura = texto.match(/factura\s*n?[°ºo]?\.?\s*#?\s*(\d+)/i)
  if (!matchFactura) return null
  const numeroFactura = parseInt(matchFactura[1], 10)
  if (!Number.isFinite(numeroFactura)) return null

  // El reintegro es OPCIONAL -- un pago sin promo/reintegro asociado
  // (ej. la parte de Mercado Pago de una compra mixta) también se puede
  // registrar solo con "factura N" en el caption. Si "reintegro" está
  // pero el valor no es un número real (ej. alguien puso "reintegro x"
  // como placeholder sin completar), se ignora el reintegro en vez de
  // descartar todo el caption -- mejor cargar el pago sin reintegro que
  // no cargarlo por un dato incompleto que no afecta el monto del pago.
  const matchReintegro = texto.match(/reintegro\s*(?:de|del)?\s*\$?\s*([\d.,]+)\s*(%)?/i)
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

  // comprobante_compra_id tiene FK a comprobantes_compra -- para
  // destino='hogar' el id va en su columna hermana (Fase 56c).
  const updateRecibido = {
    estado: 'revisado',
    pendiente_aclaracion: null,
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
