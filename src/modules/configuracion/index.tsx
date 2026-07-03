// Módulo Configuración — entry point.
// A diferencia de Tesorería/Productos y Stock/Ventas/Compras, este
// módulo no tiene un Provider con datos demo: lee y escribe directo
// contra Supabase (edgy_gestion.clientes y edgy_gestion.puntos_venta),
// porque su función es justamente reflejar los datos reales del
// cliente, no simular datos de prueba.

import { Routes, Route } from 'react-router-dom'
import { ConfiguracionLayout } from './ConfiguracionLayout'
import Empresa from './pages/Empresa'
import PuntosVenta from './pages/PuntosVenta'
import Integraciones from './pages/Integraciones'

export default function ConfiguracionModule() {
  return (
    <Routes>
      <Route element={<ConfiguracionLayout />}>
        <Route index element={<Empresa />} />
        <Route path="puntos-venta" element={<PuntosVenta />} />
        <Route path="integraciones" element={<Integraciones />} />
      </Route>
    </Routes>
  )
}
