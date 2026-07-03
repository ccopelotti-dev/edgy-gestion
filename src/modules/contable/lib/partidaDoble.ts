// Validación de partida doble -- la regla central de todo el módulo: un
// asiento no es válido si la suma de los débitos no es igual a la suma de
// los créditos. No es una preferencia de UI, es la definición de "asiento
// contable" (ver Diseno_Modulo_Contable.md, sección 5).

import type { LineaAsientoInput } from '../types'

const EPSILON = 0.005 // tolerancia de redondeo en centavos

export interface ValidacionAsiento {
  valido: boolean
  totalDebe: number
  totalHaber: number
  diferencia: number
  errores: string[]
}

export function validarAsiento(
  lineas: LineaAsientoInput[],
  fecha: string,
): ValidacionAsiento {
  const errores: string[] = []

  if (!fecha) errores.push('La fecha es obligatoria.')
  if (lineas.length < 2) errores.push('Un asiento necesita al menos 2 líneas.')

  for (const [i, linea] of lineas.entries()) {
    if (!linea.cuentaId) errores.push(`Línea ${i + 1}: falta seleccionar la cuenta.`)
    if (linea.debe < 0 || linea.haber < 0) errores.push(`Línea ${i + 1}: los montos no pueden ser negativos.`)
    if (linea.debe > 0 && linea.haber > 0) errores.push(`Línea ${i + 1}: no puede tener debe y haber a la vez.`)
    if (linea.debe === 0 && linea.haber === 0) errores.push(`Línea ${i + 1}: tiene que cargar un monto en debe o en haber.`)
  }

  const totalDebe = lineas.reduce((sum, l) => sum + (l.debe || 0), 0)
  const totalHaber = lineas.reduce((sum, l) => sum + (l.haber || 0), 0)
  const diferencia = Math.round((totalDebe - totalHaber) * 100) / 100

  if (Math.abs(diferencia) > EPSILON) {
    errores.push(
      `El asiento no balancea: Debe ${totalDebe.toFixed(2)} vs. Haber ${totalHaber.toFixed(2)} (diferencia ${diferencia.toFixed(2)}).`,
    )
  }

  return { valido: errores.length === 0, totalDebe, totalHaber, diferencia, errores }
}
