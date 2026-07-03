// Módulo Contable — entry point.
// Sin Provider propio: todo el estado es Supabase-backed vía hooks (cada
// página resuelve su propio fetch), no hay Context/localStorage que
// envolver -- mismo criterio que Reportes, distinto de Utilidades
// (que sí tiene Provider para Tracking de horas, la única parte local).

import { Routes, Route } from 'react-router-dom'
import { ContableLayout } from './ContableLayout'
import PlanDeCuentas from './pages/PlanDeCuentas'
import Asientos from './pages/Asientos'
import AsientosModelo from './pages/AsientosModelo'
import LibroDiario from './pages/LibroDiario'
import LibroMayor from './pages/LibroMayor'
import BalanceGeneral from './pages/BalanceGeneral'
import EstadoResultado from './pages/EstadoResultado'

export default function ContableModule() {
  return (
    <Routes>
      <Route element={<ContableLayout />}>
        <Route index element={<PlanDeCuentas />} />
        <Route path="asientos" element={<Asientos />} />
        <Route path="modelos" element={<AsientosModelo />} />
        <Route path="libro-diario" element={<LibroDiario />} />
        <Route path="libro-mayor" element={<LibroMayor />} />
        <Route path="balance-general" element={<BalanceGeneral />} />
        <Route path="estado-resultado" element={<EstadoResultado />} />
      </Route>
    </Routes>
  )
}
