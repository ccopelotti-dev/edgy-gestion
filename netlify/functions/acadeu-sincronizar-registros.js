import { crearSupabaseAdmin, autenticarAgente } from './_lib/agenteAuth.js'

// Fase 75q (11/09, a pedido de Carlos): a diferencia de acadeu-sincronizar.js
// (que lee /notificaciones -- un feed de eventos, con cursor por ID, cada
// 30 minutos) esto lee 4 páginas de CONSULTA por alumno (Boletín,
// Convivencia, Materias Adeudadas, Asistencias histórico) que no traen un
// id incremental -- son un estado actual, no un feed. Por eso la lógica
// acá es "upsert del snapshot más reciente" en vez de "cursor de
// novedades": una fila por (vinculo, tipo_registro) con origen='acadeu'
// que se pisa cada corrida. Los registros cargados a MANO (sin
// origen='acadeu') no se tocan nunca desde acá -- conviven en la misma
// tabla, distinguidos por esa columna.
//
// Corre bastante menos seguido que las notificaciones -- 2 veces por día
// (13/14hs y 18hs aprox., decisión de Carlos) porque esto no cambia cada
// 30 minutos, no tiene sentido pegarle a Acadeu tan seguido para algo que
// se actualiza a lo sumo una vez por día.
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

function primerNombre(nombreCompleto) {
  return (nombreCompleto || '').trim().split(/\s+/)[0] || ''
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
      // en vez de acumular -- ver comentario de cabecera.
      const { data: existente, error: errBuscar } = await supabaseAdmin
        .from('institucion_registros')
        .select('id')
        .eq('vinculo_id', vinculoId)
        .eq('tipo_registro', tipoRegistro)
        .eq('origen', 'acadeu')
        .maybeSingle()

      if (errBuscar) {
        console.error('acadeu-sincronizar-registros: error buscando registro existente', tipoRegistro, errBuscar)
        continue
      }

      const payload = {
        vinculo_id: vinculoId,
        tipo_registro: tipoRegistro,
        periodo: new Date().getFullYear().toString(),
        contenido: datos,
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
