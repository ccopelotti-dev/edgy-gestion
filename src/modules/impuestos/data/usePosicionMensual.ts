// Combina Libro IVA Ventas + Compras + Retenciones sufridas del
// período + saldo técnico del período anterior (posiciones_iva_mensuales,
// si ya se cerró) para calcular la posición del mes en curso -- esto
// es la "calculadora fiscal preliminar" en tiempo real. `cerrar()`
// persiste el resultado para que el próximo período lo use como
// saldo anterior.

import { useCallback, useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { calcularPosicionMensual, type CalculoPosicionMensualResultado } from '../lib/posicionMensual'
import { periodoAnterior } from '../lib/format'
import { useClienteId } from './useClienteId'
import { useLibroIvaVentas } from './useLibroIvaVentas'
import { useLibroIvaCompras } from './useLibroIvaCompras'
import { useRetencionesPercepciones } from './useRetencionesPercepciones'

interface UsePosicionMensualResult {
  resultado: CalculoPosicionMensualResultado | null
  debitoFiscal: number
  creditoFiscalComputable: number
  retencionesSufridas: number
  saldoTecnicoAnterior: number
  periodoCerrado: boolean
  cargando: boolean
  error: string | null
  cerrar: () => Promise<boolean>
}

export function usePosicionMensual(periodo: string): UsePosicionMensualResult {
  const { clienteId } = useClienteId()
  const { resumen: ventas, cargando: cargandoVentas } = useLibroIvaVentas(periodo)
  const { resumen: compras, cargando: cargandoCompras } = useLibroIvaCompras(periodo)
  const { registros: retenciones, cargando: cargandoRetenciones } = useRetencionesPercepciones(periodo)

  const [saldoAnterior, setSaldoAnterior] = useState(0)
  const [periodoCerrado, setPeriodoCerrado] = useState(false)
  const [cargandoSaldo, setCargandoSaldo] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const cargarSaldoAnterior = useCallback(async () => {
    if (!clienteId) {
      setCargandoSaldo(false)
      return
    }
    setCargandoSaldo(true)

    const { data: posActual } = await supabase
      .from('posiciones_iva_mensuales')
      .select('cerrado')
      .eq('cliente_id', clienteId)
      .eq('periodo', periodo)
      .maybeSingle()
    setPeriodoCerrado(!!posActual?.cerrado)

    const { data: posAnterior, error: errFetch } = await supabase
      .from('posiciones_iva_mensuales')
      .select('saldo_tecnico')
      .eq('cliente_id', clienteId)
      .eq('periodo', periodoAnterior(periodo))
      .maybeSingle()

    if (errFetch) {
      setError('No pudimos cargar el saldo técnico del período anterior.')
      setCargandoSaldo(false)
      return
    }

    // saldo_tecnico negativo = a favor -- lo que arrastramos es ese
    // saldo a favor (valor absoluto), 0 si dio a pagar o no hay
    // período anterior cargado.
    const saldo = posAnterior?.saldo_tecnico ?? 0
    setSaldoAnterior(saldo < 0 ? Math.abs(saldo) : 0)
    setCargandoSaldo(false)
  }, [clienteId, periodo])

  useEffect(() => {
    cargarSaldoAnterior()
  }, [cargarSaldoAnterior])

  const debitoFiscal = ventas?.totalIva ?? 0
  const creditoFiscalComputable = compras?.totalCreditoFiscalComputable ?? 0
  const retencionesSufridas = retenciones
    .filter((r) => r.direccion === 'sufrida' && r.impuesto === 'iva')
    .reduce((acc, r) => acc + r.monto, 0)

  const resultado =
    ventas && compras
      ? calcularPosicionMensual({
          debitoFiscal,
          creditoFiscalComputable,
          retencionesPercepcionesSufridas: retencionesSufridas,
          saldoTecnicoAnteriorAFavor: saldoAnterior,
        })
      : null

  const cerrar = useCallback(async () => {
    if (!clienteId || !resultado) return false
    setError(null)

    const { error: errUpsert } = await supabase.from('posiciones_iva_mensuales').upsert(
      {
        cliente_id: clienteId,
        periodo,
        debito_fiscal: debitoFiscal,
        credito_fiscal: creditoFiscalComputable,
        retenciones_percepciones_sufridas: retencionesSufridas,
        saldo_tecnico_anterior: saldoAnterior,
        saldo_tecnico: resultado.saldoTecnico,
        saldo_libre_disponibilidad: resultado.saldoLibreDisponibilidad,
        cerrado: true,
      },
      { onConflict: 'cliente_id,periodo' },
    )

    if (errUpsert) {
      setError('No pudimos cerrar el período.')
      return false
    }

    setPeriodoCerrado(true)
    return true
  }, [clienteId, periodo, resultado, debitoFiscal, creditoFiscalComputable, retencionesSufridas, saldoAnterior])

  return {
    resultado,
    debitoFiscal,
    creditoFiscalComputable,
    retencionesSufridas,
    saldoTecnicoAnterior: saldoAnterior,
    periodoCerrado,
    cargando: cargandoVentas || cargandoCompras || cargandoRetenciones || cargandoSaldo,
    error,
    cerrar,
  }
}
