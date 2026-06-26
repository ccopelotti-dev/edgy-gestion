// Modelo de dominio del Módulo de Tesorería.

export type MovementType = 'ingreso' | 'egreso'

export type PaymentMethod =
  | 'efectivo'
  | 'transferencia'
  | 'cheque'
  | 'tarjeta'
  | 'mercadopago'

export const PAYMENT_METHODS: { value: PaymentMethod; label: string }[] = [
  { value: 'efectivo', label: 'Efectivo' },
  { value: 'transferencia', label: 'Transferencia' },
  { value: 'cheque', label: 'Cheque' },
  { value: 'tarjeta', label: 'Tarjeta' },
  { value: 'mercadopago', label: 'MercadoPago' },
]

export const BANK_SETTLED_METHODS: PaymentMethod[] = [
  'transferencia',
  'tarjeta',
  'mercadopago',
]

export function isBankSettled(method: PaymentMethod): boolean {
  return BANK_SETTLED_METHODS.includes(method)
}

export const CATEGORIES: { value: string; type: MovementType | 'ambos' }[] = [
  { value: 'Ventas', type: 'ingreso' },
  { value: 'Cobranza clientes', type: 'ingreso' },
  { value: 'Aporte de socios', type: 'ingreso' },
  { value: 'Reintegros', type: 'ingreso' },
  { value: 'Otros ingresos', type: 'ingreso' },
  { value: 'Pago a proveedores', type: 'egreso' },
  { value: 'Sueldos y jornales', type: 'egreso' },
  { value: 'Cargas sociales', type: 'egreso' },
  { value: 'Impuestos (AFIP/ARCA)', type: 'egreso' },
  { value: 'Servicios', type: 'egreso' },
  { value: 'Alquiler', type: 'egreso' },
  { value: 'Mercadería', type: 'egreso' },
  { value: 'Gastos varios', type: 'egreso' },
]

export interface CajaMovement {
  id: string
  fecha: string
  tipo: MovementType
  concepto: string
  categoria: string
  medioPago: PaymentMethod
  monto: number
  cuentaId?: string
  linkId?: string
}

export type BankMovementOrigin = 'manual' | 'caja' | 'cheque'
export type AccountKind = 'cuenta_corriente' | 'caja_ahorro'

export interface BankAccount {
  id: string
  banco: string
  alias: string
  numero: string
  cbu: string
  tipo: AccountKind
  moneda: 'ARS' | 'USD'
  saldoInicial: number
}

export interface BankMovement {
  id: string
  cuentaId: string
  fecha: string
  tipo: MovementType
  concepto: string
  categoria: string
  medioPago: PaymentMethod
  monto: number
  linkId?: string
  origen?: BankMovementOrigin
}

export type ChequeKind = 'recibido' | 'emitido'

export type ChequeEstado =
  | 'en_cartera'
  | 'depositado'
  | 'cobrado'
  | 'rechazado'

export const CHEQUE_ESTADOS_POR_TIPO: Record<
  ChequeKind,
  { value: ChequeEstado; label: string }[]
> = {
  recibido: [
    { value: 'en_cartera', label: 'En cartera' },
    { value: 'depositado', label: 'Depositado' },
    { value: 'cobrado', label: 'Cobrado' },
    { value: 'rechazado', label: 'Rechazado' },
  ],
  emitido: [
    { value: 'en_cartera', label: 'A pagar' },
    { value: 'cobrado', label: 'Pagado' },
    { value: 'rechazado', label: 'Anulado' },
  ],
}

export function chequeEstadoLabel(
  estado: ChequeEstado,
  tipo: ChequeKind,
): string {
  return (
    CHEQUE_ESTADOS_POR_TIPO[tipo].find((e) => e.value === estado)?.label ??
    estado
  )
}

export interface Cheque {
  id: string
  tipo: ChequeKind
  numero: string
  banco: string
  librador: string
  fechaRecepcion: string
  fechaCobro: string
  monto: number
  estado: ChequeEstado
  cuentaDepositoId?: string
  cuentaOrigenId?: string
  notas?: string
  bankMovLinkId?: string
}

export interface TreasuryState {
  cajaMovements: CajaMovement[]
  bankAccounts: BankAccount[]
  bankMovements: BankMovement[]
  cheques: Cheque[]
}
