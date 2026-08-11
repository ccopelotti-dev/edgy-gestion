import { NavLink, Outlet, useLocation } from 'react-router-dom'
import { BookOpen, Calculator, Receipt } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useCondicionIva } from './data/useCondicionIva'

export function ImpuestosLayout() {
  const { pathname } = useLocation()
  const base = pathname.match(/^(\/m\/[^/]+)/)?.[1] ?? ''
  const { esMonotributo, cargando } = useCondicionIva()

  const tabs = [
    { to: base, label: 'Libro IVA', icon: BookOpen, end: true, soloResponsableInscripto: true },
    { to: `${base}/posicion-mensual`, label: 'Posición Mensual', icon: Calculator, end: false, soloResponsableInscripto: true },
    { to: `${base}/retenciones-percepciones`, label: 'Retenciones y Percepciones', icon: Receipt, end: false, soloResponsableInscripto: false },
  ].filter((t) => !t.soloResponsableInscripto || !esMonotributo)

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Impuestos</h1>
        <p className="text-muted-foreground text-sm">
          Libro IVA, posición mensual de IVA y retenciones/percepciones -- versión beta, sobre datos ya cargados en Ventas y Compras.
        </p>
      </div>

      {!cargando && esMonotributo && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          Este cliente está configurado como <strong>Monotributista</strong> en Configuración &gt; Empresa. El
          Monotributo no liquida IVA por régimen general, así que el Libro IVA y la Posición Mensual no aplican --
          solo se muestra Retenciones y Percepciones (por ej. percepciones de Ingresos Brutos sufridas).
        </div>
      )}

      <nav className="border-b">
        <div className="-mb-px flex gap-1 overflow-x-auto">
          {tabs.map(({ to, label, icon: Icon, end }) => (
            <NavLink
              key={label}
              to={to}
              end={end}
              className={({ isActive }) =>
                cn(
                  'inline-flex items-center gap-2 border-b-2 px-4 py-2.5 text-sm font-medium transition-colors whitespace-nowrap',
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
