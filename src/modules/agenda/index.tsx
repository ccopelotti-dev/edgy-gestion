// Módulo Agenda (Fase 31) — entry point.
// Calendario/Tareas y Notas son independientes entre sí -- cada pestaña
// llama a Supabase directo vía su propio hook (useAgendaTareas/useNotas),
// mismo criterio que Utilidades/Explorador: no hace falta un Provider de
// Context compartido.

import { Routes, Route } from 'react-router-dom'
import { AgendaLayout } from './AgendaLayout'
import Calendario from './pages/Calendario'
import Notas from './pages/Notas'

export default function AgendaModule() {
  return (
    <Routes>
      <Route element={<AgendaLayout />}>
        <Route index element={<Calendario />} />
        <Route path="notas" element={<Notas />} />
      </Route>
    </Routes>
  )
}
