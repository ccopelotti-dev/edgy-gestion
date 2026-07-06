// Módulo Reportes — entry point.
// Sin Provider: no persiste nada propio (ver Diseno_Modulo_Reportes.md).
// Inventario es Supabase-backed (useReportesInventario, mismo criterio que
// Configuración/Utilidades); Financiero y Gestión usan datos de ejemplo
// estáticos (data/reportesEjemplo.ts) hasta que Tesorería/Ventas/Compras
// tengan su propia tabla; Contable es un placeholder hasta que ese módulo
// exista.

import { Routes, Route } from 'react-router-dom'
import { ReportesLayout } from './ReportesLayout'
import Inventario from './pages/Inventario'
import Financiero from './pages/Financiero'
import Gestion from './pages/Gestion'
import Contable from './pages/Contable'
import ReporteNoEncontrado from './pages/ReporteNoEncontrado'

export default function ReportesModule() {
  return (
    <Routes>
      <Route element={<ReportesLayout />}>
        <Route index element={<Inventario />} />
        <Route path="financiero" element={<Financiero />} />
        <Route path="gestion" element={<Gestion />} />
        <Route path="contable" element={<Contable />} />
        {/* Antes, cualquier ruta bajo /m/reportes/* que no matcheara ninguna
            de las de arriba (ej. /m/reportes/inventario, typo de un link
            viejo, URL escrita a mano) renderizaba una página en blanco: este
            <Routes> no tenía ningún catch-all, así que React Router no
            pintaba nada para un path sin match. Se agrega un comodín "*"
            que muestra un mensaje claro en vez de la pantalla vacía. */}
        <Route path="*" element={<ReporteNoEncontrado />} />
      </Route>
    </Routes>
  )
}
