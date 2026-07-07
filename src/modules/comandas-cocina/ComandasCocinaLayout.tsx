import { NavLink, Outlet, useLocation } from 'react-router-dom'
import { ChefHat, ClipboardList } from 'lucide-react'
import { cn } from '@/lib/utils'

// Layout con tabs: Comandas (lista de mesas activas) y Cocina (KDS).
// La pantalla de detalle de una mesa (mesa/:mesaId) no es una tab -- se
// llega ahi desde el Salon o desde el listado de Comandas.
export function ComandasCocinaLayout() {
  const { pathname } = useLocation()
  const base = pathname.match(/^(\/m\/[^/]+)/)?.[1] ?? ''

  const tabs = [
    { to: base, label: 'Comandas', icon: ClipboardList, end: true },
    { to: `${base}/cocina`, label: 'Cocina', icon: ChefHat, end: false },
  ]

  return (
    <div className="flex flex-col gap-6">
      <nav className="border-b">
        <div className="-mb-px flex gap-1 overflow-x-auto">
          {tabs.map(({ to, label, icon: Icon, end }) => (
            <NavLink
              key={label}
              to={to}
              end={end}
              className={({ isActive }) =>
                cn(
                  'inline-flex items-center gap-2 border-b-2 px-4 py-2.5 text-sm font-medium whitespace-nowrap transition-colors',
                  isActive
                    ? 'border-primary text-primary'
                    : 'text-muted-foreground hover:text-foreground border-transparent hover:border-gray-300',
                )
              }
            >
              <Icon className="h-4 w-4" />
              {label}
            </NavLink>
          ))}
        </div>
      </nav>

      <Outlet />
    </div>
  )
}
