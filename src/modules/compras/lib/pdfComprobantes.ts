// ============================================================
// Módulo Compras — helpers de descarga de PDF
// Edgy Gestión · Fase 17 (auditoría e ícono de descarga PDF en listados)
// + Fase 17b (Resumen de cuenta y Comprobante de Pago, en Proveedores)
//
// Mismo motor compartido que Ventas (src/lib/comprobantes-pdf), con
// el proveedor en el lugar del "cliente" del PDF -- el motor no le
// pone ninguna etiqueta fija a ese campo, así que es reutilizable tal
// cual. Cubre los tres documentos de Compras que ya tienen sus datos
// completos en memoria: Comprobantes, Órdenes de compra y Pedidos de
// cotización.
//
// Fase 17b suma dos documentos nuevos, propios de Proveedores: el
// Resumen de cuenta (ledger clásico con saldo corriente) y el
// Comprobante de Pago (documento inverso a un Recibo -- acá somos
// nosotros los que pagamos).
// ============================================================

import {
  generarComprobantePdf,
  type EmpresaParaPdf,
} from '@/lib/comprobantes-pdf/generarComprobantePdf';
import {
  generarResumenCuentaPdf,
  type MovimientoResumenCuenta,
} from '@/lib/comprobantes-pdf/generarResumenCuentaPdf';
import {
  generarComprobantePagoPdf,
} from '@/lib/comprobantes-pdf/generarComprobantePagoPdf';
import type { Cliente as ClienteEmpresa } from '@/types';
import { formatCuit, formatDate, formatNumero, PREFIJO_COMPROBANTE_COMPRA } from './format';
import type {
  ComprobanteCompra,
  OrdenCompra,
  PedidoCotizacion,
  Proveedor,
  PagoCompra,
} from '../types';
import { TIPO_COMPROBANTE_COMPRA_LABEL, MEDIO_PAGO_COMPRA_LABEL } from '../types';

function empresaParaPdf(empresaActual: ClienteEmpresa): EmpresaParaPdf {
  return {
    nombre: empresaActual.nombre,
    cuit: empresaActual.cuit,
    direccion: empresaActual.direccion,
    telefono: empresaActual.telefono,
    logoUrl: empresaActual.logo_url,
    colorMarca: empresaActual.color_marca,
  };
}

function nombreProveedorFallback(proveedor: Proveedor | undefined, fallback: string): string {
  return proveedor?.nombre ?? fallback;
}

/** El número que identifica a un comprobante DE COMPRA frente al proveedor
 * es el suyo -- el que viene impreso en la factura física (`numeroComprobanteProveedor`,
 * ej. "0003-00002857"), no nuestro correlativo interno (FC-00009), que solo
 * es un ID de nuestra tabla de Supabase sin ninguna utilidad para quien lo
 * lee. Se usa este número legítimo en el Resumen de cuenta y en el
 * Comprobante de Pago; si por algún motivo el comprobante no lo tiene
 * cargado, se cae al correlativo interno para no dejar la celda vacía. */
function numeroLegitimoComprobante(c: ComprobanteCompra): string {
  return c.numeroComprobanteProveedor?.trim() || formatNumero(PREFIJO_COMPROBANTE_COMPRA[c.tipo], c.numero);
}

/** Descarga el PDF de un ComprobanteCompra (Factura/Nota de crédito/
 * Nota de débito recibida de un proveedor). */
export async function descargarComprobanteCompraPdf(
  empresaActual: ClienteEmpresa,
  proveedor: Proveedor | undefined,
  comp: ComprobanteCompra,
  proveedorNombreFallback: string,
): Promise<void> {
  const numero = formatNumero(PREFIJO_COMPROBANTE_COMPRA[comp.tipo], comp.numero);
  await generarComprobantePdf(
    empresaParaPdf(empresaActual),
    {
      tipoLabel: TIPO_COMPROBANTE_COMPRA_LABEL[comp.tipo],
      numero,
      fecha: formatDate(comp.fecha),
      clienteNombre: nombreProveedorFallback(proveedor, proveedorNombreFallback),
      clienteDocumento: proveedor?.cuit ?? null,
      items: comp.items.map((i) => ({
        descripcion: i.descripcion,
        cantidad: i.cantidad,
        precioUnitario: i.precioUnitario,
        subtotal: i.subtotal,
      })),
      subtotal: comp.subtotal,
      montoIva: comp.montoIva,
      total: comp.total,
      notas: comp.notas ?? null,
    },
    numero,
  );
}

/** Descarga el PDF de una Orden de compra (documento para mandarle al
 * proveedor, no tiene IVA discriminado -- eso llega recién con el
 * comprobante que el proveedor emite en respuesta). */
export async function descargarOrdenCompraPdf(
  empresaActual: ClienteEmpresa,
  proveedor: Proveedor | undefined,
  oc: OrdenCompra,
  proveedorNombreFallback: string,
): Promise<void> {
  const numero = formatNumero('OC', oc.numero);
  await generarComprobantePdf(
    empresaParaPdf(empresaActual),
    {
      tipoLabel: 'Orden de compra',
      numero,
      fecha: formatDate(oc.fecha),
      clienteNombre: nombreProveedorFallback(proveedor, proveedorNombreFallback),
      clienteDocumento: proveedor?.cuit ?? null,
      items: oc.items.map((i) => ({
        descripcion: i.descripcion,
        cantidad: i.cantidad,
        precioUnitario: i.precioUnitario,
        subtotal: i.subtotal,
      })),
      subtotal: oc.subtotal,
      total: oc.total,
      notas: oc.notas ?? null,
    },
    numero,
  );
}

/** Descarga el PDF de un Pedido de cotización (lo que se le manda al
 * proveedor para que cotice, no un documento que el proveedor emite). */
export async function descargarCotizacionPdf(
  empresaActual: ClienteEmpresa,
  proveedor: Proveedor | undefined,
  cot: PedidoCotizacion,
  proveedorNombreFallback: string,
): Promise<void> {
  const numero = formatNumero('COT', cot.numero);
  await generarComprobantePdf(
    empresaParaPdf(empresaActual),
    {
      tipoLabel: 'Pedido de cotización',
      numero,
      fecha: formatDate(cot.fecha),
      clienteNombre: nombreProveedorFallback(proveedor, proveedorNombreFallback),
      clienteDocumento: proveedor?.cuit ?? null,
      items: cot.items.map((i) => ({
        descripcion: i.descripcion,
        cantidad: i.cantidad,
        precioUnitario: i.precioUnitario,
        subtotal: i.subtotal,
      })),
      subtotal: cot.subtotal,
      total: cot.total,
      notas: cot.notas ?? null,
    },
    numero,
  );
}

// ─── Fase 17b: Resumen de cuenta ─────────────────────────────

/** Arma la lista cronológica de movimientos (comprobantes + pagos) de un
 * proveedor para el Resumen de cuenta -- factura/nota de débito suman al
 * "Debe" (aumentan lo que le debemos), nota de crédito y pagos van al
 * "Haber" (lo disminuyen). Los comprobantes anulados no cuentan: nunca
 * llegaron a afectar el saldo real. */
function construirMovimientosProveedor(
  proveedorId: string,
  comprobantes: ComprobanteCompra[],
  pagos: PagoCompra[],
): MovimientoResumenCuenta[] {
  type MovimientoConFecha = MovimientoResumenCuenta & { _orden: string };

  const deComprobantes: MovimientoConFecha[] = comprobantes
    .filter((c) => c.proveedorId === proveedorId && c.estado !== 'anulado')
    .map((c) => ({
      fecha: formatDate(c.fecha),
      comprobante: numeroLegitimoComprobante(c),
      detalle: TIPO_COMPROBANTE_COMPRA_LABEL[c.tipo],
      debe: c.tipo === 'nota_credito' ? undefined : c.total,
      haber: c.tipo === 'nota_credito' ? c.total : undefined,
      _orden: `${c.fecha}T${c.createdAt}`,
    }));

  const dePagos: MovimientoConFecha[] = pagos
    .filter((p) => p.proveedorId === proveedorId)
    .map((p) => ({
      fecha: formatDate(p.fecha),
      comprobante: `PAG-${String(p.numero).padStart(5, '0')}`,
      detalle: MEDIO_PAGO_COMPRA_LABEL[p.medioPago],
      haber: p.monto,
      _orden: `${p.fecha}T${p.createdAt}`,
    }));

  return [...deComprobantes, ...dePagos]
    .sort((a, b) => a._orden.localeCompare(b._orden))
    .map(({ _orden, ...mov }) => mov);
}

/** Descarga el Resumen de cuenta clásico de un proveedor -- ledger con
 * todos sus comprobantes y pagos históricos, saldo corriente fila a
 * fila y saldo final (el mismo `proveedor.saldoCuentaCorriente`). */
export async function descargarResumenCuentaProveedorPdf(
  empresaActual: ClienteEmpresa,
  proveedor: Proveedor,
  comprobantes: ComprobanteCompra[],
  pagos: PagoCompra[],
): Promise<void> {
  const movimientos = construirMovimientosProveedor(proveedor.id, comprobantes, pagos);
  await generarResumenCuentaPdf(
    empresaParaPdf(empresaActual),
    {
      entidadNombre: proveedor.nombre,
      entidadDocumento: formatCuit(proveedor.cuit),
      saldoInicial: 0,
      movimientos,
      saldoFinal: proveedor.saldoCuentaCorriente,
    },
    `resumen-cuenta-${proveedor.nombre.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-')}`,
  );
}

// ─── Fase 17b: Comprobante de Pago ────────────────────────────

/** Descarga el Comprobante de Pago de un pago ya registrado -- documento
 * inverso a un Recibo (acá somos nosotros los que le pagamos al
 * proveedor), con el detalle de a qué comprobantes se imputó. */
export async function descargarComprobantePagoPdf(
  empresaActual: ClienteEmpresa,
  proveedor: Proveedor | undefined,
  pago: PagoCompra,
  comprobantes: ComprobanteCompra[],
  proveedorNombreFallback: string,
): Promise<void> {
  const numero = `PAG-${String(pago.numero).padStart(5, '0')}`;
  await generarComprobantePagoPdf(
    empresaParaPdf(empresaActual),
    {
      numero,
      fecha: formatDate(pago.fecha),
      pagadoA: nombreProveedorFallback(proveedor, proveedorNombreFallback),
      pagadoADocumento: proveedor ? formatCuit(proveedor.cuit) : null,
      monto: pago.monto,
      medioPagoLabel: MEDIO_PAGO_COMPRA_LABEL[pago.medioPago],
      imputaciones: pago.imputaciones.map((imp) => {
        const comp = comprobantes.find((c) => c.id === imp.comprobanteId);
        return {
          comprobante: comp ? numeroLegitimoComprobante(comp) : 'Comprobante eliminado',
          montoImputado: imp.montoImputado,
        };
      }),
      lineasPago: (pago.lineasPago ?? []).map((linea) => ({
        medioPagoLabel: MEDIO_PAGO_COMPRA_LABEL[linea.medioPago],
        monto: linea.monto,
        detalle:
          linea.medioPago === 'cheque'
            ? `N.º ${linea.chequeNumero ?? '—'} · ${linea.chequeBanco ?? '—'}${linea.chequeFechaPago ? ` · vence ${formatDate(linea.chequeFechaPago)}` : ''}`
            : null,
      })),
      notas: pago.notas ?? null,
    },
    numero,
  );
}
