// Fase 41.2: helper compartido por Presupuestos.tsx y Ordenes.tsx para
// encontrar un cobro de seña pendiente de imputar contra una factura
// recién emitida. Un cobro de seña se identifica por tener `presupuestoId`
// cargado (ver Cobro.presupuestoId en types/index.ts) -- puede tener
// imputaciones parciales ya (si el presupuesto se facturó en más de una
// tanda), así que el monto real disponible es monto - suma(imputaciones).

import type { Cobro } from '../types';

export interface SenaPendiente {
  cobroId: string;
  montoDisponible: number;
}

export function buscarSenaPendiente(cobros: Cobro[], presupuestoId: string | undefined): SenaPendiente | null {
  if (!presupuestoId) return null;
  const cobro = cobros.find((c) => c.presupuestoId === presupuestoId);
  if (!cobro) return null;

  const imputado = cobro.imputaciones.reduce((sum, imp) => sum + imp.montoImputado, 0);
  const montoDisponible = cobro.monto - imputado;
  if (montoDisponible <= 0.01) return null;

  return { cobroId: cobro.id, montoDisponible };
}
