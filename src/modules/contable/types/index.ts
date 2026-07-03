// Modelo de dominio del Módulo Contable.
// Ver Diseno_Modulo_Contable.md para el razonamiento completo. A diferencia
// de Tesorería/Ventas/Compras (localStorage), Contable es Supabase-backed
// desde el día uno -- los asientos necesitan persistencia real y
// auditabilidad (ver 0014_modulo_contable.sql).

export type TipoCuenta = 'activo' | 'pasivo' | 'patrimonio_neto' | 'ingreso' | 'costo' | 'gasto'

export const TIPOS_CUENTA: { value: TipoCuenta; label: string }[] = [
  { value: 'activo', label: 'Activo' },
  { value: 'pasivo', label: 'Pasivo' },
  { value: 'patrimonio_neto', label: 'Patrimonio Neto' },
  { value: 'ingreso', label: 'Ingreso' },
  { value: 'costo', label: 'Costo' },
  { value: 'gasto', label: 'Gasto' },
]

export function tipoCuentaLabel(tipo: TipoCuenta): string {
  return TIPOS_CUENTA.find((t) => t.value === tipo)?.label ?? tipo
}

export interface CuentaContable {
  id: string
  codigo: string
  nombre: string
  tipo: TipoCuenta
  cuentaPadreId: string | null
  // Solo las cuentas "hoja" (imputable=true) reciben movimientos directos.
  imputable: boolean
  activa: boolean
  createdAt: string
}

export type OrigenAsiento = 'manual' | 'modelo' | 'cierre' | 'ajuste_inflacion'

export function origenAsientoLabel(origen: OrigenAsiento): string {
  switch (origen) {
    case 'manual':
      return 'Manual'
    case 'modelo':
      return 'Desde modelo'
    case 'cierre':
      return 'Cierre de ejercicio'
    case 'ajuste_inflacion':
      return 'Ajuste por inflación'
  }
}

export interface LineaAsiento {
  id: string
  cuentaId: string
  debe: number
  haber: number
  centroCosto?: string
  descripcion?: string
}

export interface Asiento {
  id: string
  numero: number
  fecha: string // ISO date (yyyy-mm-dd)
  descripcion: string
  origen: OrigenAsiento
  origenId?: string
  createdAt: string
  lineas: LineaAsiento[]
}

/** Línea nueva en edición (sin id todavía, se genera al guardar). */
export interface LineaAsientoInput {
  cuentaId: string
  debe: number
  haber: number
  centroCosto?: string
  descripcion?: string
}

export interface AsientoInput {
  fecha: string
  descripcion: string
  lineas: LineaAsientoInput[]
}

// ─── Asientos modelo (plantillas reutilizables) ────────────────────────────

export interface LineaAsientoModelo {
  id: string
  cuentaId: string
  debe: number
  haber: number
  descripcion?: string
}

export interface AsientoModelo {
  id: string
  nombre: string
  descripcion: string
  createdAt: string
  lineas: LineaAsientoModelo[]
}

// ─── Libros y estados contables (vistas calculadas, no se persisten) ──────

export interface MovimientoLibroDiario {
  asientoId: string
  numero: number
  fecha: string
  descripcion: string
  origen: OrigenAsiento
  lineas: { cuentaCodigo: string; cuentaNombre: string; debe: number; haber: number }[]
}

export interface MovimientoLibroMayor {
  asientoId: string
  numero: number
  fecha: string
  descripcion: string
  debe: number
  haber: number
  saldoAcumulado: number
}

export interface FilaBalanceGeneral {
  cuentaId: string
  codigo: string
  nombre: string
  nivel: number
  imputable: boolean
  saldo: number
}

export interface BalanceGeneral {
  activo: FilaBalanceGeneral[]
  pasivo: FilaBalanceGeneral[]
  patrimonioNeto: FilaBalanceGeneral[]
  totalActivo: number
  totalPasivo: number
  totalPatrimonioNeto: number
  // totalActivo debería ser igual a (totalPasivo + totalPatrimonioNeto) --
  // si no coincide, hay un desbalance real en algún asiento (no debería
  // pasar nunca gracias a la validación de partida doble, pero se expone
  // para poder detectarlo si algún dato se cargó fuera de la app).
  diferencia: number
}

export interface FilaEstadoResultado {
  cuentaId: string
  codigo: string
  nombre: string
  nivel: number
  imputable: boolean
  monto: number
}

export interface EstadoResultado {
  ingresos: FilaEstadoResultado[]
  costos: FilaEstadoResultado[]
  gastos: FilaEstadoResultado[]
  totalIngresos: number
  totalCostos: number
  totalGastos: number
  resultado: number
}

export interface ContableState {
  cuentas: CuentaContable[]
  asientos: Asiento[]
  modelos: AsientoModelo[]
}
