// ============================================================
// Módulo Ventas — Descuento de stock al facturar
// Edgy Gestión · Fase 6c del refactor de Productos
//
// Cuando una línea de la factura está vinculada a un producto real del
// catálogo (productos-stock), se descuenta el stock automáticamente (o
// el de la variante puntual, si el producto tiene variantes) y se deja
// asentado el movimiento en `movimientos_stock` con origen 'venta'.
//
// La validación de "hay stock suficiente" se hace ANTES de despachar el
// comprobante -- ver `validarStockDisponible` en PuntoDeVenta.tsx, que
// bloquea la venta si falta stock. Esta función corre DESPUÉS de que el
// comprobante ya se generó, como fire-and-forget, mismo criterio que el
// resto de los side-effects de Ventas (ej. registrarMovimientoTesoreria).
//
// Este módulo no está montado dentro de ProductosStockProvider, así que
// se opera con consultas directas a Supabase (mismo criterio cross-
// módulo ya usado en Mesa.tsx de comandas-cocina para Fase 6a).
// ============================================================

import { supabase } from '@/lib/supabase'

export interface LineaStock {
  productoId?: string
  varianteId?: string
  cantidad: number
}

// Fase 19.1: una línea de venta ahora puede estar vinculada a un Combo en
// vez de a un Producto único. El combo no tiene stock propio -- vender N
// combos descuenta N * cantidad de cada uno de sus componentes fijos
// (combo_componentes_fijos). Los componentes "a elección" (rubro + cantidad
// a elegir) quedan fuera de este descuento por ahora: la elección real del
// cliente no viaja en la línea de comprobante todavía, así que no hay forma
// de saber qué producto puntual habría que descontar -- documentado como
// limitación conocida, no boquea el resto del flujo.
export interface LineaVentaCatalogo {
  productoId?: string
  comboId?: string
  varianteId?: string
  cantidad: number
}

/**
 * Expande líneas de venta (producto o combo) a líneas de stock puro
 * (siempre productoId), resolviendo los componentes fijos de cada combo
 * involucrado. Se llama ANTES de `descontarStockPorVenta` para que ésta
 * siga operando únicamente sobre productos, sin tener que saber nada de
 * combos.
 */
export async function expandirLineasConCombos(lineas: LineaVentaCatalogo[]): Promise<LineaStock[]> {
  const resultado: LineaStock[] = []
  const comboIds = Array.from(new Set(lineas.filter((l) => l.comboId).map((l) => l.comboId!)))

  const componentesPorCombo = new Map<string, { productoId: string; cantidad: number }[]>()
  if (comboIds.length > 0) {
    const { data } = await supabase
      .from('combo_componentes_fijos')
      .select('combo_id, producto_id, cantidad')
      .in('combo_id', comboIds)

    for (const row of (data ?? []) as { combo_id: string; producto_id: string; cantidad: number }[]) {
      const arr = componentesPorCombo.get(row.combo_id) ?? []
      arr.push({ productoId: row.producto_id, cantidad: Number(row.cantidad) })
      componentesPorCombo.set(row.combo_id, arr)
    }
  }

  for (const l of lineas) {
    if (l.cantidad <= 0) continue
    if (l.comboId) {
      const componentes = componentesPorCombo.get(l.comboId) ?? []
      for (const comp of componentes) {
        resultado.push({ productoId: comp.productoId, cantidad: comp.cantidad * l.cantidad })
      }
    } else if (l.productoId) {
      resultado.push({ productoId: l.productoId, varianteId: l.varianteId, cantidad: l.cantidad })
    }
  }

  return resultado
}

export async function descontarStockPorVenta(
  lineas: LineaStock[],
  clienteTenantId: string,
  numeroFactura: number,
  fecha: string,
) {
  // Agrupa por producto+variante: si la misma línea de catálogo aparece
  // repetida en la factura, se descuenta la suma, no cada línea por
  // separado (evita pisarse leyendo stock "viejo" entre lecturas).
  const agrupado = new Map<string, { productoId: string; varianteId?: string; cantidad: number }>()
  for (const l of lineas) {
    if (!l.productoId || l.cantidad <= 0) continue
    const key = `${l.productoId}::${l.varianteId ?? ''}`
    const prev = agrupado.get(key)
    if (prev) prev.cantidad += l.cantidad
    else agrupado.set(key, { productoId: l.productoId, varianteId: l.varianteId, cantidad: l.cantidad })
  }

  for (const { productoId, varianteId, cantidad } of agrupado.values()) {
    const { data: producto } = await supabase
      .from('productos')
      .select('stock, controla_stock')
      .eq('id', productoId)
      .maybeSingle()

    if (!producto || !producto.controla_stock) continue

    if (varianteId) {
      const { data: variante } = await supabase
        .from('producto_variantes')
        .select('stock')
        .eq('id', varianteId)
        .maybeSingle()
      if (!variante) continue
      const nuevoStockVariante = Number(variante.stock) - cantidad
      await supabase.from('producto_variantes').update({ stock: nuevoStockVariante }).eq('id', varianteId)
      await supabase.from('productos').update({ stock: Number(producto.stock) - cantidad }).eq('id', productoId)
    } else {
      const nuevoStock = Number(producto.stock) - cantidad
      await supabase.from('productos').update({ stock: nuevoStock }).eq('id', productoId)
    }

    await supabase.from('movimientos_stock').insert({
      cliente_id: clienteTenantId,
      tipo: 'egreso',
      item_tipo: 'producto',
      item_id: productoId,
      variante_id: varianteId ?? null,
      cantidad: -cantidad,
      motivo: 'otro',
      nota: `Venta — Factura N.º ${numeroFactura}`,
      origen: 'venta',
      fecha,
    })
  }
}
