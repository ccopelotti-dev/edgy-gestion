import { NavLink } from 'react-router-dom'
import type { ModuloActivo } from '@/hooks/useClienteActual'
import { cn } from '@/lib/utils'

interface SidebarProps {
  nombreCliente: string
  logoUrl: string | null
  colorMarca: string | null
  modulos: ModuloActivo[]
}

export function Sidebar({ nombreCliente, logoUrl, colorMarca, modulos }: SidebarProps) {
  return (
    <aside className="flex h-screen w-64 flex-col border-r border-gray-200 bg-white">
      <div className="flex items-center gap-3 border-b border-gray-200 px-5 py-5">
        {logoUrl ? (
          <img src={logoUrl} alt={nombreCliente} className="h-8 w-8 rounded-md object-cover" />
        ) : (
          <div
            className="flex h-8 w-8 items-center justify-center rounded-md text-sm font-medium text-white"
            style={{ backgroundColor: colorMarca ?? '#0C1A2E' }}
          >
            {nombreCliente.charAt(0).toUpperCase()}
          </div>
        )}
        <span className="truncate text-sm font-medium text-gray-900">{nombreCliente}</span>
      </div>

      <nav className="flex-1 space-y-1 overflow-y-auto px-3 py-4">
        {modulos.length === 0 && (
          <p className="px-2 py-4 text-sm text-gray-400">
            Todavía no activaste ningún módulo.
          </p>
        )}
        {modulos.map((modulo) => (
          <NavLink
            key={modulo.id}
            to={`/m/${modulo.slug}`}
            className={({ isActive }) =>
              cn(
                'block rounded-md px-3 py-2 text-sm font-medium transition-colors',
                isActive ? 'bg-brand-50 text-brand-500' : 'text-gray-600 hover:bg-gray-50',
              )
            }
          >
            {modulo.nombre}
          </NavLink>
        ))}
      </nav>

      <div className="border-t border-gray-200 px-3 py-4">
        <NavLink
          to="/configuracion/modulos"
          className="block rounded-md px-3 py-2 text-sm font-medium text-gray-500 hover:bg-gray-50"
        >
          Agregar módulos
        </NavLink>
      </div>
    </aside>
  )
}
