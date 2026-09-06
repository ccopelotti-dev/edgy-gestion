import { createClient } from '@supabase/supabase-js'

// Fase 71b (05/09, a pedido de Carlos -- "Perfil Familiar"): mismo
// mecanismo que invitar-admin.js (Supabase crea la cuenta), pero pensado
// para que lo dispare el propio Admin/Dueño del cliente desde adentro
// de su cuenta, no el staff de Edgy desde /panel. Por eso el chequeo de
// "quién puede llamar a esto" es distinto: acá se exige que el que
// llama sea admin (roles.es_admin) del MISMO cliente al que pertenece
// la persona que se está invitando -- nunca de otro cliente, y nunca un
// usuario sin rol admin (ej. el propio "Hijo" no podría invitar a otro
// integrante).
//
// Fase 71c (05/09, a pedido de Carlos): un hijo chico no puede
// gestionarse la invitación solo (abrir el mail, definir su propia
// contraseña) -- para eso este endpoint acepta un `password` opcional
// en el body. Si viene, el admin elige la contraseña él mismo y la
// cuenta se crea ya lista para usar (createUser + email_confirm), sin
// mandar ningún mail; el admin se la da al chico cuando le parezca. Si
// no viene `password`, sigue el camino de siempre (inviteUserByEmail),
// pensado para alguien que ya maneja su propio correo. Mismo auth_mode
// 'full' en los dos casos -- entran por el login de siempre
// (/ingresar), no hace falta ninguna pantalla nueva.
//
// Se mantiene como archivo aparte (en vez de generalizar invitar-admin.js
// con un if/else de autorización) para no tocar un endpoint que ya
// funciona en producción para el flujo de staff -- menos superficie de
// riesgo de romper algo que ya andaba.
//
// Mismas variables de entorno que invitar-admin.js:
//   SUPABASE_SERVICE_ROLE_KEY, VITE_SUPABASE_URL

export default async (req) => {
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ ok: false, error: 'Método no permitido' }), { status: 405 })
  }

  const auth = req.headers.get('authorization') || ''
  const token = auth.replace(/^Bearer\s+/i, '')
  if (!token) {
    console.error('invitar-familiar: falta el header Authorization')
    return new Response(JSON.stringify({ ok: false, error: 'Falta sesión' }), { status: 401 })
  }

  let usuarioClienteId
  let password
  try {
    const body = await req.json()
    usuarioClienteId = String(body.usuarioClienteId || '')
    password = body.password ? String(body.password) : null
  } catch (e) {
    console.error('invitar-familiar: body inválido', e)
    return new Response(JSON.stringify({ ok: false, error: 'Body inválido' }), { status: 400 })
  }

  if (!usuarioClienteId) {
    console.error('invitar-familiar: falta usuarioClienteId en el body')
    return new Response(JSON.stringify({ ok: false, error: 'Falta usuarioClienteId' }), { status: 400 })
  }

  if (password && password.length < 6) {
    return new Response(
      JSON.stringify({ ok: false, error: 'La contraseña tiene que tener al menos 6 caracteres' }),
      { status: 400 },
    )
  }

  const supabaseAdmin = createClient(
    process.env.VITE_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    { db: { schema: 'edgy_gestion' } },
  )

  // 1) Validar la sesión de quien llama.
  const { data: userData, error: userError } = await supabaseAdmin.auth.getUser(token)
  if (userError || !userData?.user) {
    console.error('invitar-familiar: sesión inválida', userError)
    return new Response(JSON.stringify({ ok: false, error: 'Sesión inválida' }), { status: 401 })
  }

  // 2) A quién se invita, y de qué cliente es -- se necesita ANTES de
  // poder validar que quien llama es admin de ese mismo cliente.
  const { data: destino, error: destinoError } = await supabaseAdmin
    .from('usuarios_cliente')
    .select('id, nombre, email, auth_mode, cliente_id')
    .eq('id', usuarioClienteId)
    .maybeSingle()

  if (destinoError) {
    console.error('invitar-familiar: error buscando usuarioClienteId', destinoError)
    return new Response(JSON.stringify({ ok: false, error: 'No pudimos buscar a esa persona' }), { status: 500 })
  }
  if (!destino) {
    console.error('invitar-familiar: usuarioClienteId no existe:', usuarioClienteId)
    return new Response(JSON.stringify({ ok: false, error: 'No encontramos a esa persona' }), { status: 404 })
  }

  // 3) Quien llama tiene que ser admin (roles.es_admin) del MISMO
  // cliente que el destino -- no alcanza con estar logueado, ni con ser
  // admin de otra cuenta.
  const { data: llamante, error: llamanteError } = await supabaseAdmin
    .from('usuarios_cliente')
    .select('cliente_id, roles(es_admin)')
    .eq('user_id', userData.user.id)
    .maybeSingle()

  if (llamanteError) {
    console.error('invitar-familiar: error buscando al llamante', llamanteError)
  }

  const esAdminDelMismoCliente =
    !!llamante &&
    llamante.cliente_id === destino.cliente_id &&
    llamante.roles?.es_admin === true

  if (!esAdminDelMismoCliente) {
    console.error('invitar-familiar: llamante no autorizado', userData.user.id, 'destino cliente', destino.cliente_id)
    return new Response(JSON.stringify({ ok: false, error: 'No autorizado' }), { status: 403 })
  }

  if (destino.auth_mode !== 'full' || !destino.email) {
    console.error('invitar-familiar: destino sin email/auth_mode full', destino)
    return new Response(
      JSON.stringify({ ok: false, error: 'Esa persona no está configurada con email' }),
      { status: 409 },
    )
  }

  let userIdCreado = null

  if (password) {
    // 4a) El admin elige la contraseña -- pensado para un hijo chico
    // que todavía no maneja su propio mail. email_confirm:true porque
    // ya fue el admin (no el chico) quien confirmó que ese email/cuenta
    // corresponde a esa persona; no hace falta el paso de confirmación
    // por mail de Supabase.
    const { data: creado, error: createError } = await supabaseAdmin.auth.admin.createUser({
      email: destino.email,
      password,
      email_confirm: true,
      user_metadata: { nombre: destino.nombre, cliente_id: destino.cliente_id },
    })

    if (createError) {
      const yaExistia =
        createError.code === 'email_exists' || /already registered/i.test(createError.message ?? '')

      if (yaExistia) {
        console.error('invitar-familiar: el email ya tenía cuenta, no se crea de nuevo:', destino.email)
        return new Response(JSON.stringify({ ok: true, yaExistia: true }), { status: 200 })
      }

      console.error('invitar-familiar: createUser falló', createError)
      return new Response(
        JSON.stringify({ ok: false, error: 'No pudimos crear el acceso' }),
        { status: 502 },
      )
    }

    userIdCreado = creado?.user?.id ?? null
  } else {
    // 4b) Camino de siempre -- Supabase manda el mail y la persona
    // define su propia contraseña. Necesita el link de vuelta al
    // subdominio propio del cliente (mismo criterio que invitar-admin.js).
    const { data: clienteRow } = await supabaseAdmin
      .from('clientes')
      .select('slug')
      .eq('id', destino.cliente_id)
      .maybeSingle()

    const redirectTo = clienteRow?.slug
      ? `https://${clienteRow.slug}.edgysistemas.tech/completar-cuenta`
      : 'https://panel.edgysistemas.tech/completar-cuenta'

    const { data: invitado, error: inviteError } = await supabaseAdmin.auth.admin.inviteUserByEmail(
      destino.email,
      {
        data: { nombre: destino.nombre, cliente_id: destino.cliente_id },
        redirectTo,
      },
    )

    if (inviteError) {
      const yaExistia =
        inviteError.code === 'email_exists' || /already registered/i.test(inviteError.message ?? '')

      if (yaExistia) {
        console.error('invitar-familiar: el email ya tenía cuenta, no se reenvía invitación:', destino.email)
        return new Response(JSON.stringify({ ok: true, yaExistia: true }), { status: 200 })
      }

      console.error('invitar-familiar: inviteUserByEmail falló', inviteError)
      return new Response(
        JSON.stringify({ ok: false, error: 'No pudimos enviar la invitación' }),
        { status: 502 },
      )
    }

    userIdCreado = invitado?.user?.id ?? null
  }

  // 5) Guardar el user_id real de Auth -- así el listado deja de ofrecer
  // "Enviar invitación"/"Definir contraseña" y pasa a mostrar "Activo".
  if (userIdCreado) {
    const { error: backfillError } = await supabaseAdmin
      .from('usuarios_cliente')
      .update({ user_id: userIdCreado })
      .eq('id', destino.id)
    if (backfillError) {
      console.error('invitar-familiar: no se pudo guardar el user_id', backfillError)
    }
  }

  return new Response(
    JSON.stringify({ ok: true, yaExistia: false, userId: userIdCreado }),
    { status: 200 },
  )
}
