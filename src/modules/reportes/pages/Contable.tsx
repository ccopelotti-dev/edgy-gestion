'use client'

import { Calculator } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { Button } from '@/components/ui/button'
import { EmptyState } from '../components/reportes/display'

// El módulo Contable ya existe (/m/contable) -- este texto originalmente
// decía "todavía no existe" porque se escribió antes de que se construyera.
// Los reportes de solo lectura sobre asientos (Balance General, Estado de
// Resultado) siguen sin implementarse acá dentro de Reportes, pero el
// módulo en sí ya está operativo, así que el mensaje y el link llevan al
// usuario al lugar correcto en vez de sugerir que no existe nada.
export default function Contable() {
  const navigate = useNavigate()

  return (
    <EmptyState
      icon={Calculator}
      title="Reportes contables: próximamente"
      description="El Balance General y el Estado de Resultado como reportes de solo lectura todavía no están armados acá. Mientras tanto, podés operar el módulo Contable directamente."
    >
      <Button onClick={() => navigate('/m/contable')}>Ir a Contable</Button>
    </EmptyState>
  )
}
