// Conversión de un importe en pesos a su expresión en letras -- lo
// exige el Art. 140 inciso g) LCT para el neto (y como buena
// práctica recomendada, también se aplica al bruto en el PDF).
// Implementación estándar de números en español, sin dependencias.

const UNIDADES = ['', 'uno', 'dos', 'tres', 'cuatro', 'cinco', 'seis', 'siete', 'ocho', 'nueve']
const ESPECIALES = [
  'diez', 'once', 'doce', 'trece', 'catorce', 'quince', 'dieciséis', 'diecisiete', 'dieciocho', 'diecinueve',
]
const DECENAS = [
  '', '', 'veinte', 'treinta', 'cuarenta', 'cincuenta', 'sesenta', 'setenta', 'ochenta', 'noventa',
]
const CENTENAS = [
  '', 'ciento', 'doscientos', 'trescientos', 'cuatrocientos', 'quinientos', 'seiscientos', 'setecientos', 'ochocientos', 'novecientos',
]

function trescientosALetras(n: number): string {
  if (n === 0) return ''
  if (n === 100) return 'cien'

  let resto = n
  const partes: string[] = []

  if (resto >= 100) {
    partes.push(CENTENAS[Math.floor(resto / 100)])
    resto %= 100
  }

  if (resto >= 10 && resto <= 19) {
    partes.push(ESPECIALES[resto - 10])
    resto = 0
  } else if (resto >= 20) {
    const decena = Math.floor(resto / 10)
    const unidad = resto % 10
    if (decena === 2) {
      partes.push(unidad > 0 ? `veinti${UNIDADES[unidad]}` : 'veinte')
    } else {
      partes.push(unidad > 0 ? `${DECENAS[decena]} y ${UNIDADES[unidad]}` : DECENAS[decena])
    }
    resto = 0
  } else if (resto > 0) {
    partes.push(UNIDADES[resto])
  }

  return partes.filter(Boolean).join(' ')
}

function enteroALetras(n: number): string {
  if (n === 0) return 'cero'

  const millones = Math.floor(n / 1_000_000)
  const miles = Math.floor((n % 1_000_000) / 1000)
  const resto = n % 1000

  const partes: string[] = []

  if (millones > 0) {
    partes.push(millones === 1 ? 'un millón' : `${trescientosALetras(millones)} millones`)
  }
  if (miles > 0) {
    partes.push(miles === 1 ? 'mil' : `${trescientosALetras(miles)} mil`)
  }
  if (resto > 0) {
    partes.push(trescientosALetras(resto))
  }

  return partes.join(' ')
}

/** Ej: 123456.78 -> "Ciento veintitrés mil cuatrocientos cincuenta y
 * seis pesos con 78/100". */
export function montoALetras(monto: number): string {
  const entero = Math.trunc(Math.abs(monto))
  const centavos = Math.round((Math.abs(monto) - entero) * 100)
  const letras = enteroALetras(entero)
  const capitalizado = letras.charAt(0).toUpperCase() + letras.slice(1)
  return `${capitalizado} pesos con ${String(centavos).padStart(2, '0')}/100`
}
