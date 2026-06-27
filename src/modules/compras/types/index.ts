// ============================================================
// Módulo Compras — Modelo de dominio
// Edgy Gestión · Core administrativo
// ============================================================

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
  descripcion: string;
  cantidad: number;
  precioUnitario: number;
  descuento: number;            // %
  subtotal: number;             // cantidad * precio * (1 - desc/100)
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
  total: number;
  estado: EstadoComprobanteCompra;
  medioPago: MedioPagoCompra;
  montoPagado: number;
  saldoPendiente: number;
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
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}
