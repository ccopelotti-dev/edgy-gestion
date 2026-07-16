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
  ArrowUpDown,
} from 'lucide-react'
import { cn } from '@/lib/utils'

export function ProductosStockLayout() {
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
    { to: `${base}/movimientos`, label: 'Movimientos', icon: ArrowUpDown, end: false },
    { to: `${base}/recepcion`, label: 'Recepción', icon: PackageCheck, end: false },
    { to: `${base}/transferencias`, label: 'Transferencias', icon: ArrowLeftRight, end: false },
    { to: `${base}/control`, label: 'Control', icon: ClipboardCheck, end: false },
  ]

  return (
    <div className="flex flex-col gap-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Productos y Stock</h1>
        <p className="text-muted-foreground text-sm">
          Catálogo, insumos, formulación de productos y control de inventario
        </p>
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
