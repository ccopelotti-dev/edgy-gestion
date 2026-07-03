// Módulo Servicios — entry point.
// Sigue el mismo patrón que Productos y Stock: Provider envuelve Routes.
// El router del dashboard carga este componente con lazy() desde registry.ts.
//
// Deliberadamente separado del módulo Productos y Stock (no "Productos y
// servicios" combinados, a diferencia de Contabilium): pensado para clientes
// profesionales (médicos, ingenieros, abogados, oficios) que no manejan
// stock ni fórmulas — solo un catálogo de servicios con su modalidad de
// precio y, opcionalmente, variantes.

import { Routes, Route } from 'react-router-dom'
import { ServiciosProvider } from './data/store'
import { ServiciosLayout } from './ServiciosLayout'
import Dashboard from './pages/Dashboard'
import Rubros from './pages/Rubros'
import Servicios from './pages/Servicios'

export default function ServiciosModule() {
  return (
    <ServiciosProvider>
      <Routes>
        <Route element={<ServiciosLayout />}>
          <Route index element={<Dashboard />} />
          <Route path="rubros" element={<Rubros />} />
          <Route path="servicios" element={<Servicios />} />
        </Route>
      </Routes>
    </ServiciosProvider>
  )
}
