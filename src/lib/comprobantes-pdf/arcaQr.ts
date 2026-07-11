// ============================================================
// QR fiscal obligatorio en comprobantes electrónicos -- ARCA/AFIP
// Edgy Gestión · Fase 11
//
// Especificación oficial ("Especificaciones del QR incluido en las
// facturas electrónicas", RG 4892/2020 AFIP/ARCA):
// https://www.afip.gob.ar/fe/qr/documentos/QRespecificaciones.pdf
//
// Solo tiene sentido para comprobantes modoEmision='electronica' que
// ya tienen CAE (Comprobante.afip.cae). Para modoEmision='interno' no
// corresponde -- no son comprobantes fiscales, no llevan QR ni CAE.
//
// Vive en src/lib (no en netlify/functions) a propósito: el motor de
// PDF corre en el browser, y todos los datos que necesita el QR
// (tipoComprobanteAfip, numeroComprobante, cae) ya quedaron guardados
// en Comprobante.afip cuando ARCA aprobó el comprobante -- no hace
// falta volver a pedirle nada a ARCA ni recalcular códigos acá.
// ============================================================

/** Datos ya resueltos que necesita el JSON del QR (ver spec de ARCA). */
export interface DatosQrFiscal {
  /** Fecha de emisión, formato YYYY-MM-DD. */
  fecha: string
  /** CUIT del emisor (el cliente de Edgy), solo dígitos. */
  cuitEmisor: string
  puntoVenta: number
  /** Código AFIP del tipo de comprobante (1=Factura A, 6=B, 11=C, etc.) */
  tipoComprobanteAfip: number
  /** Número asignado por ARCA (CbteNro), no el número interno de Edgy. */
  numeroComprobante: number
  importeTotal: number
  /** Código AFIP del tipo de documento del receptor (80=CUIT, 96=DNI, 99=CF...). */
  tipoDocumentoReceptor?: number
  numeroDocumentoReceptor?: string
  /** CAE devuelto por ARCA. */
  cae: string
}

/**
 * Arma la URL que hay que codificar en el QR del comprobante. Devuelve
 * `null` si falta algún dato obligatorio de la especificación (nunca
 * debería pasar si `datos` viene de un Comprobante ya aprobado por
 * ARCA, pero se valida igual porque el tipado de `DatosAfip` tiene
 * estos campos como opcionales).
 */
export function construirUrlQrFiscal(datos: DatosQrFiscal): string | null {
  if (!datos.cae || !datos.fecha || !datos.cuitEmisor) return null

  const payload: Record<string, unknown> = {
    ver: 1,
    fecha: datos.fecha,
    cuit: Number(datos.cuitEmisor),
    ptoVta: datos.puntoVenta,
    tipoCmp: datos.tipoComprobanteAfip,
    nroCmp: datos.numeroComprobante,
    importe: Number(datos.importeTotal.toFixed(2)),
    moneda: 'PES',
    ctz: 1,
    tipoCodAut: 'E',
    codAut: Number(datos.cae),
  }

  // "De corresponder" según la spec -- Consumidor Final sin documento
  // real no siempre viaja con tipoDocRec/nroDocRec.
  if (datos.tipoDocumentoReceptor !== undefined && datos.numeroDocumentoReceptor) {
    payload.tipoDocRec = datos.tipoDocumentoReceptor
    payload.nroDocRec = Number(datos.numeroDocumentoReceptor)
  }

  const json = JSON.stringify(payload)
  // btoa alcanza acá -- todos los valores del JSON son numéricos o
  // strings fijos en ASCII ("PES", "E"), nunca texto libre con acentos.
  const base64 = btoa(json)

  return `https://www.afip.gob.ar/fe/qr/?p=${base64}`
}
