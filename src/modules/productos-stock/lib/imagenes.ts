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

/** Tamaño máximo por foto, en bytes (5 MB). */
export const TAMANIO_MAXIMO_IMAGEN = 5 * 1024 * 1024

export interface ResultadoSubidaImagen {
  url: string
  path: string
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
  if (!TIPOS_IMAGEN_ACEPTADOS.includes(file.type)) {
    throw new Error('Formato no soportado. Usá JPG, PNG o WEBP.')
  }
  if (file.size > TAMANIO_MAXIMO_IMAGEN) {
    throw new Error('La foto supera el tamaño máximo de 5 MB.')
  }

  const ext = file.name.split('.').pop()?.toLowerCase() || 'jpg'
  const nombreArchivo = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`
  const ruta = `${carpetaId}/${nombreArchivo}`

  const { data, error } = await supabase.storage.from(BUCKET).upload(ruta, file, {
    cacheControl: '3600',
    upsert: false,
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
