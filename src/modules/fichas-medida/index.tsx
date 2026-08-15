// Módulo Fichas de medida — entry point (Kit "A Medida", Fase 0082).
//
// Una sola pantalla (Listado, con el dialog de carga/edición) -- no
// amerita un Provider de Context ni sub-rutas propias: mismo criterio
// liviano de Agenda (useFichasMedida habla directo con Supabase, sin
// reducer intermedio).

import Listado from './pages/Listado'

export default function FichasMedidaModule() {
  return <Listado />
}
