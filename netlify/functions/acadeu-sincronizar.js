import { crearSupabaseAdmin, autenticarAgente } from './_lib/agenteAuth.js'

// Fase 75l (09/09, a pedido de Carlos) -- sincronizador del agente
// Acadeu (notificaciones de colegio). El workflow n8n "Acadeu - Prueba
// de login y evaluaciones" hace el login por Puppeteer/Browserless y
// scrapea el widget de evaluaciones próximas de los 3 hijos; este
// endpoint es el que decide qué hay de NUEVO y lo deja registrado.
//
//   POST /.netlify/functions/acadeu-sincronizar
//   Header: X-Api-Key: <api key del tenant -- reutiliza la de La
//                        Charcutería, mismo cliente_id que Home Keep>
//   Body:   { "evaluacionesHtml": "<p>...</p><p>...</p>..." }
//
// Por qué acá y no en un Code node de n8n: mismo criterio que el resto
// de los endpoints /agente-* (Fase 50) -- n8n nunca tiene la
// SUPABASE_SERVICE_ROLE_KEY, solo la X-Api-Key del tenant. Toda la
// lectura/escritura en Supabase (comparar contra el último estado,
// upsert, insertar en la Agenda familiar) vive acá.
//
// Todavía NO envía WhatsApp -- eso queda pendiente de que Carlos defina
// el número/instancia dedicado para este canal (lo pidió aparte, "más
// limpio" que reusar el de La Charcutería). Esta función devuelve
// `novedades` con el texto ya armado, listo para que un paso siguiente
// de n8n (o una futura versión de este mismo endpoint) lo mande.

// Fase 75k: mismas categorías que home_keep_tareas (types/index.ts,
// CategoriaTareaHogar) -- 'escolar' es justo la pensada para esto.
const CATEGORIA_ESCOLAR = 'escolar'
const ORIGEN_ACADEU = 'acadeu'

function limpiarHtml(bloque) {
  return bloque
    .replace(/<a[^>]*>/g, '')
    .replace(/<\/a>/g, '')
    .replace(/<strong>/g, '')
    .replace(/<\/strong>/g, '')
    .replace(/<p[^>]*>/g, '')
    .replace(/<\/p>/g, '')
    .replace(/[\t\r]+/g, ' ')
    .replace(/\n\s*\n/g, '\n')
    .replace(/\s{2,}/g, ' ')
    .trim()
}

// El widget de Acadeu viene como una lista de bloques <p>, uno por
// hijo, con el nombre en "APELLIDO, Nombre" dentro del primer <a
// href="/usuario/ver/...">. Se devuelve [{ nombreAcadeu, apellido,
// nombrePila, texto }] -- el matching contra usuarios_cliente se hace
// aparte (acá no se conoce todavía el cliente_id).
function parsearBloquesPorHijo(html) {
  const bloques = html.match(/<p[^>]*>[\s\S]*?<\/p>/g) || []
  const resultado = []
  for (const bloque of bloques) {
    const matchNombre = bloque.match(/<a[^>]*href="\/usuario\/ver\/\d+"[^>]*>([^<]+)<\/a>/)
    if (!matchNombre) continue
    const nombreAcadeu = matchNombre[1].trim() // "COPELOTTI, Milagros"
    const [apellido, nombrePila] = nombreAcadeu.split(',').map((s) => s.trim())
    resultado.push({
      nombreAcadeu,
      apellido: apellido || '',
      nombrePila: nombrePila || '',
      texto: limpiarHtml(bloque),
    })
  }
  return resultado
}

// "Milagros Copelotti" (usuarios_cliente.nombre) vs "COPELOTTI,
// Milagros" (Acadeu) -- alcanza con chequear que el nombre de pila
// aparezca como palabra dentro del nombre guardado en la app. No hace
// falta nada más sofisticado: los 3 hijos tienen primeros nombres
// distintos entre sí.
function encontrarIntegrante(nombrePila, integrantes) {
  const pila = nombrePila.toLowerCase()
  if (!pila) return null
  return integrantes.find((i) => (i.nombre || '').toLowerCase().split(/\s+/).includes(pila)) || null
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

  const evaluacionesHtml = String(body.evaluacionesHtml || '')
  if (!evaluacionesHtml.trim()) {
    return new Response(JSON.stringify({ ok: false, error: 'Falta evaluacionesHtml' }), { status: 400 })
  }

  const bloques = parsearBloquesPorHijo(evaluacionesHtml)
  if (bloques.length === 0) {
    return new Response(
      JSON.stringify({ ok: true, novedades: [], huboNovedades: false, aviso: 'No se encontraron bloques por hijo en el HTML.' }),
      { status: 200 },
    )
  }

  const { data: integrantes, error: errIntegrantes } = await supabaseAdmin
    .from('usuarios_cliente')
    .select('id, nombre')
    .eq('cliente_id', agente.clienteId)

  if (errIntegrantes) {
    console.error('acadeu-sincronizar: error trayendo integrantes', errIntegrantes)
    return new Response(JSON.stringify({ ok: false, error: 'No se pudo resolver la familia' }), { status: 500 })
  }

  const { data: estadoPrevio, error: errEstado } = await supabaseAdmin
    .from('acadeu_estado_evaluaciones')
    .select('usuario_cliente_id, ultimo_texto')
    .eq('cliente_id', agente.clienteId)

  if (errEstado) {
    console.error('acadeu-sincronizar: error trayendo estado previo', errEstado)
    return new Response(JSON.stringify({ ok: false, error: 'No se pudo leer el último estado' }), { status: 500 })
  }
  const ultimoTextoPorIntegrante = new Map((estadoPrevio || []).map((e) => [e.usuario_cliente_id, e.ultimo_texto]))

  const novedades = []
  const sinIdentificar = []

  for (const bloque of bloques) {
    const integrante = encontrarIntegrante(bloque.nombrePila, integrantes || [])
    if (!integrante) {
      sinIdentificar.push(bloque.nombreAcadeu)
      continue
    }

    const textoAnterior = ultimoTextoPorIntegrante.get(integrante.id)
    if (textoAnterior === bloque.texto) continue // sin cambios, no es novedad

    const { error: errUpsertEstado } = await supabaseAdmin
      .from('acadeu_estado_evaluaciones')
      .upsert(
        { cliente_id: agente.clienteId, usuario_cliente_id: integrante.id, ultimo_texto: bloque.texto, updated_at: new Date().toISOString() },
        { onConflict: 'usuario_cliente_id' },
      )
    if (errUpsertEstado) {
      console.error('acadeu-sincronizar: error guardando estado de', integrante.nombre, errUpsertEstado)
      continue
    }

    const { error: errTarea } = await supabaseAdmin.from('home_keep_tareas').insert({
      cliente_id: agente.clienteId,
      usuario_cliente_id: integrante.id,
      titulo: `Acadeu -- ${integrante.nombre}: ${bloque.texto}`,
      descripcion: null,
      fecha: new Date().toISOString().slice(0, 10),
      categoria: CATEGORIA_ESCOLAR,
      prioridad: 'media',
      origen: ORIGEN_ACADEU,
    })
    if (errTarea) {
      console.error('acadeu-sincronizar: error insertando en Agenda familiar para', integrante.nombre, errTarea)
    }

    novedades.push({
      usuarioClienteId: integrante.id,
      nombre: integrante.nombre,
      mensaje: `${integrante.nombre}: ${bloque.texto}`,
    })
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
