import { useCallback, useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import type { DireccionRetencionPercepcion, ImpuestoRetencionPercepcion, RetencionPercepcion, TipoRetencionPercepcion } from '../types'
import { useClienteId } from './useClienteId'

function filaARetencion(row: any): RetencionPercepcion {
  return {
    id: row.id,
    clienteId: row.cliente_id,
    fecha: row.fecha,
    periodo: row.periodo,
    tipo: row.tipo,
    direccion: row.direccion,
    impuesto: row.impuesto,
    sujetoNombre: row.sujeto_nombre,
    sujetoDocumento: row.sujeto_documento,
    numeroCertificado: row.numero_certificado,
    baseCalculo: row.base_calculo === null ? null : Number(row.base_calculo),
    alicuota: row.alicuota === null ? null : Number(row.alicuota),
    monto: Number(row.monto),
    comprobanteVentaId: row.comprobante_venta_id,
    comprobanteCompraId: row.comprobante_compra_id,
    notas: row.notas,
    createdAt: row.created_at,
  }
}

export interface NuevaRetencionPercepcion {
  fecha: string
  periodo: string
  tipo: TipoRetencionPercepcion
  direccion: DireccionRetencionPercepcion
  impuesto: ImpuestoRetencionPercepcion
  sujetoNombre: string
  sujetoDocumento?: string
  numeroCertificado?: string
  baseCalculo?: number
  alicuota?: number
  monto: number
  notas?: string
}

interface UseRetencionesPercepcionesResult {
  registros: RetencionPercepcion[]
  cargando: boolean
  error: string | null
  crear: (datos: NuevaRetencionPercepcion) => Promise<boolean>
  eliminar: (id: string) => Promise<boolean>
  recargar: () => Promise<void>
}

export function useRetencionesPercepciones(periodo?: string): UseRetencionesPercepcionesResult {
  const { clienteId, cargando: cargandoClienteId, error: errorClienteId } = useClienteId()
  const [registros, setRegistros] = useState<RetencionPercepcion[]>([])
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const cargar = useCallback(async () => {
    if (!clienteId) {
      setCargando(false)
      return
    }
    setCargando(true)
    setError(null)

    let query = supabase.from('retenciones_percepciones').select('*').eq('cliente_id', clienteId)
    if (periodo) query = query.eq('periodo', periodo)

    const { data, error: errFetch } = await query.order('fecha', { ascending: false })

    if (errFetch) {
      setError('No pudimos cargar retenciones y percepciones.')
      setCargando(false)
      return
    }

    setRegistros((data ?? []).map(filaARetencion))
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

  const crear = useCallback(
    async (datos: NuevaRetencionPercepcion) => {
      if (!clienteId) return false
      setError(null)

      const { error: errInsert } = await supabase.from('retenciones_percepciones').insert({
        cliente_id: clienteId,
        fecha: datos.fecha,
        periodo: datos.periodo,
        tipo: datos.tipo,
        direccion: datos.direccion,
        impuesto: datos.impuesto,
        sujeto_nombre: datos.sujetoNombre,
        sujeto_documento: datos.sujetoDocumento || null,
        numero_certificado: datos.numeroCertificado || null,
        base_calculo: datos.baseCalculo ?? null,
        alicuota: datos.alicuota ?? null,
        monto: datos.monto,
        notas: datos.notas || null,
      })

      if (errInsert) {
        setError('No pudimos crear el registro.')
        return false
      }

      await cargar()
      return true
    },
    [clienteId, cargar],
  )

  const eliminar = useCallback(
    async (id: string) => {
      setError(null)
      const { error: errDelete } = await supabase.from('retenciones_percepciones').delete().eq('id', id)
      if (errDelete) {
        setError('No pudimos eliminar el registro.')
        return false
      }
      await cargar()
      return true
    },
    [cargar],
  )

  return { registros, cargando: cargando || cargandoClienteId, error, crear, eliminar, recargar: cargar }
}
