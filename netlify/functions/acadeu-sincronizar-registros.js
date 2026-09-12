import { crearSupabaseAdmin, autenticarAgente } from './_lib/agenteAuth.js'

// Fase 75q (11/09, a pedido de Carlos): a diferencia de acadeu-sincronizar.js
// (que lee /notificaciones -- un feed de eventos, con cursor por ID, cada
// 30 minutos) esto lee 4 páginas de CONSULTA por alumno (Boletín,
// Convivencia, Materias Adeudadas, Asistencias histórico) que no traen un
// id incremental -- son un estado actual, no un feed.
//
// Fase 75r (11/09, a pedido de Carlos): dos agregados sobre la versión
// original --
//   1) NORMALIZACIÓN: el scraper de Puppeteer manda tablas HTML crudas
//      (headers/filas genéricos, distintos entre primaria y secundaria).
//      Acá se las convierte a una forma prolija por tipo de registro
//      (ver normalizarPorTipo) para que la Ficha pueda mostrar un
//      resumen legible en vez de tener que interpretar tablas crudas.
//   2) HISTORIAL LIVIANO: en vez de pisar el registro sin dejar rastro,
//      se compara el estado nuevo contra el anterior (mismo vínculo +
//      tipo + origen='acadeu') y, si algo cambió, se agrega una entrada
//      corta a contenido.historial (capado a las últimas 50) -- NO se
//      duplica la tabla entera en cada corrida, que sería la mayoría
//      de las veces exactamente igual a la anterior. Los cambios de
//      nota puntuales YA llegan por WhatsApp vía el feed de
//      notificaciones (30 min) -- este historial es de referencia
//      dentro de la ficha, no una alerta nueva.
//
// El campo `contenido` de cada fila queda entonces:
//   { estadoActual: <forma normalizada según el tipo>, historial: [{fecha, cambios: [...]}] }
// Los registros cargados a MANO (ver useInstituciones.ts) usan el mismo
// sobre -- estadoActual: { mensaje: texto }, historial: [] -- para que
// el renderer de la Ficha tenga una sola forma que entender sin
// importar el origen.
//
//   POST /.netlify/functions/acadeu-sincronizar-registros
//   Header: X-Api-Key: <api key del tenant -- La Charcutería>
//   Body:   { "resultados": [
//               { "nombre": "Milagros",
//                 "asistencias": { "tablas": [...], "mensaje": null },
//                 "boletin": { "tablas": [...], "mensaje": null },
//                 "convivencia": { "tablas": [...], "mensaje": "..." },
//                 "materias_adeudadas": { "tablas": [...], "mensaje": "..." } },
//               ... ] }
//   -- "nombre" es el primer nombre tal cual lo tiene Acadeu en su menú;
//   se resuelve al integrante local por primer nombre (mismo criterio ya
//   probado en acadeu-sincronizar.js -- los 3 hijos tienen primeros
//   nombres distintos entre sí).

const TIPOS_VALIDOS = ['asistencias_historico', 'boletin', 'convivencia', 'materias_adeudadas']

// El body usa las claves "cortas" de la página (asistencias, boletin,
// convivencia, materias_adeudadas) -- "asistencias" se guarda como
// tipo_registro='asistencias_historico' (nombre ya usado en el catálogo
// de tipos, ver useInstituciones.ts).
const CLAVE_A_TIPO_REGISTRO = {
  asistencias: 'asistencias_historico',
  boletin: 'boletin',
  convivencia: 'convivencia',
  materias_adeudadas: 'materias_adeudadas',
}

const MAX_HISTORIAL = 50

function primerNombre(nombreCompleto) {
  return (nombreCompleto || '').trim().split(/\s+/)[0] || ''
}

// ─── Normalización de tablas crudas a una forma tipada por sección ──

function tablaPorHeaderRegex(tablas, regex, excluir) {
  return (tablas || []).find(
    (t) => (t.headers || []).some((h) => regex.test(h)) && t !== excluir,
  )
}

function filasATablaObjetos(tabla, limite) {
  if (!tabla) return []
  const headers = tabla.headers || []
  const filas = limite ? (tabla.filas || []).slice(0, limite) : tabla.filas || []
  return filas.map((fila) => {
    const obj = {}
    headers.forEach((h, i) => {
      if (h) obj[h] = fila[i] ?? ''
    })
    return obj
  })
}

// Boletín: tabla de asignaturas (nombre + una columna por trimestre) +
// resumen de asistencias del período + materias adeudadas de años
// anteriores + observaciones. Los headers exactos difieren entre
// primaria ("1T","2T","3T") y secundaria ("1° Trimestre", "Valoración
// final", etc.) -- por eso se busca por patrón, no por texto exacto.
function normalizarBoletin(datos) {
  const tablas = datos.tablas || []
  const tAsignaturas = tablaPorHeaderRegex(tablas, /^asignatura/i)
  const tAsistencias = tablaPorHeaderRegex(tablas, /^asistencia/i)
  const tMateriasAdeudadas = tablaPorHeaderRegex(tablas, /materias adeudadas/i)
  const tObservaciones = tablaPorHeaderRegex(tablas, /observaciones/i)

  function filaAValores(tabla, fila) {
    const valores = {}
    ;(tabla.headers || []).slice(1).forEach((h, i) => {
      if (h) valores[h] = fila[i + 1] ?? ''
    })
    return valores
  }

  const asignaturas = (tAsignaturas?.filas || [])
    .map((fila) => ({ nombre: fila[0], valores: filaAValores(tAsignaturas, fila) }))
    .filter((a) => a.nombre)

  const asistenciasResumen = (tAsistencias?.filas || [])
    .map((fila) => ({ nombre: fila[0], valores: filaAValores(tAsistencias, fila) }))
    .filter((a) => a.nombre)

  const materiasAdeudadasAnteriores = (tMateriasAdeudadas?.filas || [])
    .map((f) => f[0])
    .filter((t) => t && !/sin materias adeudadas/i.test(t))

  const observaciones = tObservaciones?.filas?.[0]?.[0] || null

  return { asignaturas, asistenciasResumen, materiasAdeudadasAnteriores, observaciones }
}

// Asistencias histórico: tabla resumen (Justificadas/Injustificadas/
// Computadas/Porcentaje, 1 fila) + tabla detalle (Fecha/Actividad/
// Estado/Justificación/Acumulado, muchas filas). El resto de las
// tablas que trae la página son el widget de calendario -- se ignoran.
function normalizarAsistenciasHistorico(datos) {
  const tablas = datos.tablas || []
  const tResumen = tablaPorHeaderRegex(tablas, /justificad/i)
  const tDetalle = tablaPorHeaderRegex(tablas, /^fecha$/i, tResumen)

  let resumen = null
  if (tResumen) {
    const fila = tResumen.filas?.[0] || []
    resumen = {}
    ;(tResumen.headers || []).forEach((h, i) => {
      if (h && h.toLowerCase() !== 'acciones') resumen[h] = fila[i] ?? ''
    })
  }

  const detalle = tDetalle ? filasATablaObjetos(tDetalle, 40) : []

  return { resumen, detalle }
}

// Convivencia y Materias Adeudadas: cuando no hay nada cargado, Acadeu
// muestra un mensaje informativo ("El alumno no posee..."); cuando sí
// hay algo, aparece como tabla -- se listan sus filas como items
// genéricos (headers como claves).
function normalizarGenerico(datos) {
  const tablas = datos.tablas || []
  if (tablas.length === 0) {
    return { mensaje: datos.mensaje || null, items: [] }
  }
  const items = tablas.flatMap((t) => filasATablaObjetos(t))
  return { mensaje: null, items }
}

function normalizarPorTipo(tipoRegistro, datos) {
  if (tipoRegistro === 'boletin') return normalizarBoletin(datos)
  if (tipoRegistro === 'asistencias_historico') return normalizarAsistenciasHistorico(datos)
  return normalizarGenerico(datos)
}

// ─── Historial liviano: solo anota si algo realmente cambió ─────────

function detectarCambios(tipoRegistro, anterior, actual) {
  if (!anterior) return [] // primera carga -- no es un "cambio", es el alta

  const cambios = []

  if (tipoRegistro === 'boletin') {
    const porNombre = new Map((anterior.asignaturas || []).map((a) => [a.nombre, a.valores]))
    for (const a of actual.asignaturas || []) {
      const antes = porNombre.get(a.nombre)
      if (!antes) cambios.push(`${a.nombre}: agregada`)
      else if (JSON.stringify(antes) !== JSON.stringify(a.valores)) cambios.push(`${a.nombre}: actualizada`)
    }
    if ((anterior.observaciones || '') !== (actual.observaciones || '') && actual.observaciones) {
      cambios.push('Observaciones actualizadas')
    }
  } else if (tipoRegistro === 'asistencias_historico') {
    const a = anterior.resumen || {}
    const b = actual.resumen || {}
    const claves = new Set([...Object.keys(a), ...Object.keys(b)])
    const partes = []
    for (const k of claves) {
      if (String(a[k] ?? '') !== String(b[k] ?? '')) partes.push(`${k}: ${a[k] ?? '—'} → ${b[k] ?? '—'}`)
    }
    if (partes.length > 0) cambios.push(partes.join(', '))
  } else {
    if ((anterior.mensaje || '') !== (actual.mensaje || '') && actual.mensaje) {
      cambios.push(actual.mensaje)
    }
    const antesN = (anterior.items || []).length
    const ahoraN = (actual.items || []).length
    if (ahoraN !== antesN) cambios.push(`Pasó de ${antesN} a ${ahoraN} ítem(s)`)
  }

  return cambios
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

  const resultados = Array.isArray(body.resultados) ? body.resultados : []
  if (resultados.length === 0) {
    return new Response(JSON.stringify({ ok: true, actualizados: 0, aviso: 'No se recibieron resultados.' }), { status: 200 })
  }

  const { data: integrantes, error: errIntegrantes } = await supabaseAdmin
    .from('usuarios_cliente')
    .select('id, nombre')
    .eq('cliente_id', agente.clienteId)

  if (errIntegrantes) {
    console.error('acadeu-sincronizar-registros: error trayendo integrantes', errIntegrantes)
    return new Response(JSON.stringify({ ok: false, error: 'No se pudo resolver la familia' }), { status: 500 })
  }

  const { data: vinculos, error: errVinculos } = await supabaseAdmin
    .from('vinculos_institucionales')
    .select('id, usuario_cliente_id')
    .eq('cliente_id', agente.clienteId)
    .eq('proveedor', 'acadeu')
    .eq('activo', true)

  if (errVinculos) {
    console.error('acadeu-sincronizar-registros: error trayendo vinculos_institucionales', errVinculos)
    return new Response(JSON.stringify({ ok: false, error: 'No se pudo resolver los vínculos institucionales' }), { status: 500 })
  }

  const vinculoPorUsuarioId = new Map((vinculos || []).map((v) => [v.usuario_cliente_id, v.id]))

  let actualizados = 0
  const sinResolver = []

  for (const resultado of resultados) {
    const integrante = (integrantes || []).find(
      (i) => primerNombre(i.nombre).toLowerCase() === String(resultado.nombre || '').toLowerCase(),
    )
    if (!integrante) {
      sinResolver.push({ motivo: 'integrante_no_encontrado', nombre: resultado.nombre })
      continue
    }
    const vinculoId = vinculoPorUsuarioId.get(integrante.id)
    if (!vinculoId) {
      sinResolver.push({ motivo: 'sin_vinculo_acadeu', nombre: resultado.nombre })
      continue
    }

    for (const [clave, tipoRegistro] of Object.entries(CLAVE_A_TIPO_REGISTRO)) {
      const datos = resultado[clave]
      if (!datos || !TIPOS_VALIDOS.includes(tipoRegistro)) continue

      // ¿Ya existe el snapshot de Acadeu para este vínculo+tipo? Se pisa
      // en vez de acumular filas -- pero antes se compara para armar el
      // historial liviano (ver comentario de cabecera).
      const { data: existente, error: errBuscar } = await supabaseAdmin
        .from('institucion_registros')
        .select('id, contenido')
        .eq('vinculo_id', vinculoId)
        .eq('tipo_registro', tipoRegistro)
        .eq('origen', 'acadeu')
        .maybeSingle()

      if (errBuscar) {
        console.error('acadeu-sincronizar-registros: error buscando registro existente', tipoRegistro, errBuscar)
        continue
      }

      const estadoActual = normalizarPorTipo(tipoRegistro, datos)
      const estadoAnterior = existente?.contenido?.estadoActual || null
      const cambios = detectarCambios(tipoRegistro, estadoAnterior, estadoActual)
      const historialPrevio = existente?.contenido?.historial || []
      const historial =
        cambios.length > 0
          ? [...historialPrevio, { fecha: new Date().toISOString(), cambios }].slice(-MAX_HISTORIAL)
          : historialPrevio

      const payload = {
        vinculo_id: vinculoId,
        tipo_registro: tipoRegistro,
        periodo: new Date().getFullYear().toString(),
        contenido: { estadoActual, historial },
        origen: 'acadeu',
        updated_at: new Date().toISOString(),
      }

      const { error: errUpsert } = existente
        ? await supabaseAdmin.from('institucion_registros').update(payload).eq('id', existente.id)
        : await supabaseAdmin.from('institucion_registros').insert(payload)

      if (errUpsert) {
        console.error('acadeu-sincronizar-registros: error guardando', tipoRegistro, errUpsert)
        continue
      }
      actualizados += 1
    }
  }

  return new Response(
    JSON.stringify({ ok: true, actualizados, sinResolver: sinResolver.length > 0 ? sinResolver : undefined }),
    { status: 200 },
  )
}
