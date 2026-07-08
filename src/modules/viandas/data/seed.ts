import type { ViandasState } from '../types'

// Estado inicial en memoria, antes de que resuelva el fetch a
// Supabase (mismo criterio que el resto de los módulos del pack
// gastronómico) -- no hay datos de ejemplo, el módulo arranca vacío
// hasta que se carga el primer plan real.
export const seedState: ViandasState = {
  planes: [],
  entregas: [],
}
