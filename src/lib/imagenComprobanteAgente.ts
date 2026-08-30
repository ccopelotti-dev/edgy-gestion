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

  const paths = Array.from(pathPorComprobante.values());
  if (paths.length === 0) return mapa;

  const { data: firmadas, error: errorFirma } = await supabase.storage
    .from(BUCKET)
    .createSignedUrls(paths, VIGENCIA_URL_SEGUNDOS);

  if (errorFirma || !firmadas) {
    console.error('obtenerImagenesComprobantesAgente: error firmando URLs', errorFirma);
    return mapa;
  }

  const urlPorPath = new Map(firmadas.map((f) => [f.path, f.signedUrl]));
  for (const [comprobanteId, path] of pathPorComprobante) {
    const url = path ? urlPorPath.get(path) : null;
    if (url) mapa.set(comprobanteId, url);
  }

  return mapa;
}
