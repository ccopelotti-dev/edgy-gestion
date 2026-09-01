import { Routes, Route } from 'react-router-dom'
import { TreasuryProvider } from './data/store'
import { TesoreriaLayout } from './TesoreriaLayout'
import { Dashboard } from './pages/Dashboard'
import { Caja } from './pages/Caja'
import { Bancos } from './pages/Bancos'
import { Cheques } from './pages/Cheques'
import { Vencimientos } from './pages/Vencimientos'
import { CreditosReintegros } from './pages/CreditosReintegros'

export default function TesoreriaModule() {
  return (
    <TreasuryProvider>
      <Routes>
        <Route element={<TesoreriaLayout />}>
          <Route index element={<Dashboard />} />
          <Route path="caja" element={<Caja />} />
          <Route path="bancos" element={<Bancos />} />
          <Route path="cheques" element={<Cheques />} />
          <Route path="vencimientos" element={<Vencimientos />} />
          <Route path="creditos" element={<CreditosReintegros />} />
        </Route>
      </Routes>
    </TreasuryProvider>
  )
}
