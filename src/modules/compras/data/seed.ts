// ============================================================
// Módulo Compras — Estado inicial vacío
// ============================================================

import type { ComprasState, ComprasConfig } from '../types';

const config: ComprasConfig = {
  ivaDefault: 21,
  validezCotizacionDias: 15,
};

export const SEED_STATE: ComprasState = {
  proveedores: [],
  cotizaciones: [],
  ordenesCompra: [],
  comprobantes: [],
  pagos: [],
  nextNumeroCotizacion: 1,
  nextNumeroOrdenCompra: 1,
  nextNumeroComprobante: { factura: 1, nota_credito: 1, nota_debito: 1 },
  nextNumeroPago: 1,
  config,
};
