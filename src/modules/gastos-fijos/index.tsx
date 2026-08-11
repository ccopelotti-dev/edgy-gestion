// Módulo Gastos Fijos y Fiscales (Fase 33) -- entry point.
// Sueldos y Alquiler y Servicios son independientes entre sí -- cada
// pestaña llama a Supabase directo vía sus propios hooks, mismo
// criterio que Agenda: no hace falta un Provider de Context compartido.

import { Routes, Route } from 'react-router-dom'
import { GastosFijosLayout } from './GastosFijosLayout'
import Sueldos from './pages/Sueldos'
import AlquilerServicios from './pages/AlquilerServicios'

export default function GastosFijosModule() {
  return (
    <Routes>
      <Route element={<GastosFijosLayout />}>
        <Route index element={<Sueldos />} />
        <Route path="alquiler-servicios" element={<AlquilerServicios />} />
      </Route>
    </Routes>
  )
}
