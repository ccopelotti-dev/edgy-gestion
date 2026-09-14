// Subida de la foto del hero al bucket "landing-imagenes" en Supabase
// Storage. Mismo patrón que src/modules/productos-stock/lib/imagenes.ts
// (bucket público: lectura anónima -- necesaria porque la lee un sitio
// externo estático -- + escritura para autenticados). Ver migración
// 0143_fase76_modulo_landing.sql para el SQL del bucket y sus políticas.

import { supabase } from '@/lib/supabase'

const BUCKET = 'landing-imagenes'

export const TIPOS_IMAGEN_ACEPTADOS = ['image/jpeg', 'image/png', 'image/webp']
const EXTENSIONES_ACEPTADAS = ['jpg', 'jpeg', 'jfif', 'png', 'webp']

export const ACCEPT_IMAGENES = [
  ...TIPOS_IMAGEN_ACEPTADOS,
  ...EXTENSIONES_ACEPTADAS.map((ext) => `.${ext}`),
].join(',')

/** Tamaño máximo por foto, en bytes (5 MB) -- mismo límite que
 * productos-stock. */
export const TAMANIO_MAXIMO_IMAGEN = 5 * 1024 * 1024

export interface ResultadoSubidaImagen {
  url: string
  path: string
}

function extensionDe(nombreArchivo: string): string {
  return nombreArchivo.split('.').pop()?.toLowerCase() || ''
}

function esImagenValida(file: File): boolean {
  if (TIPOS_IMAGEN_ACEPTADOS.includes(file.type)) return true
  const ext = extensionDe(file.name)
  return EXTENSIONES_ACEPTADAS.includes(ext)
}

function contentTypeDe(file: File): string {
  if (TIPOS_IMAGEN_ACEPTADOS.includes(file.type)) return file.type
  const ext = extensionDe(file.name)
  if (ext === 'png') return 'image/png'
  if (ext === 'webp') return 'image/webp'
  return 'image/jpeg' // jpg, jpeg, jfif
}

/**
 * Sube la foto del hero bajo una carpeta identificada por `clienteId`.
 * Devuelve la URL pública (la que después se guarda en
 * landing_config.hero_imagen_url y termina viéndose en la landing).
 */
export async function subirImagenLanding(
  file: File,
  clienteId: string,
): Promise<ResultadoSubidaImagen> {
  if (!esImagenValida(file)) {
    throw new Error('Formato no soportado. Usá JPG, PNG o WEBP.')
  }
  if (file.size > TAMANIO_MAXIMO_IMAGEN) {
    throw new Error('La foto supera el tamaño máximo de 5 MB.')
  }

  const ext = extensionDe(file.name) || 'jpg'
  const nombreArchivo = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`
  const ruta = `${clienteId}/${nombreArchivo}`

  const { data, error } = await supabase.storage.from(BUCKET).upload(ruta, file, {
    cacheControl: '3600',
    upsert: false,
    contentType: contentTypeDe(file),
  })

  if (error || !data) {
    throw new Error(error?.message || 'No se pudo subir la imagen.')
  }

  const { data: publicUrlData } = supabase.storage.from(BUCKET).getPublicUrl(data.path)
  return { url: publicUrlData.publicUrl, path: data.path }
}
