import { NavLink } from 'react-router-dom'
import { cn } from '@/lib/utils'

interface ItemMenu {
  to: string
  label: string
  disponible: boolean
}

const ITEMS: ItemMenu[] = [
  { to: '/panel/nuevo-cliente', label: 'Nuevo Cliente', disponible: true },
  { to: '/panel/clientes', label: 'Clientes', disponible: true },
  { to: '/panel/modulos', label: 'Módulos', disponible: true },
  { to: '/panel/metricas', label: 'Métricas', disponible: false },
]

export function PanelSidebar({ nombreStaff }: { nombreStaff: string | null }) {
  return (
    <aside className="flex h-screen w-64 flex-col bg-brand-500 text-white">
      <div className="border-b border-white/10 px-5 py-5">
        <span className="text-base font-semibold tracking-tight">Edgy Sistemas</span>
        <p className="mt-1 text-xs text-white/60">Panel interno{nombreStaff ? ` · ${nombreStaff}` : ''}</p>
      </div>

      <nav className="flex-1 space-y-1 px-3 py-4">
        {ITEMS.map((item) =>
          item.disponible ? (
            <NavLink
              key={item.to}
              to={item.to}
              className={({ isActive }) =>
                cn(
                  'block rounded-md px-3 py-2 text-sm font-medium transition-colors',
                  isActive ? 'bg-white/15 text-white' : 'text-white/70 hover:bg-white/10',
                )
              }
            >
              {item.label}
            </NavLink>
          ) : (
            <div
              key={item.to}
              className="flex items-center justify-between rounded-md px-3 py-2 text-sm font-medium text-white/40"
            >
              {item.label}
              <span className="rounded-full bg-white/10 px-2 py-0.5 text-[10px]">Próximamente</span>
            </div>
          ),
        )}
      </nav>

      <div className="border-t border-white/10 px-3 py-4">
        <a
          href="https://edgysistemas.tech"
          className="block rounded-md px-3 py-2 text-sm font-medium text-white/60 hover:bg-white/10"
        >
          ← Volver a edgysistemas.tech
        </a>
      </div>
    </aside>
  )
}
