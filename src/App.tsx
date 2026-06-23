import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { DashboardLayout } from '@/components/Layout'
import { DashboardHome } from '@/pages/DashboardHome'
import { ModuloRoute } from '@/pages/ModuloRoute'
import { NuevoProyecto } from '@/pages/onboarding/NuevoProyecto'

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Navigate to="/dashboard" replace />} />
        <Route path="/nuevo-proyecto" element={<NuevoProyecto />} />

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
