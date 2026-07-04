import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useReducer,
  useState,
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
import { supabase } from '@/lib/supabase'
import { useClienteActual } from '@/hooks/useClienteActual'

// ============================================================
// Persistencia real en Supabase (schema edgy_gestion), en vez de
// localStorage. La firma pública (PublicAction, useTreasury().dispatch)
// es IDÉNTICA a la versión anterior — ningún diálogo ni página
// necesita cambiar una sola línea. Internamente se resuelve el id
// (uuid real) y se sincroniza con Supabase en paralelo al update
// optimista del reducer.
// ============================================================

function newId(): string {
  return crypto.randomUUID()
}

function defaultDepositAccount(state: TreasuryState): string | undefined {
  const cc = state.bankAccounts.find((a) => a.tipo === 'cuenta_corriente')
  return (cc ?? state.bankAccounts[0])?.id
}

function chequeAfectaBanco(tipo: 'recibido' | 'emitido', estado: ChequeEstado): boolean {
  return tipo === 'recibido'
    ? estado === 'depositado' || estado === 'cobrado'
    : estado === 'cobrado'
}

// ─── Mapeo DB (snake_case) <-> dominio (camelCase) ────────────

function accountFromDb(r: any): BankAccount {
  return {
    id: r.id,
    banco: r.banco,
    alias: r.alias ?? '',
    numero: r.numero ?? '',
    cbu: r.cbu ?? '',
    tipo: r.tipo,
    moneda: r.moneda,
    saldoInicial: Number(r.saldo_inicial),
  }
}

function cajaFromDb(r: any): CajaMovement {
  return {
    id: r.id,
    fecha: r.fecha,
    tipo: r.tipo,
    concepto: r.concepto,
    categoria: r.categoria ?? '',
    medioPago: r.medio_pago,
    monto: Number(r.monto),
    cuentaId: r.cuenta_id ?? undefined,
    linkId: r.link_id ?? undefined,
  }
}

function bankMovFromDb(r: any): BankMovement {
  return {
    id: r.id,
    cuentaId: r.cuenta_id,
    fecha: r.fecha,
    tipo: r.tipo,
    concepto: r.concepto,
    categoria: r.categoria ?? '',
    medioPago: r.medio_pago,
    monto: Number(r.monto),
    linkId: r.link_id ?? undefined,
    origen: r.origen ?? undefined,
  }
}

function chequeFromDb(r: any): Cheque {
  return {
    id: r.id,
    tipo: r.tipo,
    numero: r.numero,
    banco: r.banco,
    librador: r.librador,
    fechaRecepcion: r.fecha_recepcion,
    fechaCobro: r.fecha_cobro,
    monto: Number(r.monto),
    estado: r.estado,
    cuentaDepositoId: r.cuenta_deposito_id ?? undefined,
    cuentaOrigenId: r.cuenta_origen_id ?? undefined,
    notas: r.notas ?? undefined,
    bankMovLinkId: r.bank_mov_link_id ?? undefined,
  }
}

async function fetchTreasuryState(): Promise<TreasuryState> {
  const [cuentas, caja, bancarios, cheques] = await Promise.all([
    supabase.from('cuentas_bancarias').select('*').order('created_at'),
    supabase.from('movimientos_caja').select('*').order('created_at', { ascending: false }),
    supabase.from('movimientos_bancarios').select('*').order('created_at', { ascending: false }),
    supabase.from('cheques').select('*').order('created_at', { ascending: false }),
  ])

  return {
    bankAccounts: (cuentas.data ?? []).map(accountFromDb),
    cajaMovements: (caja.data ?? []).map(cajaFromDb),
    bankMovements: (bancarios.data ?? []).map(bankMovFromDb),
    cheques: (cheques.data ?? []).map(chequeFromDb),
  }
}

function insertRow(table: string, row: Record<string, unknown>, label: string) {
  supabase
    .from(table)
    .insert(row)
    .then(({ error }) => error && console.error(`Error guardando ${label}:`, error))
}

function deleteRow(table: string, id: string, label: string) {
  supabase
    .from(table)
    .delete()
    .eq('id', id)
    .then(({ error }) => error && console.error(`Error borrando ${label}:`, error))
}

function updateRow(table: string, id: string, row: Record<string, unknown>, label: string) {
  supabase
    .from(table)
    .update(row)
    .eq('id', id)
    .then(({ error }) => error && console.error(`Error actualizando ${label}:`, error))
}

// ─── Acción pública (idéntica a la firma anterior) ────────────
// Ningún diálogo/página cambia: siguen despachando estos mismos
// tipos y formas de payload de siempre.

export type PublicAction =
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

// ─── Acción interna del reducer (con ids ya resueltos) ────────

type InternalAction =
  | { type: 'SET_STATE'; payload: TreasuryState }
  | { type: 'ADD_CAJA'; payload: CajaMovement }
  | { type: 'DELETE_CAJA'; id: string }
  | { type: 'ADD_BANK'; payload: BankMovement }
  | { type: 'DELETE_BANK_MOV'; id: string }
  | { type: 'ADD_ACCOUNT'; payload: BankAccount }
  | { type: 'ADD_CHEQUE'; payload: Cheque }
  | {
      type: 'CHEQUE_TRANSITION_RESOLVED'
      payload: { chequeId: string; nuevoEstado: ChequeEstado; cuentaId?: string; bankMov?: BankMovement }
    }
  | { type: 'RESET' }

function reducer(state: TreasuryState, action: InternalAction): TreasuryState {
  switch (action.type) {
    case 'SET_STATE':
      return action.payload

    case 'ADD_CAJA':
      return { ...state, cajaMovements: [action.payload, ...state.cajaMovements] }

    case 'DELETE_CAJA': {
      const mov = state.cajaMovements.find((m) => m.id === action.id)
      const linkId = mov?.linkId
      return {
        ...state,
        cajaMovements: state.cajaMovements.filter((m) => m.id !== action.id),
        bankMovements: linkId ? state.bankMovements.filter((m) => m.linkId !== linkId) : state.bankMovements,
      }
    }

    case 'ADD_BANK':
      return { ...state, bankMovements: [action.payload, ...state.bankMovements] }

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
      return { ...state, bankMovements: state.bankMovements.filter((m) => m.id !== action.id), cajaMovements, cheques }
    }

    case 'ADD_ACCOUNT':
      return { ...state, bankAccounts: [...state.bankAccounts, action.payload] }

    case 'ADD_CHEQUE':
      return { ...state, cheques: [action.payload, ...state.cheques] }

    case 'CHEQUE_TRANSITION_RESOLVED': {
      const { chequeId, nuevoEstado, cuentaId, bankMov } = action.payload
      const cheque = state.cheques.find((c) => c.id === chequeId)
      if (!cheque) return state
      const next = nuevoEstado
      const recibido = cheque.tipo === 'recibido'
      const wasEnBanco = chequeAfectaBanco(cheque.tipo, cheque.estado)
      const willBeEnBanco = chequeAfectaBanco(cheque.tipo, next)

      if (willBeEnBanco && !wasEnBanco && bankMov) {
        return {
          ...state,
          bankMovements: [bankMov, ...state.bankMovements],
          cheques: state.cheques.map((c) =>
            c.id === cheque.id
              ? {
                  ...c,
                  estado: next,
                  bankMovLinkId: bankMov.linkId,
                  ...(recibido ? { cuentaDepositoId: cuentaId } : { cuentaOrigenId: cuentaId }),
                }
              : c,
          ),
        }
      }

      if (!willBeEnBanco && wasEnBanco) {
        const linkId = cheque.bankMovLinkId
        return {
          ...state,
          bankMovements: linkId ? state.bankMovements.filter((m) => m.linkId !== linkId) : state.bankMovements,
          cheques: state.cheques.map((c) =>
            c.id === cheque.id
              ? {
                  ...c,
                  estado: next,
                  bankMovLinkId: undefined,
                  cuentaDepositoId: recibido && next === 'en_cartera' ? undefined : c.cuentaDepositoId,
                }
              : c,
          ),
        }
      }

      return {
        ...state,
        cheques: state.cheques.map((c) =>
          c.id === cheque.id ? { ...c, estado: next, cuentaDepositoId: cuentaId ?? c.cuentaDepositoId } : c,
        ),
      }
    }

    case 'RESET':
      // Solo resetea la vista local (demo). No borra ni reescribe
      // datos reales del cliente en Supabase.
      return seedState

    default:
      return state
  }
}

// ─── Resolución de acción pública -> interna + persistencia ───
// Acá vive la lógica que antes estaba adentro del reducer para
// CHEQUE_TRANSITION (armar el movimiento bancario derivado, etc).

function resolveAndPersist(
  publicAction: PublicAction,
  state: TreasuryState,
  clienteId: string,
  dispatch: (a: InternalAction) => void,
) {
  switch (publicAction.type) {
    case 'ADD_CAJA': {
      const payload: CajaMovement = { ...publicAction.payload, id: newId() }
      dispatch({ type: 'ADD_CAJA', payload })
      insertRow(
        'movimientos_caja',
        {
          id: payload.id,
          cliente_id: clienteId,
          fecha: payload.fecha,
          tipo: payload.tipo,
          concepto: payload.concepto,
          categoria: payload.categoria,
          medio_pago: payload.medioPago,
          monto: payload.monto,
          cuenta_id: payload.cuentaId ?? null,
          link_id: payload.linkId ?? null,
        },
        'movimiento de caja',
      )
      return
    }

    case 'DELETE_CAJA': {
      dispatch({ type: 'DELETE_CAJA', id: publicAction.id })
      deleteRow('movimientos_caja', publicAction.id, 'movimiento de caja')
      return
    }

    case 'ADD_BANK': {
      const payload: BankMovement = { ...publicAction.payload, id: newId(), origen: publicAction.payload.origen ?? 'manual' }
      dispatch({ type: 'ADD_BANK', payload })
      insertRow(
        'movimientos_bancarios',
        {
          id: payload.id,
          cliente_id: clienteId,
          cuenta_id: payload.cuentaId,
          fecha: payload.fecha,
          tipo: payload.tipo,
          concepto: payload.concepto,
          categoria: payload.categoria,
          medio_pago: payload.medioPago,
          monto: payload.monto,
          link_id: payload.linkId ?? null,
          origen: payload.origen,
        },
        'movimiento bancario',
      )
      return
    }

    case 'DELETE_BANK_MOV': {
      dispatch({ type: 'DELETE_BANK_MOV', id: publicAction.id })
      deleteRow('movimientos_bancarios', publicAction.id, 'movimiento bancario')
      return
    }

    case 'ADD_ACCOUNT': {
      const payload: BankAccount = { ...publicAction.payload, id: newId() }
      dispatch({ type: 'ADD_ACCOUNT', payload })
      insertRow(
        'cuentas_bancarias',
        {
          id: payload.id,
          cliente_id: clienteId,
          banco: payload.banco,
          alias: payload.alias,
          numero: payload.numero,
          cbu: payload.cbu,
          tipo: payload.tipo,
          moneda: payload.moneda,
          saldo_inicial: payload.saldoInicial,
        },
        'cuenta bancaria',
      )
      return
    }

    case 'ADD_CHEQUE': {
      const payload: Cheque = { ...publicAction.payload, id: newId(), estado: 'en_cartera' }
      dispatch({ type: 'ADD_CHEQUE', payload })
      insertRow(
        'cheques',
        {
          id: payload.id,
          cliente_id: clienteId,
          tipo: payload.tipo,
          numero: payload.numero,
          banco: payload.banco,
          librador: payload.librador,
          fecha_recepcion: payload.fechaRecepcion,
          fecha_cobro: payload.fechaCobro,
          monto: payload.monto,
          estado: payload.estado,
          notas: payload.notas ?? null,
        },
        'cheque',
      )
      return
    }

    case 'CHEQUE_TRANSITION': {
      const { chequeId, nuevoEstado, cuentaId } = publicAction.payload
      const cheque = state.cheques.find((c) => c.id === chequeId)
      if (!cheque) return
      const recibido = cheque.tipo === 'recibido'
      const wasEnBanco = chequeAfectaBanco(cheque.tipo, cheque.estado)
      const willBeEnBanco = chequeAfectaBanco(cheque.tipo, nuevoEstado)

      let bankMov: BankMovement | undefined
      let cuentaResuelta = cuentaId

      if (willBeEnBanco && !wasEnBanco) {
        cuentaResuelta =
          cuentaId ?? (recibido ? cheque.cuentaDepositoId : cheque.cuentaOrigenId) ?? defaultDepositAccount(state)
        if (cuentaResuelta) {
          const linkId = newId()
          bankMov = {
            id: newId(),
            cuentaId: cuentaResuelta,
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
        }
      }

      dispatch({
        type: 'CHEQUE_TRANSITION_RESOLVED',
        payload: { chequeId, nuevoEstado, cuentaId: cuentaResuelta, bankMov },
      })

      updateRow(
        'cheques',
        chequeId,
        {
          estado: nuevoEstado,
          cuenta_deposito_id: recibido ? cuentaResuelta ?? null : cheque.cuentaDepositoId ?? null,
          cuenta_origen_id: !recibido ? cuentaResuelta ?? null : cheque.cuentaOrigenId ?? null,
          bank_mov_link_id: bankMov?.linkId ?? null,
        },
        'cheque',
      )

      if (bankMov) {
        insertRow(
          'movimientos_bancarios',
          {
            id: bankMov.id,
            cliente_id: clienteId,
            cuenta_id: bankMov.cuentaId,
            fecha: bankMov.fecha,
            tipo: bankMov.tipo,
            concepto: bankMov.concepto,
            categoria: bankMov.categoria,
            medio_pago: bankMov.medioPago,
            monto: bankMov.monto,
            link_id: bankMov.linkId,
            origen: 'cheque',
          },
          'movimiento de cheque',
        )
      }
      return
    }

    case 'RESET':
      dispatch({ type: 'RESET' })
      return

    default:
      return
  }
}

// ─── Context ───────────────────────────────────────────────

interface TreasuryContextValue {
  state: TreasuryState
  dispatch: (action: PublicAction) => void
  cargando: boolean
}

const TreasuryContext = createContext<TreasuryContextValue | null>(null)

const emptyState: TreasuryState = {
  cajaMovements: [],
  bankAccounts: [],
  bankMovements: [],
  cheques: [],
}

export function TreasuryProvider({ children }: { children: ReactNode }) {
  const { cliente } = useClienteActual()
  const [state, internalDispatch] = useReducer(reducer, emptyState)
  const [cargando, setCargando] = useState(true)

  useEffect(() => {
    let activo = true
    if (!cliente?.id) return
    setCargando(true)
    fetchTreasuryState().then((data) => {
      if (!activo) return
      internalDispatch({ type: 'SET_STATE', payload: data })
      setCargando(false)
    })
    return () => {
      activo = false
    }
  }, [cliente?.id])

  const dispatch = (action: PublicAction) => {
    if (!cliente?.id) {
      console.warn('TreasuryProvider: no hay cliente activo, se ignora la acción', action.type)
      return
    }
    resolveAndPersist(action, state, cliente.id, internalDispatch)
  }

  const value = useMemo(() => ({ state, dispatch, cargando }), [state, cargando, cliente?.id])
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
    const proximo = [...allEnCartera].sort((a, b) => (a.fechaCobro < b.fechaCobro ? -1 : 1))[0] ?? null

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
