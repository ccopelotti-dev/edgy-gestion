// Subida, descarga y borrado de archivos en el bucket "archivos-cliente".
//
// A diferencia de "productos-imagenes" (público, para el catálogo), este
// bucket es PRIVADO: puede haber comprobantes o documentación sensible. Por
// eso no se guarda una URL pública -- se guarda el "path" del objeto, y la
// URL de descarga se firma al vuelo (createSignedUrl) cuando el usuario
// efectivamente quiere descargar o ver el archivo.
//
// Convención de path obligatoria: "{clienteId}/{archivoId}-{nombreOriginal}".
// El primer segmento (clienteId) es lo que valida la policy de Storage del
// lado del servidor (ver 0012_modulo_utilidades.sql) -- storage.foldername(name)
// devuelve ese primer segmento.

import { supabase } from '@/lib/supabase'

const BUCKET = 'archivos-cliente'

/** Tamaño máximo por archivo, en bytes (20 MB -- más permisivo que las fotos
 * de producto porque acá puede haber PDFs de varias páginas). */
export const TAMANIO_MAXIMO_ARCHIVO = 20 * 1024 * 1024

export interface ResultadoSubidaArchivo {
  path: string
  tamanioBytes: number
}

export async function subirArchivo(
  file: File,
  clienteId: string,
  archivoId: string,
): Promise<ResultadoSubidaArchivo> {
  if (file.size > TAMANIO_MAXIMO_ARCHIVO) {
    throw new Error('El archivo supera el tamaño máximo de 20 MB.')
  }

  const nombreSanitizado = file.name.replace(/[^a-zA-Z0-9._-]/g, '_')
  const path = `${clienteId}/${archivoId}-${nombreSanitizado}`

  const { error } = await supabase.storage.from(BUCKET).upload(path, file, {
    cacheControl: '3600',
    upsert: false,
  })

  if (error) {
    throw new Error(error.message || 'No se pudo subir el archivo.')
  }

  return { path, tamanioBytes: file.size }
}

/** Devuelve una URL de descarga válida por 1 hora. */
export async function obtenerUrlDescarga(path: string): Promise<string> {
  const { data, error } = await supabase.storage.from(BUCKET).createSignedUrl(path, 60 * 60)
  if (error || !data) {
    throw new Error('No pudimos generar el link de descarga.')
  }
  return data.signedUrl
}

export async function eliminarArchivo(path: string): Promise<void> {
  await supabase.storage.from(BUCKET).remove([path])
}
