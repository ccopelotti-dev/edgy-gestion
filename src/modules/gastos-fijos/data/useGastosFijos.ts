import { useCallback, useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { registrarMovimientoTesoreria } from '@/lib/tesoreriaSync'
import type { EstadoGastoFijo, GastoFijo, TipoGastoFijo } from '../types'
import { eliminarComprobanteGasto, subirComprobanteGasto } from '../lib/comprobantesGastos'
import { useClienteId } from './useClienteId'

function filaAGasto(row: any): GastoFijo {
  return {
    id: row.id,
    clienteId: row.cliente_id,
    concepto: row.concepto,
    tipo: row.tipo,
    proveedor: row.proveedor,
    periodo: row.periodo,
    monto: Number(row.monto),
    vencimiento: row.vencimiento,
    fechaPago: row.fecha_pago,
    estado: row.estado,
    comprobantePath: row.comprobante_path,
    createdAt: row.created_at,
  }
}

export interface NuevoGastoFijo {
  concepto: string
  tipo: TipoGastoFijo
  proveedor?: string
  periodo: string
  monto: number
  vencimiento?: string
}

interface UseGastosFijosResult {
  clienteId: string | null
  gastos: GastoFijo[]
  cargando: boolean
  error: string | null
  crear: (datos: NuevoGastoFijo, comprobante?: File) => Promise<boolean>
  marcarPagado: (gasto: GastoFijo, fechaPago: string, medioPago: string) => Promise<boolean>
  eliminar: (gasto: GastoFijo) => Promise<boolean>
  recargar: () => Promise<void>
}

export function useGastosFijos(): UseGastosFijosResult {
  const { clienteId, cargando: cargandoClienteId, error: errorClienteId } = useClienteId()
  const [gastos, setGastos] = useState<GastoFijo[]>([])
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
      .from('gastos_fijos')
      .select('*')
      .eq('cliente_id', clienteId)
      .order('periodo', { ascending: false })
      .order('created_at', { ascending: false })

    if (errFetch) {
      setError('No pudimos cargar los gastos fijos.')
      setCargando(false)
      return
    }

    setGastos((data ?? []).map(filaAGasto))
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

  const crear = useCallback(
    async (datos: NuevoGastoFijo, comprobante?: File) => {
      if (!clienteId) return false
      setError(null)

      let comprobantePath: string | null = null
      if (comprobante) {
        try {
          comprobantePath = await subirComprobanteGasto(comprobante, clienteId)
        } catch (e) {
          setError(e instanceof Error ? e.message : 'No pudimos subir el comprobante.')
          return false
        }
      }

      const { error: errInsert } = await supabase.from('gastos_fijos').insert({
        cliente_id: clienteId,
        concepto: datos.concepto,
        tipo: datos.tipo,
        proveedor: datos.proveedor || null,
        periodo: datos.periodo,
        monto: datos.monto,
        vencimiento: datos.vencimiento || null,
        comprobante_path: comprobantePath,
      })

      if (errInsert) {
        setError('No pudimos crear el gasto fijo.')
        return false
      }

      await cargar()
      return true
    },
    [clienteId, cargar],
  )

  const marcarPagado = useCallback(
    async (gasto: GastoFijo, fechaPago: string, medioPago: string) => {
      if (!clienteId) return false
      setError(null)

      const estado: EstadoGastoFijo = 'pagado'
      const { error: errUpdate } = await supabase
        .from('gastos_fijos')
        .update({ estado, fecha_pago: fechaPago })
        .eq('id', gasto.id)

      if (errUpdate) {
        setError('No pudimos marcar el gasto como pagado.')
        return false
      }

      await registrarMovimientoTesoreria({
        clienteId,
        tipo: 'egreso',
        medioPago,
        monto: gasto.monto,
        concepto: `${gasto.concepto} · ${gasto.periodo}`,
        categoria: 'gastos_fijos',
        fecha: fechaPago,
        origenModulo: 'gastos-fijos',
        origenId: gasto.id,
      })

      await cargar()
      return true
    },
    [clienteId, cargar],
  )

  const eliminar = useCallback(
    async (gasto: GastoFijo) => {
      setError(null)
      const { error: errDelete } = await supabase.from('gastos_fijos').delete().eq('id', gasto.id)
      if (errDelete) {
        setError('No pudimos eliminar el gasto fijo.')
        return false
      }
      if (gasto.comprobantePath) {
        await eliminarComprobanteGasto(gasto.comprobantePath)
      }
      await cargar()
      return true
    },
    [cargar],
  )

  return {
    clienteId,
    gastos,
    cargando: cargando || cargandoClienteId,
    error,
    crear,
    marcarPagado,
    eliminar,
    recargar: cargar,
  }
}
