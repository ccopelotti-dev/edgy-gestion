import { Outlet } from 'react-router-dom'
import { Sidebar } from '@/components/Sidebar'
import { useClienteActual } from '@/hooks/useClienteActual'

export function DashboardLayout() {
  const { cliente, modulosActivos, cargando, error } = useClienteActual()

  if (cargando) {
    return <div className="flex h-screen items-center justify-center text-gray-400">Cargando...</div>
  }

  if (error || !cliente) {
    return (
      <div className="flex h-screen items-center justify-center text-gray-500">
        {error ?? 'No hay un negocio configurado para este usuario.'}
      </div>
    )
  }

  return (
    <div className="flex">
      <Sidebar
        nombreCliente={cliente.nombre}
        logoUrl={cliente.logo_url}
        colorMarca={cliente.color_marca}
        modulos={modulosActivos}
      />
      <main className="flex-1 overflow-y-auto bg-white p-8">
        <Outlet />
      </main>
    </div>
  )
}
