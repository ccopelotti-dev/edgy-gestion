import { createClient } from '@supabase/supabase-js'

// Invita por mail a un usuario_cliente con auth_mode='full', para que
// defina su propia contraseña — nunca se la asigna el wizard/staff. No
// confía en datos sueltos del body: el email/nombre se traen de lo que
// ya quedó guardado en usuarios_cliente, así no se puede usar este
// endpoint para invitar a cualquier email arbitrario.
//
// Fase 35: generalizado más allá del Admin (rol Dueño) — ahora acepta un
// `usuarioClienteId` opcional en el body para invitar a cualquier
// integrante del equipo (ej. el Encargado de una sucursal) con su propio
// login. Si no se manda, cae al comportamiento original (busca el Admin
// vía el rol Dueño), así los call-sites existentes del wizard no cambian.
//
// Mismas variables de entorno que agregar-dominio.js:
//   SUPABASE_SERVICE_ROLE_KEY, VITE_SUPABASE_URL (ya existen, se reusan)

export default async (req) => {
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ ok: false, error: 'Método no permitido' }), { status: 405 })
  }

  const auth = req.headers.get('authorization') || ''
  const token = auth.replace(/^Bearer\s+/i, '')
  if (!token) {
    console.error('invitar-admin: falta el header Authorization')
    return new Response(JSON.stringify({ ok: false, error: 'Falta sesión' }), { status: 401 })
  }

  let clienteId
  let usuarioClienteId
  try {
    const body = await req.json()
    clienteId = String(body.clienteId || '')
    usuarioClienteId = body.usuarioClienteId ? String(body.usuarioClienteId) : null
  } catch (e) {
    console.error('invitar-admin: body inválido', e)
    return new Response(JSON.stringify({ ok: false, error: 'Body inválido' }), { status: 400 })
  }

  if (!clienteId) {
    console.error('invitar-admin: falta clienteId en el body')
    return new Response(JSON.stringify({ ok: false, error: 'Falta clienteId' }), { status: 400 })
  }

  const supabaseAdmin = createClient(
    process.env.VITE_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    { db: { schema: 'edgy_gestion' } },
  )

  // 1) Confirmar que quien llama es personal de Edgy (mismo criterio que
  // agregar-dominio.js)
  const { data: userData, error: userError } = await supabaseAdmin.auth.getUser(token)
  if (userError || !userData?.user) {
    console.error('invitar-admin: sesión inválida', userError)
    return new Response(JSON.stringify({ ok: false, error: 'Sesión inválida' }), { status: 401 })
  }

  const { data: staffRow, error: staffError } = await supabaseAdmin
    .from('personal_edgy')
    .select('user_id')
    .eq('user_id', userData.user.id)
    .maybeSingle()

  if (staffError) {
    console.error('invitar-admin: error consultando personal_edgy', staffError)
  }

  if (!staffRow) {
    console.error('invitar-admin: usuario no es personal_edgy:', userData.user.id)
    return new Response(JSON.stringify({ ok: false, error: 'No autorizado' }), { status: 403 })
  }

  // 2) Traer el slug del cliente -- Fase 30 (fix #143): antes el mail
  // de invitación mandaba siempre a panel.edgysistemas.tech (dominio
  // interno de staff) en vez del subdominio propio del cliente. Si
  // todavía no tiene slug (no debería pasar a esta altura del wizard),
  // se cae al dominio interno como antes.
  const { data: clienteRow } = await supabaseAdmin
    .from('clientes')
    .select('slug')
    .eq('id', clienteId)
    .maybeSingle()

  const redirectTo = clienteRow?.slug
    ? `https://${clienteRow.slug}.edgysistemas.tech/completar-cuenta`
    : 'https://panel.edgysistemas.tech/completar-cuenta'

  // 3) Traer a quién se invita. Si vino usuarioClienteId, es esa fila
  // puntual (validando que sea de este mismo cliente, para que el
  // endpoint no sirva para invitar usuarios de otro cliente). Si no,
  // comportamiento original: el Admin vía el rol Dueño.
  let admin
  if (usuarioClienteId) {
    const { data: fila, error: filaError } = await supabaseAdmin
      .from('usuarios_cliente')
      .select('id, nombre, email, auth_mode, cliente_id')
      .eq('id', usuarioClienteId)
      .maybeSingle()

    if (filaError) {
      console.error('invitar-admin: error buscando usuarioClienteId', filaError)
    }

    if (!fila || fila.cliente_id !== clienteId) {
      console.error('invitar-admin: usuarioClienteId no existe o no es de este cliente:', usuarioClienteId, clienteId)
      return new Response(
        JSON.stringify({ ok: false, error: 'Ese usuario no pertenece a este cliente' }),
        { status: 404 },
      )
    }
    admin = fila
  } else {
    const { data: rolDueno, error: rolError } = await supabaseAdmin
      .from('roles')
      .select('id')
      .eq('cliente_id', clienteId)
      .eq('nombre', 'Dueño')
      .maybeSingle()

    if (rolError) {
      console.error('invitar-admin: error buscando el rol Dueño', rolError)
    }

    if (!rolDueno) {
      console.error('invitar-admin: este cliente no tiene rol Dueño todavía:', clienteId)
      return new Response(
        JSON.stringify({ ok: false, error: 'Este cliente todavía no tiene Admin cargado' }),
        { status: 404 },
      )
    }

    const { data: fila, error: adminError } = await supabaseAdmin
      .from('usuarios_cliente')
      .select('id, nombre, email, auth_mode')
      .eq('cliente_id', clienteId)
      .eq('rol_id', rolDueno.id)
      .maybeSingle()

    if (adminError) {
      console.error('invitar-admin: error buscando al Admin', adminError)
    }
    admin = fila
  }

  if (!admin || admin.auth_mode !== 'full' || !admin.email) {
    console.error('invitar-admin: el usuario a invitar no tiene email configurado', admin)
    return new Response(
      JSON.stringify({ ok: false, error: 'Ese usuario no está configurado con email' }),
      { status: 409 },
    )
  }

  // 4) Invitar — Supabase crea la cuenta y manda el mail con el link
  // para que el Admin defina su propia contraseña.
  const { data: invitado, error: inviteError } = await supabaseAdmin.auth.admin.inviteUserByEmail(
    admin.email,
    {
      data: { nombre: admin.nombre, cliente_id: clienteId },
      redirectTo,
    },
  )

  if (inviteError) {
    // Si ya tenía cuenta (ej. reintentando la activación de nuevo), no
    // es un error real — ya puede entrar con la contraseña que definió.
    const yaExistia =
      inviteError.code === 'email_exists' || /already registered/i.test(inviteError.message ?? '')

    if (yaExistia) {
      console.error('invitar-admin: el email ya tenía cuenta, no se reenvía invitación:', admin.email)
      return new Response(JSON.stringify({ ok: true, yaExistia: true }), { status: 200 })
    }

    console.error('invitar-admin: inviteUserByEmail falló', inviteError)
    return new Response(
      JSON.stringify({ ok: false, error: 'No pudimos enviar la invitación' }),
      { status: 502 },
    )
  }

  // 5) Dejar guardado el user_id real de Auth en la fila -- así el panel
  // interno sabe que esta persona ya tiene cuenta creada (deja de
  // ofrecer "Enviar invitación" y pasa a ofrecer "Reenviar acceso").
  if (invitado?.user?.id && admin.id) {
    const { error: backfillError } = await supabaseAdmin
      .from('usuarios_cliente')
      .update({ user_id: invitado.user.id })
      .eq('id', admin.id)
    if (backfillError) {
      console.error('invitar-admin: no se pudo guardar el user_id', backfillError)
    }
  }

  return new Response(
    JSON.stringify({ ok: true, yaExistia: false, userId: invitado?.user?.id }),
    { status: 200 },
  )
}
