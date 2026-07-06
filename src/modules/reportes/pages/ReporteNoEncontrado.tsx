'use client'

import { FileQuestion } from 'lucide-react'
import { useNavigate, useLocation } from 'react-router-dom'
import { Button } from '@/components/ui/button'
import { EmptyState } from '../components/reportes/display'

// Catch-all para cualquier ruta dentro de /m/reportes/* que no matchea
// ninguna pestaña real (Inventario, Financiero, Gestión, Contable). Antes
// esto quedaba en blanco sin ningún mensaje; ver comentario en index.tsx.
export default function ReporteNoEncontrado() {
  const navigate = useNavigate()
  const { pathname } = useLocation()
  const base = pathname.match(/^(\/m\/[^/]+)/)?.[1] ?? '/m/reportes'

  return (
    <EmptyState
      icon={FileQuestion}
      title="Esta página no existe"
      description={`No hay ningún reporte en "${pathname}". Usá las pestañas de arriba para navegar entre Inventario, Financiero, Gestión y Contable.`}
    >
      <Button onClick={() => navigate(base)}>Volver a Reportes</Button>
    </EmptyState>
  )
}
