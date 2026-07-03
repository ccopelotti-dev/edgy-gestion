// Semilla del módulo Servicios. Igual que Productos y Stock: arranca vacía
// (sin datos de demo precargados), el cliente carga sus propios rubros y
// servicios desde cero.

import type { ServiciosState } from '../types'

export const seedState: ServiciosState = {
  servicios: [],
  rubros: [],
  subRubros: [],
}
