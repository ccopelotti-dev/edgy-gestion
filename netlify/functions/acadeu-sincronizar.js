import { crearSupabaseAdmin, autenticarAgente } from './_lib/agenteAuth.js'
import { normalizarTelefonoArgentina } from './_lib/telefono.js'

// Fase 75l (09/09) -- primera versión: leía solo el widget de
// "evaluaciones próximas" (texto libre, diff por igualdad exacta).
// Fase 75n (11/09, a pedido de Carlos) -- ahora lee el feed completo de
// /notificaciones (ausencias, calificaciones publicadas Y evaluaciones
// nuevas), que Acadeu ya arma con un ID único y creciente por ítem.
// Con ID propio alcanza con un cursor: "hasta qué ID ya procesamos"
// (edgy_gestion.acadeu_estado_notificaciones, una fila por cliente --
// el feed es compartido entre los 3 hijos, no hace falta uno por
// integrante como en la versión vieja).
//
//   POST /.netlify/functions/acadeu-sincronizar
//   Header: X-Api-Key: <api key del tenant -- La Charcutería, mismo
//                        cliente_id que Home Keep>
//   Body:   { "notificaciones": [{ "id": 290694035, "texto": "...",
//                                   "iconoClass": "..." }, ...] }
//           -- ya vienen extraídas del DOM por el script de Puppeteer
//           (ver nodo "Login y Evaluaciones (Puppeteer)" en n8n), no
//           HTML crudo: separar id/texto en el browser (con DOM real)
//           es mucho más confiable que parsear con regex del lado de
//           acá, que es lo que hacía la Fase 75l con el widget viejo.
//
// Clasificación por TEXTO (no por iconoClass -- se recibe por si hace
// falta de respaldo, pero el ícono es un detalle de presentación más
// frágil que el texto armado por Acadeu, que difícilmente cambie).
//
// Decisión de Carlos (11/09): ausencias y calificaciones publicadas son
// eventos ya pasados/informativos -- van por WhatsApp pero NO se cargan
// en la Agenda familiar. Solo "nueva evaluación cargada" (algo por
// venir, hay que prepararse) genera una tarea en Home Keep.
//
// Todavía manda WhatsApp real (Fase 75m), mismo canal dedicado
// (clientes_agente_canales, canal='home_keep').

const CATEGORIA_ESCOLAR = 'escolar'
const ORIGEN_ACADEU = 'acadeu'

const TIPO_AUSENCIA = 'ausencia'
const TIPO_CALIFICACION = 'calificacion'
const TIPO_NUEVA_EVALUACION = 'nueva_evaluacion'
const TIPO_OTRO = 'otro'

const ICONO_POR_TIPO = {
  [TIPO_AUSENCIA]: '📌',
  [TIPO_CALIFICACION]: '📊',
  [TIPO_NUEVA_EVALUACION]: '📚',
  [TIPO_OTRO]: 'ℹ️',
}

// El texto de "nueva evaluación cargada" no menciona el nombre del
// chico, solo el curso entre paréntesis al final (ej. "...en
// Construcción de la Ciudadanía (1° III)"). Mapeo confirmado por
// Carlos el 11/09 -- si algún día cambia de división hay que actualizar
// esto a mano.
const CURSO_A_NOMBRE_PILA = {
  '1° III': 'Milagros',
  '6° Economía y Administración': 'Mateo',
  '4° B Prim': 'Martina',
}

function clasificarTipo(texto) {
  const t = texto.toLowerCase()
  if (t.includes('tiene') && t.includes('ausente')) return TIPO_AUSENCIA
  if (t.includes('se ha publicado la calificación')) return TIPO_CALIFICACION
  if (t.includes('cargó una nueva evaluación')) return TIPO_NUEVA_EVALUACION
  return TIPO_OTRO
}

function primerNombre(nombreCompleto) {
  return (nombreCompleto || '').trim().split(/\s+/)[0] || ''
}

// Ausencias y calificaciones mencionan el nombre de pila en el texto
// -- alcanza con chequear que aparezca como palabra completa. Mismo
// criterio que la Fase 75l (los 3 hijos tienen primeros nombres
// distintos entre sí).
function encontrarIntegrantePorNombre(texto, integrantes) {
  for (const integrante of integrantes) {
    const pila = primerNombre(integrante.nombre).toLowerCase()
    if (!pila) continue
    const re = new RegExp(`\\b${pila}\\b`, 'i')
    if (re.test(texto)) return integrante
  }
  return null
}

// "Nueva evaluación cargada" no trae el nombre -- el curso va entre
// paréntesis al final del texto.
function encontrarIntegrantePorCurso(texto, integrantes) {
  const m = texto.match(/\(([^)]+)\)\s*$/)
  if (!m) return null
  const curso = m[1].trim()
  const nombrePila = CURSO_A_NOMBRE_PILA[curso]
  if (!nombrePila) return null
  return (
    integrantes.find((i) => primerNombre(i.nombre).toLowerCase() === nombrePila.toLowerCase()) || null
  )
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

  const notificacionesRaw = Array.isArray(body.notificaciones) ? body.notificaciones : []
  const notificaciones = notificacionesRaw
    .map((n) => ({
      id: Number(n?.id),
      texto: String(n?.texto || '').replace(/\s+/g, ' ').trim(),
    }))
    .filter((n) => Number.isFinite(n.id) && n.id > 0 && n.texto)

  if (notificaciones.length === 0) {
    return new Response(
      JSON.stringify({ ok: true, novedades: [], huboNovedades: false, aviso: 'No se recibieron notificaciones válidas.' }),
      { status: 200 },
    )
  }

  const { data: integrantes, error: errIntegrantes } = await supabaseAdmin
    .from('usuarios_cliente')
    .select('id, nombre, telefono')
    .eq('cliente_id', agente.clienteId)

  if (errIntegrantes) {
    console.error('acadeu-sincronizar: error trayendo integrantes', errIntegrantes)
    return new Response(JSON.stringify({ ok: false, error: 'No se pudo resolver la familia' }), { status: 500 })
  }

  const { data: canal, error: errCanal } = await supabaseAdmin
    .from('clientes_agente_canales')
    .select('evolution_instance_nombre, evolution_instance_apikey, numero_adulto, activo')
    .eq('cliente_id', agente.clienteId)
    .eq('canal', 'home_keep')
    .maybeSingle()

  if (errCanal) {
    console.error('acadeu-sincronizar: error trayendo el canal de WhatsApp', errCanal)
  }
  const canalListo = Boolean(canal?.activo && canal?.evolution_instance_nombre && canal?.evolution_instance_apikey)

  async function mandarWhatsapp(numeroRaw, texto) {
    const numero = normalizarTelefonoArgentina(numeroRaw)
    if (!numero || numero.length < 12) return { numero: numeroRaw, ok: false, motivo: 'numero_invalido' }
    try {
      const res = await fetch(`https://evolution.edgysistemas.tech/message/sendText/${canal.evolution_instance_nombre}`, {
        method: 'POST',
        headers: { apikey: canal.evolution_instance_apikey, 'Content-Type': 'application/json' },
        body: JSON.stringify({ number: numero, text: texto }),
      })
      if (!res.ok) {
        console.error('acadeu-sincronizar: Evolution respondió error', res.status, await res.text())
        return { numero, ok: false, motivo: `evolution_${res.status}` }
      }
      return { numero, ok: true }
    } catch (e) {
      console.error('acadeu-sincronizar: error de red contra Evolution', e)
      return { numero, ok: false, motivo: 'error_red' }
    }
  }

  const { data: estadoPrevio, error: errEstado } = await supabaseAdmin
    .from('acadeu_estado_notificaciones')
    .select('ultimo_id_procesado')
    .eq('cliente_id', agente.clienteId)
    .maybeSingle()

  if (errEstado) {
    console.error('acadeu-sincronizar: error trayendo estado previo', errEstado)
    return new Response(JSON.stringify({ ok: false, error: 'No se pudo leer el último estado' }), { status: 500 })
  }
  const ultimoIdProcesado = estadoPrevio?.ultimo_id_procesado ?? 0

  // Más viejo primero -- para que el orden de los WhatsApp y de la
  // Agenda familiar sea cronológico, y para que el cursor avance bien
  // aunque se corte la ejecución a mitad de camino.
  const nuevas = notificaciones
    .filter((n) => n.id > ultimoIdProcesado)
    .sort((a, b) => a.id - b.id)

  const maxIdVisto = Math.max(ultimoIdProcesado, ...notificaciones.map((n) => n.id))

  const novedades = []
  const sinIdentificar = []

  for (const n of nuevas) {
    const tipo = clasificarTipo(n.texto)
    const integrante = encontrarIntegrantePorNombre(n.texto, integrantes || []) || encontrarIntegrantePorCurso(n.texto, integrantes || [])

    if (!integrante) {
      sinIdentificar.push({ id: n.id, texto: n.texto })
      continue
    }

    // Solo "nueva evaluación cargada" genera tarea en la Agenda
    // familiar -- ausencias y calificaciones son informativas, no hay
    // nada que "hacer" con ellas (decisión de Carlos, 11/09).
    if (tipo === TIPO_NUEVA_EVALUACION) {
      const { error: errTarea } = await supabaseAdmin.from('home_keep_tareas').insert({
        cliente_id: agente.clienteId,
        usuario_cliente_id: integrante.id,
        titulo: `Acadeu -- ${integrante.nombre}: ${n.texto}`,
        descripcion: null,
        fecha: new Date().toISOString().slice(0, 10),
        categoria: CATEGORIA_ESCOLAR,
        prioridad: 'media',
        origen: ORIGEN_ACADEU,
      })
      if (errTarea) {
        console.error('acadeu-sincronizar: error insertando en Agenda familiar para', integrante.nombre, errTarea)
      }
    }

    // Ausencias y calificaciones ya traen el nombre adentro del texto
    // (viene así armado por Acadeu) -- no repetirlo. "Nueva evaluación"
    // no lo trae (solo el curso), así que ahí sí hace falta anteponerlo.
    const mensaje =
      tipo === TIPO_NUEVA_EVALUACION
        ? `${ICONO_POR_TIPO[tipo]} Acadeu -- ${integrante.nombre}\n${n.texto}`
        : `${ICONO_POR_TIPO[tipo]} Acadeu\n${n.texto}`

    let envios
    if (canalListo) {
      const destinatarios = new Map()
      if (integrante.telefono) {
        const num = normalizarTelefonoArgentina(integrante.telefono)
        if (num) destinatarios.set(num, integrante.telefono)
      }
      if (canal.numero_adulto) {
        const num = normalizarTelefonoArgentina(canal.numero_adulto)
        if (num) destinatarios.set(num, canal.numero_adulto)
      }
      envios = []
      for (const numeroRaw of destinatarios.values()) {
        envios.push(await mandarWhatsapp(numeroRaw, mensaje))
      }
    }

    novedades.push({
      id: n.id,
      tipo,
      usuarioClienteId: integrante.id,
      nombre: integrante.nombre,
      mensaje: `${integrante.nombre}: ${n.texto}`,
      whatsapp: canalListo ? envios : 'canal_no_configurado',
    })
  }

  const { error: errUpsertEstado } = await supabaseAdmin
    .from('acadeu_estado_notificaciones')
    .upsert(
      { cliente_id: agente.clienteId, ultimo_id_procesado: maxIdVisto, updated_at: new Date().toISOString() },
      { onConflict: 'cliente_id' },
    )
  if (errUpsertEstado) {
    console.error('acadeu-sincronizar: error guardando el cursor', errUpsertEstado)
  }

  return new Response(
    JSON.stringify({
      ok: true,
      novedades,
      huboNovedades: novedades.length > 0,
      sinIdentificar: sinIdentificar.length > 0 ? sinIdentificar : undefined,
    }),
    { status: 200 },
  )
}
