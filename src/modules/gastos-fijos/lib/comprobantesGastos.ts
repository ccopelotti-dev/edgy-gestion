// Subida, descarga y borrado de archivos en el bucket
// "comprobantes-gastos". Privado, mismo criterio que "notas-media"
// (ver modules/agenda/lib/notasMedia.ts): no se guarda una URL
// pública, se guarda el "path" y la URL de descarga se firma al
// vuelo.

import { supabase } from '@/lib/supabase'

const BUCKET = 'comprobantes-gastos'

export const TAMANIO_MAXIMO_COMPROBANTE = 20 * 1024 * 1024

export async function subirComprobanteGasto(file: File, clienteId: string): Promise<string> {
  if (file.size > TAMANIO_MAXIMO_COMPROBANTE) {
    throw new Error('El archivo supera el tamaño máximo de 20 MB.')
  }

  const nombreSanitizado = file.name.replace(/[^a-zA-Z0-9._-]/g, '_')
  const path = `${clienteId}/${crypto.randomUUID()}-${nombreSanitizado}`

  const { error } = await supabase.storage.from(BUCKET).upload(path, file, {
    cacheControl: '3600',
    upsert: false,
  })

  if (error) {
    throw new Error(error.message || 'No se pudo subir el comprobante.')
  }

  return path
}

export async function obtenerUrlComprobanteGasto(path: string): Promise<string> {
  const { data, error } = await supabase.storage.from(BUCKET).createSignedUrl(path, 60 * 60)
  if (error || !data) {
    throw new Error('No pudimos generar el link del comprobante.')
  }
  return data.signedUrl
}

export async function eliminarComprobanteGasto(path: string): Promise<void> {
  await supabase.storage.from(BUCKET).remove([path])
}
