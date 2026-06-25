import { createClient } from '@supabase/supabase-js'

// Agrega {slug}.edgysistemas.tech como domain_alias del sitio en Netlify.
// Esto existe porque Netlify no soporta wildcard real (*.edgysistemas.tech
// rechazado tanto en su UI como en su API con "has invalid characters") —
// confirmado a mano antes de escribir esto. Mientras tanto se registra
// cada subdominio de cliente individualmente (tope real: 100 por sitio).
// Cuando haya movimiento de varios clientes, esto se reemplaza por un
// wildcard real vía Cloudflare delante de Netlify.
//
// Requiere estas variables de entorno en Netlify (Site settings >
// Environment variables), NUNCA en el bundle del frontend:
//   SUPABASE_SERVICE_ROLE_KEY  (Supabase > Settings > API > service_role)
//   NETLIFY_API_TOKEN          (User settings > Applications > Personal access tokens)
//   NETLIFY_SITE_ID            (Project configuration > General > Project ID)
// VITE_SUPABASE_URL ya existe como variable del frontend y se reutiliza acá.

const SLUG_VALIDO = /^[a-z0-9]+(-[a-z0-9]+)*$/

export default async (req) => {
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ ok: false, error: 'Método no permitido' }), { status: 405 })
  }

  const auth = req.headers.get('authorization') || ''
  const token = auth.replace(/^Bearer\s+/i, '')
  if (!token) {
    console.error('agregar-dominio: falta el header Authorization')
    return new Response(JSON.stringify({ ok: false, error: 'Falta sesión' }), { status: 401 })
  }

  let slug
  try {
    const body = await req.json()
    slug = String(body.slug || '').toLowerCase()
  } catch (e) {
    console.error('agregar-dominio: body inválido', e)
    return new Response(JSON.stringify({ ok: false, error: 'Body inválido' }), { status: 400 })
  }

  if (!SLUG_VALIDO.test(slug)) {
    console.error('agregar-dominio: slug con formato inválido:', slug)
    return new Response(JSON.stringify({ ok: false, error: 'Slug con formato inválido' }), { status: 400 })
  }

  const supabaseAdmin = createClient(
    process.env.VITE_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    { db: { schema: 'edgy_gestion' } },
  )

  const { data: userData, error: userError } = await supabaseAdmin.auth.getUser(token)
  if (userError || !userData?.user) {
    console.error('agregar-dominio: sesión inválida', userError)
    return new Response(JSON.stringify({ ok: false, error: 'Sesión inválida' }), { status: 401 })
  }

  const { data: staffRow, error: staffError } = await supabaseAdmin
    .from('personal_edgy')
    .select('user_id')
    .eq('user_id', userData.user.id)
    .maybeSingle()

  if (staffError) {
    console.error('agregar-dominio: error consultando personal_edgy', staffError)
  }

  if (!staffRow) {
    console.error('agregar-dominio: usuario no es personal_edgy:', userData.user.id)
    return new Response(JSON.stringify({ ok: false, error: 'No autorizado' }), { status: 403 })
  }

  const NETLIFY_TOKEN = process.env.NETLIFY_API_TOKEN
  const SITE_ID = process.env.NETLIFY_SITE_ID
  const dominio = `${slug}.edgysistemas.tech`

  const getRes = await fetch(`https://api.netlify.com/api/v1/sites/${SITE_ID}`, {
    headers: { Authorization: `Bearer ${NETLIFY_TOKEN}` },
  })
  if (!getRes.ok) {
    const detalleGet = await getRes.text()
    console.error('agregar-dominio: GET a Netlify falló', getRes.status, detalleGet)
    return new Response(
      JSON.stringify({ ok: false, error: 'No pudimos leer la configuración de Netlify' }),
      { status: 502 },
    )
  }
  const site = await getRes.json()
  const aliasesActuales = site.domain_aliases || []

  if (aliasesActuales.includes(dominio)) {
    return new Response(JSON.stringify({ ok: true, url: `https://${dominio}`, yaExistia: true }), {
      status: 200,
    })
  }

  if (aliasesActuales.length >= 100) {
    console.error('agregar-dominio: tope de 100 alias alcanzado')
    return new Response(
      JSON.stringify({
        ok: false,
        error: 'Se llegó al máximo de 100 subdominios de Netlify — momento de migrar a Cloudflare',
      }),
      { status: 409 },
    )
  }

  const patchRes = await fetch(`https://api.netlify.com/api/v1/sites/${SITE_ID}`, {
    method: 'PATCH',
    headers: {
      Authorization: `Bearer ${NETLIFY_TOKEN}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ domain_aliases: [...aliasesActuales, dominio] }),
  })

  if (!patchRes.ok) {
    const detalle = await patchRes.text()
    console.error('agregar-dominio: PATCH a Netlify falló', patchRes.status, detalle)
    return new Response(
      JSON.stringify({ ok: false, error: 'Netlify rechazó el subdominio', detalle }),
      { status: 502 },
    )
  }

  return new Response(JSON.stringify({ ok: true, url: `https://${dominio}`, yaExistia: false }), {
    status: 200,
  })
}
