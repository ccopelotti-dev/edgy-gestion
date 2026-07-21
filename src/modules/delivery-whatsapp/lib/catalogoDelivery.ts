// ============================================================
// Módulo Ventas Online (antes "Delivery por WhatsApp") — Catálogo de productos
// Edgy Gestión · Fase 6d del refactor de Productos
//
// Mismo criterio que cargarCatalogo() en Ventas/PuntoDeVenta.tsx
// (Fase 6c / 6b), reimplementado acá porque Delivery no está montado
// dentro de ProductosStockProvider: consultas directas a Supabase para
// traer productos + precio efectivo según la lista de precio de
// Delivery (clientes.lista_precio_delivery_id) + variantes + la
// plantilla de garantía efectiva (propia del producto, o heredada de
// su rubro).
//
// Se usa tanto en Index.tsx (alta de pedido: buscador de catálogo) como
// en Pedido.tsx (entrega: resolver stock/garantía de los ítems ya
// vinculados).
// ============================================================

import { useEffect, useMemo, useState } from 'react'
import { supabase } from '@/lib/supabase'

export interface VarianteCatalogoDelivery {
  id: string
  color?: string
  talle?: string
  stock: number
}

export interface PlantillaGarantiaLiteDelivery {
  id: string
  nombre: string
  duracionMeses: number
  cobertura: string
}

export interface ProductoCatalogoDelivery {
  id: string
  nombre: string
  precioVenta: number
  stock: number
  controlaStock: boolean
  tipo: 'unico' | 'con_variantes'
  variantes: VarianteCatalogoDelivery[]
  plantillaGarantia?: PlantillaGarantiaLiteDelivery
}

export function etiquetaVarianteDelivery(v: VarianteCatalogoDelivery): string {
  return [v.color, v.talle].filter(Boolean).join(' / ') || 'Variante'
}

export function useCatalogoDelivery(
  clienteTenantId: string | undefined,
  listaPrecioDeliveryId: string | null | undefined,
) {
  const [productos, setProductos] = useState<ProductoCatalogoDelivery[]>([])

  useEffect(() => {
    if (!clienteTenantId) return
    let activo = true
    const listaId = listaPrecioDeliveryId ?? null

    async function cargarCatalogo() {
      const [productosRes, listaRes, overridesRes, variantesRes, rubrosRes, plantillasRes] =
        await Promise.all([
          supabase
            .from('productos')
            .select('id, nombre, precio_venta, costo, stock, controla_stock, tipo, rubro_id, plantilla_garantia_id')
            .eq('cliente_id', clienteTenantId)
            .eq('disponible', true)
            .eq('estado', 'activo')
            .order('nombre'),
          listaId
            ? supabase.from('listas_precio').select('porcentaje_recargo').eq('id', listaId).maybeSingle()
            : Promise.resolve({ data: null } as { data: { porcentaje_recargo: number } | null }),
          listaId
            ? supabase.from('producto_precios').select('producto_id, precio').eq('lista_id', listaId)
            : Promise.resolve({ data: [] as { producto_id: string; precio: number }[] }),
          supabase.from('producto_variantes').select('id, producto_id, color, talle, stock'),
          supabase.from('rubros').select('id, plantilla_garantia_id'),
          supabase.from('plantillas_garantia').select('id, nombre, duracion_meses, cobertura'),
        ])

      if (!activo) return

      const porcentaje = listaRes.data ? Number(listaRes.data.porcentaje_recargo) : 0
      const overridesPorProducto = new Map<string, number>()
      for (const o of overridesRes.data ?? []) {
        overridesPorProducto.set(o.producto_id, Number(o.precio))
      }

      const variantesPorProducto = new Map<string, VarianteCatalogoDelivery[]>()
      for (const v of (variantesRes.data ?? []) as any[]) {
        const arr = variantesPorProducto.get(v.producto_id) ?? []
        arr.push({
          id: v.id,
          color: v.color ?? undefined,
          talle: v.talle ?? undefined,
          stock: Number(v.stock),
        })
        variantesPorProducto.set(v.producto_id, arr)
      }

      const plantillaGarantiaPorRubro = new Map<string, string>()
      for (const r of (rubrosRes.data ?? []) as any[]) {
        if (r.plantilla_garantia_id) plantillaGarantiaPorRubro.set(r.id, r.plantilla_garantia_id)
      }

      const plantillasPorId = new Map<string, PlantillaGarantiaLiteDelivery>()
      for (const pg of (plantillasRes.data ?? []) as any[]) {
        plantillasPorId.set(pg.id, {
          id: pg.id,
          nombre: pg.nombre,
          duracionMeses: Number(pg.duracion_meses),
          cobertura: pg.cobertura ?? '',
        })
      }

      setProductos(
        ((productosRes.data ?? []) as any[]).map((p) => {
          const override = overridesPorProducto.get(p.id)
          const calculado = Number(p.costo) * (1 + porcentaje / 100)
          const precioVenta = listaId ? override ?? calculado : Number(p.precio_venta)
          const idPlantillaEfectiva = p.plantilla_garantia_id ?? plantillaGarantiaPorRubro.get(p.rubro_id)
          return {
            id: p.id,
            nombre: p.nombre,
            precioVenta,
            stock: Number(p.stock),
            controlaStock: !!p.controla_stock,
            tipo: p.tipo === 'con_variantes' ? 'con_variantes' : 'unico',
            variantes: variantesPorProducto.get(p.id) ?? [],
            plantillaGarantia: idPlantillaEfectiva ? plantillasPorId.get(idPlantillaEfectiva) : undefined,
          } as ProductoCatalogoDelivery
        }),
      )
    }

    cargarCatalogo()
    return () => {
      activo = false
    }
  }, [clienteTenantId, listaPrecioDeliveryId])

  const porId = useMemo(() => {
    const map = new Map<string, ProductoCatalogoDelivery>()
    for (const p of productos) map.set(p.id, p)
    return map
  }, [productos])

  return { productos, porId }
}
