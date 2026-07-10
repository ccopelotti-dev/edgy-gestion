// ============================================================
// Módulo Delivery por WhatsApp — State Management
// Edgy Gestión · Context + useReducer + Supabase
//
// Fase 8b/8c: el pedido dejó de ser una sola fila en
// `pedidos_delivery` -- ahora son dos tablas: `ordenes_venta` (el
// motor central del pedido: cliente, ítems, total, medio de pago,
// comprobante, origen) y `pedidos_delivery` como extensión logística
// liviana (solo `estado` de reparto: pendiente/en_camino/entregado/
// cancelado). Este archivo es el único que lo sabe -- reconstruye la
// misma forma de `PedidoDelivery` que siempre devolvió, así que
// Index.tsx y Pedido.tsx no cambian ni una línea.
//
// Los pedidos generados desde el Catálogo Público (src/pages/
// MenuPublico.tsx) se insertan directo vía la función SQL
// crear_orden_venta_publica -- no pasan por este reducer/dispatch en
// absoluto (esa página no tiene sesión ni este Provider montado).
// Este store solo los LEE de vuelta (fetchDeliveryState) igual que
// cualquier otro pedido, distinguiéndolos por `origen`.
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
  OrigenPedidoDelivery,
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
        ordenVentaId: uid(),
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
        origen: 'operador',
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
//
// Fase 8b/8c: una alta de pedido ahora escribe en DOS tablas -- la
// orden de venta primero (tiene la FK que pedidos_delivery necesita),
// recién después la extensión logística. El resto de las acciones
// (marcar en camino/entregado/cancelado) actualizan una o ambas según
// qué dato cambie.

function ordenVentaToRow(p: PedidoDelivery, clienteId: string) {
  return {
    id: p.ordenVentaId,
    cliente_id: clienteId,
    cliente_venta_id: p.clienteVentaId ?? null,
    cliente_nombre: p.clienteNombre,
    telefono: p.telefono ?? null,
    direccion: p.direccion,
    canal_cumplimiento: 'delivery',
    origen: 'operador',
    items: p.items,
    subtotal: p.total,
    total: p.total,
    estado: 'pendiente',
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
      // La orden de venta tiene que existir antes que la extensión
      // logística (FK) -- se encadena en vez de disparar las dos en
      // paralelo.
      supabase
        .from('ordenes_venta')
        .insert(ordenVentaToRow(p, clienteId))
        .then(({ error }) => {
          if (error) {
            console.error('Delivery WhatsApp · error en alta de orden_venta:', error)
            return
          }
          supabase
            .from('pedidos_delivery')
            .insert({ id: p.id, orden_venta_id: p.ordenVentaId, estado: 'pendiente' })
            .then(logErr('alta de extensión logística'))
        })
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
      const p = nextState.pedidos.find((x) => x.id === action.payload.pedidoId)
      if (!p) return
      supabase
        .from('ordenes_venta')
        .update({
          estado: 'facturada',
          medio_pago: action.payload.medioPago,
          comprobante_id: action.payload.comprobanteId,
        })
        .eq('id', p.ordenVentaId)
        .then(logErr('facturación de la orden de venta'))
      supabase
        .from('pedidos_delivery')
        .update({ estado: 'entregado' })
        .eq('id', action.payload.pedidoId)
        .then(logErr('marcar entregado'))
      return
    }
    case 'CANCELAR_PEDIDO': {
      const p = nextState.pedidos.find((x) => x.id === action.payload.pedidoId)
      if (!p) return
      supabase
        .from('ordenes_venta')
        .update({ estado: 'cancelada' })
        .eq('id', p.ordenVentaId)
        .then(logErr('cancelación de la orden de venta'))
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
    .select('*, ordenes_venta(*, clientes_venta(nombre))')
    .order('created_at', { ascending: false })

  const pedidos: PedidoDelivery[] = (data ?? [])
    .filter((r: any) => r.ordenes_venta)
    .map((r: any) => {
      const ov = r.ordenes_venta
      return {
        id: r.id,
        ordenVentaId: ov.id,
        clienteVentaId: ov.cliente_venta_id ?? undefined,
        clienteVentaNombre: ov.clientes_venta?.nombre ?? undefined,
        clienteNombre: ov.cliente_nombre,
        telefono: ov.telefono ?? undefined,
        direccion: ov.direccion,
        items: (ov.items ?? []) as ItemPedidoDelivery[],
        total: Number(ov.total),
        medioPago: ov.medio_pago ?? undefined,
        estado: r.estado as EstadoPedidoDelivery,
        comprobanteId: ov.comprobante_id ?? undefined,
        notas: ov.notas ?? undefined,
        fecha: ov.fecha,
        createdAt: r.created_at,
        origen: (ov.origen === 'catalogo_publico' ? 'menu_qr' : 'operador') as OrigenPedidoDelivery,
      }
    })

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
