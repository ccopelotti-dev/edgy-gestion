// Módulo Caja por turno — entry point.

import { Routes, Route } from 'react-router-dom'
import { CajaTurnoProvider } from './data/store'
import { CajaTurnoLayout } from './CajaTurnoLayout'
import Turno from './pages/Turno'

export default function CajaTurnoModule() {
  return (
    <CajaTurnoProvider>
      <Routes>
        <Route element={<CajaTurnoLayout />}>
          <Route index element={<Turno />} />
        </Route>
      </Routes>
    </CajaTurnoProvider>
  )
}
