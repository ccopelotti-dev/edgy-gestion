import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Wallet,
  Landmark,
  FileText,
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
import { KpiCard } from '@/modules/tesoreria/components/treasury/KpiCard'
import { PAYMENT_METHODS } from '@/modules/tesoreria/types'
import { formatARS } from '@/modules/tesoreria/lib/format'

// Home dashboard (/dashboard) -- resumen ejecutivo multi-módulo.
//
// Reemplaza la versión anterior, que era enteramente estática ($0 fijo,
// "Sin datos" en todos lados, ninguna llamada a Supabase). Acá los datos
// de "Informes de caja" salen de useResumenDashboard (consulta directa a
// Supabase, ver ese archivo). Los dashboards internos de cada módulo
// (Tesorería, Ventas, Compras, Productos y Stock) siguen existiendo tal
// cual y no se tocaron -- esto es un resumen de entrada, no un reemplazo.
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

export function DashboardHome() {
  const { cliente } = useClienteActual()
  const resumen = useResumenDashboard(cliente?.id)
  const navigate = useNavigate()
  const [editando, setEditando] = useState(false)
  const [atajos, setAtajos] = useState<Atajo[]>(ATAJOS_DEFAULT)

  function quitarAtajo(id: string) {
    setAtajos((prev) => prev.filter((a) => a.id !== id))
  }

  const maxMedio = Math.max(1, ...resumen.flujoPorMedio.map((x) => Math.max(x.ingreso, x.egreso)))

  return (
    <div className="grid grid-cols-1 gap-6 xl:grid-cols-[1fr_300px]">
      {/* Informes de caja */}
      <div className="space-y-4">
        <p className="text-sm text-gray-500">Informes de caja</p>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <KpiCard label="Saldo de caja" value={formatARS(resumen.saldoCaja)} icon={Wallet} accent="primary" />
          <KpiCard label="Total en bancos" value={formatARS(resumen.totalBancos)} icon={Landmark} accent="income" />
          <KpiCard
            label="Cheques en cartera"
            value={formatARS(resumen.chequesEnCarteraValor)}
            icon={FileText}
            accent="warning"
            hint={`${resumen.chequesEnCarteraCount} por cobrar`}
          />
        </div>

        <div className="rounded-lg border border-gray-200 p-4">
          <p className="mb-3 text-sm text-gray-500">Flujo de fondos por medio de pago — últimos 30 días</p>

          {resumen.flujoPorMedio.length === 0 ? (
            <div className="flex h-20 items-center justify-center">
              <p className="text-sm text-gray-400">
                {resumen.cargando ? 'Cargando...' : 'Sin movimientos de caja en este período'}
              </p>
            </div>
          ) : (
            <div className="flex flex-col gap-3">
              {resumen.flujoPorMedio.map((row) => {
                const meta = PAYMENT_METHODS.find((m) => m.value === row.medio)
                return (
                  <div key={row.medio} className="flex items-center gap-3">
                    <span className="w-28 flex-shrink-0 text-sm text-gray-500">{meta?.label ?? row.medio}</span>
                    <div className="flex flex-1 items-center gap-1.5">
                      <div className="flex flex-1 justify-end">
                        <div
                          className="bg-income h-2.5 rounded-full"
                          style={{ width: `${(row.ingreso / maxMedio) * 100}%` }}
                        />
                      </div>
                      <div className="h-4 w-px bg-gray-200" />
                      <div className="flex flex-1">
                        <div
                          className="bg-expense h-2.5 rounded-full"
                          style={{ width: `${(row.egreso / maxMedio) * 100}%` }}
                        />
                      </div>
                    </div>
                  </div>
                )
              })}
              <div className="mt-1 flex items-center justify-center gap-6 text-xs text-gray-500">
                <span className="flex items-center gap-1.5">
                  <span className="bg-income size-2.5 rounded-full" /> Ingresos
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="bg-expense size-2.5 rounded-full" /> Egresos
                </span>
              </div>
            </div>
          )}
        </div>

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
