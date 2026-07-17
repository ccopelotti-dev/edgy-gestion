// ============================================================
// Módulo Compras — Modelo de dominio
// Edgy Gestión · Core administrativo
// ============================================================

import type { UnidadMedida } from '@/modules/productos-stock/types';

// ─── Proveedor ───────────────────────────────────────────────

export type CondicionIvaProveedor =
  | 'responsable_inscripto'
  | 'monotributista'
  | 'exento';

export interface Proveedor {
  id: string;
  nombre: string;
  cuit: string;
  condicionIva: CondicionIvaProveedor;
  email?: string;
  telefono?: string;
  direccion?: string;
  localidad?: string;
  provincia?: string;
  contacto?: string;            // nombre de contacto
  rubro?: string;
  notas?: string;
  saldoCuentaCorriente: number; // positivo = le debemos
  activo: boolean;
  createdAt: string;
  updatedAt: string;
}

// ─── Item genérico (compartido entre cotización, OC y comprobante) ─

export interface ItemCompra {
  id: string;
  productoId?: string;
  /**
   * Vínculo opcional a un Insumo del catálogo de Productos y Stock (materia
   * prima) -- mutuamente excluyente con productoId. Permite que "Actualizar
   * stock" (ver actualizarStockCompra.ts) sepa a qué insumo sumarle stock.
   * Si ninguno de los dos está cargado, la línea sigue siendo texto libre
   * como siempre (comportamiento default sin cambios).
   */
  insumoId?: string;
  /**
   * Unidad en la que se cargó `cantidad` en esta línea. Puede diferir de la
   * unidad de stock real del insumo/producto vinculado (ej. compraste "kg"
   * de un insumo que lleva el stock en "gramo") -- se convierte con
   * convertirUnidad() al generar la Recepción.
   */
  unidad?: UnidadMedida;
  descripcion: string;
  cantidad: number;
  precioUnitario: number;
  descuento: number;            // %
  subtotal: number;             // cantidad * precio * (1 - desc/100)
  /**
   * IVA de la línea -- opcional acá porque en un Pedido de Cotización no
   * aplica (no es un documento fiscal), pero en una Orden de Compra sirve
   * para estimar el costo total real antes de recibir la factura (ver
   * OrdenCompraPreciosDialog, Fase 21). En ComprobanteCompra este campo es
   * obligatorio -- ver ItemComprobanteCompra más abajo.
   */
  alicuotaIva?: number;         // 0, 10.5, 21, 27
  montoIva?: number;
}

export interface ItemComprobanteCompra extends ItemCompra {
  alicuotaIva: number;         // 0, 10.5, 21, 27
  montoIva: number;
}

// ─── Pedido de Cotización ────────────────────────────────────

export type EstadoCotizacion =
  | 'borrador'
  | 'enviado'
  | 'respondido'
  | 'aprobado'
  | 'vencido'
  | 'cancelado';

export interface PedidoCotizacion {
  id: string;
  numero: number;
  proveedorId: string;
  fecha: string;
  validezDias: number;
  fechaVencimiento: string;
  estado: EstadoCotizacion;
  items: ItemCompra[];
  subtotal: number;
  total: number;
  notas?: string;
  ordenCompraId?: string;       // si se convirtió a OC
  createdAt: string;
  updatedAt: string;
}

// ─── Orden de Compra ─────────────────────────────────────────

export type EstadoOrdenCompra =
  | 'pendiente'
  | 'parcial'
  | 'recibida'
  | 'cancelada';

/** Impuesto/percepción adicional cargado a mano en una Orden de Compra --
 * percepción de Ganancias, percepción de IIBB, impuesto a los débitos y
 * créditos bancarios, etc. Lista libre porque varía mucho según proveedor
 * y jurisdicción; cada uno suma directo al total (no lleva alícuota). */
export interface ImpuestoOrdenCompra {
  id: string;
  concepto: string;
  monto: number;
}

export interface OrdenCompra {
  id: string;
  numero: number;
  proveedorId: string;
  cotizacionId?: string;
  fecha: string;
  fechaEntrega?: string;
  estado: EstadoOrdenCompra;
  items: ItemCompra[];
  subtotal: number;
  /** Suma de `montoIva` de los items (ver ItemCompra.alicuotaIva). */
  montoIva?: number;
  /** Percepciones/impuestos adicionales -- ver ImpuestoOrdenCompra. */
  otrosImpuestos?: ImpuestoOrdenCompra[];
  /** subtotal + montoIva + suma(otrosImpuestos). */
  total: number;
  notas?: string;
  comprobanteIds: string[];
  createdAt: string;
  updatedAt: string;
}

// ─── Comprobantes de Compra ──────────────────────────────────

export type TipoComprobanteCompra =
  | 'factura'
  | 'nota_credito'
  | 'nota_debito';

export type EstadoComprobanteCompra =
  | 'pendiente'
  | 'pagado_parcial'
  | 'pagado'
  | 'anulado';

export type MedioPagoCompra =
  | 'efectivo'
  | 'transferencia'
  | 'cheque'
  | 'cuenta_corriente'
  | 'otro';

// ─── Conexión Compras -> Recepción (stock) ───────────────────
// 'si': la mercadería tiene un control de remito separado -- la Recepción
// física se confirma más adelante en Productos y Stock, y "Actualizar
// stock" queda deshabilitado en el modal para no duplicar el ingreso.
// 'no': la factura representa la llegada real de la mercadería, así que
// se puede empujar el stock directamente desde el modal de Compras.
export type ControlRemision = 'si' | 'no';

export interface ComprobanteCompra {
  id: string;
  tipo: TipoComprobanteCompra;
  numero: number;
  proveedorId: string;
  ordenCompraId?: string;
  fecha: string;
  fechaVencimiento?: string;
  items: ItemComprobanteCompra[];
  subtotal: number;
  montoIva: number;
  /** Percepciones/impuestos adicionales -- ver ImpuestoOrdenCompra. */
  otrosImpuestos?: ImpuestoOrdenCompra[];
  total: number;
  estado: EstadoComprobanteCompra;
  medioPago: MedioPagoCompra;
  montoPagado: number;
  saldoPendiente: number;
  controlRemision: ControlRemision;
  numeroRemito?: string;
  /**
   * Nro. de comprobante fiscal del PROVEEDOR (el que viene impreso en la
   * factura física, ej. "0001-00000542") -- distinto de `numero`, que es el
   * correlativo interno de Edgy Gestión (FC-00001, FC-00002...). Es el dato
   * clave para identificar la compra frente al proveedor y para el libro
   * IVA Compras del período fiscal.
   */
  numeroComprobanteProveedor?: string;
  /** true una vez que se generó la Recepción correspondiente en Productos y
   * Stock -- evita sumar el mismo stock dos veces. */
  stockActualizado: boolean;
  /** id de la Recepción generada en Productos y Stock, si stockActualizado. */
  recepcionId?: string;
  notas?: string;
  createdAt: string;
  updatedAt: string;
}

// ─── Pagos ───────────────────────────────────────────────────

export interface ImputacionPago {
  comprobanteId: string;
  montoImputado: number;
}

export interface PagoCompra {
  id: string;
  numero: number;
  proveedorId: string;
  fecha: string;
  monto: number;
  medioPago: MedioPagoCompra;
  imputaciones: ImputacionPago[];
  notas?: string;
  createdAt: string;
}

// ─── Estado global ───────────────────────────────────────────

export interface ComprasState {
  proveedores: Proveedor[];
  cotizaciones: PedidoCotizacion[];
  ordenesCompra: OrdenCompra[];
  comprobantes: ComprobanteCompra[];
  pagos: PagoCompra[];
  nextNumeroCotizacion: number;
  nextNumeroOrdenCompra: number;
  nextNumeroComprobante: Record<TipoComprobanteCompra, number>;
  nextNumeroPago: number;
  config: ComprasConfig;
}

export interface ComprasConfig {
  ivaDefault: number;
  validezCotizacionDias: number;
}

// ─── Labels ──────────────────────────────────────────────────

export const ESTADO_COTIZACION_LABEL: Record<EstadoCotizacion, string> = {
  borrador: 'Borrador',
  enviado: 'Enviado',
  respondido: 'Respondido',
  aprobado: 'Aprobado',
  vencido: 'Vencido',
  cancelado: 'Cancelado',
};

export const ESTADO_OC_LABEL: Record<EstadoOrdenCompra, string> = {
  pendiente: 'Pendiente',
  parcial: 'Recepción parcial',
  recibida: 'Recibida',
  cancelada: 'Cancelada',
};

export const ESTADO_COMPROBANTE_COMPRA_LABEL: Record<EstadoComprobanteCompra, string> = {
  pendiente: 'Pendiente',
  pagado_parcial: 'Pago parcial',
  pagado: 'Pagado',
  anulado: 'Anulado',
};

export const TIPO_COMPROBANTE_COMPRA_LABEL: Record<TipoComprobanteCompra, string> = {
  factura: 'Factura',
  nota_credito: 'Nota de crédito',
  nota_debito: 'Nota de débito',
};

export const MEDIO_PAGO_COMPRA_LABEL: Record<MedioPagoCompra, string> = {
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
