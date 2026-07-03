// Balance general y Estado de resultado: vistas calculadas agregando saldos
// de cuentas (ver Diseno_Modulo_Contable.md, sección 3). No filtran por
// fecha de corte en esta v1 -- toman todos los asientos cargados; filtrar
// por fecha queda como extensión natural (ver manual, sección "Cómo
// extender").

import { saldoDeCuenta } from './libros'
import type {
  Asiento,
  BalanceGeneral,
  CuentaContable,
  EstadoResultado,
  FilaBalanceGeneral,
  FilaEstadoResultado,
} from '../types'

/** Calcula el "nivel" de una cuenta en el árbol contando ancestros -- se usa
 * para indentar el árbol en la UI (misma idea que Rubro/SubRubro en otros
 * módulos, pero acá el árbol puede tener más de 2 niveles). */
function nivelDe(cuenta: CuentaContable, cuentasPorId: Map<string, CuentaContable>): number {
  let nivel = 0
  let actual = cuenta
  while (actual.cuentaPadreId) {
    const padre = cuentasPorId.get(actual.cuentaPadreId)
    if (!padre) break
    nivel += 1
    actual = padre
  }
  return nivel
}

function filasDeRama(
  cuentas: CuentaContable[],
  asientos: Asiento[],
  cuentasPorId: Map<string, CuentaContable>,
  tipos: CuentaContable['tipo'][],
): { filas: FilaBalanceGeneral[]; total: number } {
  const deLaRama = cuentas
    .filter((c) => tipos.includes(c.tipo) && c.activa)
    .sort((a, b) => a.codigo.localeCompare(b.codigo))

  const filas: FilaBalanceGeneral[] = deLaRama.map((c) => ({
    cuentaId: c.id,
    codigo: c.codigo,
    nombre: c.nombre,
    nivel: nivelDe(c, cuentasPorId),
    imputable: c.imputable,
    saldo: c.imputable ? saldoDeCuenta(asientos, c) : 0,
  }))

  // El total solo suma cuentas imputables -- las de agrupación (imputable
  // = false) son solo para organizar el árbol, sumarlas duplicaría el monto.
  const total = filas.filter((f) => f.imputable).reduce((sum, f) => sum + f.saldo, 0)

  return { filas, total }
}

export function calcularBalanceGeneral(cuentas: CuentaContable[], asientos: Asiento[]): BalanceGeneral {
  const cuentasPorId = new Map(cuentas.map((c) => [c.id, c]))

  const { filas: activo, total: totalActivo } = filasDeRama(cuentas, asientos, cuentasPorId, ['activo'])
  const { filas: pasivo, total: totalPasivo } = filasDeRama(cuentas, asientos, cuentasPorId, ['pasivo'])
  const { filas: patrimonioNeto, total: totalPatrimonioNeto } = filasDeRama(cuentas, asientos, cuentasPorId, [
    'patrimonio_neto',
  ])

  return {
    activo,
    pasivo,
    patrimonioNeto,
    totalActivo,
    totalPasivo,
    totalPatrimonioNeto,
    diferencia: Math.round((totalActivo - (totalPasivo + totalPatrimonioNeto)) * 100) / 100,
  }
}

function filasResultado(
  cuentas: CuentaContable[],
  asientos: Asiento[],
  cuentasPorId: Map<string, CuentaContable>,
  tipos: CuentaContable['tipo'][],
): { filas: FilaEstadoResultado[]; total: number } {
  const deLaRama = cuentas
    .filter((c) => tipos.includes(c.tipo) && c.activa)
    .sort((a, b) => a.codigo.localeCompare(b.codigo))

  const filas: FilaEstadoResultado[] = deLaRama.map((c) => ({
    cuentaId: c.id,
    codigo: c.codigo,
    nombre: c.nombre,
    nivel: nivelDe(c, cuentasPorId),
    imputable: c.imputable,
    monto: c.imputable ? saldoDeCuenta(asientos, c) : 0,
  }))

  const total = filas.filter((f) => f.imputable).reduce((sum, f) => sum + f.monto, 0)
  return { filas, total }
}

export function calcularEstadoResultado(cuentas: CuentaContable[], asientos: Asiento[]): EstadoResultado {
  const cuentasPorId = new Map(cuentas.map((c) => [c.id, c]))

  const { filas: ingresos, total: totalIngresos } = filasResultado(cuentas, asientos, cuentasPorId, ['ingreso'])
  const { filas: costos, total: totalCostos } = filasResultado(cuentas, asientos, cuentasPorId, ['costo'])
  const { filas: gastos, total: totalGastos } = filasResultado(cuentas, asientos, cuentasPorId, ['gasto'])

  return {
    ingresos,
    costos,
    gastos,
    totalIngresos,
    totalCostos,
    totalGastos,
    resultado: Math.round((totalIngresos - totalCostos - totalGastos) * 100) / 100,
  }
}
