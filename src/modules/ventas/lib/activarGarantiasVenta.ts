// ============================================================
// Módulo Ventas — Activación de garantía al facturar
// Edgy Gestión · Fase 6b del refactor de Productos
//
// Cuando una línea de la factura está vinculada a un producto real del
// catálogo (productos-stock, Fase 6c) que tiene una plantilla de
// garantía asignada (propia o heredada de su rubro -- resuelto en
// PuntoDeVenta.tsx, mismo criterio que resolverPlantillaGarantia() en
// productos-stock/data/store.tsx), se crea un registro en
// garantias_emitidas con la fecha de vencimiento calculada a partir de
// la duración de la plantilla.
//
// Se llama DESPUÉS de que ADD_COMPROBANTE ya generó la factura, como
// fire-and-forget, mismo criterio que descontarStockPorVenta -- no
// bloquea la venta si falla.
// ============================================================

import { supabase } from '@/lib/supabase'

export interface LineaGarantia {
  productoId: string
  varianteId?: string
  cantidad: number
  productoNombre: string
  plantillaGarantiaId: string
  nombrePlantilla: string
  duracionMeses: number
  cobertura: string
}

// Suma meses a una fecha 'YYYY-MM-DD' usando componentes locales (no
// parsea el string como Date directo, para evitar el corrimiento de un
// día por zona horaria -- mismo criterio que todayISO() en
// productos-stock/lib/format.ts).
function sumarMeses(fechaISO: string, meses: number): string {
  const [y, m, d] = fechaISO.split('-').map(Number)
  const fecha = new Date(y, (m ?? 1) - 1, d ?? 1)
  fecha.setMonth(fecha.getMonth() + meses)
  const yyyy = fecha.getFullYear()
  const mm = String(fecha.getMonth() + 1).padStart(2, '0')
  const dd = String(fecha.getDate()).padStart(2, '0')
  return `${yyyy}-${mm}-${dd}`
}

export async function activarGarantiasPorVenta(
  lineas: LineaGarantia[],
  clienteTenantId: string,
  numeroFactura: number,
  fecha: string,
  clienteFinalNombre: string,
  clienteFinalTelefono: string,
) {
  if (lineas.length === 0) return

  const filas = lineas.map((l) => ({
    cliente_id: clienteTenantId,
    comprobante_numero: numeroFactura,
    producto_id: l.productoId,
    variante_id: l.varianteId ?? null,
    producto_nombre: l.productoNombre,
    cantidad: l.cantidad,
    plantilla_garantia_id: l.plantillaGarantiaId,
    nombre_plantilla: l.nombrePlantilla,
    duracion_meses: l.duracionMeses,
    cobertura: l.cobertura || null,
    cliente_final_nombre: clienteFinalNombre.trim() || 'Consumidor Final',
    cliente_final_telefono: clienteFinalTelefono.trim(),
    fecha_inicio: fecha,
    fecha_vencimiento: sumarMeses(fecha, l.duracionMeses),
  }))

  await supabase.from('garantias_emitidas').insert(filas)
}
