// ============================================================
// Módulo Home Keep — helpers de descarga de PDF
// Clon adaptado de compras/lib/pdfComprobantes.ts: mismo motor
// compartido que Ventas/Compras (src/lib/comprobantes-pdf), recortado a
// los tres documentos que aplican a Home Keep (no hay Orden de Compra ni
// Pedido de Cotización acá): Comprobante, Resumen de cuenta de
// Proveedor, y Comprobante de Pago.
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
import { formatCuit, formatDate, formatNumero, PREFIJO_COMPROBANTE } from './format';
import type {
  Comprobante,
  Proveedor,
  Pago,
} from '../types';
import { TIPO_COMPROBANTE_LABEL, MEDIO_PAGO_LABEL } from '../types';

export function empresaParaPdf(empresaActual: ClienteEmpresa): EmpresaParaPdf {
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

/** El número que identifica a un comprobante frente al proveedor es el
 * suyo -- el que viene impreso en la factura física
 * (`numeroComprobanteProveedor`), no nuestro correlativo interno (FC-00009),
 * que solo es un ID de nuestra tabla de Supabase. Se usa este número
 * legítimo en el Resumen de cuenta y en el Comprobante de Pago; si por
 * algún motivo el comprobante no lo tiene cargado, se cae al correlativo
 * interno para no dejar la celda vacía. */
function numeroLegitimoComprobante(c: Comprobante): string {
  return c.numeroComprobanteProveedor?.trim() || formatNumero(PREFIJO_COMPROBANTE[c.tipo], c.numero);
}

/** Descarga el PDF de un Comprobante (Factura/Nota de crédito/Nota de
 * débito recibida de un proveedor). */
export async function descargarComprobantePdf(
  empresaActual: ClienteEmpresa,
  proveedor: Proveedor | undefined,
  comp: Comprobante,
  proveedorNombreFallback: string,
): Promise<void> {
  const numero = formatNumero(PREFIJO_COMPROBANTE[comp.tipo], comp.numero);
  await generarComprobantePdf(
    empresaParaPdf(empresaActual),
    {
      tipoLabel: TIPO_COMPROBANTE_LABEL[comp.tipo],
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

// ─── Resumen de cuenta ─────────────────────────────────────────

/** Arma la lista cronológica de movimientos (comprobantes + pagos) de un
 * proveedor para el Resumen de cuenta -- factura/nota de débito suman al
 * "Debe" (aumentan lo que le debemos), nota de crédito y pagos van al
 * "Haber" (lo disminuyen). Los comprobantes anulados no cuentan. */
function construirMovimientosProveedor(
  proveedorId: string,
  comprobantes: Comprobante[],
  pagos: Pago[],
): MovimientoResumenCuenta[] {
  type MovimientoConFecha = MovimientoResumenCuenta & { _orden: string };

  const deComprobantes: MovimientoConFecha[] = comprobantes
    .filter((c) => c.proveedorId === proveedorId && c.estado !== 'anulado')
    .map((c) => ({
      fecha: formatDate(c.fecha),
      comprobante: numeroLegitimoComprobante(c),
      detalle: TIPO_COMPROBANTE_LABEL[c.tipo],
      debe: c.tipo === 'nota_credito' ? undefined : c.total,
      haber: c.tipo === 'nota_credito' ? c.total : undefined,
      _orden: `${c.fecha}T${c.createdAt}`,
    }));

  const dePagos: MovimientoConFecha[] = pagos
    .filter((p) => p.proveedorId === proveedorId)
    .map((p) => ({
      fecha: formatDate(p.fecha),
      comprobante: `PAG-${String(p.numero).padStart(5, '0')}`,
      detalle: MEDIO_PAGO_LABEL[p.medioPago],
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
  comprobantes: Comprobante[],
  pagos: Pago[],
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

// ─── Comprobante de Pago ───────────────────────────────────────

/** Descarga el Comprobante de Pago de un pago ya registrado -- documento
 * inverso a un Recibo (acá somos nosotros los que le pagamos al
 * proveedor), con el detalle de a qué comprobantes se imputó.
 *
 * `soloBase64`: en vez de descargar, devuelve el PDF en base64 -- para
 * mandarlo como adjunto real por WhatsApp (mismo patrón que Compras). */
export async function descargarComprobantePagoPdf(
  empresaActual: ClienteEmpresa,
  proveedor: Proveedor | undefined,
  pago: Pago,
  comprobantes: Comprobante[],
  proveedorNombreFallback: string,
  soloBase64 = false,
): Promise<void | string> {
  const numero = `PAG-${String(pago.numero).padStart(5, '0')}`;
  return generarComprobantePagoPdf(
    empresaParaPdf(empresaActual),
    {
      numero,
      fecha: formatDate(pago.fecha),
      pagadoA: nombreProveedorFallback(proveedor, proveedorNombreFallback),
      pagadoADocumento: proveedor ? formatCuit(proveedor.cuit) : null,
      monto: pago.monto,
      medioPagoLabel: MEDIO_PAGO_LABEL[pago.medioPago],
      imputaciones: pago.imputaciones.map((imp) => {
        const comp = comprobantes.find((c) => c.id === imp.comprobanteId);
        return {
          comprobante: comp ? numeroLegitimoComprobante(comp) : 'Comprobante eliminado',
          montoImputado: imp.montoImputado,
        };
      }),
      lineasPago: (pago.lineasPago ?? []).map((linea) => ({
        medioPagoLabel: MEDIO_PAGO_LABEL[linea.medioPago],
        monto: linea.monto,
        detalle:
          linea.medioPago === 'cheque'
            ? `N.º ${linea.chequeNumero ?? '—'} · ${linea.chequeBanco ?? '—'}${linea.chequeFechaPago ? ` · vence ${formatDate(linea.chequeFechaPago)}` : ''}`
            : null,
      })),
      notas: pago.notas ?? null,
    },
    numero,
    soloBase64,
  );
}

/** Variante de `descargarComprobantePagoPdf` que devuelve el PDF en
 * base64 en vez de descargarlo. */
export function generarComprobantePagoPdfBase64(
  empresaActual: ClienteEmpresa,
  proveedor: Proveedor | undefined,
  pago: Pago,
  comprobantes: Comprobante[],
  proveedorNombreFallback: string,
): Promise<string> {
  return descargarComprobantePagoPdf(
    empresaActual,
    proveedor,
    pago,
    comprobantes,
    proveedorNombreFallback,
    true,
  ) as Promise<string>;
}
