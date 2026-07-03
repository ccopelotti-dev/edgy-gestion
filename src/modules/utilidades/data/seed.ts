// Semilla de Tracking de horas (única parte localStorage del módulo).
// Arranca vacía, mismo criterio que el resto de los módulos.

import type { UtilidadesState } from '../types'

export const seedState: UtilidadesState = {
  seguimientos: [],
  entradas: [],
}
