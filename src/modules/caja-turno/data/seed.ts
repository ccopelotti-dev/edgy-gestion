import type { CajaTurnoState } from '../types'

// Estado vacío de fábrica — se muestra un instante antes de que
// termine el primer fetch a Supabase, y como fallback si ese fetch
// falla. No representa datos reales.
export const seedState: CajaTurnoState = {
  turnos: [],
}
