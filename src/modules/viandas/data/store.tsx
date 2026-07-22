// ============================================================
// Módulo Viandas — State Management
// Edgy Gestión · Context + useReducer + Supabase
//
// Mismo patrón que Caja por turno: reducer chico, cada dispatch
// persiste el registro resuelto en Supabase. El cliente del plan es
// un cliente_venta real (tabla de Ventas, no propia de este módulo)
// -- se resuelve con un join en el fetch inicial, mismo criterio que
// usuario_apertura en Caja por turno.
// ============================================================

import {
  createContext,
  useContext,
  useReducer,
  useEffect,
  useMemo,
  type ReactNode,
} from 'react'
import type { ViandasState, PlanVianda, EntregaVianda, PeriodoVianda } from '../types'
import { seedState } from './seed'
import { supabase } from '@/lib/supabase'
import { useClienteActual } from '@/hooks/useClienteActual'
import { todayISO } from '../lib/format'

function uid(): string {
  return crypto.randomUUID()
}

type Action =
  | {
      type: 'CREAR_PLAN'
      payload: {
        clienteVentaId: string
        clienteVentaNombre?: string
        cantidadPeriodo: number
        periodo: PeriodoVianda
        precioAbono: number
        fechaInicio: string
        fechaVencimiento: string
        notas?: string
      }
    }
  | { type: 'CANCELAR_PLAN'; payload: { planId: string } }
  | {
      type: 'AGREGAR_ENTREGA'
      payload: {
        planId: string
        fecha: string
        cantidad: number
        productoId: string
        productoNombre?: string
        precioUnitario: number
        ordenId: string
      }
    }
  | { type: 'SET_STATE'; payload: ViandasState }

function reducer(state: ViandasState, action: Action): ViandasState {
  switch (action.type) {
    case 'SET_STATE':
      return action.payload

    case 'CREAR_PLAN': {
      const nuevo: PlanVianda = {
        id: uid(),
        clienteVentaId: action.payload.clienteVentaId,
        clienteVentaNombre: action.payload.clienteVentaNombre,
        cantidadPeriodo: action.payload.cantidadPeriodo,
        periodo: action.payload.periodo,
        precioAbono: action.payload.precioAbono,
        fechaInicio: action.payload.fechaInicio,
        fechaVencimiento: action.payload.fechaVencimiento,
        estado: 'activo',
        notas: action.payload.notas,
        createdAt: todayISO(),
      }
      return { ...state, planes: [...state.planes, nuevo] }
    }

    case 'CANCELAR_PLAN':
      return {
        ...state,
        planes: state.planes.map((p) =>
          p.id === action.payload.planId ? { ...p, estado: 'cancelado' as const } : p,
        ),
      }

    case 'AGREGAR_ENTREGA': {
      const nueva: EntregaVianda = {
        id: uid(),
        planId: action.payload.planId,
        fecha: action.payload.fecha,
        cantidad: action.payload.cantidad,
        productoId: action.payload.productoId,
        productoNombre: action.payload.productoNombre,
        precioUnitario: action.payload.precioUnitario,
        ordenId: action.payload.ordenId,
        createdAt: todayISO(),
      }
      return { ...state, entregas: [...state.entregas, nueva] }
    }

    default:
      return state
  }
}

// ─── Mapeo dominio -> filas de Supabase ───────────────────────

function planToRow(p: PlanVianda, clienteId: string) {
  return {
    id: p.id,
    cliente_id: clienteId,
    cliente_venta_id: p.clienteVentaId,
    cantidad_periodo: p.cantidadPeriodo,
    periodo: p.periodo,
    precio_abono: p.precioAbono,
    fecha_inicio: p.fechaInicio,
    fecha_vencimiento: p.fechaVencimiento,
    estado: p.estado,
    notas: p.notas ?? null,
  }
}

function entregaToRow(e: EntregaVianda) {
  return {
    id: e.id,
    plan_id: e.planId,
    fecha: e.fecha,
    cantidad: e.cantidad,
    producto_id: e.productoId,
    precio_unitario: e.precioUnitario,
    orden_id: e.ordenId,
    comprobante_id: e.comprobanteId ?? null,
  }
}

function logErr(label: string) {
  return ({ error }: { error: unknown }) => error && console.error(`Viandas · error en ${label}:`, error)
}

function syncToSupabase(action: Action, nextState: ViandasState, clienteId: string) {
  switch (action.type) {
    case 'CREAR_PLAN': {
      const p = nextState.planes[nextState.planes.length - 1]
      supabase.from('planes_vianda').insert(planToRow(p, clienteId)).then(logErr('alta de plan'))
      return
    }
    case 'CANCELAR_PLAN': {
      const p = nextState.planes.find((x) => x.id === action.payload.planId)
      if (!p) return
      supabase.from('planes_vianda').update({ estado: p.estado }).eq('id', p.id).then(logErr('cancelación de plan'))
      return
    }
    case 'AGREGAR_ENTREGA': {
      const e = nextState.entregas[nextState.entregas.length - 1]
      supabase.from('entregas_vianda').insert(entregaToRow(e)).then(logErr('alta de entrega'))
      return
    }
    default:
      return
  }
}

// ─── Fetch inicial desde Supabase ──────────────────────────────

async function fetchViandasState(): Promise<ViandasState> {
  const [planesRes, entregasRes] = await Promise.all([
    supabase
      .from('planes_vianda')
      .select('*, clientes_venta(nombre)')
      .order('created_at', { ascending: false }),
    supabase
      .from('entregas_vianda')
      .select('*, productos(nombre)')
      .order('fecha', { ascending: false }),
  ])

  const planes: PlanVianda[] = (planesRes.data ?? []).map((r: any) => ({
    id: r.id,
    clienteVentaId: r.cliente_venta_id,
    clienteVentaNombre: r.clientes_venta?.nombre ?? undefined,
    cantidadPeriodo: Number(r.cantidad_periodo),
    periodo: r.periodo,
    precioAbono: Number(r.precio_abono),
    fechaInicio: r.fecha_inicio,
    fechaVencimiento: r.fecha_vencimiento,
    estado: r.estado,
    notas: r.notas ?? undefined,
    createdAt: r.created_at,
  }))

  const entregas: EntregaVianda[] = (entregasRes.data ?? []).map((r: any) => ({
    id: r.id,
    planId: r.plan_id,
    fecha: r.fecha,
    cantidad: Number(r.cantidad),
    productoId: r.producto_id ?? '',
    productoNombre: r.productos?.nombre ?? undefined,
    precioUnitario: Number(r.precio_unitario ?? 0),
    ordenId: r.orden_id ?? '',
    comprobanteId: r.comprobante_id ?? undefined,
    createdAt: r.created_at,
  }))

  return { planes, entregas }
}

// ─── Context ───────────────────────────────────────────────────

interface ContextValue {
  state: ViandasState
  dispatch: React.Dispatch<Action>
}

const Ctx = createContext<ContextValue | null>(null)

export function ViandasProvider({ children }: { children: ReactNode }) {
  const { cliente } = useClienteActual()
  const [state, rawDispatch] = useReducer(reducer, seedState)

  useEffect(() => {
    let activo = true
    if (!cliente?.id) return
    fetchViandasState().then((data) => {
      if (activo) rawDispatch({ type: 'SET_STATE', payload: data })
    })
    return () => {
      activo = false
    }
  }, [cliente?.id])

  const dispatch = useMemo<React.Dispatch<Action>>(() => {
    return (action: Action) => {
      const nextState = reducer(state, action)
      rawDispatch(action)
      if (cliente?.id) syncToSupabase(action, nextState, cliente.id)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state, cliente?.id])

  const value = useMemo(() => ({ state, dispatch }), [state, dispatch])

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

export function useViandas() {
  const ctx = useContext(Ctx)
  if (!ctx) throw new Error('useViandas debe usarse dentro de ViandasProvider')
  return ctx
}

export function usePlanesVianda(): PlanVianda[] {
  const { state } = useViandas()
  return state.planes
}

export function usePlanVianda(planId: string): PlanVianda | undefined {
  const { state } = useViandas()
  return useMemo(() => state.planes.find((p) => p.id === planId), [state.planes, planId])
}

export function useEntregas(): EntregaVianda[] {
  const { state } = useViandas()
  return state.entregas
}

export function useEntregasDePlan(planId: string): EntregaVianda[] {
  const { state } = useViandas()
  return useMemo(
    () => state.entregas.filter((e) => e.planId === planId).sort((a, b) => b.fecha.localeCompare(a.fecha)),
    [state.entregas, planId],
  )
}

export type { Action as ViandasAction }
