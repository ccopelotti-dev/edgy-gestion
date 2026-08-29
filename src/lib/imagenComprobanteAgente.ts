// Fase 57 -- ver, desde Comprobantes (Compras y Home Keep), la imagen
// original que el admin mandó por WhatsApp y a partir de la cual el
// agente cargó el comprobante. La imagen vive en comprobantes_recibidos
// (bucket privado "comprobantes-gastos", mismo criterio que
// modules/gastos-fijos/lib/comprobantesGastos.ts) -- acá solo se
// resuelve el link (comprobante_compra_id / comprobante_hogar_id ->
// imagen_url) y se firma la URL al vuelo.

import { supabase } from '@/lib/supabase';

const BUCKET = 'comprobantes-gastos';

export type CampoOrigenAgente = 'comprobante_compra_id' | 'comprobante_hogar_id';

/**
 * Trae, para TODOS los comprobantes de un cliente que se cargaron vía
 * el agente de WhatsApp, el path de la imagen original. Pensado para
 * llamarse una sola vez por carga de página (no por fila) y armar un
 * Map<comprobanteId, path> -- así el listado sabe, sin una consulta
 * por fila, para cuáles mostrar el ícono de "Ver imagen".
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

  for (const fila of (data ?? []) as Record<string, string | null>[]) {
    const comprobanteId = fila[campo];
    const imagenUrl = fila.imagen_url;
    if (comprobanteId && imagenUrl) {
      mapa.set(comprobanteId, imagenUrl);
    }
  }

  return mapa;
}

/** Firma el path y abre la imagen en una pestaña nueva (para ampliarla). */
export async function abrirImagenComprobanteAgente(path: string): Promise<void> {
  const { data, error } = await supabase.storage.from(BUCKET).createSignedUrl(path, 60 * 10);
  if (error || !data) {
    alert('No pudimos abrir la imagen del comprobante.');
    return;
  }
  window.open(data.signedUrl, '_blank', 'noopener,noreferrer');
}
