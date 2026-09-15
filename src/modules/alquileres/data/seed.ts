// Semilla del módulo Alquileres. Arranca vacía -- los datos reales de
// GD Neuquén ya están cargados directo en Supabase (migración de datos,
// Fase 82c), no hacen falta datos de demo acá.

import type { AlquileresState } from '../types'

export const seedState: AlquileresState = {
  propietarios: [],
  propiedades: [],
  unidades: [],
  inquilinos: [],
  pagos: [],
}
