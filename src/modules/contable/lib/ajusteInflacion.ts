// Ajuste por inflación: aplica un coeficiente a un conjunto de cuentas no
// monetarias elegidas a mano (bienes de uso, patrimonio, etc.) y genera la
// contrapartida en "Resultado por Exposición a la Inflación (REI)". Es un
// asiento común con origen='ajuste_inflacion' -- no hay tabla propia.
//
// Simplificación deliberada de esta v1: el modelo de cuentas no distingue
// "monetario" de "no monetario" como un campo propio (el ajuste por
// inflación contable real solo debería aplicarse a partidas no monetarias).
// En vez de inventar esa clasificación sin pedirla, se deja a criterio del
// usuario elegir manualmente qué cuentas ajustar -- documentado en el
// manual como una simplificación a revisar con un contador antes de usar
// en un cierre real.

import { saldoDeCuenta } from './libros'
import type { Asiento, CuentaContable, LineaAsientoInput } from '../types'

export const CODIGO_REI = '4.1.03'

const NATURALEZA_DEUDORA: CuentaContable['tipo'][] = ['activo', 'costo', 'gasto']

export interface PreviewAjusteInflacion {
  lineas: LineaAsientoInput[]
  totalAjusteNeto: number
  cuentaREI: CuentaContable | null
  error: string | null
}

export function generarLineasAjusteInflacion(
  cuentas: CuentaContable[],
  asientos: Asiento[],
  cuentaIdsSeleccionadas: string[],
  coeficiente: number,
): PreviewAjusteInflacion {
  const cuentaREI =
    cuentas.find((c) => c.codigo === CODIGO_REI) ??
    cuentas.find((c) => c.nombre.toLowerCase().includes('exposición a la inflación')) ??
    null

  if (!cuentaREI) {
    return {
      lineas: [],
      totalAjusteNeto: 0,
      cuentaREI: null,
      error: 'No encontramos la cuenta "Resultado por Exposición a la Inflación" (código 4.1.03).',
    }
  }

  if (cuentaIdsSeleccionadas.length === 0) {
    return { lineas: [], totalAjusteNeto: 0, cuentaREI, error: 'Elegí al menos una cuenta para ajustar.' }
  }

  if (!Number.isFinite(coeficiente) || coeficiente <= 0) {
    return { lineas: [], totalAjusteNeto: 0, cuentaREI, error: 'El coeficiente tiene que ser un número mayor a 0.' }
  }

  const lineas: LineaAsientoInput[] = []
  let totalAjusteNeto = 0

  for (const cuentaId of cuentaIdsSeleccionadas) {
    const cuenta = cuentas.find((c) => c.id === cuentaId)
    if (!cuenta || !cuenta.imputable) continue

    const saldo = saldoDeCuenta(asientos, cuenta)
    const ajuste = Math.round(saldo * (coeficiente - 1) * 100) / 100
    if (Math.abs(ajuste) < 0.005) continue

    const esDeudora = NATURALEZA_DEUDORA.includes(cuenta.tipo)

    if (esDeudora) {
      if (ajuste > 0) lineas.push({ cuentaId: cuenta.id, debe: ajuste, haber: 0, descripcion: 'Ajuste por inflación' })
      else lineas.push({ cuentaId: cuenta.id, debe: 0, haber: -ajuste, descripcion: 'Ajuste por inflación' })
      totalAjusteNeto += ajuste
    } else {
      if (ajuste > 0) lineas.push({ cuentaId: cuenta.id, debe: 0, haber: ajuste, descripcion: 'Ajuste por inflación' })
      else lineas.push({ cuentaId: cuenta.id, debe: -ajuste, haber: 0, descripcion: 'Ajuste por inflación' })
      totalAjusteNeto -= ajuste
    }
  }

  if (lineas.length === 0) {
    return { lineas: [], totalAjusteNeto: 0, cuentaREI, error: 'Ninguna de las cuentas elegidas tiene saldo para ajustar.' }
  }

  const neto = Math.round(totalAjusteNeto * 100) / 100
  if (neto > 0) {
    lineas.push({ cuentaId: cuentaREI.id, debe: 0, haber: neto, descripcion: 'Contrapartida ajuste por inflación (REI)' })
  } else if (neto < 0) {
    lineas.push({ cuentaId: cuentaREI.id, debe: -neto, haber: 0, descripcion: 'Contrapartida ajuste por inflación (REI)' })
  }

  return { lineas, totalAjusteNeto: neto, cuentaREI, error: null }
}
