// Tipos del módulo Gastos Fijos y Fiscales (Fase 33) -- Sueldos +
// Alquiler y Servicios (+ a futuro, Impuestos). Mismo criterio que el
// resto de los módulos: tipos propios acá, no en src/types/index.ts.

// ─── Sueldos ──────────────────────────────────────────────────

export interface Empleado {
  id: string
  clienteId: string
  nombre: string
  cuil: string | null
  fechaIngreso: string // YYYY-MM-DD
  categoria: string | null
  sueldoBasico: number
  activo: boolean
  createdAt: string
}

// Todos los valores son porcentajes, salvo seguroVidaMonto y
// artMontoFijo que son importes fijos mensuales. Son de referencia --
// hay que confirmarlos con el contador de cada cliente antes de
// emitir recibos reales (ver comentario en la migración 0079).
export interface AlicuotasLiquidacion {
  jubilacion_empleado: number
  ley19032_empleado: number
  obra_social_empleado: number
  sindical_empleado: number
  seguro_vida_monto: number
  sipa_patronal: number
  fondo_nacional_empleo_patronal: number
  asignaciones_familiares_patronal: number
  obra_social_patronal: number
  art_alicuota: number
  art_monto_fijo: number
  sindical_patronal: number
  camara_patronal: number
}

export const ALICUOTAS_LABEL: Record<keyof AlicuotasLiquidacion, string> = {
  jubilacion_empleado: 'Jubilación (empleado)',
  ley19032_empleado: 'Ley 19.032 / PAMI (empleado)',
  obra_social_empleado: 'Obra social (empleado)',
  sindical_empleado: 'Cuota sindical (empleado)',
  seguro_vida_monto: 'Seguro de vida -- 1/3 prima (importe fijo)',
  sipa_patronal: 'SIPA (contribución patronal)',
  fondo_nacional_empleo_patronal: 'Fondo Nacional de Empleo (patronal)',
  asignaciones_familiares_patronal: 'Asignaciones Familiares (patronal)',
  obra_social_patronal: 'Obra social (patronal)',
  art_alicuota: 'ART -- alícuota %',
  art_monto_fijo: 'ART -- cuota fija (importe)',
  sindical_patronal: 'Aportes sindicales (patronal)',
  camara_patronal: 'Cámara / entidad empresarial (patronal)',
}

export type TipoConceptoRecibo = 'remunerativo' | 'deduccion' | 'contribucion_patronal'
export type RubroContribucion = 'sindical' | 'seguridad_social' | 'obra_social' | 'pami' | 'art' | 'camaras' | 'otros'
export type EstadoRecibo = 'borrador' | 'emitido'

export const RUBRO_CONTRIBUCION_LABEL: Record<RubroContribucion, string> = {
  sindical: 'Sindical',
  seguridad_social: 'Seguridad social',
  obra_social: 'Obra social',
  pami: 'PAMI (INSSJP)',
  art: 'ART',
  camaras: 'Cámaras empresariales',
  otros: 'Otros',
}

export interface ReciboConcepto {
  id: string
  reciboId: string
  tipo: TipoConceptoRecibo
  rubro: RubroContribucion | null
  concepto: string
  baseCalculo: number | null
  monto: number
  orden: number
}

export interface ReciboSueldo {
  id: string
  clienteId: string
  empleadoId: string
  numero: number
  periodo: string // 'YYYY-MM'
  fechaPago: string | null
  estado: EstadoRecibo
  presentismo: boolean
  esRectificativa: boolean
  reciboOriginalId: string | null
  totalRemunerativo: number
  totalDeducciones: number
  neto: number
  totalContribucionesPatronales: number
  pagado: boolean
  fechaPagoReal: string | null
  createdAt: string
  // Sumado en el hook al traer el listado (join con empleados) -- no
  // son columnas de esta tabla.
  empleadoNombre?: string
  empleadoCuil?: string | null
  empleadoCategoria?: string | null
  empleadoFechaIngreso?: string
  conceptos?: ReciboConcepto[]
}

// ─── Alquiler y Servicios ─────────────────────────────────────

export type TipoGastoFijo = 'alquiler' | 'luz' | 'gas' | 'internet' | 'telefonia' | 'otro'
export type EstadoGastoFijo = 'pendiente' | 'pagado' | 'vencido'

export const TIPO_GASTO_FIJO_LABEL: Record<TipoGastoFijo, string> = {
  alquiler: 'Alquiler',
  luz: 'Luz',
  gas: 'Gas',
  internet: 'Internet',
  telefonia: 'Telefonía',
  otro: 'Otro',
}

export const ESTADO_GASTO_FIJO_LABEL: Record<EstadoGastoFijo, string> = {
  pendiente: 'Pendiente',
  pagado: 'Pagado',
  vencido: 'Vencido',
}

export interface GastoFijo {
  id: string
  clienteId: string
  concepto: string
  tipo: TipoGastoFijo
  proveedor: string | null
  periodo: string // 'YYYY-MM'
  monto: number
  vencimiento: string | null
  fechaPago: string | null
  estado: EstadoGastoFijo
  comprobantePath: string | null
  createdAt: string
}
