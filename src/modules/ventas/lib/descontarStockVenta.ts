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
