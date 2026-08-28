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
import { generarComprobantePdfClasico } from '@/lib/comprobantes-pdf/generarComprobantePdfClasico';
import {
  generarResumenCuentaPdf,
  type MovimientoResumenCuenta,
} from '@/lib/comprobantes-pdf/generarResumenCuentaPdf';
import { generarReciboPdf } from '@/lib/comprobantes-pdf/generarReciboPdf';
import { fetchFichaPorPresupuestoId } from '@/modules/fichas-medida/data/useFichasMedida';
import { dibujarDetalleRelevado } from '@/modules/fichas-medida/lib/generarFichaMedidaPdf';
import type { Cliente as ClienteEmpresa } from '@/types';
import { formatCuit, formatDate, formatNumero, PREFIJO_COMPROBANTE, conIvaIncluido } from './format';
import type { Cliente, Cobro, Comprobante, Presupuesto } from '../types';
import {
  CONDICION_IVA_LABEL,
  CONSUMIDOR_FINAL_ID,
  MEDIO_PAGO_LABEL,
  TIPO_DOCUMENTO_LABEL,
  labelTipoComprobante,
} from '../types';

// Fase 38b: forma mínima de un punto de venta que necesita el PDF --
// solo id + dirección, para no acoplar este lib al tipo completo
// (PuntoVenta de configuracion/types, o el PuntoVentaLiviano de
// useClienteActual, cualquiera de los dos calza acá tal cual).
interface PuntoVentaParaPdf {
  id: string;
  direccion: string | null;
}

// Fase 43 (20/08): exportada -- Fichas de medida ("Toma de Pedidos") la
// reusa para armar el mismo EmpresaParaPdf rico (titular/IIBB/contactos
// con pictograma) que ya usa Factura, en vez de duplicar el mapeo con
// solo los campos chicos que tenía antes.
export function empresaParaPdf(empresaActual: ClienteEmpresa): EmpresaParaPdf {
  return {
    nombre: empresaActual.nombre,
    cuit: empresaActual.cuit,
    direccion: empresaActual.direccion,
    telefono: empresaActual.telefono,
    logoUrl: empresaActual.logo_url,
    colorMarca: empresaActual.color_marca,
    // Fase 28 (cumplimiento ARCA, Anexo II RG 1415 + RG 5614/2024).
    ingresosBrutosCondicion: empresaActual.ingresos_brutos_condicion,
    ingresosBrutosNumero: empresaActual.ingresos_brutos_numero,
    inicioActividades: empresaActual.inicio_actividades,
    provincia: empresaActual.provincia,
    mostrarIibbAlicuota: empresaActual.mostrar_iibb_alicuota,
    iibbAlicuota: empresaActual.iibb_alicuota,
    // Fase 38b: nombre del titular tal como figura en ARCA (recuadro
    // emisor) + info comercial opcional (web/IG/WhatsApp).
    titular: empresaActual.titular,
    sitioWeb: empresaActual.sitio_web,
    instagram: empresaActual.instagram,
    whatsappComercial: empresaActual.whatsapp_comercial,
    // Fase 38e: ícono propio subido en Configuración > Empresa (si lo
    // hay), para no depender del pictograma genérico.
    sitioWebIconoUrl: empresaActual.sitio_web_icono_url,
    instagramIconoUrl: empresaActual.instagram_icono_url,
    whatsappIconoUrl: empresaActual.whatsapp_icono_url,
  };
}

// Fase 38 -- corte de formato: cualquier Comprobante creado ANTES de
// este momento (los que Carlos ya emitió/probó, incluidos los que ya
// tienen CAE real cargado en la base de ARCA) se sigue descargando con
// el motor Clásico (A4 vertical, el que estaba en producción). No
// tiene sentido cambiarle retroactivamente el diseño a un documento
// que ARCA ya tiene registrado con otra apariencia -- el cliente que
// lo recibió tiene esa versión en la mano. Todo lo que se cree de acá
// en adelante (los comprobantes Internos que Carlos usa para iterar el
// diseño, y cualquier factura electrónica real una vez que el diseño
// esté afinado) usa el motor nuevo (A5 apaisada, Anexo II RG 1415).
// Fix: el corte original quedó mal puesto (fin del 15/08, no inicio) --
// eso hacía que hasta los comprobantes de prueba de HOY (creados
// después del deploy) siguieran cayendo en el motor Clásico. Lo que
// hay que dejar afuera son los que ya tienen CAE real de ARCA, todos
// del 14/08 o antes -- cualquier cosa del 15/08 en adelante (incluidas
// las pruebas Internas de hoy) ya usa el motor nuevo.
const CORTE_FORMATO_A5 = '2026-08-15T03:00:00.000Z'; // inicio del 15/08/2026 en Arg. (UTC-3)

/** Descarga el PDF de un Comprobante (Factura/Recibo/Nota) -- mismo
 * mapeo que ya usaba Comprobantes.tsx, ahora reutilizable desde
 * cualquier listado que tenga el Comprobante completo en memoria. */
export async function descargarComprobantePdf(
  empresaActual: ClienteEmpresa,
  cliente: Cliente | undefined,
  comp: Comprobante,
  clienteNombreFallback: string,
  // Fase 38b: lista de puntos de venta del cliente, para resolver la
  // dirección del local que emitió ESTE comprobante (comp.puntoVentaId)
  // -- no la dirección fiscal, que dejó de publicarse en el PDF.
  // Default [] para no romper ningún llamador existente que todavía no
  // la pasa (clientes de un solo local, o código no actualizado).
  puntosVenta: PuntoVentaParaPdf[] = [],
): Promise<void> {
  const puntoVenta = comp.puntoVentaId
    ? puntosVenta.find((pv) => pv.id === comp.puntoVentaId)
    : undefined;

  const datosComprobante = {
    tipoLabel: labelTipoComprobante(comp.tipo, comp.modoEmision),
    numero: formatNumero(PREFIJO_COMPROBANTE[comp.tipo], comp.numero),
    fecha: formatDate(comp.fecha),
    clienteNombre: cliente?.nombre ?? clienteNombreFallback,
    // Fase 38h: prefijo con el tipo real de documento (CUIT/CUIL/DNI/
    // Otro) en vez de mostrar el número pelado -- Carlos lo pidió
    // explícito ("Agregar la palabra CUIT antes del número"). Se
    // resuelve acá (no en el motor de PDF) porque es este módulo el
    // que conoce `Cliente.tipoDocumento` y su tabla de labels.
    clienteDocumento:
      cliente && cliente.id !== CONSUMIDOR_FINAL_ID
        ? `${TIPO_DOCUMENTO_LABEL[cliente.tipoDocumento]} ${cliente.documento}`
        : null,
    // Fase 38b: datos de contacto/fiscales del cliente, cuando están
    // cargados -- antes el PDF solo mostraba nombre y documento.
    clienteDireccion: cliente && cliente.id !== CONSUMIDOR_FINAL_ID ? cliente.direccion ?? null : null,
    clienteTelefono: cliente && cliente.id !== CONSUMIDOR_FINAL_ID ? cliente.telefono ?? null : null,
    clienteCondicionIva:
      cliente && cliente.id !== CONSUMIDOR_FINAL_ID ? CONDICION_IVA_LABEL[cliente.condicionIva] : null,
    // Fase 38b: dirección del punto de venta que emitió el comprobante
    // (en blanco si no tiene uno asignado -- no se cae a la fiscal).
    puntoVentaDireccion: puntoVenta?.direccion ?? null,
    // Fase 38 (Anexo II RG 1415, inciso e) -- condición de venta. Solo
    // la usa el motor nuevo; el Clásico simplemente no tiene ese campo
    // en su tipo y lo ignora.
    condicionVenta: MEDIO_PAGO_LABEL[comp.medioPago],
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
    // Leyenda obligatoria de ARCA (Factura A a Monotributista) + notas
    // libres del comprobante, si las hay -- ver DatosAfip.leyendaEspecial.
    notas: [comp.notas, comp.afip?.leyendaEspecial].filter(Boolean).join(' — ') || null,
    // Fase 38: letra a mostrar en el recuadro fiscal del motor nuevo --
    // la que ya resolvió ARCA (A/B/C) una vez que hay CAE, o 'X'
    // mientras el comprobante es interno o todavía no fue autorizado.
    letraFiscal: (comp.afip?.tipoFiscal ?? 'X') as 'A' | 'B' | 'C' | 'X',
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
            tipoFiscal: comp.afip.tipoFiscal,
            condicionIvaEmisor: comp.afip.condicionIvaEmisor,
          }
        : undefined,
  };
  const nombreArchivo = formatNumero(PREFIJO_COMPROBANTE[comp.tipo], comp.numero);

  // Comparación por Date (no por string): Supabase/PostgREST puede
  // devolver el offset UTC como "Z" o como "+00:00" según el cliente,
  // y una comparación de strings cruda es frágil ante eso -- parsear
  // ambos lados a instante real es lo único que da un resultado
  // correcto siempre.
  if (new Date(comp.createdAt).getTime() < new Date(CORTE_FORMATO_A5).getTime()) {
    // Ya emitido con el diseño viejo -- se descarga igual que siempre.
    await generarComprobantePdfClasico(empresaParaPdf(empresaActual), datosComprobante, nombreArchivo);
    return;
  }

  await generarComprobantePdf(
    empresaParaPdf(empresaActual),
    datosComprobante,
    nombreArchivo,
    // Fase 38 -- 2 copias por defecto (cliente + local), definido por
    // Carlos en base a su experiencia de 20 años en gráfica. Solo
    // tiene efecto real dentro de la app de escritorio (Electron); en
    // navegador se ignora y descarga una vez, como siempre.
    2,
  );
}

/** Descarga el PDF de un Presupuesto -- mismo motor genérico que
 * Factura/Recibo, sin datos de ARCA (nunca tiene CAE).
 *
 * `ivaDefault` (Fase 42, 20/08, a pedido de Carlos): los montos que
 * guarda `Presupuesto` en la base son NETOS (misma cadena limpia que
 * Compras -> Insumo/Producto -> Fórmula, que a propósito no se toca).
 * Pero lo que el cliente tiene que VER, desde el primer presupuesto que
 * recibe, es el precio final -- el mismo número que después va a pagar
 * en la Factura, sin que le cambie por el IVA "apareciendo" recién ahí.
 * Por eso acá, al armar el PDF, cada monto se multiplica por
 * `conIvaIncluido` antes de mandarlo al motor -- nunca se discrimina el
 * IVA como línea aparte (a diferencia de Factura, que si lo hace: ese
 * es, a propósito, el ÚNICO lugar de todo el sistema donde el IVA se
 * separa del precio). El neto real sigue viviendo en la base tal cual
 * se guardó; esto es pura transformación de visualización al imprimir.
 *
 * `incluirDetalleRelevado` (Fase 41.7, 20/08, a pedido de Carlos): si el
 * presupuesto viene de una Ficha de medida de cortinas, agrega al final
 * el mismo bloque "Detalle relevado" (esquema técnico por paño) que ya
 * imprime el PDF de la Ficha -- opcional, a elección de quien lo
 * descarga (ver el segundo ícono en Presupuestos.tsx, solo visible
 * cuando existe esa ficha vinculada). Si no hay ficha vinculada, o no es
 * de tipo cortinas, el flag no tiene efecto -- el PDF sale igual que
 * siempre. */
export async function descargarPresupuestoPdf(
  empresaActual: ClienteEmpresa,
  cliente: Cliente | undefined,
  presupuesto: Presupuesto,
  clienteNombreFallback: string,
  ivaDefault: number,
  incluirDetalleRelevado = false,
  soloBase64 = false,
): Promise<void | string> {
  const numero = `PRE-${String(presupuesto.numero).padStart(5, '0')}`;

  let bloqueAdicional: Parameters<typeof generarComprobantePdf>[1]['bloqueAdicional'];
  if (incluirDetalleRelevado) {
    const ficha = await fetchFichaPorPresupuestoId(presupuesto.id);
    if (ficha) {
      const color = empresaActual.color_marca || '#0F6E56';
      bloqueAdicional = (doc, y, pageWidth, marginX) =>
        dibujarDetalleRelevado(doc, y, pageWidth, marginX, doc.internal.pageSize.getHeight() - 20, color, ficha);
    }
  }

  return generarComprobantePdf(
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
        precioUnitario: conIvaIncluido(i.precioUnitario, ivaDefault),
        subtotal: conIvaIncluido(i.subtotal, ivaDefault),
      })),
      subtotal: conIvaIncluido(presupuesto.subtotal, ivaDefault),
      descuentoGeneral: presupuesto.descuentoGeneral,
      total: conIvaIncluido(presupuesto.total, ivaDefault),
      notas: presupuesto.notas ?? presupuesto.condiciones ?? null,
      bloqueAdicional,
    },
    numero,
    1,
    soloBase64,
  );
}

/** Fase 50d: variante de `descargarPresupuestoPdf` que devuelve el PDF
 * en base64 en vez de descargarlo -- para mandarlo como adjunto real
 * por WhatsApp (`enviar-documento-whatsapp.js`) en vez de abrir un link
 * `wa.me` sin el archivo. Delega en la misma función para no duplicar
 * el armado del comprobante. */
export function generarPresupuestoPdfBase64(
  empresaActual: ClienteEmpresa,
  cliente: Cliente | undefined,
  presupuesto: Presupuesto,
  clienteNombreFallback: string,
  ivaDefault: number,
): Promise<string> {
  return descargarPresupuestoPdf(
    empresaActual,
    cliente,
    presupuesto,
    clienteNombreFallback,
    ivaDefault,
    false,
    true,
  ) as Promise<string>;
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
