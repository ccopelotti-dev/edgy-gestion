// Motor de posición mensual de IVA -- función pura, sin Supabase
// adentro (fácil de probar/ajustar a mano), mismo criterio que
// modules/gastos-fijos/lib/calculoRecibo.ts.
//
// Saldo Técnico = Débito Fiscal (Ventas) - Crédito Fiscal Computable
//                 (Compras) - Saldo Técnico a favor del mes anterior
//
// Si el resultado es positivo, es el IVA a pagar del período (antes
// de aplicar retenciones/percepciones sufridas, que son pago a
// cuenta). Si es negativo, queda como saldo a favor técnico para el
// mes siguiente.
//
// Retenciones/percepciones sufridas: se descuentan del saldo técnico
// positivo hasta el límite de ese saldo -- lo que sobra (si las
// retenciones superan el saldo técnico del período) pasa a ser saldo
// de libre disponibilidad, no se pierde.

export interface CalculoPosicionMensualInput {
  debitoFiscal: number
  creditoFiscalComputable: number
  retencionesPercepcionesSufridas: number
  saldoTecnicoAnteriorAFavor: number
}

export interface CalculoPosicionMensualResultado {
  saldoTecnico: number // positivo = a pagar (antes de retenciones), negativo = a favor
  ivaAIngresar: number // lo que efectivamente hay que depositar este período (nunca negativo)
  saldoTecnicoAFavorProximoPeriodo: number // se arrastra si saldoTecnico dio negativo
  saldoLibreDisponibilidad: number // retenciones/percepciones que no se pudieron absorber contra el saldo técnico
}

export function calcularPosicionMensual(input: CalculoPosicionMensualInput): CalculoPosicionMensualResultado {
  const saldoTecnico =
    input.debitoFiscal - input.creditoFiscalComputable - input.saldoTecnicoAnteriorAFavor

  if (saldoTecnico <= 0) {
    // Sin saldo técnico a pagar -- las retenciones sufridas del
    // período completas van a libre disponibilidad, y el saldo a
    // favor técnico se arrastra entero al próximo período.
    return {
      saldoTecnico: round2(saldoTecnico),
      ivaAIngresar: 0,
      saldoTecnicoAFavorProximoPeriodo: round2(Math.abs(saldoTecnico)),
      saldoLibreDisponibilidad: round2(input.retencionesPercepcionesSufridas),
    }
  }

  const absorbidoPorRetenciones = Math.min(saldoTecnico, input.retencionesPercepcionesSufridas)
  const ivaAIngresar = saldoTecnico - absorbidoPorRetenciones
  const saldoLibreDisponibilidad = input.retencionesPercepcionesSufridas - absorbidoPorRetenciones

  return {
    saldoTecnico: round2(saldoTecnico),
    ivaAIngresar: round2(ivaAIngresar),
    saldoTecnicoAFavorProximoPeriodo: 0,
    saldoLibreDisponibilidad: round2(saldoLibreDisponibilidad),
  }
}

function round2(n: number): number {
  return Math.round(n * 100) / 100
}
