// ============================================================
// Módulo Home Keep — Estado inicial vacío
// ============================================================

import type { HomeKeepState, HomeKeepConfig } from '../types';

const config: HomeKeepConfig = {
  ivaDefault: 21,
};

export const SEED_STATE: HomeKeepState = {
  proveedores: [],
  comprobantes: [],
  pagos: [],
  nextNumeroComprobante: { factura: 1, nota_credito: 1, nota_debito: 1 },
  nextNumeroPago: 1,
  config,
};
