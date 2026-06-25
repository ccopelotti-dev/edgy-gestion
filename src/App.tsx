import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { DashboardLayout } from '@/components/Layout'
import { PanelLayout } from '@/components/PanelLayout'
import { RutaStaff } from '@/components/RutaStaff'
import { DashboardHome } from '@/pages/DashboardHome'
import { ModuloRoute } from '@/pages/ModuloRoute'
import { NuevoProyecto } from '@/pages/onboarding/NuevoProyecto'
import { ClientesListado } from '@/pages/panel/ClientesListado'
import { ClienteDetalle } from '@/pages/panel/ClienteDetalle'
import { CompletarCuenta } from '@/pages/CompletarCuenta'
import { usePersonalEdgy } from '@/hooks/usePersonalEdgy'

// La raíz ("/") no sabe de antemano si quien entra es personal de Edgy o
// un cliente — antes mandaba siempre a /dashboard (la pantalla del
// cliente). Ahora consulta personal_edgy primero y manda a cada uno a su
// lugar.
function RaizRedirect() {
  const { esStaff, cargando } = usePersonalEdgy()

  if (cargando) {
    return (
      <div className="flex h-screen items-center justify-center text-gray-400">
        Cargando...
      </div>
    )
  }

  return <Navigate to={esStaff ? '/panel' : '/dashboard'} replace />
}

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<RaizRedirect />} />
        <Route path="/completar-cuenta" element={<CompletarCuenta />} />

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

