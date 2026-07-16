import { NavLink, Outlet, useLocation } from 'react-router-dom'
import {
  LayoutDashboard,
  Package,
  Tags,
  Images,
  Percent,
  ShieldCheck,
  History,
  PackagePlus,
  Boxes,
  FlaskConical,
  Factory,
  BarChart3,
  PackageCheck,
  ArrowLeftRight,
  ClipboardCheck,
  RotateCcw,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { useProductosStock } from './data/store'

export function ProductosStockLayout() {
  const { dispatch } = useProductosStock()
  const { pathname } = useLocation()
  const base = pathname.match(/^(\/m\/[^/]+)/)?.[1] ?? ''

  const tabs = [
    { to: base, label: 'Dashboard', icon: LayoutDashboard, end: true },
    { to: `${base}/rubros`, label: 'Rubros', icon: Tags, end: false },
    { to: `${base}/productos`, label: 'Productos', icon: Package, end: false },
    { to: `${base}/catalogo`, label: 'Catálogo', icon: Images, end: false },
    { to: `${base}/listas-precio`, label: 'Listas de precio', icon: Percent, end: false },
    { to: `${base}/garantias`, label: 'Garantías', icon: ShieldCheck, end: false },
    { to: `${base}/garantias-emitidas`, label: 'Garantías emitidas', icon: History, end: false },
    { to: `${base}/combos`, label: 'Combos', icon: PackagePlus, end: false },
    { to: `${base}/insumos`, label: 'Insumos', icon: Boxes, end: false },
    { to: `${base}/formular`, label: 'Formular Producto', icon: FlaskConical, end: false },
    { to: `${base}/produccion`, label: 'Producción', icon: Factory, end: false },
    { to: `${base}/stock`, label: 'Stock', icon: BarChart3, end: false },
    { to: `${base}/recepcion`, label: 'Recepción', icon: PackageCheck, end: false },
    { to: `${base}/transferencias`, label: 'Transferencias', icon: ArrowLeftRight, end: false },
    { to: `${base}/control`, label: 'Control', icon: ClipboardCheck, end: false },
  ]

  return (
    <div className="flex flex-col gap-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Productos y Stock</h1>
          <p className="text-muted-foreground text-sm">
            Catálogo, insumos, formulación de productos y control de inventario
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
