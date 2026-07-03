import { NavLink, Outlet, useLocation } from 'react-router-dom'
import { Package, Wallet, Users, Calculator } from 'lucide-react'
import { cn } from '@/lib/utils'

export function ReportesLayout() {
  const { pathname } = useLocation()
  const base = pathname.match(/^(\/m\/[^/]+)/)?.[1] ?? ''

  const tabs = [
    { to: base, label: 'Inventario', icon: Package, end: true },
    { to: `${base}/financiero`, label: 'Financiero', icon: Wallet, end: false },
    { to: `${base}/gestion`, label: 'Gestión', icon: Users, end: false },
    { to: `${base}/contable`, label: 'Contable', icon: Calculator, end: false },
  ]

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Reportes</h1>
        <p className="text-muted-foreground text-sm">
          Consultas, filtros y exportación sobre los datos de los demás módulos
        </p>
      </div>

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
