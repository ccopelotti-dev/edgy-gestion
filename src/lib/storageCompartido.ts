// Storage de sesión para Supabase Auth basado en cookies, no en
// localStorage. localStorage está aislado por origen exacto — una sesión
// creada en edgysistemas.tech no la vería panel.edgysistemas.tech, aunque
// sean el mismo dominio "de marca". Una cookie con Domain=.edgysistemas.tech
// sí viaja a todos los subdominios, que es justo lo que necesitamos para
// que el login de la landing valga también en el panel interno.
//
// Este mismo archivo tiene que existir en los DOS proyectos (edgy-gestion
// y la landing de edgysistemas.tech) para que ambos lean/escriban la
// sesión en el mismo lugar.

const DOMINIO_COOKIE =
  typeof window !== 'undefined' && window.location.hostname.endsWith('edgysistemas.tech')
    ? '.edgysistemas.tech'
    : undefined // en localhost (desarrollo) no se puede fijar Domain — cae a cookie normal

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
// removeItem, puede ser sync o devolver una Promise.
export const storageCompartidoEntreSubdominios = {
  getItem: (key: string) => leerCookie(key),
  setItem: (key: string, value: string) => escribirCookie(key, value),
  removeItem: (key: string) => borrarCookie(key),
}
