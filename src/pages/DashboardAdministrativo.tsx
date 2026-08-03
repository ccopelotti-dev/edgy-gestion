import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  ShoppingCart,
  ShoppingBag,
  Banknote,
  PackagePlus,
  Receipt,
  AlertTriangle,
  Pencil,
} from 'lucide-react'
import { useClienteActual } from '@/hooks/useClienteActual'
import { useResumenDashboard } from '@/hooks/useResumenDashboard'
import { formatARS } from '@/modules/tesoreria/lib/format'
import { ModoMostradorToggle } from './operativo/ModoMostradorToggle'

// Resumen ejecutivo multi-módulo -- lo que veía todo el mundo en
// /dashboard antes de la migración 0022 (Dashboard operativo por rol).
// A partir de esa migración, DashboardHome.tsx pasó a ser un switch que
// decide entre esta pantalla (roles con vista='administrativo') y
// DashboardOperativo* (vista='operativo') -- ver ese archivo. El
// contenido de acá no cambió, solo el nombre del componente.
//
// "Informes de caja" (saldo de caja/bancos/cheques, flujo de fondos)
// se sacó de acá a pedido del usuario -- quedaba duplicado con
// Tesorería, que ya lo muestra con más detalle. useResumenDashboard
// sigue calculando esos campos (los usan otras pantallas), simplemente
// no se leen más en este componente.
//
// El panel de la derecha ("dock") reutiliza el mismo diseño visual que
// se pensó para la futura app mobile (grilla de atajos con ícono + label),
// para que un operador de escritorio tenga acceso a las mismas acciones
// rápidas sin abrir ningún módulo. El lápiz activa un modo edición que por
// ahora solo permite sacar atajos de la lista (estado local, se resetea
// al recargar la página) -- guardar el orden/selección por cliente en
// Supabase y poder agregar atajos nuevos queda para una próxima etapa.

interface Atajo {
  id: string
  label: string
  icon: typeof ShoppingCart
  ruta: string
}

const ATAJOS_DEFAULT: Atajo[] = [
  { id: 'nueva-venta', label: 'Nueva venta', icon: ShoppingCart, ruta: '/m/ventas/comprobantes' },
  { id: 'nueva-compra', label: 'Nueva compra', icon: ShoppingBag, ruta: '/m/compras/comprobantes' },
  { id: 'ingreso-caja', label: 'Ingreso a caja', icon: Banknote, ruta: '/m/tesoreria/caja' },
  { id: 'nueva-recepcion', label: 'Nueva recepción', icon: PackagePlus, ruta: '/m/productos-stock/recepcion' },
  { id: 'nuevo-pago', label: 'Nuevo pago', icon: Receipt, ruta: '/m/compras/comprobantes' },
]

interface Props {
  /** Fase 26: atajo a Modo Mostrador si el cliente tiene Ventas activo. */
  mostrarToggleMostrador?: boolean
  onCambiarModo?: (activo: boolean) => void
}

export function DashboardAdministrativo({ mostrarToggleMostrador, onCambiarModo }: Props = {}) {
  const { cliente } = useClienteActual()
  const resumen = useResumenDashboard(cliente?.id)
  const navigate = useNavigate()
  const [editando, setEditando] = useState(false)
  const [atajos, setAtajos] = useState<Atajo[]>(ATAJOS_DEFAULT)

  function quitarAtajo(id: string) {
    setAtajos((prev) => prev.filter((a) => a.id !== id))
  }

  return (
    <div className="grid grid-cols-1 gap-6 xl:grid-cols-[1fr_300px]">
      <div className="space-y-4">
        {mostrarToggleMostrador && onCambiarModo && (
          <div className="flex justify-end">
            <ModoMostradorToggle activo={false} onChange={onCambiarModo} />
          </div>
        )}

        {resumen.stockCritico > 0 && (
          <div className="flex items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
            <AlertTriangle size={16} className="flex-shrink-0" />
            {resumen.stockCritico} {resumen.stockCritico === 1 ? 'producto' : 'productos'} con stock en o por debajo
            del mínimo.
          </div>
        )}
      </div>

      {/* Panel de atajos, mismo diseño que la app mobile */}
      <div className="rounded-[20px] border border-gray-200 bg-gray-50 p-3.5">
        <div className="rounded-2xl bg-white p-3.5">
          <div className="mb-3 grid grid-cols-2 gap-2">
            <div className="rounded-lg bg-gray-50 px-2.5 py-2">
              <p className="text-[10px] text-gray-400">Ventas hoy</p>
              <p className="text-sm font-medium">{formatARS(resumen.ventasHoy)}</p>
            </div>
            <div className="rounded-lg bg-gray-50 px-2.5 py-2">
              <p className="text-[10px] text-gray-400">Stock crítico</p>
              <p className="text-sm font-medium">{resumen.stockCritico} ítems</p>
            </div>
          </div>

          <div className="mb-2 flex items-center justify-between">
            <span className="text-xs text-gray-500">Atajos</span>
            <button
              onClick={() => setEditando((v) => !v)}
              className="text-xs font-medium text-indigo-600"
              title={editando ? 'Terminar de editar' : 'Editar atajos'}
            >
              {editando ? 'Listo' : <Pencil size={13} />}
            </button>
          </div>

          <div className="grid grid-cols-2 gap-3">
            {atajos.map((a) => (
              <button
                key={a.id}
                onClick={() => (editando ? quitarAtajo(a.id) : navigate(a.ruta))}
                className="relative flex flex-col items-center gap-1"
              >
                <span className="flex h-9 w-9 items-center justify-center rounded-full bg-gray-100 text-indigo-600">
                  <a.icon size={16} />
                </span>
                {editando && (
                  <span className="absolute -right-1 -top-1 flex h-3.5 w-3.5 items-center justify-center rounded-full bg-red-500 text-[9px] leading-none text-white">
                    ×
                  </span>
                )}
                <span className="text-center text-[10px] leading-tight text-gray-500">{a.label}</span>
              </button>
            ))}
            {atajos.length === 0 && (
              <p className="col-span-2 py-4 text-center text-xs text-gray-400">No quedan atajos. Recargá la página para restaurarlos.</p>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
