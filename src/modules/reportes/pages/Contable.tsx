'use client'

import { Calculator } from 'lucide-react'
import { EmptyState } from '../components/reportes/display'

// A diferencia de Financiero/Gestión (módulos que existen pero siguen en
// localStorage), Contable ni siquiera existe todavía como módulo -- no
// tiene sentido inventar filas de ejemplo para un Balance General o un
// Estado de Resultado antes de que el modelo de datos real (plan de
// cuentas, asientos) esté definido. Se activa esta pestaña recién cuando
// el módulo Contable tenga sus tablas reales.

export default function Contable() {
  return (
    <EmptyState
      icon={Calculator}
      title="Próximamente"
      description="El módulo Contable todavía no existe. Cuando esté construido, el Balance General y el Estado de Resultado van a aparecer acá como reportes de solo lectura sobre sus asientos."
    />
  )
}
