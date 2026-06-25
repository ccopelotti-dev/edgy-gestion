import { createClient } from '@supabase/supabase-js'

// Invita por mail al Admin (rol Dueño) de un cliente, para que defina su
// propia contraseña — nunca se la asigna el wizard. No confía en datos
// sueltos del body: el email/nombre se traen de lo que ya quedó guardado
// en usuarios_cliente desde el Paso 2, así no se puede usar este
// endpoint para invitar a cualquier email arbitrario.
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
  try {
    const body = await req.json()
    clienteId = String(body.clienteId || '')
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

  // 2) Traer el Admin real (rol Dueño) de este cliente.
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

  const { data: admin, error: adminError } = await supabaseAdmin
    .from('usuarios_cliente')
    .select('nombre, email, auth_mode')
    .eq('cliente_id', clienteId)
    .eq('rol_id', rolDueno.id)
    .maybeSingle()

  if (adminError) {
    console.error('invitar-admin: error buscando al Admin', adminError)
  }

  if (!admin || admin.auth_mode !== 'full' || !admin.email) {
    console.error('invitar-admin: el Admin de este cliente no tiene email configurado', admin)
    return new Response(
      JSON.stringify({ ok: false, error: 'El Admin de este cliente no está configurado con email' }),
      { status: 409 },
    )
  }

  // 3) Invitar — Supabase crea la cuenta y manda el mail con el link
  // para que el Admin defina su propia contraseña.
  const { data: invitado, error: inviteError } = await supabaseAdmin.auth.admin.inviteUserByEmail(
    admin.email,
    {
      data: { nombre: admin.nombre, cliente_id: clienteId },
      redirectTo: 'https://panel.edgysistemas.tech/completar-cuenta',
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

  return new Response(
    JSON.stringify({ ok: true, yaExistia: false, userId: invitado?.user?.id }),
    { status: 200 },
  )
}
