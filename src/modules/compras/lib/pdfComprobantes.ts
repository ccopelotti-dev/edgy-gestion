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

// Fase 58 (30/08, a pedido de Carlos): antes esta función solo mapeaba
// nombre/cuit/direccion/telefono/logoUrl/colorMarca -- por eso Cotización,
// Comprobante de Compra y Orden de Compra salían "pelados" (sin WhatsApp/
// Instagram/Sitio web ni IIBB/Inicio de actividades) comparados con
// Presupuesto (Ventas), que ya mapeaba todo esto desde Fase 38b. Ahora
// mapea los mismos campos que `empresaParaPdf` de Ventas -- mismo objeto
// `ClienteEmpresa`, los datos ya estaban ahí, solo faltaba pasarlos.
function empresaParaPdf(empresaActual: ClienteEmpresa): EmpresaParaPdf {
  return {
    nombre: empresaActual.nombre,
    cuit: empresaActual.cuit,
    direccion: empresaActual.direccion,
    telefono: empresaActual.telefono,
    logoUrl: empresaActual.logo_url,
    colorMarca: empresaActual.color_marca,
    titular: empresaActual.titular,
    ingresosBrutosCondicion: empresaActual.ingresos_brutos_condicion,
    ingresosBrutosNumero: empresaActual.ingresos_brutos_numero,
    inicioActividades: empresaActual.inicio_actividades,
    provincia: empresaActual.provincia,
    mostrarIibbAlicuota: empresaActual.mostrar_iibb_alicuota,
    iibbAlicuota: empresaActual.iibb_alicuota,
    sitioWeb: empresaActual.sitio_web,
    instagram: empresaActual.instagram,
    whatsappComercial: empresaActual.whatsapp_comercial,
    sitioWebIconoUrl: empresaActual.sitio_web_icono_url,
    instagramIconoUrl: empresaActual.instagram_icono_url,
    whatsappIconoUrl: empresaActual.whatsapp_icono_url,
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
  // Fase 58 (30/08, a pedido de Carlos): dirección del punto de venta
  // "por defecto"/Casa Central del cliente -- Compras no tiene ningún
  // punto de venta propio asociado (una compra no es "de un local" en
  // particular, a diferencia de una venta), así que el llamador
  // (Comprobantes.tsx) resuelve este dato una sola vez a partir de
  // `useClienteActual().puntosVenta` y lo pasa acá.
  direccionCasaCentral: string | null = null,
): Promise<void> {
  const numero = formatNumero(PREFIJO_COMPROBANTE_COMPRA[comp.tipo], comp.numero);
  await generarComprobantePdf(
    empresaParaPdf(empresaActual),
    {
      tipoLabel: TIPO_COMPROBANTE_COMPRA_LABEL[comp.tipo],
      numero,
      fecha: formatDate(comp.fecha),
      // Fase 58d (30/08, a pedido de Carlos): "Proveedor", no "Cliente" --
      // mismo criterio que ya tenían Orden de compra y Cotización (Fase
      // 45f/tarea #57), pero a este documento se le había pasado por alto.
      clienteLabel: 'Proveedor',
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
      puntoVentaDireccion: direccionCasaCentral,
    },
    numero,
  );
}

/** Descarga el PDF de una Orden de compra (documento para mandarle al
 * proveedor, no tiene IVA discriminado -- eso llega recién con el
 * comprobante que el proveedor emite en respuesta).
 *
 * `soloBase64` (Fase 50e, 28/08): en vez de descargar, devuelve el PDF
 * en base64 -- para mandarlo como adjunto real por WhatsApp (agente
 * como canal de salida), igual que ya hace Presupuestos en Ventas. */
export async function descargarOrdenCompraPdf(
  empresaActual: ClienteEmpresa,
  proveedor: Proveedor | undefined,
  oc: OrdenCompra,
  proveedorNombreFallback: string,
  soloBase64 = false,
  // Fase 58: ver comentario homólogo en `descargarComprobanteCompraPdf`.
  direccionCasaCentral: string | null = null,
): Promise<void | string> {
  const numero = formatNumero('OC', oc.numero);
  return generarComprobantePdf(
    empresaParaPdf(empresaActual),
    {
      tipoLabel: 'Orden de compra',
      numero,
      fecha: formatDate(oc.fecha),
      clienteLabel: 'Proveedor',
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
      puntoVentaDireccion: direccionCasaCentral,
    },
    numero,
    1,
    soloBase64,
  );
}

/** Fase 50e: variante de `descargarOrdenCompraPdf` que devuelve el PDF
 * en base64 en vez de descargarlo -- ver comentario homólogo en
 * ventas/lib/pdfComprobantes.ts (generarPresupuestoPdfBase64). */
export function generarOrdenCompraPdfBase64(
  empresaActual: ClienteEmpresa,
  proveedor: Proveedor | undefined,
  oc: OrdenCompra,
  proveedorNombreFallback: string,
  direccionCasaCentral: string | null = null,
): Promise<string> {
  return descargarOrdenCompraPdf(empresaActual, proveedor, oc, proveedorNombreFallback, true, direccionCasaCentral) as Promise<string>;
}

/** Descarga el PDF de un Pedido de cotización (lo que se le manda al
 * proveedor para que cotice, no un documento que el proveedor emite).
 *
 * `soloBase64` (Fase 50e): ver comentario homólogo en
 * `descargarOrdenCompraPdf` más arriba. */
export async function descargarCotizacionPdf(
  empresaActual: ClienteEmpresa,
  proveedor: Proveedor | undefined,
  cot: PedidoCotizacion,
  proveedorNombreFallback: string,
  soloBase64 = false,
  // Fase 58: ver comentario homólogo en `descargarComprobanteCompraPdf`.
  direccionCasaCentral: string | null = null,
): Promise<void | string> {
  const numero = formatNumero('COT', cot.numero);
  return generarComprobantePdf(
    empresaParaPdf(empresaActual),
    {
      tipoLabel: 'Pedido de cotización',
      numero,
      fecha: formatDate(cot.fecha),
      clienteLabel: 'Proveedor',
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
      puntoVentaDireccion: direccionCasaCentral,
      // Fase 58c (30/08, a pedido de Carlos): frase de apertura fija --
      // ver comentario en ComprobanteParaPdf.textoIntroductorio.
      textoIntroductorio: 'Sr. proveedor, solicito la cotización de los siguientes productos y/o servicios:',
    },
    numero,
    1,
    soloBase64,
  );
}

/** Fase 50e: variante de `descargarCotizacionPdf` que devuelve el PDF
 * en base64 en vez de descargarlo. */
export function generarCotizacionPdfBase64(
  empresaActual: ClienteEmpresa,
  proveedor: Proveedor | undefined,
  cot: PedidoCotizacion,
  proveedorNombreFallback: string,
  direccionCasaCentral: string | null = null,
): Promise<string> {
  return descargarCotizacionPdf(empresaActual, proveedor, cot, proveedorNombreFallback, true, direccionCasaCentral) as Promise<string>;
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
  // Fase 50e (28/08): ver comentario homólogo en Ventas/pdfComprobantes.ts.
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
    soloBase64,
  );
}

/** Fase 50e: variante de `descargarComprobantePagoPdf` que devuelve el
 * PDF en base64 en vez de descargarlo. */
export function generarComprobantePagoPdfBase64(
  empresaActual: ClienteEmpresa,
  proveedor: Proveedor | undefined,
  pago: PagoCompra,
  comprobantes: ComprobanteCompra[],
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
