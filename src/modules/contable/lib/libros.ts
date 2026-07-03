// Libro diario y Libro mayor: vistas de solo lectura calculadas al vuelo
// sobre los asientos ya cargados -- no son tablas propias (ver
// Diseno_Modulo_Contable.md, sección 3: "separar fuente de verdad de
// vistas"). Reciben los asientos y cuentas que ya trajeron useAsientos()/
// useCuentasContables() -- no hacen fetch propio.

import type { Asiento, CuentaContable, MovimientoLibroDiario, MovimientoLibroMayor, TipoCuenta } from '../types'

/** Cuentas "deudoras por naturaleza": su saldo normal crece con el Debe. */
const NATURALEZA_DEUDORA: TipoCuenta[] = ['activo', 'costo', 'gasto']

export function construirLibroDiario(
  asientos: Asiento[],
  cuentasPorId: Map<string, CuentaContable>,
): MovimientoLibroDiario[] {
  return [...asientos]
    .sort((a, b) => (a.fecha === b.fecha ? a.numero - b.numero : a.fecha.localeCompare(b.fecha)))
    .map((a) => ({
      asientoId: a.id,
      numero: a.numero,
      fecha: a.fecha,
      descripcion: a.descripcion,
      origen: a.origen,
      lineas: a.lineas.map((l) => {
        const cuenta = cuentasPorId.get(l.cuentaId)
        return {
          cuentaCodigo: cuenta?.codigo ?? '?',
          cuentaNombre: cuenta?.nombre ?? 'Cuenta eliminada',
          debe: l.debe,
          haber: l.haber,
        }
      }),
    }))
}

export function construirLibroMayor(
  asientos: Asiento[],
  cuenta: CuentaContable,
): MovimientoLibroMayor[] {
  const esDeudora = NATURALEZA_DEUDORA.includes(cuenta.tipo)

  const movimientos = [...asientos]
    .sort((a, b) => (a.fecha === b.fecha ? a.numero - b.numero : a.fecha.localeCompare(b.fecha)))
    .flatMap((a) =>
      a.lineas
        .filter((l) => l.cuentaId === cuenta.id)
        .map((l) => ({
          asientoId: a.id,
          numero: a.numero,
          fecha: a.fecha,
          descripcion: a.descripcion,
          debe: l.debe,
          haber: l.haber,
        })),
    )

  let saldo = 0
  return movimientos.map((m) => {
    saldo += esDeudora ? m.debe - m.haber : m.haber - m.debe
    return { ...m, saldoAcumulado: saldo }
  })
}

/** Saldo actual de una cuenta (para Balance/Estado de Resultado), respetando
 * su naturaleza deudora/acreedora. */
export function saldoDeCuenta(asientos: Asiento[], cuenta: CuentaContable): number {
  const esDeudora = NATURALEZA_DEUDORA.includes(cuenta.tipo)
  let saldo = 0
  for (const a of asientos) {
    for (const l of a.lineas) {
      if (l.cuentaId !== cuenta.id) continue
      saldo += esDeudora ? l.debe - l.haber : l.haber - l.debe
    }
  }
  return saldo
}
