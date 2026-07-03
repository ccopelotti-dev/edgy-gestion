// Módulo Utilidades — entry point.
// Caja de herramientas transversal (ver Diseno_Modulo_Utilidades.md):
// Explorador de archivos e Importación masiva son Supabase-backed desde el
// día uno (no localStorage -- un archivo no puede "vivir" ahí, y la
// importación necesita escribir en tablas reales). Tracking de horas sí usa
// el patrón localStorage del resto de los módulos, por eso UtilidadesProvider
// envuelve todo el módulo pero solo esa pestaña lo consume.

import { Routes, Route } from 'react-router-dom'
import { UtilidadesProvider } from './data/store'
import { UtilidadesLayout } from './UtilidadesLayout'
import Explorador from './pages/Explorador'
import ImportacionMasiva from './pages/ImportacionMasiva'
import TrackingHoras from './pages/TrackingHoras'

export default function UtilidadesModule() {
  return (
    <UtilidadesProvider>
      <Routes>
        <Route element={<UtilidadesLayout />}>
          <Route index element={<Explorador />} />
          <Route path="importacion" element={<ImportacionMasiva />} />
          <Route path="tracking-horas" element={<TrackingHoras />} />
        </Route>
      </Routes>
    </UtilidadesProvider>
  )
}
