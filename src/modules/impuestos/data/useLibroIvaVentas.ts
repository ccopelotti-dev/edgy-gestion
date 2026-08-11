// Libro IVA Ventas -- reporte agregado sobre lo que YA existe en
// Ventas (comprobantes_venta + comprobante_venta_items), no hay
// carga paralela. `tipo_comprobante_codigo` sale de `afip.tipoComprobanteAfip`
// (Fase 11, WSFEv1) cuando el comprobante fue autorizado ante ARCA;
// si no lo fue (interno/borrador) queda null y no entra en el
// resumen de alícuotas -- solo cuenta lo efectivamente facturado.

import { useCallback, useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import type { ComprobanteLibroIva, LineaAlicuota, ResumenLibroIva } from '../types'
import { rangoPeriodo } from '../lib/format'
import { useClienteId } from './useClienteId'

function armarResumen(periodo: string, comprobantes: ComprobanteLibroIva[]): ResumenLibroIva {
  const porAlicuotaMap = new Map<number, LineaAlicuota>()
  let totalNetoGravado = 0
  let totalExento = 0
  let totalIva = 0
  let totalGeneral = 0

  for (const c of comprobantes) {
    totalNetoGravado += c.netoGravado
    totalExento += c.exento
    totalIva += c.totalIva
    totalGeneral += c.total
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
    porAlicuota: Array.from(porAlicuotaMap.values())
      .map((a) => ({ ...a, netoGravado: round2(a.netoGravado), iva: round2(a.iva) }))
      .sort((a, b) => a.alicuota - b.alicuota),
    comprobantes,
  }
}

function round2(n: number): number {
  return Math.round(n * 100) / 100
}

interface UseLibroIvaVentasResult {
  resumen: ResumenLibroIva | null
  cargando: boolean
  error: string | null
  recargar: () => Promise<void>
}

export function useLibroIvaVentas(periodo: string): UseLibroIvaVentasResult {
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
      .from('comprobantes_venta')
      .select(
        `id, fecha, numero, punto_venta_id, subtotal, monto_iva, total, afip,
         cliente_venta_id, clientes_venta(nombre, documento, condicion_iva),
         puntos_venta(numero),
         comprobante_venta_items(alicuota_iva, subtotal, monto_iva)`,
      )
      .eq('cliente_id', clienteId)
      .neq('estado', 'anulado')
      .gte('fecha', desde)
      .lte('fecha', hasta)
      .order('fecha', { ascending: true })

    if (errFetch) {
      setError('No pudimos cargar el Libro IVA Ventas.')
      setCargando(false)
      return
    }

    const comprobantes: ComprobanteLibroIva[] = (data ?? [])
      .filter((row: any) => (row.comprobante_venta_items ?? []).length > 0)
      .map((row: any) => {
        const porAlic = new Map<number, LineaAlicuota>()
        let exento = 0
        for (const it of row.comprobante_venta_items ?? []) {
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
        const cliente = row.clientes_venta as { nombre?: string; documento?: string; condicion_iva?: string } | null
        return {
          id: row.id,
          fecha: row.fecha,
          tipoComprobanteCodigo: row.afip?.tipoComprobanteAfip ? String(row.afip.tipoComprobanteAfip).padStart(3, '0') : null,
          puntoVenta: row.puntos_venta?.numero ?? null,
          numero: row.numero,
          sujetoNombre: cliente?.nombre ?? 'Consumidor Final',
          sujetoDocumento: cliente?.documento ?? null,
          condicionIva: cliente?.condicion_iva ?? null,
          netoGravado: round2(Array.from(porAlic.values()).reduce((a, x) => a + x.netoGravado, 0)),
          exento: round2(exento),
          totalIva: round2(Number(row.monto_iva)),
          total: round2(Number(row.total)),
          alicuotas: Array.from(porAlic.values()).map((a) => ({ ...a, netoGravado: round2(a.netoGravado), iva: round2(a.iva) })),
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
