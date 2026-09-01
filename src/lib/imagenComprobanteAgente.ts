// Fase 57 / 57b -- ver, desde Comprobantes (Compras y Home Keep), la
// imagen original que el admin mandó por WhatsApp y a partir de la
// cual el agente cargó el comprobante (miniatura en la fila + ampliar
// al hacer click, para poder controlar el data entry contra la foto).
// La imagen vive en comprobantes_recibidos (bucket privado
// "comprobantes-gastos", mismo criterio que
// modules/gastos-fijos/lib/comprobantesGastos.ts) -- acá se resuelve
// el link (comprobante_compra_id / comprobante_hogar_id -> imagen_url)
// y se firman todas las URLs de una sola vez (batch, no una consulta
// de Storage por fila).

import { supabase } from '@/lib/supabase';

const BUCKET = 'comprobantes-gastos';
const VIGENCIA_URL_SEGUNDOS = 60 * 30; // 30 minutos -- alcanza para revisar el listado

export type CampoOrigenAgente = 'comprobante_compra_id' | 'comprobante_hogar_id';

/** Firma en batch un lote de paths de Storage ya resueltos (comprobanteId ->
 * path) y devuelve el mismo mapa pero con la URL firmada en vez del path.
 * Factorizado para que tanto la foto que llega por WhatsApp (tabla
 * comprobantes_recibidos) como la que se adjunta a mano (columna
 * imagen_url de comprobantes_compra) compartan la misma lógica de firma. */
async function firmarUrlsPorComprobante(pathPorComprobante: Map<string, string>): Promise<Map<string, string>> {
  const mapa = new Map<string, string>();
  const paths = Array.from(pathPorComprobante.values());
  if (paths.length === 0) return mapa;

  const { data: firmadas, error: errorFirma } = await supabase.storage
    .from(BUCKET)
    .createSignedUrls(paths, VIGENCIA_URL_SEGUNDOS);

  if (errorFirma || !firmadas) {
    console.error('imagenComprobanteAgente: error firmando URLs', errorFirma);
    return mapa;
  }

  const urlPorPath = new Map(firmadas.map((f) => [f.path, f.signedUrl]));
  for (const [comprobanteId, path] of pathPorComprobante) {
    const url = path ? urlPorPath.get(path) : null;
    if (url) mapa.set(comprobanteId, url);
  }

  return mapa;
}

/**
 * Trae, para TODOS los comprobantes de un cliente que se cargaron vía
 * el agente de WhatsApp, la URL YA FIRMADA de la imagen original --
 * lista para usar directo como miniatura (<img src>) o para ampliar.
 * Pensado para llamarse una sola vez por carga de página, no por fila.
 */
export async function obtenerImagenesComprobantesAgente(
  clienteId: string,
  campo: CampoOrigenAgente,
): Promise<Map<string, string>> {
  const mapa = new Map<string, string>();
  if (!clienteId) return mapa;

  const { data, error } = await supabase
    .from('comprobantes_recibidos')
    .select(`${campo}, imagen_url`)
    .eq('cliente_id', clienteId)
    .not(campo, 'is', null)
    .not('imagen_url', 'is', null);

  if (error) {
    console.error('obtenerImagenesComprobantesAgente: error consultando comprobantes_recibidos', error);
    return mapa;
  }

  const filas = (data ?? []) as Record<string, string | null>[];
  const pathPorComprobante = new Map<string, string>();
  for (const fila of filas) {
    const comprobanteId = fila[campo];
    const imagenUrl = fila.imagen_url;
    if (comprobanteId && imagenUrl) {
      pathPorComprobante.set(comprobanteId, imagenUrl);
    }
  }

  return firmarUrlsPorComprobante(pathPorComprobante);
}

/**
 * Fase 61 (30/08): equivalente a `obtenerImagenesComprobantesAgente`, pero
 * para las fotos adjuntadas A MANO desde el formulario de "Nuevo
 * comprobante de compra" (columna `comprobantes_compra.imagen_url`, no la
 * tabla `comprobantes_recibidos` que es específica del agente de
 * WhatsApp). El caller mezcla este mapa con el del agente para que la
 * miniatura/lightbox del listado no tenga que distinguir el origen.
 */
export async function obtenerImagenesComprobantesManuales(
  comprobantes: { id: string; imagenUrl?: string | null }[],
): Promise<Map<string, string>> {
  const pathPorComprobante = new Map<string, string>();
  for (const c of comprobantes) {
    if (c.imagenUrl) pathPorComprobante.set(c.id, c.imagenUrl);
  }
  return firmarUrlsPorComprobante(pathPorComprobante);
}

/** Tipos de archivo aceptados para el adjunto manual -- imagen o PDF (una
 * factura suele llegar escaneada como foto, pero también como PDF). */
export const ACCEPT_IMAGEN_COMPROBANTE = 'image/jpeg,image/png,image/webp,.jpg,.jpeg,.png,.webp';
export const TAMANIO_MAXIMO_IMAGEN_COMPROBANTE = 8 * 1024 * 1024; // 8 MB

function extensionDe(nombreArchivo: string): string {
  return nombreArchivo.split('.').pop()?.toLowerCase() || 'jpg';
}

/**
 * Sube la foto/scan de un comprobante cargado a mano al bucket privado
 * "comprobantes-gastos", bajo `{clienteId}/manual-{timestamp}-{random}.ext`
 * -- la política de Storage exige que el primer segmento de la carpeta sea
 * el cliente del usuario autenticado (mismo criterio que el resto de los
 * buckets privados del sistema). Devuelve el path (no una URL pública: el
 * bucket es privado) y ya una URL firmada lista para previsualizar en el
 * formulario antes de guardar.
 */
export async function subirImagenComprobanteManual(
  file: File,
  clienteId: string,
): Promise<{ path: string; signedUrl: string }> {
  if (file.size > TAMANIO_MAXIMO_IMAGEN_COMPROBANTE) {
    throw new Error('El archivo supera el tamaño máximo de 8 MB.');
  }
  const ext = extensionDe(file.name);
  const nombreArchivo = `manual-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
  const path = `${clienteId}/${nombreArchivo}`;

  const { data, error } = await supabase.storage.from(BUCKET).upload(path, file, {
    cacheControl: '3600',
    upsert: false,
    contentType: file.type || 'image/jpeg',
  });
  if (error || !data) {
    throw new Error(error?.message || 'No se pudo subir la imagen.');
  }

  const { data: firmada, error: errorFirma } = await supabase.storage
    .from(BUCKET)
    .createSignedUrl(data.path, VIGENCIA_URL_SEGUNDOS);
  if (errorFirma || !firmada) {
    throw new Error('La imagen se subió, pero no se pudo generar la vista previa.');
  }

  return { path: data.path, signedUrl: firmada.signedUrl };
}

/** Best-effort: borra del bucket una imagen adjuntada a mano que quedó
 * huérfana (se reemplazó por otra, o se canceló el formulario sin
 * guardar). No lanza si falla -- no vale la pena bloquear al usuario por
 * un archivo suelto en Storage. */
export async function eliminarImagenComprobanteManual(path: string): Promise<void> {
  try {
    await supabase.storage.from(BUCKET).remove([path]);
  } catch {
    // Best-effort.
  }
}

/**
 * Fase 67 (01/09): firma en batch una lista suelta de paths del mismo
 * bucket -- pensado para los tickets de pago adjuntos a cada
 * LineaPago (Compras y Home Keep), que no tienen una tabla propia
 * como `comprobantes_compra` para reusar `firmarUrlsPorComprobante`
 * (viven adentro del jsonb `lineas_pago`). Devuelve un mapa
 * path -> URL firmada, ignorando silenciosamente los paths que no se
 * pudieron firmar.
 */
export async function firmarUrlsDeTickets(paths: string[]): Promise<Map<string, string>> {
  const mapa = new Map<string, string>();
  const unicos = Array.from(new Set(paths.filter(Boolean)));
  if (unicos.length === 0) return mapa;

  const { data: firmadas, error } = await supabase.storage
    .from(BUCKET)
    .createSignedUrls(unicos, VIGENCIA_URL_SEGUNDOS);

  if (error || !firmadas) {
    console.error('firmarUrlsDeTickets: error firmando URLs', error);
    return mapa;
  }

  for (const f of firmadas) {
    if (f.signedUrl) mapa.set(f.path ?? '', f.signedUrl);
  }
  return mapa;
}
