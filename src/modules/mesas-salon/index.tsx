// Módulo Mesas y Salón — entry point.
// Sigue el mismo patrón que Tesorería/Productos y Stock: Provider
// envuelve Routes. El router del dashboard carga este componente con
// lazy() desde registry.ts.

import { Routes, Route } from 'react-router-dom'
import { MesasSalonProvider } from './data/store'
import { MesasSalonLayout } from './MesasSalonLayout'
import Salon from './pages/Salon'

export default function MesasSalonModule() {
  return (
    <MesasSalonProvider>
      <Routes>
        <Route element={<MesasSalonLayout />}>
          <Route index element={<Salon />} />
        </Route>
      </Routes>
    </MesasSalonProvider>
  )
}
