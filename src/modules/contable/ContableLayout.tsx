import { NavLink, Outlet, useLocation } from 'react-router-dom'
import { Building, FileText, Copy, BookOpen, BookText, Scale, TrendingUp } from 'lucide-react'
import { cn } from '@/lib/utils'

export function ContableLayout() {
  const { pathname } = useLocation()
  const base = pathname.match(/^(\/m\/[^/]+)/)?.[1] ?? ''

  const tabs = [
    { to: base, label: 'Plan de cuentas', icon: Building, end: true },
    { to: `${base}/asientos`, label: 'Asientos', icon: FileText, end: false },
    { to: `${base}/modelos`, label: 'Modelos', icon: Copy, end: false },
    { to: `${base}/libro-diario`, label: 'Libro diario', icon: BookOpen, end: false },
    { to: `${base}/libro-mayor`, label: 'Libro mayor', icon: BookText, end: false },
    { to: `${base}/balance-general`, label: 'Balance general', icon: Scale, end: false },
    { to: `${base}/estado-resultado`, label: 'Estado de resultado', icon: TrendingUp, end: false },
  ]

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Contable</h1>
        <p className="text-muted-foreground text-sm">
          Plan de cuentas, asientos de partida doble, libros y estados contables
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
