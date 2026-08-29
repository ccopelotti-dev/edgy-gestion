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
  esPrueba,
  destino = 'compras', // 'compras' (default) | 'hogar' (Fase 56, Home Keep)
}) {
  if (!datosExtraidos || typeof datosExtraidos !== 'object') {
    return { creado: false, motivo: 'sin_datos_extraidos' }
  }

  const tablas = TABLAS_POR_DESTINO[destino] || TABLAS_POR_DESTINO.compras
  const esHogar = destino === 'hogar'

  const formaPago = normalizarFormaPago(formaPagoRespuesta) || normalizarFormaPago(datosExtraidos.formaPagoDetectada)

  const cuit = soloDigitos(datosExtraidos.proveedorCuit)
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

  // Sin proveedor identificado: se deja pendiente, no se carga nada.
  if (!proveedor) {
    await marcarPendiente(supabaseAdmin, comprobanteRecibidoId, {
      motivo: 'proveedor_no_encontrado',
      notaExtra: cuit
        ? `El agente extrajo el CUIT ${datosExtraidos.proveedorCuit} pero no matchea ningún proveedor cargado -- completar a mano.`
        : 'El agente no pudo leer el CUIT del proveedor en la imagen -- completar a mano.',
    })
    return { creado: false, motivo: 'proveedor_no_encontrado' }
  }

  // Proveedor sí, pero falta la forma de pago: se le pregunta al admin
  // y se deja pendiente hasta que responda.
  if (!formaPago) {
    await marcarPendiente(supabaseAdmin, comprobanteRecibidoId, {
      motivo: 'forma_pago',
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
  await supabaseAdmin
    .from('comprobantes_recibidos')
    .update(update)
    .eq('id', comprobanteRecibidoId)
}

export { normalizarFormaPago }
