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

/**
 * Medios que se liquidan en una cuenta bancaria (no en el cajón de efectivo).
 * Un movimiento de caja con uno de estos medios genera un asiento bancario espejo.
 */
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

/** Movimiento de caja (journal operativo de tesorería). */
export interface CajaMovement {
  id: string
  fecha: string // ISO aaaa-mm-dd
  tipo: MovementType
  concepto: string
  categoria: string
  medioPago: PaymentMethod
  monto: number // siempre positivo; el signo lo da `tipo`
  /** Cuenta destino cuando el medio se liquida en banco. */
  cuentaId?: string
  /** Vínculo con el asiento bancario espejo (ver `BankMovement.linkId`). */
  linkId?: string
}

/** Origen de un movimiento bancario: alta directa, espejo de caja o cobro de cheque. */
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
  /** Identificador compartido con el movimiento de origen (caja o cheque). */
  linkId?: string
  /** De dónde proviene este asiento. Por defecto 'manual'. */
  origen?: BankMovementOrigin
}

export type ChequeKind = 'recibido' | 'emitido'

export type ChequeEstado =
  | 'en_cartera'
  | 'depositado'
  | 'cobrado'
  | 'rechazado'

/** Estados aplicables a cada tipo de cheque. */
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
  // Emitido: pasivo flotante "cheques a pagar" hasta que se debita.
  emitido: [
    { value: 'en_cartera', label: 'A pagar' },
    { value: 'cobrado', label: 'Pagado' },
    { value: 'rechazado', label: 'Anulado' },
  ],
}

/** Etiqueta de un estado según el tipo de cheque. */
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
  librador: string // recibido: quién lo emite; emitido: beneficiario
  fechaRecepcion: string
  fechaCobro: string // fecha de pago / vencimiento
  monto: number
  estado: ChequeEstado
  /** Recibido: cuenta donde se deposita/cobra. */
  cuentaDepositoId?: string
  /** Emitido: cuenta propia contra la que se libra (se debita al pagarse). */
  cuentaOrigenId?: string
  notas?: string
  /** Vínculo con el asiento bancario generado al cobrar/pagar el cheque. */
  bankMovLinkId?: string
}

export interface TreasuryState {
  cajaMovements: CajaMovement[]
  bankAccounts: BankAccount[]
  bankMovements: BankMovement[]
  cheques: Cheque[]
}
