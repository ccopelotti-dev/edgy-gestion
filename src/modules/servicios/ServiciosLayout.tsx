import { NavLink, Outlet, useLocation } from 'react-router-dom'
import { LayoutDashboard, Tags, Briefcase, RotateCcw } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { useServicios } from './data/store'

export function ServiciosLayout() {
  const { dispatch } = useServicios()
  const { pathname } = useLocation()
  const base = pathname.match(/^(\/m\/[^/]+)/)?.[1] ?? ''

  const tabs = [
    { to: base, label: 'Dashboard', icon: LayoutDashboard, end: true },
    { to: `${base}/rubros`, label: 'Rubros', icon: Tags, end: false },
    { to: `${base}/servicios`, label: 'Servicios', icon: Briefcase, end: false },
  ]

  return (
    <div className="flex flex-col gap-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Servicios</h1>
          <p className="text-muted-foreground text-sm">
            Catálogo de servicios ofrecidos, pensado para clientes profesionales
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => dispatch({ type: 'RESET' })}
          className="self-start"
        >
          <RotateCcw className="mr-2 h-4 w-4" />
          Restablecer datos demo
        </Button>
      </div>

      {/* Tab navigation */}
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

      {/* Page content */}
      <Outlet />
    </div>
  )
}
