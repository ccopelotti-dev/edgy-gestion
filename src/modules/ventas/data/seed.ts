import type { VentasState, VentasConfig } from '../types';

const config: VentasConfig = {
  ivaDefault: 21,
  validezPresupuestoDias: 15,
  modoEmisionDefault: 'interno',
  afipConfigurado: false,
};

export const SEED_STATE: VentasState = {
  categorias: [],
  clientes: [],
  presupuestos: [],
  ordenes: [],
  comprobantes: [],
  cobros: [],
  nextNumeroPresupuesto: 1,
  nextNumeroOrden: { pedido: 1, produccion: 1, servicio: 1 },
  nextNumeroComprobante: { factura: 1, recibo: 1, nota_credito: 1, nota_debito: 1 },
  nextNumeroCobro: 1,
  config,
};
