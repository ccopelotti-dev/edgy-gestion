import { useClienteActual } from '@/hooks/useClienteActual'
import { Card } from '@/components/ui/card'

export function DashboardHome() {
  const { cliente, modulosActivos } = useClienteActual()

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-lg font-medium text-gray-900">Hola, {cliente?.nombre}</h1>
        <p className="text-sm text-gray-500">Tenés {modulosActivos.length} módulos activos.</p>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {modulosActivos.map((modulo) => (
          <Card key={modulo.id}>
            <p className="text-sm font-medium text-gray-900">{modulo.nombre}</p>
            {modulo.descripcion && (
              <p className="mt-1 text-sm text-gray-500">{modulo.descripcion}</p>
            )}
          </Card>
        ))}
      </div>
    </div>
  )
}
