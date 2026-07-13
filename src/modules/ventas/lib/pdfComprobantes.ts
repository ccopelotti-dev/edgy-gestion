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
import type { Cliente as ClienteEmpresa } from '@/types';
import { formatDate, formatNumero, PREFIJO_COMPROBANTE } from './format';
import type { Cliente, Comprobante, Presupuesto } from '../types';
import { CONSUMIDOR_FINAL_ID, labelTipoComprobante } from '../types';

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
