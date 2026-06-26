import { NavLink, Outlet, useLocation } from 'react-router-dom'
import {
  LayoutDashboard,
  Wallet,
  Landmark,
  FileCheck,
  CalendarClock,
  RotateCcw,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { useTreasury } from './data/store'

export function TesoreriaLayout() {
  const { dispatch } = useTreasury()
  const { pathname } = useLocation()
  const base = pathname.match(/^(\/m\/[^/]+)/)?.[1] ?? ''

  const tabs = [
    { to: base, label: 'Dashboard', icon: LayoutDashboard, end: true },
    { to: `${base}/caja`, label: 'Caja', icon: Wallet, end: false },
    { to: `${base}/bancos`, label: 'Bancos', icon: Landmark, end: false },
    { to: `${base}/cheques`, label: 'Cheques', icon: FileCheck, end: false },
    { to: `${base}/vencimientos`, label: 'Vencimientos', icon: CalendarClock, end: false },
  ]

  return (
    <div className="flex flex-col gap-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Tesorería</h1>
          <p className="text-muted-foreground text-sm">
            Gestión de caja, bancos, cheques y vencimientos
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
                  'inline-flex items-center gap-2 border-b-2 px-4 py-2.5 text-sm font-medium transition-colors',
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
