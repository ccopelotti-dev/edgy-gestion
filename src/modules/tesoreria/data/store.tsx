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
} from '../types'
import { todayISO } from '../lib/format'
import { seedState } from './seed'

const STORAGE_KEY = 'edgy-tesoreria-v3'

function uid(prefix: string): string {
  return `${prefix}-${Date.now().toString(36)}-${Math.random()
    .toString(36)
    .slice(2, 7)}`
}

function defaultDepositAccount(state: TreasuryState): string | undefined {
  const cc = state.bankAccounts.find((a) => a.tipo === 'cuenta_corriente')
  return (cc ?? state.bankAccounts[0])?.id
}

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
  | { type: 'ADD_BANK'; payload: Omit<BankMovement, 'id'> }
  | { type: 'DELETE_BANK_MOV'; id: string }
  | { type: 'ADD_ACCOUNT'; payload: Omit<BankAccount, 'id'> }
  | { type: 'ADD_CHEQUE'; payload: Omit<Cheque, 'id' | 'estado'> }
  | {
      type: 'CHEQUE_TRANSITION'
      payload: { chequeId: string; nuevoEstado: ChequeEstado; cuentaId?: string }
    }
  | { type: 'RESET' }

function reducer(state: TreasuryState, action: Action): TreasuryState {
  switch (action.type) {
    case 'ADD_CAJA': {
      const p = action.payload
      return {
        ...state,
        cajaMovements: [{ ...p, id: uid('cm') }, ...state.cajaMovements],
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

    case 'ADD_BANK':
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
      if (mov.linkId) {
        if (mov.origen === 'caja') {
          cajaMovements = cajaMovements.filter((m) => m.linkId !== mov.linkId)
        } else if (mov.origen === 'cheque') {
          cheques = cheques.map((c) =>
            c.bankMovLinkId === mov.linkId
              ? { ...c, estado: 'en_cartera' as ChequeEstado, bankMovLinkId: undefined, cuentaDepositoId: undefined }
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
        cheques: [{ ...action.payload, id: uid('chq'), estado: 'en_cartera' }, ...state.cheques],
      }

    case 'CHEQUE_TRANSITION': {
      const { chequeId, nuevoEstado, cuentaId } = action.payload
      const cheque = state.cheques.find((c) => c.id === chequeId)
      if (!cheque) return state
      const next = nuevoEstado
      const recibido = cheque.tipo === 'recibido'
      const wasEnBanco = chequeAfectaBanco(cheque.tipo, cheque.estado)
      const willBeEnBanco = chequeAfectaBanco(cheque.tipo, next)

      const setEstadoSolo = () => ({
        ...state,
        cheques: state.cheques.map((c) =>
          c.id === cheque.id
            ? { ...c, estado: next, cuentaDepositoId: cuentaId ?? c.cuentaDepositoId }
            : c,
        ),
      })

      if (willBeEnBanco && !wasEnBanco) {
        const targetCuenta =
          cuentaId ??
          (recibido ? cheque.cuentaDepositoId : cheque.cuentaOrigenId) ??
          defaultDepositAccount(state)
        if (!targetCuenta) return setEstadoSolo()
        const linkId = uid('lnk')
        const bank: BankMovement = {
          id: uid('bm'),
          cuentaId: targetCuenta,
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
                  ...c, estado: next, bankMovLinkId: linkId,
                  ...(recibido ? { cuentaDepositoId: targetCuenta } : { cuentaOrigenId: targetCuenta }),
                }
              : c,
          ),
        }
      }

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
                  ...c, estado: next, bankMovLinkId: undefined,
                  cuentaDepositoId: recibido && next === 'en_cartera' ? undefined : c.cuentaDepositoId,
                }
              : c,
          ),
        }
      }

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
  } catch { /* ignore */ }
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
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)) } catch { /* ignore */ }
  }, [state])
  const value = useMemo(() => ({ state, dispatch }), [state])
  return <TreasuryContext.Provider value={value}>{children}</TreasuryContext.Provider>
}

export function useTreasury() {
  const ctx = useContext(TreasuryContext)
  if (!ctx) throw new Error('useTreasury debe usarse dentro de TreasuryProvider')
  return ctx
}

export function signedAmount(m: { tipo: 'ingreso' | 'egreso'; monto: number }): number {
  return m.tipo === 'ingreso' ? m.monto : -m.monto
}

export function useSaldoCaja(): number {
  const { state } = useTreasury()
  return useMemo(
    () => state.cajaMovements.filter((m) => m.medioPago === 'efectivo').reduce((acc, m) => acc + signedAmount(m), 0),
    [state.cajaMovements],
  )
}

export function accountBalance(account: BankAccount, movements: BankMovement[]): number {
  return movements.filter((m) => m.cuentaId === account.id).reduce((acc, m) => acc + signedAmount(m), account.saldoInicial)
}

export function useBankTotals() {
  const { state } = useTreasury()
  return useMemo(() => {
    const balances = state.bankAccounts.map((acc) => ({ account: acc, balance: accountBalance(acc, state.bankMovements) }))
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
    const aPagar = state.cheques.filter((c) => c.tipo === 'emitido' && c.estado === 'en_cartera')
    return {
      enCarteraValor: sumMonto(enCartera), enCarteraCount: enCartera.length,
      depositadosValor: sumMonto(depositados), depositadosCount: depositados.length,
      rechazadosValor: sumMonto(rechazados), rechazadosCount: rechazados.length,
      aPagarValor: sumMonto(aPagar), aPagarCount: aPagar.length,
    }
  }, [state.cheques])
}

export function useChequeResumen() {
  const { state } = useTreasury()
  return useMemo(() => {
    const recibidos = state.cheques.filter((c) => c.tipo === 'recibido')
    const emitidos = state.cheques.filter((c) => c.tipo === 'emitido')
    const enCarteraRec = recibidos.filter((c) => c.estado === 'en_cartera')
    const enCarteraEmi = emitidos.filter((c) => c.estado === 'en_cartera')
    const allEnCartera = state.cheques.filter((c) => c.estado === 'en_cartera')
    const proximo = [...allEnCartera].sort((a, b) =>
      a.fechaCobro < b.fechaCobro ? -1 : 1,
    )[0] ?? null

    return {
      enCarteraRecibido: sumMonto(enCarteraRec),
      countRecibidoCartera: enCarteraRec.length,
      enCarteraEmitido: sumMonto(enCarteraEmi),
      countEmitidoCartera: enCarteraEmi.length,
      proximoVencimiento: proximo,
      countRecibido: recibidos.length,
      countEmitido: emitidos.length,
    }
  }, [state.cheques])
}

export function useVencimientos() {
  const { state } = useTreasury()
  const today = todayISO()
  return useMemo(() => {
    const enCartera = state.cheques.filter((c) => c.estado === 'en_cartera')
    return {
      porCobrar: enCartera.filter((c) => c.tipo === 'recibido' && c.fechaCobro >= today),
      porPagar: enCartera.filter((c) => c.tipo === 'emitido' && c.fechaCobro >= today),
      vencidos: enCartera.filter((c) => c.fechaCobro < today),
    }
  }, [state.cheques, today])
}
