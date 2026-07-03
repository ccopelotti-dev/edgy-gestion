// Cierre de ejercicio: cancela las cuentas de resultado (ingresos, costos,
// gastos) contra "Resultado del Ejercicio" (Patrimonio Neto). Es un asiento
// común con origen='cierre' -- no hay tabla propia (ver 0014). Simplificación
// de esta v1: no filtra por rango de fechas del ejercicio, cierra el saldo
// acumulado de TODAS las cuentas de resultado a la fecha de cierre elegida
// -- si se necesita cerrar por período exacto, hay que haber registrado los
// asientos del ejercicio anterior por separado (ver manual, "Cómo extender").

import { saldoDeCuenta } from './libros'
import type { Asiento, CuentaContable, LineaAsientoInput } from '../types'

export const CODIGO_RESULTADO_EJERCICIO = '3.03'

export interface PreviewCierre {
  lineas: LineaAsientoInput[]
  resultado: number
  cuentaResultado: CuentaContable | null
  error: string | null
}

export function generarLineasCierre(cuentas: CuentaContable[], asientos: Asiento[]): PreviewCierre {
  const cuentaResultado =
    cuentas.find((c) => c.codigo === CODIGO_RESULTADO_EJERCICIO) ??
    cuentas.find((c) => c.nombre.toLowerCase().includes('resultado del ejercicio')) ??
    null

  if (!cuentaResultado) {
    return {
      lineas: [],
      resultado: 0,
      cuentaResultado: null,
      error:
        'No encontramos la cuenta "Resultado del Ejercicio" (código 3.03) en el plan de cuentas -- hace falta para poder cerrar.',
    }
  }

  const cuentasResultado = cuentas.filter(
    (c) => c.imputable && c.activa && ['ingreso', 'costo', 'gasto'].includes(c.tipo),
  )

  const lineas: LineaAsientoInput[] = []
  let resultado = 0

  for (const cuenta of cuentasResultado) {
    const saldo = saldoDeCuenta(asientos, cuenta)
    if (Math.abs(saldo) < 0.005) continue // sin movimientos, no hace falta línea

    if (cuenta.tipo === 'ingreso') {
      // Ingreso es acreedor por naturaleza -- para cancelarlo se debita.
      lineas.push({ cuentaId: cuenta.id, debe: saldo, haber: 0, descripcion: `Cierre ${cuenta.nombre}` })
      resultado += saldo
    } else {
      // Costo/Gasto son deudores por naturaleza -- para cancelarlos se acredita.
      lineas.push({ cuentaId: cuenta.id, debe: 0, haber: saldo, descripcion: `Cierre ${cuenta.nombre}` })
      resultado -= saldo
    }
  }

  if (lineas.length === 0) {
    return {
      lineas: [],
      resultado: 0,
      cuentaResultado,
      error: 'No hay movimientos en cuentas de resultado todavía -- no hay nada para cerrar.',
    }
  }

  const resultadoRedondeado = Math.round(resultado * 100) / 100
  if (resultadoRedondeado > 0) {
    lineas.push({
      cuentaId: cuentaResultado.id,
      debe: 0,
      haber: resultadoRedondeado,
      descripcion: 'Resultado del ejercicio (ganancia)',
    })
  } else if (resultadoRedondeado < 0) {
    lineas.push({
      cuentaId: cuentaResultado.id,
      debe: -resultadoRedondeado,
      haber: 0,
      descripcion: 'Resultado del ejercicio (pérdida)',
    })
  }

  return { lineas, resultado: resultadoRedondeado, cuentaResultado, error: null }
}
