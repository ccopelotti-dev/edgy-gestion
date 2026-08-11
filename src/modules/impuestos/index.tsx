// Módulo Impuestos (Fase 34) -- entry point.
// Libro IVA y Posición Mensual son un reporte sobre lo que ya existe
// en Ventas/Compras (sin carga paralela); Retenciones y Percepciones
// es la única tabla propia. Mismo criterio que Gastos Fijos: cada
// pestaña llama a Supabase directo vía sus propios hooks.

import { Routes, Route } from 'react-router-dom'
import { ImpuestosLayout } from './ImpuestosLayout'
import LibroIva from './pages/LibroIva'
import PosicionMensual from './pages/PosicionMensual'
import RetencionesPercepciones from './pages/RetencionesPercepciones'

export default function ImpuestosModule() {
  return (
    <Routes>
      <Route element={<ImpuestosLayout />}>
        <Route index element={<LibroIva />} />
        <Route path="posicion-mensual" element={<PosicionMensual />} />
        <Route path="retenciones-percepciones" element={<RetencionesPercepciones />} />
      </Route>
    </Routes>
  )
}
