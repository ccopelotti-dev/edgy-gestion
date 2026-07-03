import { NavLink, Outlet, useLocation } from 'react-router-dom'
import { FolderOpen, Upload, Clock } from 'lucide-react'
import { cn } from '@/lib/utils'

export function UtilidadesLayout() {
  const { pathname } = useLocation()
  const base = pathname.match(/^(\/m\/[^/]+)/)?.[1] ?? ''

  const tabs = [
    { to: base, label: 'Explorador de archivos', icon: FolderOpen, end: true },
    { to: `${base}/importacion`, label: 'Importación masiva', icon: Upload, end: false },
    { to: `${base}/tracking-horas`, label: 'Tracking de horas', icon: Clock, end: false },
  ]

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Utilidades</h1>
        <p className="text-muted-foreground text-sm">
          Caja de herramientas transversal: archivos, importación masiva y tracking de horas
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
