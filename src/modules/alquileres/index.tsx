// Módulo Alquileres — entry point.
// Mismo patrón que Servicios/Productos y Stock: Provider envuelve Routes.
// El router del dashboard carga este componente con lazy() desde registry.ts.
//
// Origen: integración del proyecto viejo "GD Neuquén" (ver Fase 82 en los
// comentarios de types/index.ts y de las migraciones 0148_fase82*.sql).

import { Routes, Route } from 'react-router-dom'
import { AlquileresProvider } from './data/store'
import { AlquileresLayout } from './AlquileresLayout'
import Dashboard from './pages/Dashboard'
import Propietarios from './pages/Propietarios'
import Propiedades from './pages/Propiedades'
import Inquilinos from './pages/Inquilinos'
import Cobranzas from './pages/Cobranzas'
import Liquidaciones from './pages/Liquidaciones'

export default function AlquileresModule() {
  return (
    <AlquileresProvider>
      <Routes>
        <Route element={<AlquileresLayout />}>
          <Route index element={<Dashboard />} />
          <Route path="propietarios" element={<Propietarios />} />
          <Route path="propiedades" element={<Propiedades />} />
          <Route path="inquilinos" element={<Inquilinos />} />
          <Route path="cobranzas" element={<Cobranzas />} />
          <Route path="liquidaciones" element={<Liquidaciones />} />
        </Route>
      </Routes>
    </AlquileresProvider>
  )
}
