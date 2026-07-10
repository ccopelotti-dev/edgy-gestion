// ============================================================
// Módulo Comandas y cocina — Catálogo de productos
// Edgy Gestión · Fase 7a (auditoría de conexiones Ventas↔Productos)
//
// Mismo criterio que useCatalogoDelivery en delivery-whatsapp/lib/
// catalogoDelivery.ts (Fase 6d), reimplementado acá porque Comandas no
// está montado dentro de ProductosStockProvider: consultas directas a
// Supabase para traer productos + precio efectivo según la lista de
// precio de Comandas (clientes.lista_precio_comandas_id, ya usada desde
// la Fase 6a) + la plantilla de garantía efectiva (propia del producto,
// o heredada de su rubro).
//
// A diferencia de Ventas/Delivery, el selector de Mesa.tsx es un <Select>
// simple (no hay UI para elegir variante todavía) -- así que acá se
// excluyen los productos con variantes del catálogo que ve Comandas,
// para no vender un producto "con_variantes" sin saber qué variante
// puntual descontar de stock. Si hace falta vender ese producto en
// mesa, por ahora se sigue pudiendo hacer con precio libre (no vinculado
// al catálogo) desde el mismo flujo de siempre.
// ============================================================

import { useEffect, useMemo, useState } from 'react'
import { supabase } from '@/lib/supabase'

export interface PlantillaGarantiaLiteComanda {
  id: string
  nombre: string
  duracionMeses: number
  cobertura: string
}

export interface ProductoCatalogoComanda {
  id: string
  nombre: string
  precioVenta: number
  stock: number
  controlaStock: boolean
  plantillaGarantia?: PlantillaGarantiaLiteComanda
}

export function useCatalogoComandas(
  clienteTenantId: string | undefined,
  listaPrecioComandasId: string | null | undefined,
) {
  const [productos, setProductos] = useState<ProductoCatalogoComanda[]>([])

  useEffect(() => {
    if (!clienteTenantId) return
    let activo = true
    const listaId = listaPrecioComandasId ?? null

    async function cargarCatalogo() {
      const [productosRes, listaRes, overridesRes, rubrosRes, plantillasRes] = await Promise.all([
        supabase
          .from('productos')
          .select('id, nombre, precio_venta, costo, stock, controla_stock, tipo, rubro_id, plantilla_garantia_id')
          .eq('cliente_id', clienteTenantId)
          .eq('disponible', true)
          .eq('estado', 'activo')
          .neq('tipo', 'con_variantes')
          .order('nombre'),
        listaId
          ? supabase.from('listas_precio').select('porcentaje_recargo').eq('id', listaId).maybeSingle()
          : Promise.resolve({ data: null } as { data: { porcentaje_recargo: number } | null }),
        listaId
          ? supabase.from('producto_precios').select('producto_id, precio').eq('lista_id', listaId)
          : Promise.resolve({ data: [] as { producto_id: string; precio: number }[] }),
        supabase.from('rubros').select('id, plantilla_garantia_id'),
        supabase.from('plantillas_garantia').select('id, nombre, duracion_meses, cobertura'),
      ])

      if (!activo) return

      const porcentaje = listaRes.data ? Number(listaRes.data.porcentaje_recargo) : 0
      const overridesPorProducto = new Map<string, number>()
      for (const o of overridesRes.data ?? []) {
        overridesPorProducto.set(o.producto_id, Number(o.precio))
      }

      const plantillaGarantiaPorRubro = new Map<string, string>()
      for (const r of (rubrosRes.data ?? []) as any[]) {
        if (r.plantilla_garantia_id) plantillaGarantiaPorRubro.set(r.id, r.plantilla_garantia_id)
      }

      const plantillasPorId = new Map<string, PlantillaGarantiaLiteComanda>()
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
            plantillaGarantia: idPlantillaEfectiva ? plantillasPorId.get(idPlantillaEfectiva) : undefined,
          } as ProductoCatalogoComanda
        }),
      )
    }

    cargarCatalogo()
    return () => {
      activo = false
    }
  }, [clienteTenantId, listaPrecioComandasId])

  const porId = useMemo(() => {
    const map = new Map<string, ProductoCatalogoComanda>()
    for (const p of productos) map.set(p.id, p)
    return map
  }, [productos])

  return { productos, porId }
}
