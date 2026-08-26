import { crearSupabaseAdmin, autenticarAgente } from './_lib/agenteAuth.js'

// Fase 50, Capa 3 -- herramienta "buscar productos" para el agente.
//
//   POST /.netlify/functions/agente-productos-buscar
//   Header: X-Api-Key: <api key del tenant>
//   Body:   { "q": "texto a buscar" }
//
// Devuelve nombre y precio de lista (precio_venta, sin descuentos por
// categoría de cliente todavía -- eso se resuelve recién al crear el
// pedido, ver agente-ordenes-crear.js, porque ahí sí se sabe a qué
// cliente_venta corresponde). No devuelve stock puntual por punto de
// venta -- Edgy Gestión maneja stock por local (Fase 27e) y agregarlo acá
// sumaría una complejidad que no hace falta todavía; por ahora solo se
// filtra por `disponible` (el mismo flag que ya usa el Menú Público).

const LIMITE = 15

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

  const q = String(body.q || '').trim()
  if (!q) {
    return new Response(JSON.stringify({ ok: false, error: 'Falta q (texto de búsqueda)' }), { status: 400 })
  }

  const { data, error } = await supabaseAdmin
    .from('productos')
    .select('id, nombre, descripcion, precio_venta')
    .eq('cliente_id', agente.clienteId)
    .eq('disponible', true)
    .eq('estado', 'activo')
    .ilike('nombre', `%${q}%`)
    .order('nombre')
    .limit(LIMITE)

  if (error) {
    console.error('agente-productos-buscar: error consultando productos', error)
    return new Response(JSON.stringify({ ok: false, error: 'No se pudo buscar productos' }), { status: 500 })
  }

  return new Response(
    JSON.stringify({
      ok: true,
      productos: (data || []).map((p) => ({
        id: p.id,
        nombre: p.nombre,
        descripcion: p.descripcion || undefined,
        precio: p.precio_venta,
      })),
    }),
    { status: 200 },
  )
}
