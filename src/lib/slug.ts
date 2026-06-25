/**
 * El slug es el subdominio público del cliente
 * (https://{slug}.edgysistemas.tech) — identifica al negocio frente al
 * cliente final. No se usa para resolver qué cliente mostrar en el
 * dashboard: eso sigue siendo por usuario logueado (useClienteActual).
 * El subdominio funciona porque *.edgysistemas.tech es un wildcard
 * apuntando al mismo deploy de Netlify — no hace falta crear nada por
 * cliente más allá de guardar este slug.
 */

const SLUG_VALIDO = /^[a-z0-9]+(-[a-z0-9]+)*$/

/** "Café de la Esquina" -> "cafe-de-la-esquina" */
export function generarSlug(nombre: string): string {
  return nombre
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // sacar acentos
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

export function slugValido(slug: string): boolean {
  return SLUG_VALIDO.test(slug)
}

export function urlCliente(slug: string): string {
  return `https://${slug}.edgysistemas.tech`
}
