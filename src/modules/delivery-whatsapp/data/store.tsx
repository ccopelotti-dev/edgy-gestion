// ============================================================
// Módulo Ventas Online (antes "Delivery por WhatsApp") — State Management
// Edgy Gestión · Context + useReducer + Supabase
//
// Retrofit (post Fase 8b/8c): las Fases 8a-8c se construyeron sobre
// una tabla `ordenes_venta` que se pensó nueva pero en realidad ya
// existía -- con OTRO esquema -- como motor de Presupuestos/Órdenes
// de venta manuales (Ordenes.tsx/Presupuestos.tsx). Este archivo se
// reescribe para usar el esquema REAL: `ordenes_venta` (cliente,
// numero, tipo='pedido', cliente_venta_id opcional + contacto_nombre/
// contacto_telefono para pedidos sin cliente registrado, estado,
// notas) + `orden_venta_items` (ítems normalizados, no jsonb) +
// `pedidos_delivery` como extensión logística liviana (estado de
// reparto, dirección, modalidad retiro/delivery). El comprobante de
// venta se sigue generando en cerrarPedidoComoVenta.ts (sin cambios
// de fondo, solo ahora vincula `orden_id`).
//
// Index.tsx y Pedido.tsx no cambian ni una línea -- este archivo sigue
// devolviendo exactamente la misma forma de `PedidoDelivery`.
//
// Los pedidos generados desde el Catálogo Público (src/pages/
// MenuPublico.tsx) se insertan directo vía la función SQL
// crear_orden_venta_publica -- no pasan por este reducer/dispatch en
// absoluto. Este store solo los LEE de vuelta (fetchDeliveryState)
// igual que cualquier otro pedido, distinguiéndolos por
// `origen_modulo`.
//
// Limitación conocida y aceptada: `orden_venta_items` (la tabla real,
// compartida con Presupuestos/Ordenes.tsx) no tiene columna de
// variante -- lo mismo pasa en el `OrdenItem` de Ventas. Un pedido de
// delivery vinculado a un producto CON variante pierde la variante
// específica al pasar por acá (el descuento de stock/activación de
// garantía cae al nivel de producto base). No es una regresión de
// este retrofit: la tabla real nunca tuvo esa columna.
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

// ─── Mapeo dominio -> filas de Supabase (esquema real) ─────────

function ordenVentaToRow(p: PedidoDelivery, clienteId: string, numero: number) {
  return {
    id: p.ordenVentaId,
    cliente_id: clienteId,
    numero,
    tipo: 'pedido',
    cliente_venta_id: p.clienteVentaId ?? null,
    contacto_nombre: p.clienteNombre,
    contacto_telefono: p.telefono ?? null,
    fecha: p.fecha,
    estado: 'pendiente',
    subtotal: p.total,
    descuento_general: 0,
    total: p.total,
    notas: p.notas ?? null,
    origen_modulo: 'ventas-online',
    origen_canal: 'operador',
  }
}

function itemToRow(i: ItemPedidoDelivery, ordenId: string) {
  return {
    id: crypto.randomUUID(),
    orden_id: ordenId,
    producto_id: i.productoId ?? null,
    descripcion: i.descripcion,
    cantidad: i.cantidad,
    precio_unitario: i.precioUnitario,
    descuento: 0,
    subtotal: i.cantidad * i.precioUnitario,
    cantidad_entregada: 0,
  }
}

async function proximoNumeroOrden(clienteId: string): Promise<number> {
  const { data } = await supabase
    .from('ordenes_venta')
    .select('numero')
    .eq('cliente_id', clienteId)
    .eq('tipo', 'pedido')
    .order('numero', { ascending: false })
    .limit(1)
  return (data?.[0]?.numero ?? 0) + 1
}

function logErr(label: string) {
  return ({ error }: { error: unknown }) => error && console.error(`Ventas Online · error en ${label}:`, error)
}

function syncToSupabase(action: Action, nextState: DeliveryWhatsappState, clienteId: string) {
  switch (action.type) {
    case 'CREAR_PEDIDO': {
      const p = nextState.pedidos[nextState.pedidos.length - 1]
      // La orden de venta tiene que existir antes que sus ítems y que
      // la extensión logística (FK) -- se encadena en vez de disparar
      // todo en paralelo. `numero` se calcula acá porque el alta
      // corre autenticada (no es la función SQL pública, que sí lo
      // calcula del lado del servidor).
      ;(async () => {
        const numero = await proximoNumeroOrden(clienteId)
        const { error: errOrden } = await supabase
          .from('ordenes_venta')
          .insert(ordenVentaToRow(p, clienteId, numero))
        if (errOrden) {
          console.error('Ventas Online · error en alta de orden_venta:', errOrden)
          return
        }
        if (p.items.length) {
          const { error: errItems } = await supabase
            .from('orden_venta_items')
            .insert(p.items.map((i) => itemToRow(i, p.ordenVentaId)))
          if (errItems) console.error('Ventas Online · error en ítems de la orden:', errItems)
        }
        const { error: errExt } = await supabase.from('pedidos_delivery').insert({
          id: p.id,
          orden_venta_id: p.ordenVentaId,
          estado: 'pendiente',
          direccion: p.direccion,
          modalidad: 'delivery',
        })
        if (errExt) console.error('Ventas Online · error en alta de extensión logística:', errExt)
      })()
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
        .update({ estado: 'entregado', fecha_completada: todayISO() })
        .eq('id', p.ordenVentaId)
        .then(logErr('cierre de la orden de venta'))
      // Marca los ítems como entregados en su totalidad -- mismo
      // criterio que "Marcar entregado" en Ordenes.tsx (Ventas).
      supabase
        .from('orden_venta_items')
        .select('id, cantidad')
        .eq('orden_id', p.ordenVentaId)
        .then(({ data, error }) => {
          if (error || !data) return
          for (const i of data) {
            supabase
              .from('orden_venta_items')
              .update({ cantidad_entregada: i.cantidad })
              .eq('id', i.id)
              .then(logErr('marcar ítem entregado'))
          }
        })
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
        .update({ estado: 'cancelado' })
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
    .select('*, ordenes_venta(*, orden_venta_items(*), clientes_venta(nombre))')
    .order('created_at', { ascending: false })

  const rows = (data ?? []).filter((r: any) => r.ordenes_venta)
  const ordenIds = rows.map((r: any) => r.ordenes_venta.id)

  // El comprobante se busca aparte (no anidado): `comprobantes_venta`
  // apunta a la orden vía `orden_id`, pero no asumimos que esa
  // relación esté registrada para el embed automático de PostgREST.
  const comprobantesPorOrden = new Map<string, { id: string; medioPago: string | null }>()
  if (ordenIds.length) {
    const { data: comprobantes } = await supabase
      .from('comprobantes_venta')
      .select('id, orden_id, medio_pago')
      .in('orden_id', ordenIds)
    for (const c of comprobantes ?? []) {
      if (c.orden_id) comprobantesPorOrden.set(c.orden_id, { id: c.id, medioPago: c.medio_pago ?? null })
    }
  }

  const pedidos: PedidoDelivery[] = rows.map((r: any) => {
    const ov = r.ordenes_venta
    const comprobante = comprobantesPorOrden.get(ov.id)
    return {
      id: r.id,
      ordenVentaId: ov.id,
      numero: ov.numero ?? undefined,
      clienteVentaId: ov.cliente_venta_id ?? undefined,
      clienteVentaNombre: ov.clientes_venta?.nombre ?? undefined,
      clienteNombre: ov.contacto_nombre ?? ov.clientes_venta?.nombre ?? 'Sin nombre',
      telefono: ov.contacto_telefono ?? undefined,
      direccion: r.direccion ?? '',
      items: (ov.orden_venta_items ?? []).map((i: any) => ({
        descripcion: i.descripcion,
        cantidad: Number(i.cantidad),
        precioUnitario: Number(i.precio_unitario),
        productoId: i.producto_id ?? undefined,
      })),
      total: Number(ov.total),
      medioPago: comprobante?.medioPago ?? undefined,
      estado: r.estado as EstadoPedidoDelivery,
      comprobanteId: comprobante?.id,
      notas: ov.notas ?? undefined,
      fecha: ov.fecha,
      createdAt: r.created_at,
      origen: (ov.origen_modulo === 'menu-publico' ? 'menu_qr' : 'operador') as OrigenPedidoDelivery,
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
