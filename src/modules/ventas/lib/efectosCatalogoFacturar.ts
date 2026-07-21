// ============================================================
// Módulo Ventas — Efectos de catálogo al facturar desde Ordenes/Presupuestos
// Edgy Gestión · Fase 22b (cierre de un gap pre-existente)
//
// Comprobantes.tsx (Fase 19.1) y PuntoDeVenta.tsx (Fase 6b/6c) ya
// descuentan stock y (solo PuntoDeVenta) activan garantía cuando una
// línea de la factura está vinculada a un producto/combo real del
// catálogo. "Facturar directamente" desde Ordenes.tsx y Presupuestos.tsx
// nunca tuvo ninguna de las dos cosas -- el ADD_COMPROBANTE que disparan
// esas pantallas solo crea el comprobante, sin los side-effects de
// catálogo. Esto quedó expuesto al revisar Fase 22b (Ventas Online iba a
// dejar de tener su propio motor de stock/garantía asumiendo que
// Facturar en Comandas ya lo cubría -- no era cierto).
//
// Esta función centraliza ambos efectos para que Ordenes.tsx y
// Presupuestos.tsx los llamen igual, sin duplicar la resolución de
// plantilla de garantía (que PuntoDeVenta resuelve de un catálogo ya
// precargado en memoria -- acá no lo tenemos montado, así que se
// resuelve con consultas puntuales a Supabase).
// ============================================================

import { supabase } from '@/lib/supabase'
import {
  descontarStockPorVenta,
  expandirLineasConCombos,
  type LineaVentaCatalogo,
} from './descontarStockVenta'
import { activarGarantiasPorVenta, type LineaGarantia } from './activarGarantiasVenta'

/** Fire-and-forget, mismo criterio que el resto de los side-effects de
 * Ventas: el comprobante ya se generó: si esto falla no se revierte la
 * venta, solo queda constancia en consola. */
export async function aplicarEfectosCatalogoAlFacturar(
  items: LineaVentaCatalogo[],
  clienteTenantId: string,
  numeroFactura: number,
  fecha: string,
  contactoNombre: string,
  contactoTelefono: string,
): Promise<void> {
  const lineasCatalogo = items.filter((i) => (i.productoId || i.comboId) && i.cantidad > 0)
  if (lineasCatalogo.length === 0) return

  try {
    const lineasStock = await expandirLineasConCombos(lineasCatalogo)
    if (lineasStock.length > 0) {
      await descontarStockPorVenta(lineasStock, clienteTenantId, numeroFactura, fecha)
    }
  } catch {
    // eslint-disable-next-line no-console
    console.error('No se pudo descontar el stock de la venta', numeroFactura)
  }

  // Garantía: solo líneas con productoId directo -- un combo no tiene
  // garantía propia (mismo criterio que PuntoDeVenta.tsx).
  const productoIds = Array.from(
    new Set(lineasCatalogo.filter((i) => i.productoId).map((i) => i.productoId!)),
  )
  if (productoIds.length === 0) return

  try {
    const { data: productos } = await supabase
      .from('productos')
      .select('id, nombre, rubro_id, plantilla_garantia_id')
      .in('id', productoIds)
    if (!productos || productos.length === 0) return

    const rubroIds = Array.from(
      new Set(
        productos
          .filter((p: any) => !p.plantilla_garantia_id && p.rubro_id)
          .map((p: any) => p.rubro_id as string),
      ),
    )
    const plantillaPorRubro = new Map<string, string>()
    if (rubroIds.length > 0) {
      const { data: rubros } = await supabase
        .from('rubros')
        .select('id, plantilla_garantia_id')
        .in('id', rubroIds)
      for (const r of (rubros ?? []) as any[]) {
        if (r.plantilla_garantia_id) plantillaPorRubro.set(r.id, r.plantilla_garantia_id)
      }
    }

    const plantillaIdPorProducto = new Map<string, string>()
    for (const p of productos as any[]) {
      const idEfectivo = p.plantilla_garantia_id ?? plantillaPorRubro.get(p.rubro_id ?? '')
      if (idEfectivo) plantillaIdPorProducto.set(p.id, idEfectivo)
    }
    if (plantillaIdPorProducto.size === 0) return

    const plantillaIds = Array.from(new Set(plantillaIdPorProducto.values()))
    const { data: plantillas } = await supabase
      .from('plantillas_garantia')
      .select('id, nombre, duracion_meses, cobertura')
      .in('id', plantillaIds)
    const plantillaPorId = new Map((plantillas ?? []).map((pg: any) => [pg.id, pg]))
    const nombrePorProducto = new Map((productos as any[]).map((p) => [p.id, p.nombre as string]))

    const lineasGarantia: LineaGarantia[] = []
    for (const i of lineasCatalogo) {
      if (!i.productoId) continue
      const plantillaId = plantillaIdPorProducto.get(i.productoId)
      if (!plantillaId) continue
      const pg = plantillaPorId.get(plantillaId) as any
      if (!pg) continue
      lineasGarantia.push({
        productoId: i.productoId,
        varianteId: i.varianteId,
        cantidad: i.cantidad,
        productoNombre: nombrePorProducto.get(i.productoId) ?? '',
        plantillaGarantiaId: pg.id,
        nombrePlantilla: pg.nombre,
        duracionMeses: Number(pg.duracion_meses),
        cobertura: pg.cobertura ?? '',
      })
    }

    if (lineasGarantia.length > 0) {
      await activarGarantiasPorVenta(
        lineasGarantia,
        clienteTenantId,
        numeroFactura,
        fecha,
        contactoNombre,
        contactoTelefono,
      )
    }
  } catch {
    // eslint-disable-next-line no-console
    console.error('No se pudo activar la garantía de la venta', numeroFactura)
  }
}
