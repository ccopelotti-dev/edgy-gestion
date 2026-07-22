// ============================================================
// Módulo Mesas y Salón — Mapa de calor (Fase 16.2)
//
// Sin tabla nueva: `comandas` (comandas-cocina) ya guarda `mesa_id`,
// `fecha_apertura`/`fecha_cierre` y `total` por cada uso de una mesa --
// alcanza con leerla directo (misma técnica de lectura cross-módulo que
// ya usa Ordenes.tsx para traer `usuarios_cliente`) y agregarla acá,
// sin pasar por el store de Comandas y cocina ni agregar columnas a
// `mesas`.
// ============================================================

import { supabase } from '@/lib/supabase';

export type MetricaCalor = 'rotacion' | 'facturacion' | 'tiempo_ocupacion';
export type RangoCalor = 'hoy' | '7d' | '30d' | 'custom';

export const METRICA_CALOR_LABEL: Record<MetricaCalor, string> = {
  rotacion: 'Rotación (cant. de comandas)',
  facturacion: 'Facturación generada',
  tiempo_ocupacion: 'Tiempo de ocupación',
};

export const RANGO_CALOR_LABEL: Record<RangoCalor, string> = {
  hoy: 'Hoy',
  '7d': 'Últimos 7 días',
  '30d': 'Últimos 30 días',
  custom: 'Rango personalizado',
};

interface ComandaCalorRow {
  mesaId: string;
  total: number;
  fechaApertura: string;
  fechaCierre?: string;
}

/**
 * Límites del rango en ISO completo (no solo fecha) porque
 * `fecha_apertura`/`fecha_cierre` de `comandas` se guardan con
 * timestamp completo (`nowISO()`, ver comandas-cocina/lib/format.ts).
 */
export function limitesRango(rango: RangoCalor, desdeCustom?: string, hastaCustom?: string): { desde: string; hasta: string } {
  const ahora = new Date();
  const hasta = new Date(ahora);
  hasta.setHours(23, 59, 59, 999);

  if (rango === 'custom') {
    return {
      desde: `${desdeCustom ?? hasta.toISOString().slice(0, 10)}T00:00:00`,
      hasta: `${hastaCustom ?? hasta.toISOString().slice(0, 10)}T23:59:59.999`,
    };
  }

  const dias = rango === 'hoy' ? 0 : rango === '7d' ? 6 : 29;
  const desde = new Date(ahora);
  desde.setDate(desde.getDate() - dias);
  desde.setHours(0, 0, 0, 0);

  return { desde: desde.toISOString(), hasta: hasta.toISOString() };
}

async function obtenerComandasPorMesa(clienteId: string, desde: string, hasta: string): Promise<ComandaCalorRow[]> {
  const { data, error } = await supabase
    .from('comandas')
    .select('mesa_id, total, fecha_apertura, fecha_cierre')
    .eq('cliente_id', clienteId)
    .gte('fecha_apertura', desde)
    .lte('fecha_apertura', hasta);

  if (error) {
    console.error('Mesas y Salón · error al leer comandas para el mapa de calor:', error);
    return [];
  }

  return (data ?? []).map((r: any) => ({
    mesaId: r.mesa_id,
    total: Number(r.total),
    fechaApertura: r.fecha_apertura,
    fechaCierre: r.fecha_cierre ?? undefined,
  }));
}

/**
 * Valor crudo por mesa según la métrica elegida -- cantidad de
 * comandas (rotación), suma de `total` (facturación) o minutos
 * promedio entre apertura y cierre (tiempo de ocupación, solo cuenta
 * comandas ya cerradas: una comanda todavía abierta no tiene un
 * tiempo de ocupación definitivo).
 */
export async function calcularIntensidadPorMesa(
  clienteId: string,
  metrica: MetricaCalor,
  rango: RangoCalor,
  desdeCustom?: string,
  hastaCustom?: string,
): Promise<Map<string, number>> {
  const { desde, hasta } = limitesRango(rango, desdeCustom, hastaCustom);
  const comandas = await obtenerComandasPorMesa(clienteId, desde, hasta);

  const valores = new Map<string, number>();

  if (metrica === 'rotacion') {
    for (const c of comandas) valores.set(c.mesaId, (valores.get(c.mesaId) ?? 0) + 1);
    return valores;
  }

  if (metrica === 'facturacion') {
    for (const c of comandas) valores.set(c.mesaId, (valores.get(c.mesaId) ?? 0) + c.total);
    return valores;
  }

  // tiempo_ocupacion: minutos promedio por mesa entre apertura y cierre.
  const acumulado = new Map<string, { sumaMinutos: number; cantidad: number }>();
  for (const c of comandas) {
    if (!c.fechaCierre) continue;
    const minutos = (new Date(c.fechaCierre).getTime() - new Date(c.fechaApertura).getTime()) / 60000;
    if (!Number.isFinite(minutos) || minutos < 0) continue;
    const prev = acumulado.get(c.mesaId) ?? { sumaMinutos: 0, cantidad: 0 };
    acumulado.set(c.mesaId, { sumaMinutos: prev.sumaMinutos + minutos, cantidad: prev.cantidad + 1 });
  }
  for (const [mesaId, { sumaMinutos, cantidad }] of acumulado) {
    valores.set(mesaId, Math.round(sumaMinutos / cantidad));
  }
  return valores;
}

/**
 * Bucket de intensidad (0 a 4) según qué tan cerca está el valor de una
 * mesa del máximo del grupo -- 5 escalones de color, de "sin
 * actividad" a "el más caliente". Se normaliza contra el máximo real
 * en pantalla (no un umbral fijo) para que el mapa siga siendo útil
 * tanto en un salón chico como en uno grande.
 */
export function bucketIntensidad(valor: number, maximo: number): number {
  if (maximo <= 0 || valor <= 0) return 0;
  const pct = valor / maximo;
  if (pct <= 0.2) return 1;
  if (pct <= 0.45) return 2;
  if (pct <= 0.7) return 3;
  return 4;
}

export const COLOR_INTENSIDAD: string[] = [
  'bg-gray-100 text-gray-400',
  'bg-yellow-200 text-yellow-900',
  'bg-orange-300 text-orange-900',
  'bg-orange-500 text-white',
  'bg-red-600 text-white',
];

export function formatValorCalor(valor: number, metrica: MetricaCalor): string {
  if (metrica === 'facturacion') {
    return valor.toLocaleString('es-AR', { style: 'currency', currency: 'ARS', maximumFractionDigits: 0 });
  }
  if (metrica === 'tiempo_ocupacion') {
    return `${valor} min`;
  }
  return `${valor}`;
}
