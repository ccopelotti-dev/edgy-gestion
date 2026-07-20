// ============================================================
// Módulo Ventas — helpers de descarga de PDF
// Edgy Gestión · Fase 17 (auditoría e ícono de descarga PDF en listados)
//
// Antes de esta fase, la descarga de PDF (motor compartido en
// src/lib/comprobantes-pdf) solo estaba conectada en el panel
// expandido de Comprobantes.tsx. Se factoriza acá la construcción del
// `ComprobanteParaPdf` a partir de un `Comprobante` o un `Presupuesto`
// para poder ofrecer el mismo ícono de descarga en cualquier listado
// que ya tenga los datos completos en memoria (Comprobantes.tsx,
// Dashboard.tsx "Últimos comprobantes", Presupuestos.tsx) sin repetir
// el mapeo en cada uno.
// ============================================================

import {
  generarComprobantePdf,
  type EmpresaParaPdf,
} from '@/lib/comprobantes-pdf/generarComprobantePdf';
import {
  generarResumenCuentaPdf,
  type MovimientoResumenCuenta,
} from '@/lib/comprobantes-pdf/generarResumenCuentaPdf';
import { generarReciboPdf } from '@/lib/comprobantes-pdf/generarReciboPdf';
import type { Cliente as ClienteEmpresa } from '@/types';
import { formatCuit, formatDate, formatNumero, PREFIJO_COMPROBANTE } from './format';
import type { Cliente, Cobro, Comprobante, Presupuesto } from '../types';
import { CONSUMIDOR_FINAL_ID, MEDIO_PAGO_LABEL, labelTipoComprobante } from '../types';

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

/** Descarga el PDF de un Comprobante (Factura/Recibo/Nota) -- mismo
 * mapeo que ya usaba Comprobantes.tsx, ahora reutilizable desde
 * cualquier listado que tenga el Comprobante completo en memoria. */
export async function descargarComprobantePdf(
  empresaActual: ClienteEmpresa,
  cliente: Cliente | undefined,
  comp: Comprobante,
  clienteNombreFallback: string,
): Promise<void> {
  await generarComprobantePdf(
    empresaParaPdf(empresaActual),
    {
      tipoLabel: labelTipoComprobante(comp.tipo, comp.modoEmision),
      numero: formatNumero(PREFIJO_COMPROBANTE[comp.tipo], comp.numero),
      fecha: formatDate(comp.fecha),
      clienteNombre: cliente?.nombre ?? clienteNombreFallback,
      clienteDocumento:
        cliente && cliente.id !== CONSUMIDOR_FINAL_ID ? cliente.documento : null,
      items: comp.items.map((i) => ({
        descripcion: i.descripcion,
        cantidad: i.cantidad,
        precioUnitario: i.precioUnitario,
        subtotal: i.subtotal,
      })),
      subtotal: comp.subtotal,
      descuentoGeneral: comp.descuentoGeneral,
      montoIva: comp.montoIva,
      total: comp.total,
      fechaIso: comp.fecha,
      afip:
        comp.afip?.resultado === 'A' &&
        comp.afip.cae &&
        comp.afip.vencimientoCae &&
        comp.afip.tipoComprobanteAfip !== undefined &&
        comp.afip.numeroComprobante !== undefined
          ? {
              cae: comp.afip.cae,
              vencimientoCae: comp.afip.vencimientoCae,
              puntoVenta: comp.afip.puntoVenta,
              tipoComprobanteAfip: comp.afip.tipoComprobanteAfip,
              numeroComprobante: comp.afip.numeroComprobante,
              docTipoReceptor: comp.afip.docTipoReceptor,
            }
          : undefined,
    },
    formatNumero(PREFIJO_COMPROBANTE[comp.tipo], comp.numero),
  );
}

/** Descarga el PDF de un Presupuesto -- mismo motor, sin IVA
 * discriminado por línea (los presupuestos de Edgy no lo calculan) ni
 * datos de ARCA (nunca tiene CAE). */
export async function descargarPresupuestoPdf(
  empresaActual: ClienteEmpresa,
  cliente: Cliente | undefined,
  presupuesto: Presupuesto,
  clienteNombreFallback: string,
): Promise<void> {
  const numero = `PRE-${String(presupuesto.numero).padStart(5, '0')}`;
  await generarComprobantePdf(
    empresaParaPdf(empresaActual),
    {
      tipoLabel: 'Presupuesto',
      numero,
      fecha: formatDate(presupuesto.fecha),
      clienteNombre: cliente?.nombre ?? clienteNombreFallback,
      clienteDocumento:
        cliente && cliente.id !== CONSUMIDOR_FINAL_ID ? cliente.documento : null,
      items: presupuesto.items.map((i) => ({
        descripcion: i.descripcion,
        cantidad: i.cantidad,
        precioUnitario: i.precioUnitario,
        subtotal: i.subtotal,
      })),
      subtotal: presupuesto.subtotal,
      descuentoGeneral: presupuesto.descuentoGeneral,
      total: presupuesto.total,
      notas: presupuesto.notas ?? presupuesto.condiciones ?? null,
    },
    numero,
  );
}

// ─── Resumen de cuenta ────────────────────────────────────────
// Mismo motor compartido que Compras > Proveedores (Fase 17b, task
// #170) -- ver src/modules/compras/lib/pdfComprobantes.ts. El cliente
// va en el lugar del "proveedor" del PDF; el motor no le pone ninguna
// etiqueta fija a ese campo, así que es reutilizable tal cual.

/** Arma la lista cronológica de movimientos (comprobantes + cobros) de un
 * cliente para el Resumen de cuenta -- factura suma al "Debe" (aumenta
 * lo que nos debe), nota de crédito y cobros van al "Haber" (lo
 * disminuyen). Los comprobantes anulados no cuentan: nunca llegaron a
 * afectar el saldo real. */
function construirMovimientosCliente(
  clienteId: string,
  comprobantes: Comprobante[],
  cobros: Cobro[],
): MovimientoResumenCuenta[] {
  type MovimientoConFecha = MovimientoResumenCuenta & { _orden: string };

  const deComprobantes: MovimientoConFecha[] = comprobantes
    .filter((c) => c.clienteId === clienteId && c.estado !== 'anulado')
    .map((c) => ({
      fecha: formatDate(c.fecha),
      comprobante: formatNumero(PREFIJO_COMPROBANTE[c.tipo], c.numero),
      detalle: labelTipoComprobante(c.tipo, c.modoEmision),
      debe: c.tipo === 'nota_credito' ? undefined : c.total,
      haber: c.tipo === 'nota_credito' ? c.total : undefined,
      _orden: `${c.fecha}T${c.createdAt}`,
    }));

  const deCobros: MovimientoConFecha[] = cobros
    .filter((co) => co.clienteId === clienteId)
    .map((co) => ({
      fecha: formatDate(co.fecha),
      comprobante: `COB-${String(co.numero).padStart(5, '0')}`,
      detalle: MEDIO_PAGO_LABEL[co.medioPago],
      haber: co.monto,
      _orden: `${co.fecha}T${co.createdAt}`,
    }));

  return [...deComprobantes, ...deCobros]
    .sort((a, b) => a._orden.localeCompare(b._orden))
    .map(({ _orden, ...mov }) => mov);
}

/** Descarga el Resumen de cuenta clásico de un cliente -- ledger con
 * todos sus comprobantes y cobros históricos, saldo corriente fila a
 * fila y saldo final (el mismo `cliente.saldoCuentaCorriente`). */
export async function descargarResumenCuentaClientePdf(
  empresaActual: ClienteEmpresa,
  cliente: Cliente,
  comprobantes: Comprobante[],
  cobros: Cobro[],
): Promise<void> {
  const movimientos = construirMovimientosCliente(cliente.id, comprobantes, cobros);
  await generarResumenCuentaPdf(
    empresaParaPdf(empresaActual),
    {
      entidadNombre: cliente.nombre,
      entidadDocumento: cliente.id !== CONSUMIDOR_FINAL_ID ? formatCuit(cliente.documento) : undefined,
      saldoInicial: 0,
      movimientos,
      saldoFinal: cliente.saldoCuentaCorriente,
    },
    `resumen-cuenta-${cliente.nombre.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-')}`,
  );
}

// ─── Recibo (Comprobante de Cobro) ────────────────────────────
// Documento inverso al Comprobante de Pago de Compras -- ver
// src/lib/comprobantes-pdf/generarReciboPdf.ts.

/** Descarga el Recibo de un cobro ya registrado -- con el detalle de a
 * qué comprobantes se imputó. */
export async function descargarReciboPdf(
  empresaActual: ClienteEmpresa,
  cliente: Cliente | undefined,
  cobro: Cobro,
  comprobantes: Comprobante[],
  clienteNombreFallback: string,
): Promise<void> {
  const numero = `COB-${String(cobro.numero).padStart(5, '0')}`;
  await generarReciboPdf(
    empresaParaPdf(empresaActual),
    {
      numero,
      fecha: formatDate(cobro.fecha),
      recibidoDe: cliente?.nombre ?? clienteNombreFallback,
      recibidoDeDocumento:
        cliente && cliente.id !== CONSUMIDOR_FINAL_ID ? formatCuit(cliente.documento) : null,
      monto: cobro.monto,
      medioPagoLabel: MEDIO_PAGO_LABEL[cobro.medioPago],
      imputaciones: cobro.imputaciones.map((imp) => {
        const comp = comprobantes.find((c) => c.id === imp.comprobanteId);
        return {
          comprobante: comp ? formatNumero(PREFIJO_COMPROBANTE[comp.tipo], comp.numero) : 'Comprobante eliminado',
          montoImputado: imp.montoImputado,
        };
      }),
      notas: cobro.notas ?? null,
    },
    numero,
  );
}
