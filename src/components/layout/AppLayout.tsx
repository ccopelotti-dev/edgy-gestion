import { NavLink, Outlet, useLocation } from 'react-router-dom'
import {
  Banknote,
  LayoutDashboard,
  Receipt,
  Landmark,
  ScrollText,
  Wallet,
  RotateCcw,
  CalendarClock,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { useTreasury } from '@/data/store'

const NAV = [
  { to: '/', label: 'Dashboard', icon: LayoutDashboard, end: true },
  { to: '/caja', label: 'Caja', icon: Wallet },
  { to: '/bancos', label: 'Bancos', icon: Landmark },
  { to: '/cheques', label: 'Cartera de Cheques', icon: ScrollText },
  { to: '/vencimientos', label: 'Vencimientos', icon: CalendarClock },
]

const TITLES: Record<string, { title: string; subtitle: string }> = {
  '/': { title: 'Dashboard', subtitle: 'Resumen de tesorería' },
  '/caja': { title: 'Caja', subtitle: 'Movimientos de ingresos y egresos' },
  '/bancos': { title: 'Bancos', subtitle: 'Cuentas y movimientos bancarios' },
  '/cheques': {
    title: 'Cartera de Cheques',
    subtitle: 'Seguimiento de cheques recibidos y emitidos',
  },
  '/vencimientos': {
    title: 'Vencimientos',
    subtitle: 'Calendario de cheques a cobrar y a pagar',
  },
}

export function AppLayout() {
  const { dispatch } = useTreasury()
  const { pathname } = useLocation()
  const head = TITLES[pathname] ?? TITLES['/']

  return (
    <div className="bg-background flex min-h-svh">
      {/* Sidebar */}
      <aside className="bg-sidebar text-sidebar-foreground sticky top-0 hidden h-svh w-64 shrink-0 flex-col border-r border-sidebar-border md:flex">
        <div className="flex items-center gap-2.5 px-5 py-5">
          <div className="bg-sidebar-primary text-sidebar-primary-foreground flex size-9 items-center justify-center rounded-lg">
            <Banknote className="size-5" />
          </div>
          <div className="leading-tight">
            <p className="text-sm font-semibold">Edgy Gestión</p>
            <p className="text-sidebar-foreground/60 text-xs">
              Módulo Tesorería
            </p>
          </div>
        </div>

        <nav className="flex flex-1 flex-col gap-1 px-3 py-2">
          {NAV.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              className={({ isActive }) =>
                cn(
                  'flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors',
                  isActive
                    ? 'bg-sidebar-primary text-sidebar-primary-foreground'
                    : 'text-sidebar-foreground/80 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground',
                )
              }
            >
              <item.icon className="size-4.5 shrink-0" />
              {item.label}
            </NavLink>
          ))}
        </nav>

        <div className="border-sidebar-border border-t p-3">
          <button
            onClick={() => {
              if (confirm('¿Restablecer los datos de demostración?'))
                dispatch({ type: 'RESET' })
            }}
            className="text-sidebar-foreground/60 hover:bg-sidebar-accent hover:text-sidebar-foreground flex w-full items-center gap-2 rounded-lg px-3 py-2 text-xs transition-colors"
          >
            <RotateCcw className="size-3.5" />
            Restablecer datos demo
          </button>
        </div>
      </aside>

      {/* Main */}
      <div className="flex min-w-0 flex-1 flex-col">
        {/* Topbar */}
        <header className="bg-background/80 sticky top-0 z-30 flex items-center justify-between gap-4 border-b px-5 py-4 backdrop-blur md:px-8">
          <div>
            <h1 className="text-foreground text-xl font-semibold tracking-tight md:text-2xl">
              {head.title}
            </h1>
            <p className="text-muted-foreground text-sm">{head.subtitle}</p>
          </div>
          <div className="flex items-center gap-3">
            <div className="text-muted-foreground hidden text-right text-xs sm:block">
              <p className="font-medium text-foreground">Distribuidora Norte S.R.L.</p>
              <p>CUIT 30-71234567-9</p>
            </div>
            <div className="bg-primary text-primary-foreground flex size-9 items-center justify-center rounded-full text-sm font-semibold">
              DN
            </div>
          </div>
        </header>

        {/* Mobile nav */}
        <nav className="flex gap-1 overflow-x-auto border-b px-3 py-2 md:hidden">
          {NAV.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              className={({ isActive }) =>
                cn(
                  'flex items-center gap-2 rounded-md px-3 py-1.5 text-sm whitespace-nowrap',
                  isActive
                    ? 'bg-primary text-primary-foreground'
                    : 'text-muted-foreground hover:bg-accent',
                )
              }
            >
              <item.icon className="size-4" />
              {item.label}
            </NavLink>
          ))}
        </nav>

        <main className="flex-1 px-5 py-6 md:px-8 md:py-8">
          <Outlet />
        </main>

        <footer className="text-muted-foreground border-t px-5 py-4 text-center text-xs md:px-8">
          <span className="inline-flex items-center gap-1.5">
            <Receipt className="size-3.5" />
            Edgy Gestión · Módulo de Tesorería · Datos de demostración
          </span>
        </footer>
      </div>
    </div>
  )
}
