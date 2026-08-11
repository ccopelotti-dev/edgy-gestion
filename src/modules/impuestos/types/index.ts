// Tipos del módulo Impuestos (Fase 34) -- Libro IVA (reporte sobre
// Ventas/Compras existentes), posición mensual, retenciones y
// percepciones. Mismo criterio que el resto: tipos propios acá.

export interface LineaAlicuota {
  alicuota: number
  netoGravado: number
  iva: number
}

export interface ComprobanteLibroIva {
  id: string
  fecha: string
  tipoComprobanteCodigo: string | null
  puntoVenta: number | null
  numero: number
  sujetoNombre: string
  sujetoDocumento: string | null
  condicionIva: string | null
  netoGravado: number
  exento: number
  totalIva: number
  total: number
  alicuotas: LineaAlicuota[]
  /** Solo compras: si este comprobante computa crédito fiscal según
   * su letra (A/M sí, B/C no -- ver lib/arcaReferencia.ts). */
  creditoFiscalComputable?: boolean
  /** Solo compras: numeración propia del proveedor tal como se cargó
   * en Compras (Fase 18), ej "0001-00001234". Se usa para separar
   * punto de venta y número al exportar el TXT del Libro IVA Digital. */
  numeroComprobanteProveedor?: string | null
}

export interface ResumenLibroIva {
  periodo: string
  cantidadComprobantes: number
  totalNetoGravado: number
  totalExento: number
  totalIva: number
  totalGeneral: number
  /** Solo compras: suma de IVA de comprobantes que sí computan
   * crédito fiscal (excluye B/C). */
  totalCreditoFiscalComputable?: number
  porAlicuota: LineaAlicuota[]
  comprobantes: ComprobanteLibroIva[]
}

export type TipoRetencionPercepcion = 'retencion' | 'percepcion'
export type DireccionRetencionPercepcion = 'sufrida' | 'practicada'
export type ImpuestoRetencionPercepcion = 'iva' | 'ganancias' | 'iibb' | 'suss' | 'otro'

export const IMPUESTO_LABEL: Record<ImpuestoRetencionPercepcion, string> = {
  iva: 'IVA',
  ganancias: 'Ganancias',
  iibb: 'Ingresos Brutos',
  suss: 'SUSS',
  otro: 'Otro',
}

export interface RetencionPercepcion {
  id: string
  clienteId: string
  fecha: string
  periodo: string
  tipo: TipoRetencionPercepcion
  direccion: DireccionRetencionPercepcion
  impuesto: ImpuestoRetencionPercepcion
  sujetoNombre: string
  sujetoDocumento: string | null
  numeroCertificado: string | null
  baseCalculo: number | null
  alicuota: number | null
  monto: number
  comprobanteVentaId: string | null
  comprobanteCompraId: string | null
  notas: string | null
  createdAt: string
}

export interface PosicionIvaMensual {
  id: string
  clienteId: string
  periodo: string
  debitoFiscal: number
  creditoFiscal: number
  retencionesPercepcionesSufridas: number
  saldoTecnicoAnterior: number
  saldoTecnico: number
  saldoLibreDisponibilidad: number
  cerrado: boolean
  createdAt: string
}
