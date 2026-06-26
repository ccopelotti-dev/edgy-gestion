import { BrowserRouter, Route, Routes } from 'react-router-dom'
import { TreasuryProvider } from '@/data/store'
import { AppLayout } from '@/components/layout/AppLayout'
import { Dashboard } from '@/pages/Dashboard'
import { Caja } from '@/pages/Caja'
import { Bancos } from '@/pages/Bancos'
import { Cheques } from '@/pages/Cheques'
import { Vencimientos } from '@/pages/Vencimientos'

function App() {
  return (
    <TreasuryProvider>
      <BrowserRouter>
        <Routes>
          <Route element={<AppLayout />}>
            <Route path="/" element={<Dashboard />} />
            <Route path="/caja" element={<Caja />} />
            <Route path="/bancos" element={<Bancos />} />
            <Route path="/cheques" element={<Cheques />} />
            <Route path="/vencimientos" element={<Vencimientos />} />
          </Route>
        </Routes>
      </BrowserRouter>
    </TreasuryProvider>
  )
}

export default App
