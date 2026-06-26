import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useReducer,
  type ReactNode,
} from 'react'
import type {
  BankAccount,
  BankMovement,
  CajaMovement,
  Cheque,
  ChequeEstado,
  TreasuryState,
} from '@/types'
import { isBankSettled } from '@/types'
import { todayISO } from '@/lib/format'
import { seedState } from './seed'

// v3: cheques emitidos como pasivo flotante con débito al pagarse + vencimientos.
const STORAGE_KEY = 'edgy-tesoreria-v3'

function uid(prefix: string): string {
  return `${prefix}-${Date.now().toString(36)}-${Math.random()
    .toString(36)
    .slice(2, 7)}`
}

/** Cuenta por defecto para acreditar cobros: primera cuenta corriente, o la primera. */
function defaultDepositAccount(state: TreasuryState): string | undefined {
  const cc = state.bankAccounts.find((a) => a.tipo === 'cuenta_corriente')
  return (cc ?? state.bankAccounts[0])?.id
}

/**
 * Estados en los que el cheque ya impactó el banco:
 * - recibido: depositado/cobrado (crédito en cuenta).
 * - emitido: cobrado = pagado/debitado (egreso de la cuenta emisora).
 */
function chequeAfectaBanco(
  tipo: 'recibido' | 'emitido',
  estado: ChequeEstado,
): boolean {
  return tipo === 'recibido'
    ? estado === 'depositado' || estado === 'cobrado'
    : estado === 'cobrado'
}

type Action =
  | { type: 'ADD_CAJA'; payload: Omit<CajaMovement, 'id'> }
  | { type: 'DELETE_CAJA'; id: string }
  | { type: 'ADD_BANK_MOV'; payload: Omit<BankMovement, 'id'> }
  | { type: 'DELETE_BANK_MOV'; id: string }
  | { type: 'ADD_ACCOUNT'; payload: Omit<BankAccount, 'id'> }
  | { type: 'ADD_CHEQUE'; payload: Omit<Cheque, 'id'> }
  | {
      type: 'SET_CHEQUE_ESTADO'
      id: string
      estado: ChequeEstado
      cuentaDepositoId?: string
    }
  | { type: 'RESET' }

function reducer(state: TreasuryState, action: Action): TreasuryState {
  switch (action.type) {
    case 'ADD_CAJA': {
      const p = action.payload
      const cajaId = uid('cm')

      // Si el medio se liquida en banco y hay cuenta destino, generamos el
      // asiento bancario espejo y los vinculamos con un linkId compartido.
      if (isBankSettled(p.medioPago) && p.cuentaId) {
        const linkId = uid('lnk')
        const caja: CajaMovement = { ...p, id: cajaId, linkId }
        const bank: BankMovement = {
          id: uid('bm'),
          cuentaId: p.cuentaId,
          fecha: p.fecha,
          tipo: p.tipo,
          concepto: p.concepto,
          categoria: p.categoria,
          medioPago: p.medioPago,
          monto: p.monto,
          linkId,
          origen: 'caja',
        }
        return {
          ...state,
          cajaMovements: [caja, ...state.cajaMovements],
          bankMovements: [bank, ...state.bankMovements],
        }
      }

      return {
        ...state,
        cajaMovements: [{ ...p, id: cajaId }, ...state.cajaMovements],
      }
    }

    case 'DELETE_CAJA': {
      const mov = state.cajaMovements.find((m) => m.id === action.id)
      const linkId = mov?.linkId
      return {
        ...state,
        cajaMovements: state.cajaMovements.filter((m) => m.id !== action.id),
        bankMovements: linkId
          ? state.bankMovements.filter((m) => m.linkId !== linkId)
          : state.bankMovements,
      }
    }

    case 'ADD_BANK_MOV':
      return {
        ...state,
        bankMovements: [
          { ...action.payload, id: uid('bm'), origen: 'manual' },
          ...state.bankMovements,
        ],
      }

    case 'DELETE_BANK_MOV': {
      const mov = state.bankMovements.find((m) => m.id === action.id)
      if (!mov) return state
      let cajaMovements = state.cajaMovements
      let cheques = state.cheques
      // Al borrar un asiento vinculado, deshacemos también su contraparte.
      if (mov.linkId) {
        if (mov.origen === 'caja') {
          cajaMovements = cajaMovements.filter((m) => m.linkId !== mov.linkId)
        } else if (mov.origen === 'cheque') {
          cheques = cheques.map((c) =>
            c.bankMovLinkId === mov.linkId
              ? {
                  ...c,
                  estado: 'en_cartera',
                  bankMovLinkId: undefined,
                  cuentaDepositoId: undefined,
                }
              : c,
          )
        }
      }
      return {
        ...state,
        bankMovements: state.bankMovements.filter((m) => m.id !== action.id),
        cajaMovements,
        cheques,
      }
    }

    case 'ADD_ACCOUNT':
      return {
        ...state,
        bankAccounts: [...state.bankAccounts, { ...action.payload, id: uid('acc') }],
      }

    case 'ADD_CHEQUE':
      return {
        ...state,
        cheques: [{ ...action.payload, id: uid('chq') }, ...state.cheques],
      }

    case 'SET_CHEQUE_ESTADO': {
      const cheque = state.cheques.find((c) => c.id === action.id)
      if (!cheque) return state
      const next = action.estado
      const recibido = cheque.tipo === 'recibido'
      const wasEnBanco = chequeAfectaBanco(cheque.tipo, cheque.estado)
      const willBeEnBanco = chequeAfectaBanco(cheque.tipo, next)

      const setEstadoSolo = () => ({
        ...state,
        cheques: state.cheques.map((c) =>
          c.id === cheque.id
            ? {
                ...c,
                estado: next,
                cuentaDepositoId: action.cuentaDepositoId ?? c.cuentaDepositoId,
              }
            : c,
        ),
      })

      // Impacta el banco: recibido cobrado → ingreso; emitido pagado → egreso.
      if (willBeEnBanco && !wasEnBanco) {
        const cuentaId =
          action.cuentaDepositoId ??
          (recibido ? cheque.cuentaDepositoId : cheque.cuentaOrigenId) ??
          defaultDepositAccount(state)
        if (!cuentaId) return setEstadoSolo()

        const linkId = uid('lnk')
        const bank: BankMovement = {
          id: uid('bm'),
          cuentaId,
          fecha: todayISO(),
          tipo: recibido ? 'ingreso' : 'egreso',
          concepto: recibido
            ? `Cobro cheque N.º ${cheque.numero} — ${cheque.librador}`
            : `Pago cheque N.º ${cheque.numero} — ${cheque.librador}`,
          categoria: recibido ? 'Cobranza clientes' : 'Pago a proveedores',
          medioPago: 'cheque',
          monto: cheque.monto,
          linkId,
          origen: 'cheque',
        }
        return {
          ...state,
          bankMovements: [bank, ...state.bankMovements],
          cheques: state.cheques.map((c) =>
            c.id === cheque.id
              ? {
                  ...c,
                  estado: next,
                  bankMovLinkId: linkId,
                  ...(recibido
                    ? { cuentaDepositoId: cuentaId }
                    : { cuentaOrigenId: cuentaId }),
                }
              : c,
          ),
        }
      }

      // Revierte el asiento bancario (anulación / vuelve a cartera o a pagar).
      if (!willBeEnBanco && wasEnBanco) {
        const linkId = cheque.bankMovLinkId
        return {
          ...state,
          bankMovements: linkId
            ? state.bankMovements.filter((m) => m.linkId !== linkId)
            : state.bankMovements,
          cheques: state.cheques.map((c) =>
            c.id === cheque.id
              ? {
                  ...c,
                  estado: next,
                  bankMovLinkId: undefined,
                  // Recibido vuelto a cartera: limpia la cuenta de depósito.
                  cuentaDepositoId:
                    recibido && next === 'en_cartera'
                      ? undefined
                      : c.cuentaDepositoId,
                }
              : c,
          ),
        }
      }

      // Transición sin cambio de impacto bancario.
      return setEstadoSolo()
    }

    case 'RESET':
      return seedState

    default:
      return state
  }
}

function init(): TreasuryState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw) return JSON.parse(raw) as TreasuryState
  } catch {
    /* ignore */
  }
  return seedState
}

interface TreasuryContextValue {
  state: TreasuryState
  dispatch: React.Dispatch<Action>
}

const TreasuryContext = createContext<TreasuryContextValue | null>(null)

export function TreasuryProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(reducer, undefined, init)

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state))
    } catch {
      /* ignore */
    }
  }, [state])

  const value = useMemo(() => ({ state, dispatch }), [state])
  return (
    <TreasuryContext.Provider value={value}>
      {children}
    </TreasuryContext.Provider>
  )
}

export function useTreasury() {
  const ctx = useContext(TreasuryContext)
  if (!ctx) throw new Error('useTreasury debe usarse dentro de TreasuryProvider')
  return ctx
}

// ---- Selectores derivados ----

export function signedAmount(m: {
  tipo: 'ingreso' | 'egreso'
  monto: number
}): number {
  return m.tipo === 'ingreso' ? m.monto : -m.monto
}

/**
 * Saldo de caja = solo efectivo (el cajón físico). Los movimientos con medios
 * que se liquidan en banco viven en sus cuentas, no en caja, para no duplicar
 * fondos en la disponibilidad consolidada.
 */
export function useSaldoCaja(): number {
  const { state } = useTreasury()
  return useMemo(
    () =>
      state.cajaMovements
        .filter((m) => m.medioPago === 'efectivo')
        .reduce((acc, m) => acc + signedAmount(m), 0),
    [state.cajaMovements],
  )
}

/** Saldo de una cuenta bancaria = saldo inicial + movimientos. */
export function accountBalance(
  account: BankAccount,
  movements: BankMovement[],
): number {
  return movements
    .filter((m) => m.cuentaId === account.id)
    .reduce((acc, m) => acc + signedAmount(m), account.saldoInicial)
}

export function useBankTotals() {
  const { state } = useTreasury()
  return useMemo(() => {
    const balances = state.bankAccounts.map((acc) => ({
      account: acc,
      balance: accountBalance(acc, state.bankMovements),
    }))
    const total = balances.reduce((acc, b) => acc + b.balance, 0)
    return { balances, total }
  }, [state.bankAccounts, state.bankMovements])
}

const sumMonto = (arr: Cheque[]) => arr.reduce((a, c) => a + c.monto, 0)

export function useChequeTotals() {
  const { state } = useTreasury()
  return useMemo(() => {
    const recibidos = state.cheques.filter((c) => c.tipo === 'recibido')
    const enCartera = recibidos.filter((c) => c.estado === 'en_cartera')
    const depositados = recibidos.filter((c) => c.estado === 'depositado')
    const rechazados = recibidos.filter((c) => c.estado === 'rechazado')
    // Pasivo flotante: cheques emitidos pendientes de pago.
    const aPagar = state.cheques.filter(
      (c) => c.tipo === 'emitido' && c.estado === 'en_cartera',
    )
    return {
      enCarteraValor: sumMonto(enCartera),
      enCarteraCount: enCartera.length,
      depositadosValor: sumMonto(depositados),
      depositadosCount: depositados.length,
      rechazadosValor: sumMonto(rechazados),
      rechazadosCount: rechazados.length,
      aPagarValor: sumMonto(aPagar),
      aPagarCount: aPagar.length,
    }
  }, [state.cheques])
}

/** Resumen por estado para un tipo de cheque (alimenta KPIs y filtros). */
export function useChequeResumen(tipo: 'recibido' | 'emitido') {
  const { state } = useTreasury()
  return useMemo(() => {
    const within = state.cheques.filter((c) => c.tipo === tipo)
    const byEstado = (estado: Cheque['estado']) =>
      within.filter((c) => c.estado === estado)
    return {
      total: within.length,
      enCarteraValor: sumMonto(byEstado('en_cartera')),
      enCarteraCount: byEstado('en_cartera').length,
      depositadosValor: sumMonto(byEstado('depositado')),
      depositadosCount: byEstado('depositado').length,
      cobradosValor: sumMonto(byEstado('cobrado')),
      cobradosCount: byEstado('cobrado').length,
      rechazadosValor: sumMonto(byEstado('rechazado')),
      rechazadosCount: byEstado('rechazado').length,
    }
  }, [state.cheques, tipo])
}

/**
 * Cheques pendientes que representan flujo futuro (calendario de vencimientos):
 * emitidos "a pagar" (egreso) y recibidos "en cartera" (ingreso).
 */
export function useVencimientos() {
  const { state } = useTreasury()
  return useMemo(
    () =>
      state.cheques
        .filter((c) => c.estado === 'en_cartera')
        .map((c) => ({
          cheque: c,
          flujo: (c.tipo === 'emitido' ? 'egreso' : 'ingreso') as
            | 'ingreso'
            | 'egreso',
        })),
    [state.cheques],
  )
}
