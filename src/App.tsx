import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { DashboardLayout } from '@/components/Layout'
import { PanelLayout } from '@/components/PanelLayout'
import { RutaStaff } from '@/components/RutaStaff'
import { DashboardHome } from '@/pages/DashboardHome'
import { ModuloRoute } from '@/pages/ModuloRoute'
import { NuevoProyecto } from '@/pages/onboarding/NuevoProyecto'
import { ClientesListado } from '@/pages/panel/ClientesListado'
import { ClienteDetalle } from '@/pages/panel/ClienteDetalle'
import { ModulosListado } from '@/pages/panel/ModulosListado'
import { CompletarCuenta } from '@/pages/CompletarCuenta'
import { Ingresar } from '@/pages/Ingresar'
import MenuPublico from '@/pages/MenuPublico'
import { usePersonalEdgy } from '@/hooks/usePersonalEdgy'

function RaizRedirect() {
  const { esStaff, haySesion, cargando } = usePersonalEdgy()
  if (cargando) {
    return (
      <div className="flex h-screen items-center justify-center text-gray-400">
        Cargando...
      </div>
    )
  }
  if (haySesion === false) {
    return <Navigate to="/ingresar" replace />
  }
  return <Navigate to={esStaff ? '/panel' : '/dashboard'} replace />
}

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<RaizRedirect />} />
        <Route path="/ingresar" element={<Ingresar />} />
        <Route path="/completar-cuenta" element={<CompletarCuenta />} />
        <Route path="/menu/:slug" element={<MenuPublico />} />
        <Route element={<RutaStaff />}>
          <Route path="/panel" element={<PanelLayout />}>
            <Route index element={<Navigate to="/panel/nuevo-cliente" replace />} />
            <Route path="nuevo-cliente" element={<NuevoProyecto />} />
            <Route path="clientes" element={<ClientesListado />} />
            <Route path="clientes/:id" element={<ClienteDetalle />} />
            <Route path="modulos" element={<ModulosListado />} />
          </Route>
        </Route>
        <Route path="/dashboard" element={<DashboardLayout />}>
          <Route index element={<DashboardHome />} />
        </Route>
       <Route path="/m/:slug/*" element={<DashboardLayout />}>
  <Route index element={<ModuloRoute />} />
  <Route path="*" element={<ModuloRoute />} />
</Route>
      </Routes>
    </BrowserRouter>
  )
}
