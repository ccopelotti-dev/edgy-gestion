// Libro IVA Compras -- mismo criterio que Ventas: reporte agregado
// sobre comprobantes_compra + comprobante_compra_items existentes.
// `tipo_comprobante_codigo` es la columna nueva de Fase 34 -- si un
// comprobante viejo no la tiene cargada, se lo marca sin crédito
// fiscal computable (mejor subestimar que sobreestimar un crédito
// fiscal que después no se puede sostener ante una inspección).

import { useCallback, useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import type { ComprobanteLibroIva, LineaAlicuota, ResumenLibroIva } from '../types'
import { rangoPeriodo } from '../lib/format'
import { generaCreditoFiscal } from '../lib/arcaReferencia'
import { useClienteId } from './useClienteId'

function round2(n: number): number {
  return Math.round(n * 100) / 100
}

function armarResumen(periodo: string, comprobantes: ComprobanteLibroIva[]): ResumenLibroIva {
  const porAlicuotaMap = new Map<number, LineaAlicuota>()
  let totalNetoGravado = 0
  let totalExento = 0
  let totalIva = 0
  let totalGeneral = 0
  let totalCreditoFiscalComputable = 0

  for (const c of comprobantes) {
    totalNetoGravado += c.netoGravado
    totalExento += c.exento
    totalIva += c.totalIva
    totalGeneral += c.total
    if (c.creditoFiscalComputable) totalCreditoFiscalComputable += c.totalIva
    for (const a of c.alicuotas) {
      const acc = porAlicuotaMap.get(a.alicuota) ?? { alicuota: a.alicuota, netoGravado: 0, iva: 0 }
      acc.netoGravado += a.netoGravado
      acc.iva += a.iva
      porAlicuotaMap.set(a.alicuota, acc)
    }
  }

  return {
    periodo,
    cantidadComprobantes: comprobantes.length,
    totalNetoGravado: round2(totalNetoGravado),
    totalExento: round2(totalExento),
    totalIva: round2(totalIva),
    totalGeneral: round2(totalGeneral),
    totalCreditoFiscalComputable: round2(totalCreditoFiscalComputable),
    porAlicuota: Array.from(porAlicuotaMap.values())
      .map((a) => ({ ...a, netoGravado: round2(a.netoGravado), iva: round2(a.iva) }))
      .sort((a, b) => a.alicuota - b.alicuota),
    comprobantes,
  }
}

interface UseLibroIvaComprasResult {
  resumen: ResumenLibroIva | null
  cargando: boolean
  error: string | null
  recargar: () => Promise<void>
}

export function useLibroIvaCompras(periodo: string): UseLibroIvaComprasResult {
  const { clienteId, cargando: cargandoClienteId, error: errorClienteId } = useClienteId()
  const [resumen, setResumen] = useState<ResumenLibroIva | null>(null)
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const cargar = useCallback(async () => {
    if (!clienteId) {
      setCargando(false)
      return
    }
    setCargando(true)
    setError(null)

    const { desde, hasta } = rangoPeriodo(periodo)

    const { data, error: errFetch } = await supabase
      .from('comprobantes_compra')
      .select(
        `id, fecha, numero, tipo_comprobante_codigo, numero_comprobante_proveedor, subtotal, monto_iva, total,
         proveedor_id, proveedores(nombre, cuit, condicion_iva),
         comprobante_compra_items(alicuota_iva, subtotal, monto_iva)`,
      )
      .eq('cliente_id', clienteId)
      .neq('estado', 'anulado')
      .gte('fecha', desde)
      .lte('fecha', hasta)
      .order('fecha', { ascending: true })

    if (errFetch) {
      setError('No pudimos cargar el Libro IVA Compras.')
      setCargando(false)
      return
    }

    const comprobantes: ComprobanteLibroIva[] = (data ?? [])
      .filter((row: any) => (row.comprobante_compra_items ?? []).length > 0)
      .map((row: any) => {
        const porAlic = new Map<number, LineaAlicuota>()
        let exento = 0
        for (const it of row.comprobante_compra_items ?? []) {
          const alic = Number(it.alicuota_iva)
          if (alic === 0 && Number(it.monto_iva) === 0) {
            exento += Number(it.subtotal)
            continue
          }
          const acc = porAlic.get(alic) ?? { alicuota: alic, netoGravado: 0, iva: 0 }
          acc.netoGravado += Number(it.subtotal)
          acc.iva += Number(it.monto_iva)
          porAlic.set(alic, acc)
        }
        const proveedor = row.proveedores as { nombre?: string; cuit?: string; condicion_iva?: string } | null
        return {
          id: row.id,
          fecha: row.fecha,
          tipoComprobanteCodigo: row.tipo_comprobante_codigo,
          puntoVenta: null,
          numero: row.numero,
          sujetoNombre: proveedor?.nombre ?? 'Proveedor',
          sujetoDocumento: proveedor?.cuit ?? null,
          condicionIva: proveedor?.condicion_iva ?? null,
          netoGravado: round2(Array.from(porAlic.values()).reduce((a, x) => a + x.netoGravado, 0)),
          exento: round2(exento),
          totalIva: round2(Number(row.monto_iva)),
          total: round2(Number(row.total)),
          alicuotas: Array.from(porAlic.values()).map((a) => ({ ...a, netoGravado: round2(a.netoGravado), iva: round2(a.iva) })),
          creditoFiscalComputable: generaCreditoFiscal(row.tipo_comprobante_codigo),
          numeroComprobanteProveedor: row.numero_comprobante_proveedor,
        } satisfies ComprobanteLibroIva
      })

    setResumen(armarResumen(periodo, comprobantes))
    setCargando(false)
  }, [clienteId, periodo])

  useEffect(() => {
    if (cargandoClienteId) return
    if (errorClienteId) {
      setError(errorClienteId)
      setCargando(false)
      return
    }
    cargar()
  }, [cargandoClienteId, errorClienteId, cargar])

  return { resumen, cargando: cargando || cargandoClienteId, error, recargar: cargar }
}
