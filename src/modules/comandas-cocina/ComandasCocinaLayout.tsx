import { NavLink, Outlet, useLocation } from 'react-router-dom'
import { ChefHat, ClipboardList } from 'lucide-react'
import { cn } from '@/lib/utils'

// Layout con tabs: Comandas de salón (lista de mesas activas) y Cocina
// (KDS). La pantalla de detalle de una mesa (mesa/:mesaId) no es una
// tab -- se llega ahi desde el Salon o desde el listado.
//
// Fase 8d: se le agrega "de salón" al label -- desde que existe el
// motor central de Órdenes de Venta (Fase 8a/8b/8c), que en
// Gastronomía también se muestra como "Comanda" (ver
// src/lib/terminologia.ts), hacía falta distinguir esta de mesas de
// la otra en pantalla.
export function ComandasCocinaLayout() {
  const { pathname } = useLocation()
  const base = pathname.match(/^(\/m\/[^/]+)/)?.[1] ?? ''

  const tabs = [
    { to: base, label: 'Comandas de salón', icon: ClipboardList, end: true },
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
