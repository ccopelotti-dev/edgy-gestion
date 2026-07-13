// ============================================================
// Módulo Compras — helpers de descarga de PDF
// Edgy Gestión · Fase 17 (auditoría e ícono de descarga PDF en listados)
//
// Mismo motor compartido que Ventas (src/lib/comprobantes-pdf), con
// el proveedor en el lugar del "cliente" del PDF -- el motor no le
// pone ninguna etiqueta fija a ese campo, así que es reutilizable tal
// cual. Cubre los tres documentos de Compras que ya tienen sus datos
// completos en memoria: Comprobantes, Órdenes de compra y Pedidos de
// cotización.
// ============================================================

import {
  generarComprobantePdf,
  type EmpresaParaPdf,
} from '@/lib/comprobantes-pdf/generarComprobantePdf';
import type { Cliente as ClienteEmpresa } from '@/types';
import { formatDate, formatNumero, PREFIJO_COMPROBANTE_COMPRA } from './format';
import type {
  ComprobanteCompra,
  OrdenCompra,
  PedidoCotizacion,
  Proveedor,
} from '../types';
import { TIPO_COMPROBANTE_COMPRA_LABEL } from '../types';

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
