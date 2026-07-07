// Módulo Comandas y cocina — entry point.

import { Routes, Route } from 'react-router-dom'
import { ComandasCocinaProvider } from './data/store'
import { ComandasCocinaLayout } from './ComandasCocinaLayout'
import ComandasIndex from './pages/Index'
import Mesa from './pages/Mesa'

export default function ComandasCocinaModule() {
  return (
    <ComandasCocinaProvider>
      <Routes>
        <Route element={<ComandasCocinaLayout />}>
          <Route index element={<ComandasIndex />} />
          <Route path="mesa/:mesaId" element={<Mesa />} />
        </Route>
      </Routes>
    </ComandasCocinaProvider>
  )
}
