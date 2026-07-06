// Subida y borrado de fotos de producto en Supabase Storage.
// Mismo patrón que el bucket "logos-clientes" usado en el wizard de alta de
// cliente (ver src/pages/onboarding/NuevoProyecto.tsx).
//
// Bucket: "productos-imagenes" (público, solo lectura anónima + escritura
// para usuarios autenticados). Ver README del módulo para el SQL de
// creación del bucket y sus políticas.

import { supabase } from '@/lib/supabase'

const BUCKET = 'productos-imagenes'

/** Tipos de archivo aceptados para fotos de producto. */
export const TIPOS_IMAGEN_ACEPTADOS = ['image/jpeg', 'image/png', 'image/webp']

/**
 * Extensiones aceptadas además de los MIME types de arriba. Existen porque
 * algunos archivos JPEG llegan con extensión ".jfif" (muy común en fotos
 * descargadas de WhatsApp Web o de Windows), y el navegador a veces no les
 * asigna ningún `file.type` (queda en '') o no lo mapea a "image/jpeg".
 * Si solo valida por MIME, la subida se rechaza en silencio.
 */
const EXTENSIONES_ACEPTADAS = ['jpg', 'jpeg', 'jfif', 'png', 'webp']

/**
 * Valor para el atributo `accept` del input de archivo. Incluye tanto los
 * MIME types como las extensiones: en Windows, el selector de archivos del
 * sistema operativo filtra la lista visible usando esta lista, y si solo
 * se pasan MIME types puede ocultar los .jfif por completo (no se pueden
 * ni seleccionar). Agregar las extensiones explícitamente soluciona eso.
 */
export const ACCEPT_IMAGENES = [
  ...TIPOS_IMAGEN_ACEPTADOS,
  ...EXTENSIONES_ACEPTADAS.map((ext) => `.${ext}`),
].join(',')

/** Tamaño máximo por foto, en bytes (5 MB). */
export const TAMANIO_MAXIMO_IMAGEN = 5 * 1024 * 1024

export interface ResultadoSubidaImagen {
  url: string
  path: string
}

function extensionDe(nombreArchivo: string): string {
  return nombreArchivo.split('.').pop()?.toLowerCase() || ''
}

/**
 * Un archivo es una imagen válida si su MIME type es uno de los aceptados,
 * o (fallback) si su extensión lo es — esto cubre el caso de .jfif y
 * cualquier otro archivo al que el navegador no le haya podido asignar
 * un `file.type` correcto.
 */
function esImagenValida(file: File): boolean {
  if (TIPOS_IMAGEN_ACEPTADOS.includes(file.type)) return true
  const ext = extensionDe(file.name)
  return EXTENSIONES_ACEPTADAS.includes(ext)
}

/** Determina el content-type correcto a guardar en Storage, con .jfif
 * tratado como JPEG (que es lo que realmente es). */
function contentTypeDe(file: File): string {
  if (TIPOS_IMAGEN_ACEPTADOS.includes(file.type)) return file.type
  const ext = extensionDe(file.name)
  if (ext === 'png') return 'image/png'
  if (ext === 'webp') return 'image/webp'
  return 'image/jpeg' // jpg, jpeg, jfif
}

/**
 * Sube una foto al bucket "productos-imagenes" bajo una carpeta identificada
 * por `carpetaId` (el id del producto si ya existe, o un id temporal si el
 * producto todavía se está creando). Devuelve la URL pública.
 */
export async function subirImagenProducto(
  file: File,
  carpetaId: string,
): Promise<ResultadoSubidaImagen> {
  if (!esImagenValida(file)) {
    throw new Error('Formato no soportado. Usá JPG, PNG o WEBP.')
  }
  if (file.size > TAMANIO_MAXIMO_IMAGEN) {
    throw new Error('La foto supera el tamaño máximo de 5 MB.')
  }

  const ext = extensionDe(file.name) || 'jpg'
  const nombreArchivo = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`
  const ruta = `${carpetaId}/${nombreArchivo}`

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

/**
 * Intenta borrar una imagen del bucket a partir de su URL pública.
 * No lanza si falla (best-effort): evita que un error de limpieza
 * bloquee el flujo del formulario.
 */
export async function eliminarImagenProducto(url: string): Promise<void> {
  try {
    const marker = `/${BUCKET}/`
    const idx = url.indexOf(marker)
    if (idx === -1) return
    const path = url.slice(idx + marker.length)
    if (!path) return
    await supabase.storage.from(BUCKET).remove([path])
  } catch {
    // Best-effort: no bloquear al usuario por un fallo de limpieza.
  }
}
