import { createClient } from '@supabase/supabase-js'

// Fase 31b: manifest.json dinámico -- Android/Chrome lee el ícono y el
// nombre de acá al instalar el PWA, así que cada cliente ve SU logo y SU
// nombre en el celular, no uno genérico de Edgy. iOS/Safari no lee esto
// para "Agregar a pantalla de inicio" (usa una etiqueta fija del HTML),
// así que ahí queda el ícono genérico -- decisión de alcance tomada con
// Carlos: no vale la pena todavía sumar una Edge Function que reescriba
// el HTML por subdominio solo para eso.
//
// Se sirve como /manifest.json vía redirect en netlify.toml (tiene que
// ir ANTES de la regla catch-all /* -> /index.html, si no nunca llega
// acá). Público, sin auth -- es exactamente lo mismo que un manifest.json
// estático, solo que armado al vuelo.

const SUPABASE_URL = process.env.VITE_SUPABASE_URL
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY

function tipoDeImagen(url) {
  const ext = (url.split('.').pop() || '').toLowerCase().split('?')[0]
  if (ext === 'jpg' || ext === 'jpeg') return 'image/jpeg'
  if (ext === 'webp') return 'image/webp'
  if (ext === 'svg') return 'image/svg+xml'
  return 'image/png'
}

function slugDeHost(host) {
  const h = (host || '').toLowerCase()
  const sufijo = '.edgysistemas.tech'
  if (h.endsWith(sufijo)) {
    const slug = h.slice(0, -sufijo.length)
    // "panel" es el subdominio interno de staff, no un cliente.
    if (slug && slug !== 'panel' && slug !== 'www') return slug
  }
  return null
}

export default async (req) => {
  const host = req.headers.get('host') || ''
  const origin = `https://${host}`
  const slug = slugDeHost(host)

  let cliente = null
  if (slug && SUPABASE_URL && SUPABASE_KEY) {
    const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_KEY, { db: { schema: 'edgy_gestion' } })
    const { data } = await supabaseAdmin
      .from('clientes')
      .select('nombre, logo_url, color_marca')
      .eq('slug', slug)
      .maybeSingle()
    cliente = data
  }

  const nombre = cliente?.nombre || 'Edgy Gestión'
  const colorMarca = cliente?.color_marca || '#0C1A2E'

  const icons = cliente?.logo_url
    ? [
        { src: cliente.logo_url, sizes: '192x192', type: tipoDeImagen(cliente.logo_url), purpose: 'any' },
        { src: cliente.logo_url, sizes: '512x512', type: tipoDeImagen(cliente.logo_url), purpose: 'any' },
      ]
    : [
        { src: `${origin}/icon-192.png`, sizes: '192x192', type: 'image/png', purpose: 'any' },
        { src: `${origin}/icon-512.png`, sizes: '512x512', type: 'image/png', purpose: 'any' },
      ]

  const manifest = {
    name: nombre,
    short_name: nombre.length > 14 ? nombre.slice(0, 14) : nombre,
    description: 'Panel de gestión de negocio -- Edgy Sistemas',
    start_url: '/',
    scope: '/',
    display: 'standalone',
    orientation: 'portrait-primary',
    background_color: '#FFFFFF',
    theme_color: colorMarca,
    icons,
  }

  return new Response(JSON.stringify(manifest), {
    status: 200,
    headers: {
      'Content-Type': 'application/manifest+json',
      'Cache-Control': 'public, max-age=300',
    },
  })
}
