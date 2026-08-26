import { crearSupabaseAdmin, autenticarAgente } from './_lib/agenteAuth.js'

// Fase 50, Capa 3 -- herramienta "identificar quién está escribiendo".
//
//   POST /.netlify/functions/agente-clientes-lookup
//   Header: X-Api-Key: <api key del tenant>
//   Body:   { "telefono": "5491122334455" }
//
// Busca un clientes_venta existente por teléfono, DENTRO del tenant
// autenticado. Si no existe, devuelve encontrado:false -- no lo crea
// acá (eso es responsabilidad de agente-ordenes-crear.js, recién
// cuando efectivamente hay un pedido para cargarle -- no tiene sentido
// crear una ficha de cliente por un simple "hola").

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
  if (!telefono) {
    return new Response(JSON.stringify({ ok: false, error: 'Falta telefono' }), { status: 400 })
  }

  const { data, error } = await supabaseAdmin
    .from('clientes_venta')
    .select('id, nombre, email, direccion, saldo_cuenta_corriente, limite_credito')
    .eq('cliente_id', agente.clienteId)
    .eq('telefono', telefono)
    .eq('activo', true)
    .maybeSingle()

  if (error) {
    console.error('agente-clientes-lookup: error consultando clientes_venta', error)
    return new Response(JSON.stringify({ ok: false, error: 'No se pudo buscar el cliente' }), { status: 500 })
  }

  if (!data) {
    return new Response(JSON.stringify({ ok: true, encontrado: false }), { status: 200 })
  }

  return new Response(
    JSON.stringify({
      ok: true,
      encontrado: true,
      cliente: {
        id: data.id,
        nombre: data.nombre,
        email: data.email || undefined,
        direccion: data.direccion || undefined,
        saldoCuentaCorriente: data.saldo_cuenta_corriente,
        limiteCredito: data.limite_credito,
      },
    }),
    { status: 200 },
  )
}
