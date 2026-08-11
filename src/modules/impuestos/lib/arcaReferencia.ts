// Tablas de referencia oficiales de ARCA (Anexo I, Libro IVA Digital)
// -- son datos fijos publicados por el organismo, no configuración
// del cliente, así que viven como constantes en código y no como
// tablas en la base (mismo criterio que ALIC_IVA_ID en
// netlify/functions/lib/arca-wsfev1.js, que ya usa Fase 11 para
// pedir el CAE -- acá se reusa la misma correspondencia %→id, solo
// que formateada como código de 4 dígitos para el TXT).
//
// Fuente: afip.gob.ar/iva/documentos/Libro-IVA-Digital-Tablas-del-Sistema.pdf
// (bajado y verificado en la investigación de Fase 34, agosto 2026).

/** % de IVA -> código ARCA de 4 dígitos (tabla "Alícuotas del IVA"). */
export const CODIGO_ALICUOTA_IVA: Record<number, string> = {
  0: '0003',
  10.5: '0004',
  21: '0005',
  27: '0006',
  5: '0008',
  2.5: '0009',
}

/**
 * Subconjunto de la tabla oficial "Tipo de Comprobante" relevante
 * para un comercio/PyME estándar -- la tabla completa tiene ~80
 * códigos incluyendo rubros muy específicos (avícola, pesquero,
 * tabacalero, granos) que no tiene sentido ofrecer en un Select. Si
 * un cliente puntual necesita un código fuera de esta lista, el campo
 * en la base (`tipo_comprobante_codigo`) es texto libre -- se puede
 * cargar a mano sin romper nada.
 */
export const TIPOS_COMPROBANTE_ARCA = [
  { codigo: '001', descripcion: 'Facturas A', letra: 'A' },
  { codigo: '002', descripcion: 'Notas de Débito A', letra: 'A' },
  { codigo: '003', descripcion: 'Notas de Crédito A', letra: 'A' },
  { codigo: '004', descripcion: 'Recibos A', letra: 'A' },
  { codigo: '006', descripcion: 'Facturas B', letra: 'B' },
  { codigo: '007', descripcion: 'Notas de Débito B', letra: 'B' },
  { codigo: '008', descripcion: 'Notas de Crédito B', letra: 'B' },
  { codigo: '009', descripcion: 'Recibos B', letra: 'B' },
  { codigo: '011', descripcion: 'Facturas C', letra: 'C' },
  { codigo: '012', descripcion: 'Notas de Débito C', letra: 'C' },
  { codigo: '013', descripcion: 'Notas de Crédito C', letra: 'C' },
  { codigo: '015', descripcion: 'Recibos C', letra: 'C' },
  { codigo: '051', descripcion: 'Facturas M', letra: 'M' },
  { codigo: '052', descripcion: 'Notas de Débito M', letra: 'M' },
  { codigo: '053', descripcion: 'Notas de Crédito M', letra: 'M' },
  { codigo: '019', descripcion: 'Facturas de Exportación', letra: 'E' },
  { codigo: '020', descripcion: 'Notas de Débito por Operaciones con el Exterior', letra: 'E' },
  { codigo: '021', descripcion: 'Notas de Crédito por Operaciones con el Exterior', letra: 'E' },
  { codigo: '081', descripcion: 'Tique Factura A (controlador fiscal)', letra: 'A' },
  { codigo: '082', descripcion: 'Tique Factura B (controlador fiscal)', letra: 'B' },
  { codigo: '111', descripcion: 'Tique Factura C (controlador fiscal)', letra: 'C' },
] as const

export type LetraComprobante = 'A' | 'B' | 'C' | 'M' | 'E'

export function letraDeCodigoComprobante(codigo: string | null): LetraComprobante | null {
  return (TIPOS_COMPROBANTE_ARCA.find((t) => t.codigo === codigo)?.letra as LetraComprobante) ?? null
}

/**
 * Regla general de crédito fiscal computable para un Responsable
 * Inscripto: Factura/ND/NC/Recibo A y M discriminan IVA y generan
 * crédito fiscal; B y C no discriminan IVA (el emisor es
 * monotributista o factura a consumidor final) y en general NO
 * generan crédito fiscal computable. Export (E) queda fuera de este
 * cálculo (no lleva IVA argentino). Esta es una regla general -- hay
 * excepciones puntuales (ej. RG específicas por actividad) que quedan
 * fuera del alcance de este beta; el campo queda editable a mano por
 * si un caso concreto no encaja.
 */
export function generaCreditoFiscal(codigo: string | null): boolean {
  const letra = letraDeCodigoComprobante(codigo)
  return letra === 'A' || letra === 'M'
}

/** Tabla "Código de Documento" -- solo los relevantes para un
 * comercio (CUIT/CUIL/DNI/Consumidor Final). La tabla completa
 * incluye variantes provinciales de cédula de identidad en desuso. */
export const CODIGOS_DOCUMENTO = [
  { codigo: '80', descripcion: 'CUIT' },
  { codigo: '86', descripcion: 'CUIL' },
  { codigo: '96', descripcion: 'DNI' },
  { codigo: '94', descripcion: 'Pasaporte' },
  { codigo: '99', descripcion: 'Consumidor Final / Venta global diaria' },
] as const

/** Tabla "Código de Operación" -- cuándo un comprobante no lleva IVA
 * discriminado por el motivo que sea. */
export const CODIGOS_OPERACION = [
  { codigo: 'A', descripcion: 'No alcanzado' },
  { codigo: 'E', descripcion: 'Operaciones exentas' },
  { codigo: 'N', descripcion: 'No gravado' },
  { codigo: 'X', descripcion: 'Exportación / Importación al exterior' },
  { codigo: 'Z', descripcion: 'Exportación / Importación a zona franca' },
  { codigo: 'C', descripcion: 'Operación canje' },
  { codigo: 'D', descripcion: 'Devolución IVA turistas extranjeros' },
] as const
