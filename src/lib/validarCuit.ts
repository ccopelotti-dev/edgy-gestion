// Validación del dígito verificador de CUIT/CUIL -- Fase 34
// (Impuestos). Mismo algoritmo que usa ARCA: multiplicador
// [5,4,3,2,7,6,5,4,3,2] sobre los primeros 10 dígitos, resto de
// dividir por 11 da el dígito verificador (con el ajuste de los
// casos 11->0 y 10->se recalcula invirtiendo el primer dígito entre
// 20/23/24/27, que es el criterio real de ARCA para967 CUITs de
// persona física con "tipo" variable -- para no over-engineer un
// caso raro, acá se trata 10 como inválido directamente, que cubre
// el 99% de los casos reales de clientes/proveedores).
//
// Uso: validar el CUIT que carga el propio usuario en una ficha de
// Cliente/Proveedor -- no reemplaza una consulta real al padrón de
// ARCA (eso es otro alcance, fuera de esta fase), solo evita el
// error más común: un dígito de más/menos o transpuesto al tipear.

/** Acepta con o sin guiones ("20-12345678-9" o "20123456789"). */
export function limpiarCuit(valor: string): string {
  return valor.replace(/\D/g, '')
}

export function formatearCuit(valor: string): string {
  const limpio = limpiarCuit(valor)
  if (limpio.length !== 11) return valor
  return `${limpio.slice(0, 2)}-${limpio.slice(2, 10)}-${limpio.slice(10)}`
}

const MULTIPLICADORES = [5, 4, 3, 2, 7, 6, 5, 4, 3, 2]

/** true si el CUIT tiene 11 dígitos y el dígito verificador cierra. */
export function esCuitValido(valor: string): boolean {
  const limpio = limpiarCuit(valor)
  if (limpio.length !== 11) return false

  const digitos = limpio.split('').map(Number)
  const suma = digitos.slice(0, 10).reduce((acc, d, i) => acc + d * MULTIPLICADORES[i], 0)
  const resto = suma % 11
  let verificador = 11 - resto
  if (verificador === 11) verificador = 0
  if (verificador === 10) return false // caso especial no cubierto acá, ver comentario arriba

  return verificador === digitos[10]
}
