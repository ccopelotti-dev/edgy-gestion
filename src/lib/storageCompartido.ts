// Storage de sesión para Supabase Auth. Usa una cookie con
// Domain=.edgysistemas.tech (en vez del localStorage por defecto, que está
// aislado por origen exacto) SOLO en los hosts que realmente necesitan SSO
// entre sí: la landing y el panel interno. Cualquier otro host -- en
// particular TODOS los subdominios de clientes (puntotech.edgysistemas.tech,
// y cualquier cliente futuro) -- usa localStorage estándar, aislado por
// origen exacto como corresponde.
//
// Bug real (15/08/2026, Carlos, visita a Punto Tex): antes la cookie
// compartida viajaba a *todos* los subdominios sin distinción. Si en esa
// máquina/perfil de Chrome había una sesión de staff válida (la de Carlos
// en panel.edgysistemas.tech, heredada a un perfil "nuevo" vía Chrome
// Sync de cookies), el subdominio del cliente la aceptaba igual y mandaba
// directo al panel interno en vez de pedir el login propio del cliente --
// el sitio nunca valida host-vs-sesión (ver App.tsx: el ruteo es 100%
// agnóstico de subdominio, decide solo según el usuario logueado). Acotar
// la cookie compartida a esta lista corta la fuga de raíz: un subdominio
// de cliente jamás va a heredar una sesión ajena, sea cual sea el perfil
// o el estado de sync de Chrome.
//
// Este mismo archivo tiene que existir en los DOS proyectos (edgy-gestion
// y la landing de edgysistemas.tech) para que ambos lean/escriban la
// sesión en el mismo lugar -- y la lista HOSTS_CON_SSO tiene que quedar
// igual en los dos.
const HOSTS_CON_SSO = new Set(['edgysistemas.tech', 'www.edgysistemas.tech', 'panel.edgysistemas.tech'])

const usaCookieCompartida =
  typeof window !== 'undefined' && HOSTS_CON_SSO.has(window.location.hostname)

const DOMINIO_COOKIE = usaCookieCompartida ? '.edgysistemas.tech' : undefined

function leerCookie(nombre: string): string | null {
  const match = document.cookie.match(new RegExp(`(?:^|; )${nombre}=([^;]*)`))
  return match ? decodeURIComponent(match[1]) : null
}

function escribirCookie(nombre: string, valor: string) {
  const partes = [
    `${nombre}=${encodeURIComponent(valor)}`,
    'path=/',
    'max-age=31536000', // 1 año — Supabase maneja el refresh del token solo
    'SameSite=Lax',
  ]
  if (DOMINIO_COOKIE) partes.push(`Domain=${DOMINIO_COOKIE}`)
  if (window.location.protocol === 'https:') partes.push('Secure')
  document.cookie = partes.join('; ')
}

function borrarCookie(nombre: string) {
  const partes = [`${nombre}=`, 'path=/', 'max-age=0']
  if (DOMINIO_COOKIE) partes.push(`Domain=${DOMINIO_COOKIE}`)
  document.cookie = partes.join('; ')
}

// Interfaz que espera supabase-js en `auth.storage` — getItem/setItem/
// removeItem, puede ser sync o devolver una Promise. En hosts sin SSO
// (todo subdominio de cliente + localhost de desarrollo) cae directo a
// localStorage estándar del navegador -- ni siquiera pasa por cookies.
export const storageCompartidoEntreSubdominios = {
  getItem: (key: string) => {
    if (typeof window === 'undefined') return null
    return usaCookieCompartida ? leerCookie(key) : window.localStorage.getItem(key)
  },
  setItem: (key: string, value: string) => {
    if (typeof window === 'undefined') return
    if (usaCookieCompartida) escribirCookie(key, value)
    else window.localStorage.setItem(key, value)
  },
  removeItem: (key: string) => {
    if (typeof window === 'undefined') return
    if (usaCookieCompartida) borrarCookie(key)
    else window.localStorage.removeItem(key)
  },
}
