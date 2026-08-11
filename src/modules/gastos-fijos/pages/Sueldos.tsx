import { useState } from 'react'
import { cn } from '@/lib/utils'
import RecibosSueldo from './sueldos/RecibosSueldo'
import Empleados from './sueldos/Empleados'

// Sub-vista local (no ruta anidada) -- mismo criterio que otros
// módulos con secciones internas livianas: no justifica otro nivel de
// routing para alternar entre dos listados que comparten contexto.
type Vista = 'recibos' | 'empleados'

export default function Sueldos() {
  const [vista, setVista] = useState<Vista>('recibos')

  return (
    <div className="flex flex-col gap-4">
      <div className="flex gap-1">
        {(
          [
            { id: 'recibos', label: 'Recibos' },
            { id: 'empleados', label: 'Empleados' },
          ] as { id: Vista; label: string }[]
        ).map((t) => (
          <button
            key={t.id}
            onClick={() => setVista(t.id)}
            className={cn(
              'rounded-full px-3 py-1 text-xs font-medium transition-colors',
              vista === t.id ? 'bg-gray-900 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200',
            )}
          >
            {t.label}
          </button>
        ))}
      </div>

      {vista === 'recibos' ? <RecibosSueldo /> : <Empleados />}
    </div>
  )
}
