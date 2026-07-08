// ============================================================
// Módulo Delivery por WhatsApp — State Management
// Edgy Gestión · Context + useReducer + Supabase
//
// Mismo patrón que Viandas: reducer chico, cada dispatch persiste el
// registro resuelto en Supabase. El cliente del pedido puede ser un
// cliente_venta real (opcional) o simplemente un nombre libre escrito
// por el operador -- el pedido llega por WhatsApp y no siempre es de
// un cliente ya registrado en Ventas.
// ============================================================

import {
  createContext,
  useContext,
  useReducer,
  useEffect,
  useMemo,
  type ReactNode,
} from 'react'
import type {
  DeliveryWhatsappState,
  PedidoDelivery,
  ItemPedidoDelivery,
  EstadoPedidoDelivery,
} from '../types'
import { seedState } from './seed'
import { supabase } from '@/lib/supabase'
import { useClienteActual } from '@/hooks/useClienteActual'
import { todayISO } from '../lib/format'

function uid(): string {
  return crypto.randomUUID()
}

type Action =
  | {
      type: 'CREAR_PEDIDO'
      payload: {
        clienteVentaId?: string
        clienteVentaNombre?: string
        clienteNombre: string
        telefono?: string
        direccion: string
        items: ItemPedidoDelivery[]
        notas?: string
      }
    }
  | { type: 'MARCAR_EN_CAMINO'; payload: { pedidoId: string } }
  | {
      type: 'MARCAR_ENTREGADO'
      payload: { pedidoId: string; medioPago: string; comprobanteId: string | null }
    }
  | { type: 'CANCELAR_PEDIDO'; payload: { pedidoId: string } }
  | { type: 'SET_STATE'; payload: DeliveryWhatsappState }

function reducer(state: DeliveryWhatsappState, action: Action): DeliveryWhatsappState {
  switch (action.type) {
    case 'SET_STATE':
      return action.payload

    case 'CREAR_PEDIDO': {
      const total = action.payload.items.reduce((sum, i) => sum + i.cantidad * i.precioUnitario, 0)
      const nuevo: PedidoDelivery = {
        id: uid(),
        clienteVentaId: action.payload.clienteVentaId,
        clienteVentaNombre: action.payload.clienteVentaNombre,
        clienteNombre: action.payload.clienteNombre,
        telefono: action.payload.telefono,
        direccion: action.payload.direccion,
        items: action.payload.items,
        total,
        estado: 'pendiente',
        notas: action.payload.notas,
        fecha: todayISO(),
        createdAt: todayISO(),
      }
      return { ...state, pedidos: [...state.pedidos, nuevo] }
    }

    case 'MARCAR_EN_CAMINO':
      return {
        ...state,
        pedidos: state.pedidos.map((p) =>
          p.id === action.payload.pedidoId ? { ...p, estado: 'en_camino' as const } : p,
        ),
      }

    case 'MARCAR_ENTREGADO':
      return {
        ...state,
        pedidos: state.pedidos.map((p) =>
          p.id === action.payload.pedidoId
            ? {
                ...p,
                estado: 'entregado' as const,
                medioPago: action.payload.medioPago,
                comprobanteId: action.payload.comprobanteId ?? undefined,
              }
            : p,
        ),
      }

    case 'CANCELAR_PEDIDO':
      return {
        ...state,
        pedidos: state.pedidos.map((p) =>
          p.id === action.payload.pedidoId ? { ...p, estado: 'cancelado' as const } : p,
        ),
      }

    default:
      return state
  }
}

// ─── Mapeo dominio -> filas de Supabase ───────────────────────

function pedidoToRow(p: PedidoDelivery, clienteId: string) {
  return {
    id: p.id,
    cliente_id: clienteId,
    cliente_venta_id: p.clienteVentaId ?? null,
    cliente_nombre: p.clienteNombre,
    telefono: p.telefono ?? null,
    direccion: p.direccion,
    items: p.items,
    total: p.total,
    medio_pago: p.medioPago ?? null,
    estado: p.estado,
    comprobante_id: p.comprobanteId ?? null,
    notas: p.notas ?? null,
    fecha: p.fecha,
  }
}

function logErr(label: string) {
  return ({ error }: { error: unknown }) => error && console.error(`Delivery WhatsApp · error en ${label}:`, error)
}

function syncToSupabase(action: Action, nextState: DeliveryWhatsappState, clienteId: string) {
  switch (action.type) {
    case 'CREAR_PEDIDO': {
      const p = nextState.pedidos[nextState.pedidos.length - 1]
      supabase.from('pedidos_delivery').insert(pedidoToRow(p, clienteId)).then(logErr('alta de pedido'))
      return
    }
    case 'MARCAR_EN_CAMINO': {
      supabase
        .from('pedidos_delivery')
        .update({ estado: 'en_camino' })
        .eq('id', action.payload.pedidoId)
        .then(logErr('marcar en camino'))
      return
    }
    case 'MARCAR_ENTREGADO': {
      supabase
        .from('pedidos_delivery')
        .update({
          estado: 'entregado',
          medio_pago: action.payload.medioPago,
          comprobante_id: action.payload.comprobanteId,
        })
        .eq('id', action.payload.pedidoId)
        .then(logErr('marcar entregado'))
      return
    }
    case 'CANCELAR_PEDIDO': {
      supabase
        .from('pedidos_delivery')
        .update({ estado: 'cancelado' })
        .eq('id', action.payload.pedidoId)
        .then(logErr('cancelación de pedido'))
      return
    }
    default:
      return
  }
}

// ─── Fetch inicial desde Supabase ──────────────────────────────

async function fetchDeliveryState(): Promise<DeliveryWhatsappState> {
  const { data } = await supabase
    .from('pedidos_delivery')
    .select('*, clientes_venta(nombre)')
    .order('created_at', { ascending: false })

  const pedidos: PedidoDelivery[] = (data ?? []).map((r: any) => ({
    id: r.id,
    clienteVentaId: r.cliente_venta_id ?? undefined,
    clienteVentaNombre: r.clientes_venta?.nombre ?? undefined,
    clienteNombre: r.cliente_nombre,
    telefono: r.telefono ?? undefined,
    direccion: r.direccion,
    items: (r.items ?? []) as ItemPedidoDelivery[],
    total: Number(r.total),
    medioPago: r.medio_pago ?? undefined,
    estado: r.estado as EstadoPedidoDelivery,
    comprobanteId: r.comprobante_id ?? undefined,
    notas: r.notas ?? undefined,
    fecha: r.fecha,
    createdAt: r.created_at,
  }))

  return { pedidos }
}

// ─── Context ───────────────────────────────────────────────────

interface ContextValue {
  state: DeliveryWhatsappState
  dispatch: React.Dispatch<Action>
}

const Ctx = createContext<ContextValue | null>(null)

export function DeliveryWhatsappProvider({ children }: { children: ReactNode }) {
  const { cliente } = useClienteActual()
  const [state, rawDispatch] = useReducer(reducer, seedState)

  useEffect(() => {
    let activo = true
    if (!cliente?.id) return
    fetchDeliveryState().then((data) => {
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

export function useDeliveryWhatsapp() {
  const ctx = useContext(Ctx)
  if (!ctx) throw new Error('useDeliveryWhatsapp debe usarse dentro de DeliveryWhatsappProvider')
  return ctx
}

export function usePedidosDelivery(): PedidoDelivery[] {
  const { state } = useDeliveryWhatsapp()
  return state.pedidos
}

export function usePedidoDelivery(pedidoId: string): PedidoDelivery | undefined {
  const { state } = useDeliveryWhatsapp()
  return useMemo(() => state.pedidos.find((p) => p.id === pedidoId), [state.pedidos, pedidoId])
}

export type { Action as DeliveryWhatsappAction }
