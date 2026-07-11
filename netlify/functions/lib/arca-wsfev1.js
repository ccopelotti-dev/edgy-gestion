// ============================================================
// WSFEv1 -- Web Service de Facturación Electrónica v1 (ARCA/AFIP)
// Edgy Gestión · Fase 11
//
// Cliente para las dos operaciones que necesitamos:
//  - FECompUltimoAutorizado: último número autorizado para un punto de
//    venta + tipo de comprobante (ARCA numera de forma independiente a
//    nuestro `Comprobante.numero` interno -- hay que preguntarle a
//    ARCA cuál es el próximo número válido antes de pedir el CAE).
//  - FECAESolicitar: pide el CAE (Código de Autorización Electrónico)
//    para un comprobante. Puede aprobar (Resultado 'A') o rechazar
//    (Resultado 'R', con Observaciones detallando el motivo).
//
// Referencia: manual del desarrollador WSFEv1
// https://www.afip.gob.ar/fe/documentos/manual-desarrollador-ARCA-COMPG-v4-0.pdf
//
// IMPORTANTE -- este mapeo de campos se armó contra la documentación
// pública de ARCA, sin poder probarlo todavía contra el entorno de
// homologación real (no tenemos credenciales de un cliente real
// todavía -- ver Fase 11 en el histórico de tareas). Es esperable que
// la primera prueba real contra homologación tire algún rechazo por
// algún campo que haya que ajustar (típicamente Concepto,
// CondicionIVAReceptorId u otro campo opcional según el tipo de
// comprobante) -- no es señal de que el diseño esté mal, es lo normal
// en cualquier integración con ARCA.
// ============================================================

import soap from 'soap'

export const WSFEV1_WSDL = {
  homologacion: 'https://wswhomo.afip.gov.ar/wsfev1/service.asmx?WSDL',
  produccion: 'https://servicios1.afip.gov.ar/wsfev1/service.asmx?WSDL',
}

// ─── Mapeos dominio Edgy -> códigos AFIP ───────────────────────────

/** CbteTipo -- tipo de comprobante AFIP, según TipoComprobante + TipoFiscal (A/B/C). */
export const CBTE_TIPO = {
  factura: { A: 1, B: 6, C: 11 },
  nota_debito: { A: 2, B: 7, C: 12 },
  nota_credito: { A: 3, B: 8, C: 13 },
}

/** DocTipo -- tipo de documento del receptor. */
export const DOC_TIPO = {
  cuit: 80,
  cuil: 86,
  dni: 96,
  otro: 99, // "Consumidor Final sin identificar" cuando no hay documento real
}

/**
 * CondicionIVAReceptorId -- condición de IVA del receptor, campo
 * requerido por ARCA en FECAESolicitar desde 2024. Códigos según la
 * tabla de parámetros de ARCA (FEParamGetCondicionIvaReceptor).
 */
export const CONDICION_IVA_RECEPTOR = {
  responsable_inscripto: 1,
  exento: 4,
  consumidor_final: 5,
  monotributista: 6,
  no_responsable: 15,
}

/** AlicIva Id -- código de alícuota de IVA. */
export const ALIC_IVA_ID = {
  0: 3,
  10.5: 4,
  21: 5,
  27: 6,
}

function fechaAfip(fechaIso) {
  // ARCA espera YYYYMMDD sin separadores.
  return fechaIso.replace(/-/g, '').slice(0, 8)
}

// ─── Cliente SOAP ───────────────────────────────────────────────────

async function crearCliente(modo) {
  const wsdl = WSFEV1_WSDL[modo]
  if (!wsdl) throw new Error(`Modo ARCA inválido: ${modo}`)
  return soap.createClientAsync(wsdl)
}

/** Último número de comprobante autorizado por ARCA para este punto de venta + tipo. */
export async function obtenerUltimoAutorizado({ modo, token, sign, cuit, puntoVenta, cbteTipo }) {
  const client = await crearCliente(modo)
  let resultado
  try {
    ;[resultado] = await client.FECompUltimoAutorizadoAsync({
      Auth: { Token: token, Sign: sign, Cuit: cuit },
      PtoVta: puntoVenta,
      CbteTipo: cbteTipo,
    })
  } catch (err) {
    throw new Error('WSFEv1 (FECompUltimoAutorizado) falló: ' + (err?.message ?? err))
  }

  const r = resultado?.FECompUltimoAutorizadoResult
  if (!r) throw new Error('WSFEv1 no devolvió FECompUltimoAutorizadoResult')
  if (r.Errors) {
    throw new Error('ARCA rechazó la consulta de numeración: ' + JSON.stringify(r.Errors))
  }
  return Number(r.CbteNro ?? 0)
}

/**
 * Arma el request de FECAESolicitar para UN comprobante (CantReg=1).
 *
 * `comprobante` ya viene con los códigos AFIP resueltos (no tipos del
 * dominio de Ventas) para mantener este archivo enfocado solo en la
 * forma del request SOAP -- el mapeo TipoComprobante/CondicionIva del
 * dominio vive en arca-autorizar-comprobante.js, que es quien conoce
 * el `Comprobante` real.
 */
export function construirFeCaeReq({
  puntoVenta,
  cbteTipo,
  concepto,
  docTipo,
  docNro,
  cbteNro,
  fechaComprobante,
  importeTotal,
  importeNeto,
  importeExento,
  importeIva,
  condicionIvaReceptorId,
  alicuotas,
}) {
  return {
    FeCabReq: {
      CantReg: 1,
      PtoVta: puntoVenta,
      CbteTipo: cbteTipo,
    },
    FeDetReq: {
      FECAEDetRequest: [
        {
          Concepto: concepto,
          DocTipo: docTipo,
          DocNro: docNro,
          CbteDesde: cbteNro,
          CbteHasta: cbteNro,
          CbteFch: fechaAfip(fechaComprobante),
          ImpTotal: Number(importeTotal.toFixed(2)),
          ImpTotConc: 0,
          ImpNeto: Number(importeNeto.toFixed(2)),
          ImpOpEx: Number(importeExento.toFixed(2)),
          ImpIVA: Number(importeIva.toFixed(2)),
          ImpTrib: 0,
          MonId: 'PES',
          MonCotiz: 1,
          CondicionIVAReceptorId: condicionIvaReceptorId,
          Iva: alicuotas.length
            ? {
                AlicIva: alicuotas.map((a) => ({
                  Id: a.id,
                  BaseImp: Number(a.baseImponible.toFixed(2)),
                  Importe: Number(a.importe.toFixed(2)),
                })),
              }
            : undefined,
        },
      ],
    },
  }
}

/** Pide el CAE. Devuelve { resultado: 'A'|'R', cae, vencimientoCae, cbteNro, observaciones }. */
export async function solicitarCae({ modo, token, sign, cuit, feCaeReq }) {
  const client = await crearCliente(modo)
  let resultado
  try {
    ;[resultado] = await client.FECAESolicitarAsync({
      Auth: { Token: token, Sign: sign, Cuit: cuit },
      FeCAEReq: feCaeReq,
    })
  } catch (err) {
    throw new Error('WSFEv1 (FECAESolicitar) falló: ' + (err?.message ?? err))
  }

  const r = resultado?.FECAESolicitarResult
  if (!r) throw new Error('WSFEv1 no devolvió FECAESolicitarResult')

  if (r.Errors) {
    throw new Error('ARCA rechazó la solicitud (nivel encabezado): ' + JSON.stringify(r.Errors))
  }

  const det = r.FeDetResp?.FECAEDetResponse
  const detalle = Array.isArray(det) ? det[0] : det
  if (!detalle) throw new Error('WSFEv1 no devolvió detalle de la solicitud de CAE')

  const observaciones = detalle.Observaciones?.Obs
    ? (Array.isArray(detalle.Observaciones.Obs) ? detalle.Observaciones.Obs : [detalle.Observaciones.Obs])
        .map((o) => `[${o.Code}] ${o.Msg}`)
        .join(' | ')
    : undefined

  return {
    resultado: detalle.Resultado, // 'A' | 'R'
    cae: detalle.CAE ?? undefined,
    vencimientoCae: detalle.CAEFchVto ?? undefined,
    cbteNro: Number(detalle.CbteDesde ?? feCaeReq.FeDetReq.FECAEDetRequest[0].CbteDesde),
    observaciones,
  }
}
