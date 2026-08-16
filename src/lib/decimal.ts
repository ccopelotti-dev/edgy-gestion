// ============================================================
// Coma decimal en inputs numéricos -- utilidad compartida
// Edgy Gestión
//
// Convención de facto del proyecto (nace en Mostrador/PuntoDeVenta,
// tarea "quitar spinners Cant/Precio/Dto + coma decimal", y se repite
// -- cada vez reimplementada a mano -- en Ventas/dialogs.tsx, Combos,
// Fichas de medida y MenuPublico): un input de cantidad/precio se
// escribe como `<input type="text" inputMode="decimal">` en vez de
// `type="number"`, porque en un teclado en español la coma es el
// separador decimal natural y `type="number"` de HTML solo acepta punto
// -- tipear "0,5" ahí no hace nada (el navegador lo descarta en
// silencio), así que el usuario cree que cargó un valor y en realidad
// quedó en 0.
//
// El patrón tiene dos partes:
//  1. sanitizarDecimal(): filtra el texto crudo del input a solo
//     dígitos/punto/coma, para guardarlo en un buffer de texto SEPARADO
//     del valor numérico real -- así no se pierde la coma mientras el
//     usuario todavía está escribiendo (ej. "12," antes del segundo
//     dígito decimal).
//  2. parsearDecimal(): convierte ese texto (con punto o con coma) al
//     number real, para guardar en el estado/enviar a Supabase.
//
// Esta es la primera vez que se extrae a un lugar compartido -- antes
// cada archivo tenía su propia copia de esta misma lógica.
// ============================================================

/** Filtra un texto de input a solo dígitos, punto y coma. */
export function sanitizarDecimal(valor: string): string {
  return valor.replace(/[^0-9.,]/g, '')
}

/** Igual que sanitizarDecimal(), pero además permite un signo "-" al
 * principio -- para inputs de ajuste donde el signo indica ingreso/egreso
 * (ej. "Ajustar stock": positivo = ingreso, negativo = egreso). */
export function sanitizarDecimalConSigno(valor: string): string {
  const negativo = valor.trim().startsWith('-')
  const limpio = valor.replace(/[^0-9.,]/g, '')
  return negativo ? `-${limpio}` : limpio
}

/** Convierte un texto (con coma o punto decimal) a number. Si no es un
 * número válido -- vacío, o solo un separador suelto -- devuelve 0. */
export function parsearDecimal(texto: string): number {
  const limpio = texto.replace(',', '.').trim()
  const n = parseFloat(limpio)
  return Number.isFinite(n) ? n : 0
}

/** Texto a mostrar en el input a partir del number guardado -- usa coma
 * (formato argentino) y omite el ".00" cuando el valor es entero, para
 * no forzarle un decimal de más a quien está por sobrescribirlo. */
export function decimalATexto(valor: number): string {
  if (!valor) return ''
  return String(valor).replace('.', ',')
}
