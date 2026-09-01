// ============================================================
// Módulo Home Keep ("Kit Hogar") — Modelo de dominio
// Edgy Gestión · Clon recortado de Compras: sin Cotizaciones, sin
// Órdenes de Compra, sin catálogo de Insumos/Productos (no hay stock).
// Solo Proveedores, Comprobantes y Pagos.
// ============================================================

import type { UnidadMedida } from '@/modules/productos-stock/types';

// ─── Proveedor ───────────────────────────────────────────────
// (idéntico a Compras -- misma tabla `proveedores_hogar`, mismas columnas)

export type CondicionIvaProveedor =
  | 'responsable_inscripto'
  | 'monotributista'
  | 'exento';

export interface Proveedor {
  id: string;
  nombre: string;
  /** Nombre comercial / de fantasía, distinto de la razón social (`nombre`). */
  nombreFantasia?: string;
  cuit: string;
  condicionIva: CondicionIvaProveedor;
  email?: string;
  telefono?: string;
  direccion?: string;
  localidad?: string;
  provincia?: string;
  contacto?: string;
  rubro?: string;
  notas?: string;
  saldoCuentaCorriente: number; // positivo = le debemos
  activo: boolean;
  createdAt: string;
  updatedAt: string;
}

// ─── Item de Comprobante ─────────────────────────────────────
// A diferencia de Compras, acá no hay catálogo de Insumos/Productos (Home
// Keep no maneja stock) -- un ítem es siempre texto libre, con la
// posibilidad de clasificarlo por Categoría de gasto (tabla
// `categorias_gasto`, compartida con el resto del sistema).

export interface ItemComprobante {
  id: string;
  descripcion: string;
  cantidad: number;
  /** Unidad en la que se cargó `cantidad` -- solo informativa, no hay
   * stock real detrás para convertir. */
  unidad?: UnidadMedida;
  precioUnitario: number;
  descuento: number;            // %
  subtotal: number;             // cantidad * precio * (1 - desc/100)
  alicuotaIva: number;          // 0, 10.5, 21, 27
  montoIva: number;
  /** Categoría de gasto personal (tabla categorias_gasto) -- para poder
   * clasificar el gasto (ej. "Alimentación y Supermercado"). */
  categoriaGastoId?: string;
}

// ─── Comprobantes ────────────────────────────────────────────

export type TipoComprobante =
  | 'factura'
  | 'nota_credito'
  | 'nota_debito';

export type EstadoComprobante =
  | 'pendiente'
  | 'pagado_parcial'
  | 'pagado'
  | 'anulado';

export type MedioPago =
  | 'efectivo'
  | 'transferencia'
  | 'cheque'
  | 'cuenta_corriente'
  | 'otro';

/** Impuesto/percepción adicional cargado a mano en un comprobante. Lista
 * libre porque varía según proveedor; cada uno suma directo al total. */
export interface ImpuestoAdicional {
  id: string;
  concepto: string;
  monto: number;
}

export interface Comprobante {
  id: string;
  tipo: TipoComprobante;
  numero: number;
  proveedorId: string;
  fecha: string;
  fechaVencimiento?: string;
  items: ItemComprobante[];
  subtotal: number;
  montoIva: number;
  otrosImpuestos?: ImpuestoAdicional[];
  total: number;
  estado: EstadoComprobante;
  medioPago: MedioPago;
  montoPagado: number;
  saldoPendiente: number;
  /**
   * Nro. de comprobante fiscal del PROVEEDOR (el que viene impreso en la
   * factura física, ej. "0001-00000542") -- distinto de `numero`, que es el
   * correlativo interno de Edgy Gestión.
   */
  numeroComprobanteProveedor?: string;
  notas?: string;
  createdAt: string;
  updatedAt: string;
}

// ─── Pagos ───────────────────────────────────────────────────

export interface ImputacionPago {
  comprobanteId: string;
  montoImputado: number;
}

/**
 * Estado de vida de un Pago. Se arma en `pendiente` (se decide qué se
 * cancela y con qué combinación de medios, sin comprometer todavía ninguna
 * cuenta bancaria ni cheque real) y recién al confirmarlo pasa a `pagada`
 * (ver ConfirmarPagoDialog): ahí se elige la cuenta bancaria real para las
 * líneas de transferencia/efectivo, se emiten los cheques reales en
 * Tesorería para las líneas de cheque, y se actualiza el saldo de los
 * comprobantes y del proveedor.
 */
export type EstadoPago = 'pendiente' | 'pagada' | 'anulada';

/**
 * Una línea de pago describe UNA forma de pago dentro de un Pago. Pueden
 * combinarse varias en un mismo pago -- ej. parte por transferencia y el
 * resto con cheques a distintos plazos.
 */
export interface LineaPago {
  id: string;
  medioPago: MedioPago;
  monto: number;
  /** Transferencia / efectivo -- cuenta bancaria real, elegida al confirmar. */
  cuentaBancariaId?: string;
  /** Cheque -- datos del cheque a emitir (puede ser diferido). */
  chequeNumero?: string;
  chequeBanco?: string;
  /** Fecha de pago/vencimiento del cheque. */
  chequeFechaPago?: string;
  /** Id del Cheque ya creado en Tesorería -- se completa al confirmar. */
  chequeId?: string;
  /** Fase 67 (01/09): foto del ticket/comprobante de ESTA línea de pago
   * en particular -- mismo criterio que en Compras (ver
   * modules/compras/types/index.ts y src/lib/creditos.ts). */
  imagenUrl?: string;
  /** Si esta línea generó un reintegro/crédito esperado (ej. Promo
   * Pampa) -- borrador de formulario, no se persiste en la línea. */
  reintegroConcepto?: string;
  reintegroMonto?: number;
}

export interface Pago {
  id: string;
  numero: number;
  proveedorId: string;
  fecha: string;
  estado: EstadoPago;
  monto: number;
  /** Medio "principal" -- si el pago combina medios distintos entre sus
   * líneas, queda en 'otro'. El detalle real está en `lineasPago`. */
  medioPago: MedioPago;
  imputaciones: ImputacionPago[];
  lineasPago: LineaPago[];
  /** Fecha en que se confirmó/ejecutó el pago (estado pasa a 'pagada'). */
  fechaConfirmacion?: string;
  notas?: string;
  createdAt: string;
  updatedAt: string;
}

// ─── Estado global ───────────────────────────────────────────

export interface HomeKeepState {
  proveedores: Proveedor[];
  comprobantes: Comprobante[];
  pagos: Pago[];
  nextNumeroComprobante: Record<TipoComprobante, number>;
  nextNumeroPago: number;
  config: HomeKeepConfig;
}

export interface HomeKeepConfig {
  ivaDefault: number;
}

// ─── Labels ──────────────────────────────────────────────────

export const ESTADO_COMPROBANTE_LABEL: Record<EstadoComprobante, string> = {
  pendiente: 'Pendiente',
  pagado_parcial: 'Pago parcial',
  pagado: 'Pagado',
  anulado: 'Anulado',
};

export const TIPO_COMPROBANTE_LABEL: Record<TipoComprobante, string> = {
  factura: 'Factura',
  nota_credito: 'Nota de crédito',
  nota_debito: 'Nota de débito',
};

export const MEDIO_PAGO_LABEL: Record<MedioPago, string> = {
  efectivo: 'Efectivo',
  transferencia: 'Transferencia',
  cheque: 'Cheque',
  cuenta_corriente: 'Cuenta corriente',
  otro: 'Otro',
};

export const CONDICION_IVA_PROV_LABEL: Record<CondicionIvaProveedor, string> = {
  responsable_inscripto: 'Responsable Inscripto',
  monotributista: 'Monotributista',
  exento: 'Exento',
};

// ─── Helpers ─────────────────────────────────────────────────

export function calcularSubtotalItem(cantidad: number, precio: number, descuento: number): number {
  return cantidad * precio * (1 - descuento / 100);
}

export function generarId(): string {
  return crypto.randomUUID();
}
