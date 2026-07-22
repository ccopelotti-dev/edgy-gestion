// ============================================================
// Generación de entregas de Vianda sobre catálogo real
// Edgy Gestión · Viandas (Fase 24b)
//
// Cada entrega de un plan de vianda ahora es una línea de catálogo real
// (rubro "Viandas") en vez de un texto libre -- ver comentario en
// types/index.ts (EntregaVianda). Generar una entrega crea una Orden en
// `ordenes_venta` (tipo 'pedido', origenModulo 'viandas') que dispara el
// ciclo normal de Comandas/Ordenes (Ventas) hasta que se factura en cta.
// cte. al llegar a 'entregado' (ver handleCambiarEstado en
// ventas/pages/Ordenes.tsx, Fase 24c). Se escribe directo contra
// Supabase, sin pasar por VentasProvider (no está montado en este
// módulo) -- mismo criterio cross-módulo que cerrarComandaComoVenta en
// comandas-cocina y cobrarAbonoVianda acá mismo.
//
// El número de orden se resuelve con MAX(numero)+1 (mismo criterio y
// mismo riesgo de carrera mínimo aceptado que cobrarAbonoVianda.ts).
// ============================================================

import { supabase } from '@/lib/supabase'
import type { PlanVianda } from '../types'

export interface ProductoViandaCandidato {
  id: string
  nombre: string
}

/** Resuelve el id del rubro llamado exactamente "Viandas" del cliente
 * actual, o `null` si todavía no lo creó (Productos y Stock > Rubros --
 * no se seedea automáticamente). */
async function obtenerRubroVianda(clienteId: string): Promise<string | null> {
  const { data: rubro } = await supabase
    .from('rubros')
    .select('id')
    .eq('cliente_id', clienteId)
    .ilike('nombre', 'viandas')
    .maybeSingle()
  return (rubro as { id: string } | null)?.id ?? null
}

/**
 * Todos los productos activos/disponibles del rubro "Viandas", sin
 * filtrar por día -- para la carga manual de una entrega (Plan.tsx): el
 * filtro por `dias_disponibles` (Fase 24a) es a propósito solo para el
 * Catálogo Público, el personal puede cargar cualquier producto del
 * rubro para cualquier fecha (ej. una entrega atrasada de ayer).
 */
export async function obtenerProductosVianda(clienteId: string): Promise<ProductoViandaCandidato[]> {
  const rubroId = await obtenerRubroVianda(clienteId)
  if (!rubroId) return []

  const { data: productos } = await supabase
    .from('productos')
    .select('id, nombre')
    .eq('cliente_id', clienteId)
    .eq('rubro_id', rubroId)
    .eq('disponible', true)
    .eq('estado', 'activo')
    .order('nombre')

  return (productos ?? []).map((p: any) => ({ id: p.id, nombre: p.nombre }))
}

/**
 * Productos del rubro "Viandas" disponibles HOY (Fase 24a:
 * `dias_disponibles` nulo/vacío = disponible todos los días) -- para el
 * generador automático "Generar entregas de hoy" (Fase 24c).
 */
export async function obtenerProductosViandaDeHoy(
  clienteId: string,
): Promise<ProductoViandaCandidato[]> {
  const rubroId = await obtenerRubroVianda(clienteId)
  if (!rubroId) return []

  const hoy = new Date().getDay() // 0-6, mismo criterio que dias_disponibles

  const { data: productos } = await supabase
    .from('productos')
    .select('id, nombre, dias_disponibles')
    .eq('cliente_id', clienteId)
    .eq('rubro_id', rubroId)
    .eq('disponible', true)
    .eq('estado', 'activo')

  return (productos ?? [])
    .filter((p: any) => !p.dias_disponibles?.length || p.dias_disponibles.includes(hoy))
    .map((p: any) => ({ id: p.id, nombre: p.nombre }))
}

/**
 * Crea la Orden (ordenes_venta + orden_venta_items) para una entrega
 * puntual de un plan de vianda, a un producto real ya elegido. El
 * precio se calcula por prorrateo del abono (decisión explícita del
 * cliente): `precioAbono / cantidadPeriodo`, no el precio de catálogo
 * del producto -- es una foto tomada en este momento.
 *
 * Devuelve el `ordenId` y el `precioUnitario` usado para que el caller
 * dispatch-ee `AGREGAR_ENTREGA` con esos datos ya resueltos (mismo
 * patrón que `numeroAsignado` en Ordenes.tsx: acá no hay reducer que
 * numere la orden, así que el insert ya la deja creada).
 */
export async function crearOrdenParaEntregaVianda(
  clienteId: string,
  plan: PlanVianda,
  producto: ProductoViandaCandidato,
  fecha: string,
  cantidad: number,
): Promise<{ ordenId: string; precioUnitario: number } | null> {
  const precioUnitario =
    plan.cantidadPeriodo > 0 ? plan.precioAbono / plan.cantidadPeriodo : plan.precioAbono
  const subtotal = precioUnitario * cantidad

  const { data: ultima } = await supabase
    .from('ordenes_venta')
    .select('numero')
    .eq('cliente_id', clienteId)
    .eq('tipo', 'pedido')
    .order('numero', { ascending: false })
    .limit(1)
  const numero = ((ultima?.[0] as { numero?: number } | undefined)?.numero ?? 0) + 1

  const ordenId = crypto.randomUUID()

  const { error: errorOrden } = await supabase.from('ordenes_venta').insert({
    id: ordenId,
    cliente_id: clienteId,
    numero,
    tipo: 'pedido',
    cliente_venta_id: plan.clienteVentaId,
    fecha,
    estado: 'pendiente',
    subtotal,
    descuento_general: 0,
    total: subtotal,
    origen_modulo: 'viandas',
    origen_id: plan.id,
  })

  if (errorOrden) {
    console.error('Viandas · error creando la orden de la entrega:', errorOrden)
    return null
  }

  const { error: errorItem } = await supabase.from('orden_venta_items').insert({
    id: crypto.randomUUID(),
    orden_id: ordenId,
    producto_id: producto.id,
    descripcion: producto.nombre,
    cantidad,
    precio_unitario: precioUnitario,
    descuento: 0,
    subtotal,
    cantidad_entregada: 0,
  })

  if (errorItem) {
    console.error('Viandas · error creando el ítem de la orden de la entrega:', errorItem)
    return null
  }

  return { ordenId, precioUnitario }
}
