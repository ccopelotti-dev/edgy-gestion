// Subida, descarga y borrado de archivos en el bucket "notas-media".
//
// Privado (a diferencia de "productos-imagenes"/"logos-clientes", que
// son públicos) -- puede haber fotos o audios con información sensible
// del negocio. No se guarda una URL pública, se guarda el "path" del
// objeto, y la URL de reproducción/descarga se firma al vuelo cuando
// hace falta mostrarla (ver 0078_fase31_agenda.sql).
//
// Convención de path: "{clienteId}/{id}-{nombre}" -- igual que
// "archivos-cliente" (modules/utilidades/lib/archivos.ts), el primer
// segmento es lo que valida la policy de Storage del lado del servidor.

import { supabase } from '@/lib/supabase'

const BUCKET = 'notas-media'

/** 20 MB -- mismo tope que archivos-cliente, generoso para audios cortos
 * de nota de voz y fotos de celular. */
export const TAMANIO_MAXIMO_MEDIA = 20 * 1024 * 1024

export async function subirMediaNota(file: File | Blob, clienteId: string, nombre: string): Promise<string> {
  if (file.size > TAMANIO_MAXIMO_MEDIA) {
    throw new Error('El archivo supera el tamaño máximo de 20 MB.')
  }

  const nombreSanitizado = nombre.replace(/[^a-zA-Z0-9._-]/g, '_')
  const path = `${clienteId}/${crypto.randomUUID()}-${nombreSanitizado}`

  const { error } = await supabase.storage.from(BUCKET).upload(path, file, {
    cacheControl: '3600',
    upsert: false,
  })

  if (error) {
    throw new Error(error.message || 'No se pudo subir el archivo.')
  }

  return path
}

/** Devuelve una URL válida por 1 hora, para mostrar la imagen o
 * reproducir el audio. */
export async function obtenerUrlMediaNota(path: string): Promise<string> {
  const { data, error } = await supabase.storage.from(BUCKET).createSignedUrl(path, 60 * 60)
  if (error || !data) {
    throw new Error('No pudimos generar el link del archivo.')
  }
  return data.signedUrl
}

export async function eliminarMediaNota(path: string): Promise<void> {
  await supabase.storage.from(BUCKET).remove([path])
}
