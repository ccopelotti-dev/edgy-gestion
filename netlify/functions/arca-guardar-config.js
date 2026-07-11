import { createClient } from '@supabase/supabase-js'

// Guarda/actualiza la configuración de Facturación Electrónica ARCA de
// un cliente (punto de venta, condición de IVA, modo, y opcionalmente
// certificado+clave privada nuevos). El CUIT no se pide acá -- ya
// existe en edgy_gestion.clientes.cuit (dato protegido que carga Edgy
// en el onboarding). Solo lo puede llamar un usuario con rol admin
// (es_admin=true) DEL PROPIO cliente -- nunca se expone esta tabla
// directo al frontend porque guarda la clave privada del certificado
// digital.
//
// Mismo patrón de auth que invitar-admin.js / agregar-dominio.js:
// SUPABASE_SERVICE_ROLE_KEY, VITE_SUPABASE_URL.

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
  if (!clienteId) {
    return new Response(JSON.stringify({ ok: false, error: 'Falta clienteId' }), { status: 400 })
  }

  const supabaseAdmin = createClient(
    process.env.VITE_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    { db: { schema: 'edgy_gestion' } },
  )

  // 1) Validar sesión
  const { data: userData, error: userError } = await supabaseAdmin.auth.getUser(token)
  if (userError || !userData?.user) {
    return new Response(JSON.stringify({ ok: false, error: 'Sesión inválida' }), { status: 401 })
  }

  // 2) Confirmar que es admin DE ESE cliente (no de cualquier otro)
  const { data: usuarioCliente, error: errUsuario } = await supabaseAdmin
    .from('usuarios_cliente')
    .select('cliente_id, rol_id, roles(es_admin)')
    .eq('user_id', userData.user.id)
    .eq('cliente_id', clienteId)
    .maybeSingle()

  if (errUsuario) {
    console.error('arca-guardar-config: error consultando usuarios_cliente', errUsuario)
  }

  const esAdmin = usuarioCliente?.roles?.es_admin === true
  if (!usuarioCliente || !esAdmin) {
    return new Response(
      JSON.stringify({ ok: false, error: 'No autorizado (se requiere un rol admin de este negocio)' }),
      { status: 403 },
    )
  }

  // 3) El cliente tiene que tener CUIT cargado (lo carga Edgy en
  // Configuración > Empresa > "Datos protegidos") antes de poder
  // habilitar ARCA -- si no, ARCA rechaza todo de entrada.
  const { data: clienteRow, error: clienteError } = await supabaseAdmin
    .from('clientes')
    .select('cuit')
    .eq('id', clienteId)
    .maybeSingle()

  if (clienteError || !clienteRow) {
    return new Response(JSON.stringify({ ok: false, error: 'No se encontró el cliente' }), { status: 404 })
  }
  if (!clienteRow.cuit) {
    return new Response(
      JSON.stringify({ ok: false, error: 'Este negocio todavía no tiene CUIT cargado (lo carga Edgy en Configuración > Empresa)' }),
      { status: 409 },
    )
  }

  // 4) Validar campos obligatorios
  const puntoVenta = Number(body.puntoVenta)
  const condicionIva = String(body.condicionIva || '')
  const modo = String(body.modo || 'homologacion')

  if (!puntoVenta || puntoVenta <= 0) {
    return new Response(JSON.stringify({ ok: false, error: 'Punto de venta inválido' }), { status: 400 })
  }
  if (!['responsable_inscripto', 'monotributista', 'exento'].includes(condicionIva)) {
    return new Response(JSON.stringify({ ok: false, error: 'Condición de IVA inválida' }), { status: 400 })
  }
  if (!['homologacion', 'produccion'].includes(modo)) {
    return new Response(JSON.stringify({ ok: false, error: 'Modo inválido' }), { status: 400 })
  }

  // 5) Upsert -- certificado/clave privada solo se pisan si vienen en
  // el body (así se puede editar punto de venta/modo sin tener que
  // volver a pegar la clave privada cada vez).
  const fila = {
    cliente_id: clienteId,
    punto_venta: puntoVenta,
    condicion_iva: condicionIva,
    modo,
    habilitado: Boolean(body.habilitado),
    updated_at: new Date().toISOString(),
  }
  if (typeof body.certificadoPem === 'string' && body.certificadoPem.trim()) {
    fila.certificado_pem = body.certificadoPem.trim()
    // Cambió el certificado -- el TA cacheado (si había) quedó inválido.
    fila.ta_token = null
    fila.ta_sign = null
    fila.ta_expiracion = null
  }
  if (typeof body.clavePrivadaPem === 'string' && body.clavePrivadaPem.trim()) {
    fila.clave_privada_pem = body.clavePrivadaPem.trim()
    fila.ta_token = null
    fila.ta_sign = null
    fila.ta_expiracion = null
  }

  const { error: upsertError } = await supabaseAdmin
    .from('clientes_arca_config')
    .upsert(fila, { onConflict: 'cliente_id' })

  if (upsertError) {
    console.error('arca-guardar-config: error guardando config', upsertError)
    return new Response(JSON.stringify({ ok: false, error: 'No se pudo guardar la configuración' }), { status: 500 })
  }

  return new Response(JSON.stringify({ ok: true }), { status: 200 })
}
