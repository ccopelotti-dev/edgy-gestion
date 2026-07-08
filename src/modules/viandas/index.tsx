// Módulo Viandas — entry point.

import { Routes, Route } from 'react-router-dom'
import { ViandasProvider } from './data/store'
import { ViandasLayout } from './ViandasLayout'
import Index from './pages/Index'
import Plan from './pages/Plan'

export default function ViandasModule() {
  return (
    <ViandasProvider>
      <Routes>
        <Route element={<ViandasLayout />}>
          <Route index element={<Index />} />
          <Route path=":planId" element={<Plan />} />
        </Route>
      </Routes>
    </ViandasProvider>
  )
}
