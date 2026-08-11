// Motor de cálculo del recibo de sueldo -- funciones puras, sin
// Supabase adentro, para que sean fáciles de probar/ajustar a mano.
//
// Conceptos específicos de CCT 130/75 (Empleados de Comercio):
//   - Antigüedad: 1% del básico por año completo de antigüedad.
//   - Presentismo: 8.33% sobre (básico + antigüedad), condicional
//     (el operador puede destildarlo si no corresponde en el período
//     por ausencias).
//   - Seguro de vida obligatorio (Art. 97 CCT): 1/3 de la prima
//     mensual, importe fijo (no porcentual) -- ver
//     AlicuotasLiquidacion.seguro_vida_monto.
//
// Deducciones y contribuciones patronales toman como base el total
// remunerativo del período (básico + antigüedad + presentismo) -- es
// la convención estándar; si algún concepto necesita otra base
// (ej. topes de ART), se ajusta a mano en la tabla de conceptos antes
// de emitir, porque el recibo queda editable en estado "borrador".
//
// El PDF (Fase 33b) agrupa las líneas de tipo 'contribucion_patronal'
// por `rubro` para el gráfico de torta que exige el Anexo III.

import type { AlicuotasLiquidacion, Empleado, ReciboConcepto, RubroContribucion, TipoConceptoRecibo } from '../types'

export type LineaBorrador = Omit<ReciboConcepto, 'id' | 'reciboId'>

export interface TotalesRecibo {
  totalRemunerativo: number
  totalDeducciones: number
  neto: number
  totalContribucionesPatronales: number
}

/** Años completos de antigüedad entre `fechaIngreso` y el último día
 * del `periodo` ('YYYY-MM'). */
export function calcularAntiguedadAnios(fechaIngreso: string, periodo: string): number {
  const [anioP, mesP] = periodo.split('-').map(Number)
  const finPeriodo = new Date(anioP, mesP, 0) // día 0 del mes siguiente = último día del mes
  const ingreso = new Date(fechaIngreso + 'T00:00:00')

  let anios = finPeriodo.getFullYear() - ingreso.getFullYear()
  const aunNoCumplio =
    finPeriodo.getMonth() < ingreso.getMonth() ||
    (finPeriodo.getMonth() === ingreso.getMonth() && finPeriodo.getDate() < ingreso.getDate())
  if (aunNoCumplio) anios -= 1
  return Math.max(0, anios)
}

function linea(
  tipo: TipoConceptoRecibo,
  concepto: string,
  monto: number,
  orden: number,
  opts?: { rubro?: RubroContribucion; baseCalculo?: number },
): LineaBorrador {
  return {
    tipo,
    rubro: opts?.rubro ?? null,
    concepto,
    baseCalculo: opts?.baseCalculo ?? null,
    monto: Math.round(monto * 100) / 100,
    orden,
  }
}

/** Genera todas las líneas del recibo (remunerativas, deducciones,
 * contribuciones patronales) más los totales, a partir del empleado y
 * los parámetros vigentes del cliente. El resultado es editable --
 * esto es un punto de partida, no un cálculo final e inmutable. */
export function generarConceptosRecibo(
  empleado: Empleado,
  alicuotas: AlicuotasLiquidacion,
  opts: { periodo: string; presentismo: boolean },
): { conceptos: LineaBorrador[]; totales: TotalesRecibo } {
  const conceptos: LineaBorrador[] = []
  let orden = 0

  // ── Remunerativos ──────────────────────────────────────────
  const basico = empleado.sueldoBasico
  conceptos.push(linea('remunerativo', 'Sueldo Básico', basico, orden++))

  const aniosAntiguedad = calcularAntiguedadAnios(empleado.fechaIngreso, opts.periodo)
  const antiguedad = basico * 0.01 * aniosAntiguedad
  if (aniosAntiguedad > 0) {
    conceptos.push(
      linea('remunerativo', `Antigüedad (${aniosAntiguedad} año${aniosAntiguedad === 1 ? '' : 's'} · 1%/año)`, antiguedad, orden++, {
        baseCalculo: basico,
      }),
    )
  }

  const baseConAntiguedad = basico + antiguedad
  const presentismo = opts.presentismo ? baseConAntiguedad * 0.0833 : 0
  if (opts.presentismo) {
    conceptos.push(
      linea('remunerativo', 'Presentismo (8.33%)', presentismo, orden++, { baseCalculo: baseConAntiguedad }),
    )
  }

  const totalRemunerativo = basico + antiguedad + presentismo

  // ── Deducciones (empleado) ─────────────────────────────────
  const agregarDeduccion = (concepto: string, pctOMonto: number, esMonto = false) => {
    const monto = esMonto ? pctOMonto : totalRemunerativo * (pctOMonto / 100)
    if (monto <= 0) return
    conceptos.push(
      linea('deduccion', concepto, monto, orden++, { baseCalculo: esMonto ? undefined : totalRemunerativo }),
    )
  }
  agregarDeduccion(`Jubilación (${alicuotas.jubilacion_empleado}%)`, alicuotas.jubilacion_empleado)
  agregarDeduccion(`Ley 19.032 / PAMI (${alicuotas.ley19032_empleado}%)`, alicuotas.ley19032_empleado)
  agregarDeduccion(`Obra social (${alicuotas.obra_social_empleado}%)`, alicuotas.obra_social_empleado)
  agregarDeduccion(`Cuota sindical (${alicuotas.sindical_empleado}%)`, alicuotas.sindical_empleado)
  agregarDeduccion('Seguro de vida (Art. 97 CCT)', alicuotas.seguro_vida_monto, true)

  const totalDeducciones = conceptos
    .filter((c) => c.tipo === 'deduccion')
    .reduce((acc, c) => acc + c.monto, 0)

  const neto = totalRemunerativo - totalDeducciones

  // ── Contribuciones patronales (no se descuentan del neto -- son
  // el costo adicional del empleador, informativas en el recibo) ──
  const agregarContribucion = (concepto: string, rubro: RubroContribucion, pctOMonto: number, esMonto = false) => {
    const monto = esMonto ? pctOMonto : totalRemunerativo * (pctOMonto / 100)
    if (monto <= 0) return
    conceptos.push(
      linea('contribucion_patronal', concepto, monto, orden++, {
        rubro,
        baseCalculo: esMonto ? undefined : totalRemunerativo,
      }),
    )
  }
  agregarContribucion(`SIPA (${alicuotas.sipa_patronal}%)`, 'seguridad_social', alicuotas.sipa_patronal)
  agregarContribucion(
    `Fondo Nacional de Empleo (${alicuotas.fondo_nacional_empleo_patronal}%)`,
    'seguridad_social',
    alicuotas.fondo_nacional_empleo_patronal,
  )
  agregarContribucion(
    `Asignaciones Familiares (${alicuotas.asignaciones_familiares_patronal}%)`,
    'seguridad_social',
    alicuotas.asignaciones_familiares_patronal,
  )
  agregarContribucion(`Obra social patronal (${alicuotas.obra_social_patronal}%)`, 'obra_social', alicuotas.obra_social_patronal)
  agregarContribucion(`ART (${alicuotas.art_alicuota}%)`, 'art', alicuotas.art_alicuota)
  agregarContribucion('ART (cuota fija)', 'art', alicuotas.art_monto_fijo, true)
  agregarContribucion(`Aportes sindicales patronal (${alicuotas.sindical_patronal}%)`, 'sindical', alicuotas.sindical_patronal)
  agregarContribucion(`Cámara empresarial (${alicuotas.camara_patronal}%)`, 'camaras', alicuotas.camara_patronal)

  const totalContribucionesPatronales = conceptos
    .filter((c) => c.tipo === 'contribucion_patronal')
    .reduce((acc, c) => acc + c.monto, 0)

  return {
    conceptos,
    totales: {
      totalRemunerativo: Math.round(totalRemunerativo * 100) / 100,
      totalDeducciones: Math.round(totalDeducciones * 100) / 100,
      neto: Math.round(neto * 100) / 100,
      totalContribucionesPatronales: Math.round(totalContribucionesPatronales * 100) / 100,
    },
  }
}

/** Recalcula los totales a partir de una lista de conceptos ya
 * editada a mano (después de que el operador ajustó algo). */
export function recalcularTotales(conceptos: LineaBorrador[]): TotalesRecibo {
  const totalRemunerativo = conceptos.filter((c) => c.tipo === 'remunerativo').reduce((a, c) => a + c.monto, 0)
  const totalDeducciones = conceptos.filter((c) => c.tipo === 'deduccion').reduce((a, c) => a + c.monto, 0)
  const totalContribucionesPatronales = conceptos
    .filter((c) => c.tipo === 'contribucion_patronal')
    .reduce((a, c) => a + c.monto, 0)
  return {
    totalRemunerativo: Math.round(totalRemunerativo * 100) / 100,
    totalDeducciones: Math.round(totalDeducciones * 100) / 100,
    neto: Math.round((totalRemunerativo - totalDeducciones) * 100) / 100,
    totalContribucionesPatronales: Math.round(totalContribucionesPatronales * 100) / 100,
  }
}
