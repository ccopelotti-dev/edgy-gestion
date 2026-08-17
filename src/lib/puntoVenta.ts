// ============================================================
// Fase 27e-2: resolución de punto de venta para escrituras de stock
// Edgy Gestión
//
// Todos los puntos donde el sistema escribe stock (Ventas, Compras,
// Comandas, Ventas Online, Ajustes/Recepción/Producción en Productos y
// Stock) necesitan saber A QUÉ LOCAL le corresponde el movimiento que
// están por hacer, para poder reflejarlo en `stock_por_punto_venta`
// (Fase 27e-1, migración 0073) además del total plano de siempre.
//
// Mismo criterio de resolución que ya usa el selector de punto de venta
// de Ventas (ComprobanteDialog, Fase 27c): el punto de venta al que está
// restringido el usuario logueado, o el "por defecto" del cliente si
// tiene acceso global (admin / usuario sin restricción).
//
// Devuelve `null` para clientes de un solo local (0 o 1 punto de venta
// activo cargado) -- ese `null` es la señal que usan los write-paths de
// stock para NO tocar `stock_por_punto_venta` y seguir escribiendo el
// campo plano (`productos.stock`/`insumos.stock`) exactamente como
// hacían antes de la Fase 27e. Así el comportamiento de la inmensa
// mayoría de los clientes (un solo local) no cambia en absolutamente
// nada.
// ============================================================

import { supabase } from './supabase'

export async function resolverPuntoVentaId(clienteId: string): Promise<string | null> {
  const { data: authData } = await supabase.auth.getUser()
  if (authData.user) {
    const { data: uc } = await supabase
      .from('usuarios_cliente')
      .select('punto_venta_id')
      .eq('user_id', authData.user.id)
      .eq('cliente_id', clienteId)
      .maybeSingle()
    if (uc?.punto_venta_id) return uc.punto_venta_id as string
  }

  // Usuario sin restricción (o sin sesión resoluble, ej. checkout público
  // de Ventas Online -- ver cerrarPedidoComoVenta.ts): cae al punto de
  // venta "por defecto" del cliente, pero SOLO si el cliente de verdad
  // tiene 2+ locales activos. Con 0 o 1, se devuelve null a propósito --
  // no tiene sentido "repartir" el stock de un cliente de un solo local
  // en una tabla que para él debe quedar vacía.
  const { data: puntosVenta } = await supabase
    .from('puntos_venta')
    .select('id, por_defecto')
    .eq('cliente_id', clienteId)
    .eq('activo', true)

  if (!puntosVenta || puntosVenta.length < 2) return null

  const porDefecto = puntosVenta.find((pv) => pv.por_defecto)
  return ((porDefecto ?? puntosVenta[0]) as { id: string }).id
}

/**
 * Ajusta un renglón de `stock_por_punto_venta` de forma atómica (RPC
 * `ajustar_stock_punto_venta`, migración 0073) -- usarla SIEMPRE que
 * `resolverPuntoVentaId()` haya devuelto un id no nulo, EN VEZ DE escribir
 * `productos.stock`/`insumos.stock`/`producto_variantes.stock` directo: el
 * trigger de esa tabla se encarga de mantener el total actualizado solo.
 * `delta` es el cambio (negativo para egreso, positivo para ingreso), no
 * el valor absoluto nuevo.
 */
export async function ajustarStockPuntoVenta(params: {
  clienteId: string
  puntoVentaId: string
  itemTipo: 'producto' | 'insumo'
  itemId: string
  varianteId?: string
  delta: number
}) {
  return supabase.rpc('ajustar_stock_punto_venta', {
    p_cliente_id: params.clienteId,
    p_punto_venta_id: params.puntoVentaId,
    p_item_tipo: params.itemTipo,
    p_item_id: params.itemId,
    p_variante_id: params.varianteId ?? null,
    p_delta: params.delta,
  })
}

/**
 * Hermana de `ajustarStockPuntoVenta`, para el path de clientes de UN SOLO
 * LOCAL (`resolverPuntoVentaId()` devolvió `null`) -- rediseño Fase
 * siguiente a #410/#411 (auditoría de guardado confirmado). Antes, ese path
 * leía `producto.stock`/`insumo.stock` en el cliente, sumaba el delta en JS
 * y mandaba el valor absoluto en un `.update()` -- una lectura-modificación-
 * escritura NO atómica a nivel de base (dos ajustes casi simultáneos podían
 * pisarse). Esta RPC (migración `ajustar_stock_plano_rpc`) hace
 * `stock = stock + delta` atómico directo en Postgres, mismo criterio que
 * `ajustar_stock_punto_venta` pero escribiendo en las columnas planas
 * (`productos.stock` / `insumos.stock` / `producto_variantes.stock`, con el
 * total del producto padre recalculado como suma de sus variantes).
 */
export async function ajustarStockPlano(params: {
  itemTipo: 'producto' | 'insumo'
  itemId: string
  varianteId?: string
  delta: number
}) {
  return supabase.rpc('ajustar_stock_plano', {
    p_item_tipo: params.itemTipo,
    p_item_id: params.itemId,
    p_variante_id: params.varianteId ?? null,
    p_delta: params.delta,
  })
}
