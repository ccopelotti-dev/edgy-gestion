import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { DashboardLayout } from '@/components/Layout'
import { PanelLayout } from '@/components/PanelLayout'
import { RutaStaff } from '@/components/RutaStaff'
import { DashboardHome } from '@/pages/DashboardHome'
import { ModuloRoute } from '@/pages/ModuloRoute'
import { NuevoProyecto } from '@/pages/onboarding/NuevoProyecto'
import { ClientesListado } from '@/pages/panel/ClientesListado'
import { ClienteDetalle } from '@/pages/panel/ClienteDetalle'

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Navigate to="/dashboard" replace />} />

        {/* Panel interno de Edgy - protegido, solo personal_edgy entra */}
        <Route element={<RutaStaff />}>
          <Route path="/panel" element={<PanelLayout />}>
            <Route index element={<Navigate to="/panel/nuevo-cliente" replace />} />
            <Route path="nuevo-cliente" element={<NuevoProyecto />} />
            <Route path="clientes" element={<ClientesListado />} />
            <Route path="clientes/:id" element={<ClienteDetalle />} />
          </Route>
        </Route>

        {/* Dashboard del cliente final - sin cambios de fondo, sigue
            resolviendo el tenant por el usuario logueado (useClienteActual) */}
        <Route path="/dashboard" element={<DashboardLayout />}>
          <Route index element={<DashboardHome />} />
        </Route>
        <Route path="/m/:slug" element={<DashboardLayout />}>
          <Route index element={<ModuloRoute />} />
        </Route>
      </Routes>
    </BrowserRouter>
  )
}
