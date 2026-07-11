// ============================================================
// WSAA -- Web Service de Autenticación y Autorización (ARCA/AFIP)
// Edgy Gestión · Fase 11
//
// Responsable de obtener el "Ticket de Acceso" (TA: token + sign) que
// después necesita cualquier otro web service de ARCA (WSFEv1 en
// nuestro caso). El TA dura 12hs -- se cachea en
// edgy_gestion.clientes_arca_config (ta_token/ta_sign/ta_expiracion)
// para no volver a autenticar en cada comprobante.
//
// Referencia: manual del desarrollador WSAA de ARCA/AFIP
// https://www.afip.gob.ar/ws/documentacion/wsaa.asp
//
// No hace nada de acceso a Supabase acá a propósito -- recibe el
// certificado/clave ya resueltos y devuelve el TA nuevo; quien llama
// (arca-autorizar-comprobante.js) decide cómo cachearlo.
// ============================================================

import forge from 'node-forge'
import soap from 'soap'

export const WSAA_WSDL = {
  homologacion: 'https://wsaahomo.afip.gov.ar/ws/services/LoginCms?wsdl',
  produccion: 'https://wsaa.afip.gov.ar/ws/services/LoginCms?wsdl',
}

/** Formatea una fecha como ISO8601 con offset explícito (+00:00 en vez
 * de "Z") -- WSAA acepta ambos, pero varias implementaciones de
 * referencia usan el offset explícito, así que seguimos esa convención
 * para minimizar sorpresas. */
function isoConOffset(d) {
  return d.toISOString().replace('Z', '+00:00')
}

/** Arma el XML del "Login Ticket Request" que hay que firmar. */
export function construirLoginTicketRequest(servicio) {
  const ahora = new Date()
  // Margen de 10 minutos para tolerar diferencia de reloj entre este
  // servidor y ARCA (recomendado en la documentación de WSAA).
  const generacion = new Date(ahora.getTime() - 10 * 60 * 1000)
  const expiracion = new Date(ahora.getTime() + 10 * 60 * 1000)
  const uniqueId = Math.floor(ahora.getTime() / 1000)

  return (
    '<?xml version="1.0" encoding="UTF-8"?>' +
    '<loginTicketRequest version="1.0">' +
    '<header>' +
    `<uniqueId>${uniqueId}</uniqueId>` +
    `<generationTime>${isoConOffset(generacion)}</generationTime>` +
    `<expirationTime>${isoConOffset(expiracion)}</expirationTime>` +
    '</header>' +
    `<service>${servicio}</service>` +
    '</loginTicketRequest>'
  )
}

/**
 * Firma el XML del LTR con CMS (PKCS#7 SignedData), usando el
 * certificado y la clave privada del cliente (en PEM). Devuelve el
 * resultado en base64, listo para mandar como parámetro `in0` de
 * loginCms.
 */
export function firmarLoginTicketRequest(xml, certificadoPem, clavePrivadaPem) {
  let cert
  let privateKey
  try {
    cert = forge.pki.certificateFromPem(certificadoPem)
    privateKey = forge.pki.privateKeyFromPem(clavePrivadaPem)
  } catch (err) {
    throw new Error(
      'No se pudo leer el certificado o la clave privada de ARCA (formato PEM inválido): ' +
        (err?.message ?? err),
    )
  }

  const p7 = forge.pkcs7.createSignedData()
  p7.content = forge.util.createBuffer(xml, 'utf8')
  p7.addCertificate(cert)
  p7.addSigner({
    key: privateKey,
    certificate: cert,
    digestAlgorithm: forge.pki.oids.sha256,
    authenticatedAttributes: [
      { type: forge.pki.oids.contentType, value: forge.pki.oids.data },
      { type: forge.pki.oids.messageDigest },
      { type: forge.pki.oids.signingTime, value: new Date() },
    ],
  })
  p7.sign({ detached: false })

  const der = forge.asn1.toDer(p7.toAsn1()).getBytes()
  return forge.util.encode64(der)
}

/** Extrae token/sign/expirationTime del XML de loginTicketResponse. */
export function parsearTicketAcceso(xml) {
  const token = /<token>([\s\S]*?)<\/token>/.exec(xml)?.[1]
  const sign = /<sign>([\s\S]*?)<\/sign>/.exec(xml)?.[1]
  const expirationTime = /<expirationTime>([\s\S]*?)<\/expirationTime>/.exec(xml)?.[1]

  if (!token || !sign) {
    throw new Error('WSAA no devolvió token/sign. Respuesta cruda: ' + xml)
  }

  return { token, sign, expiracion: expirationTime ?? null }
}

/**
 * Ida y vuelta completa contra WSAA: firma el LTR y llama a loginCms.
 * `modo` es 'homologacion' | 'produccion'. Devuelve { token, sign,
 * expiracion }.
 */
export async function autenticarWsaa({ servicio, modo, certificadoPem, clavePrivadaPem }) {
  const wsdl = WSAA_WSDL[modo]
  if (!wsdl) throw new Error(`Modo ARCA inválido: ${modo}`)

  const xml = construirLoginTicketRequest(servicio)
  const cms = firmarLoginTicketRequest(xml, certificadoPem, clavePrivadaPem)

  const client = await soap.createClientAsync(wsdl)
  let resultado
  try {
    ;[resultado] = await client.loginCmsAsync({ in0: cms })
  } catch (err) {
    // WSAA devuelve el detalle del rechazo (ej: "CMS ya fue utilizado",
    // "certificado no coincide con clave", "token ya vigente para el
    // servicio") en el fault SOAP -- lo dejamos pasar tal cual para que
    // quien llama pueda mostrarlo/loguearlo.
    throw new Error('WSAA rechazó la autenticación: ' + (err?.message ?? err))
  }

  const xmlRespuesta = resultado?.loginCmsReturn
  if (!xmlRespuesta) {
    throw new Error('WSAA no devolvió loginCmsReturn. Respuesta: ' + JSON.stringify(resultado))
  }

  return parsearTicketAcceso(xmlRespuesta)
}

/**
 * true si el TA cacheado sigue vigente (con 5 minutos de margen antes
 * del vencimiento real, para no arriesgarnos a que expire a mitad de
 * una llamada a WSFEv1).
 */
export function ticketVigente(taExpiracionIso) {
  if (!taExpiracionIso) return false
  const expiracion = new Date(taExpiracionIso).getTime()
  if (Number.isNaN(expiracion)) return false
  return expiracion - Date.now() > 5 * 60 * 1000
}
