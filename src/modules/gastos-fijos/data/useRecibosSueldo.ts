import { useCallback, useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { registrarMovimientoTesoreria } from '@/lib/tesoreriaSync'
import type { AlicuotasLiquidacion, Empleado, ReciboConcepto, ReciboSueldo } from '../types'
import { generarConceptosRecibo, recalcularTotales, type LineaBorrador } from '../lib/calculoRecibo'
import { useClienteId } from './useClienteId'

function filaAConcepto(row: any): ReciboConcepto {
  return {
    id: row.id,
    reciboId: row.recibo_id,
    tipo: row.tipo,
    rubro: row.rubro,
    concepto: row.concepto,
    baseCalculo: row.base_calculo === null ? null : Number(row.base_calculo),
    monto: Number(row.monto),
    orden: row.orden,
  }
}

function filaARecibo(row: any): ReciboSueldo {
  return {
    id: row.id,
    clienteId: row.cliente_id,
    empleadoId: row.empleado_id,
    numero: row.numero,
    periodo: row.periodo,
    fechaPago: row.fecha_pago,
    estado: row.estado,
    presentismo: row.presentismo,
    esRectificativa: row.es_rectificativa,
    reciboOriginalId: row.recibo_original_id,
    totalRemunerativo: Number(row.total_remunerativo),
    totalDeducciones: Number(row.total_deducciones),
    neto: Number(row.neto),
    totalContribucionesPatronales: Number(row.total_contribuciones_patronales),
    pagado: row.pagado,
    fechaPagoReal: row.fecha_pago_real,
    createdAt: row.created_at,
    empleadoNombre: row.empleados?.nombre,
    empleadoCuil: row.empleados?.cuil ?? null,
    empleadoCategoria: row.empleados?.categoria ?? null,
    empleadoFechaIngreso: row.empleados?.fecha_ingreso,
    conceptos: (row.recibo_conceptos ?? []).map(filaAConcepto).sort((a: ReciboConcepto, b: ReciboConcepto) => a.orden - b.orden),
  }
}

interface UseRecibosSueldoResult {
  clienteId: string | null
  recibos: ReciboSueldo[]
  cargando: boolean
  error: string | null
  generar: (empleado: Empleado, alicuotas: AlicuotasLiquidacion, opts: { periodo: string; presentismo: boolean }) => Promise<boolean>
  actualizarConceptos: (reciboId: string, conceptos: ReciboConcepto[]) => Promise<boolean>
  emitir: (reciboId: string) => Promise<boolean>
  marcarPagado: (recibo: ReciboSueldo, fechaPago: string, medioPago: string) => Promise<boolean>
  eliminar: (reciboId: string) => Promise<boolean>
  recargar: () => Promise<void>
}

export function useRecibosSueldo(): UseRecibosSueldoResult {
  const { clienteId, cargando: cargandoClienteId, error: errorClienteId } = useClienteId()
  const [recibos, setRecibos] = useState<ReciboSueldo[]>([])
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const cargar = useCallback(async () => {
    if (!clienteId) {
      setCargando(false)
      return
    }
    setCargando(true)
    setError(null)

    const { data, error: errFetch } = await supabase
      .from('recibos_sueldo')
      .select('*, empleados(nombre, cuil, categoria, fecha_ingreso), recibo_conceptos(*)')
      .eq('cliente_id', clienteId)
      .order('periodo', { ascending: false })
      .order('numero', { ascending: false })

    if (errFetch) {
      setError('No pudimos cargar los recibos de sueldo.')
      setCargando(false)
      return
    }

    setRecibos((data ?? []).map(filaARecibo))
    setCargando(false)
  }, [clienteId])

  useEffect(() => {
    if (cargandoClienteId) return
    if (errorClienteId) {
      setError(errorClienteId)
      setCargando(false)
      return
    }
    cargar()
  }, [cargandoClienteId, errorClienteId, cargar])

  const generar = useCallback(
    async (empleado: Empleado, alicuotas: AlicuotasLiquidacion, opts: { periodo: string; presentismo: boolean }) => {
      if (!clienteId) return false
      setError(null)

      const { conceptos, totales } = generarConceptosRecibo(empleado, alicuotas, opts)

      const { data: existentes, error: errMax } = await supabase
        .from('recibos_sueldo')
        .select('numero')
        .eq('cliente_id', clienteId)
        .order('numero', { ascending: false })
        .limit(1)

      if (errMax) {
        setError('No pudimos calcular el número de recibo.')
        return false
      }

      const siguienteNumero = (existentes?.[0]?.numero ?? 0) + 1

      const { data: reciboCreado, error: errInsert } = await supabase
        .from('recibos_sueldo')
        .insert({
          cliente_id: clienteId,
          empleado_id: empleado.id,
          numero: siguienteNumero,
          periodo: opts.periodo,
          estado: 'borrador',
          presentismo: opts.presentismo,
          total_remunerativo: totales.totalRemunerativo,
          total_deducciones: totales.totalDeducciones,
          neto: totales.neto,
          total_contribuciones_patronales: totales.totalContribucionesPatronales,
        })
        .select('id')
        .single()

      if (errInsert || !reciboCreado) {
        setError('No pudimos crear el recibo. Verificá que no exista ya uno para ese empleado y período.')
        return false
      }

      const { error: errConceptos } = await supabase.from('recibo_conceptos').insert(
        conceptos.map((c: LineaBorrador) => ({
          recibo_id: reciboCreado.id,
          tipo: c.tipo,
          rubro: c.rubro,
          concepto: c.concepto,
          base_calculo: c.baseCalculo,
          monto: c.monto,
          orden: c.orden,
        })),
      )

      if (errConceptos) {
        setError('El recibo se creó pero no pudimos cargar sus conceptos. Eliminalo y reintentá.')
        return false
      }

      await cargar()
      return true
    },
    [clienteId, cargar],
  )

  const actualizarConceptos = useCallback(
    async (reciboId: string, conceptos: ReciboConcepto[]) => {
      setError(null)
      const totales = recalcularTotales(conceptos)

      for (const c of conceptos) {
        const { error: errUpdate } = await supabase
          .from('recibo_conceptos')
          .update({ concepto: c.concepto, monto: c.monto, base_calculo: c.baseCalculo })
          .eq('id', c.id)
        if (errUpdate) {
          setError('No pudimos guardar los cambios de un concepto.')
          return false
        }
      }

      const { error: errRecibo } = await supabase
        .from('recibos_sueldo')
        .update({
          total_remunerativo: totales.totalRemunerativo,
          total_deducciones: totales.totalDeducciones,
          neto: totales.neto,
          total_contribuciones_patronales: totales.totalContribucionesPatronales,
        })
        .eq('id', reciboId)

      if (errRecibo) {
        setError('No pudimos actualizar los totales del recibo.')
        return false
      }

      await cargar()
      return true
    },
    [cargar],
  )

  const emitir = useCallback(
    async (reciboId: string) => {
      setError(null)
      const { error: errUpdate } = await supabase.from('recibos_sueldo').update({ estado: 'emitido' }).eq('id', reciboId)
      if (errUpdate) {
        setError('No pudimos emitir el recibo.')
        return false
      }
      await cargar()
      return true
    },
    [cargar],
  )

  const marcarPagado = useCallback(
    async (recibo: ReciboSueldo, fechaPago: string, medioPago: string) => {
      if (!clienteId) return false
      setError(null)

      const { error: errUpdate } = await supabase
        .from('recibos_sueldo')
        .update({ pagado: true, fecha_pago_real: fechaPago })
        .eq('id', recibo.id)

      if (errUpdate) {
        setError('No pudimos marcar el recibo como pagado.')
        return false
      }

      // Solo se registra en Tesorería el neto abonado al empleado -- las
      // contribuciones patronales (SIPA, ART, etc.) se liquidan aparte
      // ante los organismos correspondientes, no son un pago al
      // empleado en esta misma fecha.
      await registrarMovimientoTesoreria({
        clienteId,
        tipo: 'egreso',
        medioPago,
        monto: recibo.neto,
        concepto: `Sueldo ${recibo.empleadoNombre ?? ''} · ${recibo.periodo}`.trim(),
        categoria: 'sueldos',
        fecha: fechaPago,
        origenModulo: 'gastos-fijos',
        origenId: recibo.id,
      })

      await cargar()
      return true
    },
    [clienteId, cargar],
  )

  const eliminar = useCallback(
    async (reciboId: string) => {
      setError(null)
      const { error: errDelete } = await supabase.from('recibos_sueldo').delete().eq('id', reciboId).eq('estado', 'borrador')
      if (errDelete) {
        setError('No pudimos eliminar el recibo.')
        return false
      }
      await cargar()
      return true
    },
    [cargar],
  )

  return {
    clienteId,
    recibos,
    cargando: cargando || cargandoClienteId,
    error,
    generar,
    actualizarConceptos,
    emitir,
    marcarPagado,
    eliminar,
    recargar: cargar,
  }
}
