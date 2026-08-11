// Export TXT del Libro IVA Digital -- Anexo I "Diseños de Registro"
// (AFIP/ARCA, oficial). Genera los 5 archivos de ancho fijo que se
// suben al Portal IVA para importar el período de una:
//   LIBRO_IVA_DIGITAL_VENTAS_CBTE / _ALICUOTAS
//   LIBRO_IVA_DIGITAL_COMPRAS_CBTE / _ALICUOTAS
//   LIBRO_IVA_DIGITAL_CBTES_VENTAS_ANULADOS
//
// Fuente: afip.gob.ar/iva/documentos/libro-iva-digital-diseno-registros.pdf
// (bajado y verificado en la investigación de Fase 34, agosto 2026).
// Cada línea termina en \r\n (estándar de estos archivos de ARCA).
//
// Convenciones del formato (todas las líneas):
//   - Campos numéricos: right-justified, rellenos con CEROS a la izquierda.
//   - Campos alfanuméricos: left-justified, rellenos con ESPACIOS a la derecha.
//   - Importes: sin punto decimal (13 enteros + 2 decimales concatenados).
//   - Fechas: AAAAMMDD.
//   - No hay campo de signo -- los importes van siempre en positivo,
//     el signo lo determina el tipo de comprobante (una Nota de
//     Crédito ya tiene su propio código, 003/008/013/etc).

import type { ComprobanteLibroIva } from '../types'
import { CODIGO_ALICUOTA_IVA } from './arcaReferencia'

function num(valor: number | string, longitud: number): string {
  return String(valor).replace(/\D/g, '').padStart(longitud, '0').slice(-longitud)
}

function alfa(valor: string | null | undefined, longitud: number): string {
  return (valor ?? '').slice(0, longitud).padEnd(longitud, ' ')
}

/** Importe en pesos -> 13 enteros + 2 decimales concatenados, sin
 * punto ni signo (ej 1234.5 -> "0000000123450"). */
function importe(valor: number): string {
  const centavos = Math.round(Math.abs(valor) * 100)
  return String(centavos).padStart(15, '0')
}

function fechaAAAAMMDD(iso: string): string {
  return iso.replace(/-/g, '').slice(0, 8)
}

/** "0001-00001234" -> { puntoVenta: 1, numero: 1234 }. Si no matchea
 * el formato esperado (proveedor sin numeración estándar cargada),
 * cae a puntoVenta 0 y el número interno del comprobante -- mejor
 * que romper el export completo por un dato faltante. */
function parsearNumeroProveedor(texto: string | null | undefined, fallbackNumero: number): { puntoVenta: number; numero: number } {
  const match = (texto ?? '').match(/^(\d{1,5})-(\d{1,20})$/)
  if (match) return { puntoVenta: Number(match[1]), numero: Number(match[2]) }
  return { puntoVenta: 0, numero: fallbackNumero }
}

function codigoOperacion(c: ComprobanteLibroIva): string {
  const hayGravado = c.alicuotas.some((a) => a.netoGravado > 0)
  if (hayGravado) return ' '
  if (c.exento > 0) return 'E'
  return ' '
}

// ─── Ventas ──────────────────────────────────────────────────

export function lineaVentasCabecera(c: ComprobanteLibroIva): string {
  const tipoCodigo = (c.tipoComprobanteCodigo ?? '000').padStart(3, '0')
  const puntoVenta = c.puntoVenta ?? 0
  return [
    fechaAAAAMMDD(c.fecha),
    num(tipoCodigo, 3),
    num(puntoVenta, 5),
    num(c.numero, 20),
    num(c.numero, 20), // "hasta" -- un solo comprobante, mismo número
    num(c.condicionIva ? '80' : '99', 2), // si no hay CUIT cargado, se asume consumidor final
    num(c.sujetoDocumento ?? '0', 20),
    alfa(c.sujetoNombre, 30),
    importe(c.total),
    importe(0), // conceptos que no integran el neto gravado
    importe(0), // percepción a no categorizados
    importe(c.exento),
    importe(0), // percepciones/pagos a cuenta imp. nacionales
    importe(0), // percepciones IIBB
    importe(0), // percepciones municipales
    importe(0), // impuestos internos
    alfa('PES', 3),
    num('0001000000', 10), // tipo de cambio 1:1 (todo en pesos)
    num(String(c.alicuotas.length || 0), 1),
    codigoOperacion(c),
    importe(0), // otros tributos
    ' '.repeat(8), // fecha de vencimiento/pago -- no se completa en v1
  ].join('')
}

export function lineasVentasAlicuotas(c: ComprobanteLibroIva): string[] {
  const tipoCodigo = (c.tipoComprobanteCodigo ?? '000').padStart(3, '0')
  const puntoVenta = c.puntoVenta ?? 0
  return c.alicuotas.map((a) =>
    [
      num(tipoCodigo, 3),
      num(puntoVenta, 5),
      num(c.numero, 20),
      importe(a.netoGravado),
      alfa(CODIGO_ALICUOTA_IVA[a.alicuota] ?? '0000', 4),
      importe(a.iva),
    ].join(''),
  )
}

// ─── Compras ─────────────────────────────────────────────────

export function lineaComprasCabecera(c: ComprobanteLibroIva): string {
  const tipoCodigo = (c.tipoComprobanteCodigo ?? '000').padStart(3, '0')
  const { puntoVenta, numero } = parsearNumeroProveedor(c.numeroComprobanteProveedor, c.numero)
  const creditoFiscal = c.creditoFiscalComputable ? c.totalIva : 0
  return [
    fechaAAAAMMDD(c.fecha),
    num(tipoCodigo, 3),
    num(puntoVenta, 5),
    num(numero, 20),
    ' '.repeat(16), // despacho de importación -- no aplica
    num('80', 2), // CUIT del proveedor
    num(c.sujetoDocumento ?? '0', 20),
    alfa(c.sujetoNombre, 30),
    importe(c.total),
    importe(0),
    importe(c.exento),
    importe(0),
    importe(0),
    importe(0),
    importe(0),
    importe(0),
    alfa('PES', 3),
    num('0001000000', 10),
    num(String(c.alicuotas.length || 0), 1),
    codigoOperacion(c),
    importe(creditoFiscal),
    importe(0), // otros tributos
    num('0', 11), // CUIT emisor/corredor -- no aplica (compra directa)
    alfa('', 30),
    importe(0), // IVA comisión
  ].join('')
}

export function lineasComprasAlicuotas(c: ComprobanteLibroIva): string[] {
  const tipoCodigo = (c.tipoComprobanteCodigo ?? '000').padStart(3, '0')
  const { puntoVenta, numero } = parsearNumeroProveedor(c.numeroComprobanteProveedor, c.numero)
  return c.alicuotas.map((a) =>
    [
      num(tipoCodigo, 3),
      num(puntoVenta, 5),
      num(numero, 20),
      num('80', 2),
      num(c.sujetoDocumento ?? '0', 20),
      importe(a.netoGravado),
      alfa(CODIGO_ALICUOTA_IVA[a.alicuota] ?? '0000', 4),
      importe(a.iva),
    ].join(''),
  )
}

// ─── Archivos completos ──────────────────────────────────────

const SALTO = '\r\n'

export function generarArchivoVentasCabecera(comprobantes: ComprobanteLibroIva[]): string {
  return comprobantes.map(lineaVentasCabecera).join(SALTO) + SALTO
}

export function generarArchivoVentasAlicuotas(comprobantes: ComprobanteLibroIva[]): string {
  return comprobantes.flatMap(lineasVentasAlicuotas).join(SALTO) + SALTO
}

export function generarArchivoComprasCabecera(comprobantes: ComprobanteLibroIva[]): string {
  return comprobantes.map(lineaComprasCabecera).join(SALTO) + SALTO
}

export function generarArchivoComprasAlicuotas(comprobantes: ComprobanteLibroIva[]): string {
  return comprobantes.flatMap(lineasComprasAlicuotas).join(SALTO) + SALTO
}

// ─── Comprobantes anulados ─────────────────────────────────────
// Registro de 44 caracteres: Fecha(8) + Tipo comprobante(3) +
// Punto de venta(5) + Número de comprobante(20) + Fecha de
// anulación(8). Se usa tanto para Ventas como para Compras --
// misma solapa "Comprobantes Anulados" en el Portal IVA.

export interface ComprobanteAnulado {
  fecha: string
  tipoComprobanteCodigo: string
  puntoVenta: number
  numero: number
  fechaAnulacion: string
}

export function lineaComprobanteAnulado(c: ComprobanteAnulado): string {
  return [
    fechaAAAAMMDD(c.fecha),
    num((c.tipoComprobanteCodigo ?? '000').padStart(3, '0'), 3),
    num(c.puntoVenta, 5),
    num(c.numero, 20),
    fechaAAAAMMDD(c.fechaAnulacion),
  ].join('')
}

export function generarArchivoComprobantesAnulados(anulados: ComprobanteAnulado[]): string {
  return anulados.map(lineaComprobanteAnulado).join(SALTO) + SALTO
}

export function descargarTxt(contenido: string, nombreArchivo: string): void {
  const blob = new Blob([contenido], { type: 'text/plain;charset=ascii' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = nombreArchivo
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}
