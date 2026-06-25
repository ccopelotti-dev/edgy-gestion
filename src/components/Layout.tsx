import { Outlet } from 'react-router-dom'
import { Store } from 'lucide-react'
import { Sidebar } from '@/components/Sidebar'
import { useClienteActual } from '@/hooks/useClienteActual'
import { colorDeContraste } from '@/lib/colorContraste'

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

  const colorMarca = cliente.color_marca ?? '#0C1A2E'
  const contraste = colorDeContraste(colorMarca)
  const bordeLogo = contraste === '#FFFFFF' ? 'rgba(255,255,255,0.5)' : 'rgba(32,31,27,0.35)'

  return (
    <div className="flex h-screen">
      <Sidebar colorMarca={cliente.color_marca} modulos={modulosActivos} />

      <div className="flex flex-1 flex-col overflow-hidden">
        <header
          className="flex items-center gap-3 px-6 py-4"
          style={{ backgroundColor: colorMarca }}
        >
          <div
            className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-[10px] border-[1.5px] border-dashed bg-white"
            style={{ borderColor: bordeLogo }}
          >
            {cliente.logo_url ? (
              <img
                src={cliente.logo_url}
                alt={cliente.nombre}
                className="h-full w-full rounded-[10px] object-cover"
              />
            ) : (
              <Store size={18} className="text-gray-400" />
            )}
          </div>
          <span className="truncate text-base font-medium" style={{ color: contraste }}>
            {cliente.nombre}
          </span>
        </header>

        <main className="flex-1 overflow-y-auto bg-white p-8">
          <Outlet />
        </main>
      </div>
    </div>
  )
}
