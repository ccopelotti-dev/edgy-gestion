import { ShoppingCart, Receipt, AlertTriangle, Wallet } from 'lucide-react'
import { useClienteActual } from '@/hooks/useClienteActual'

export function DashboardHome() {
  const { cliente } = useClienteActual()
  const colorMarca = cliente?.color_marca ?? '#0C1A2E'

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <TarjetaMetrica etiqueta="Ventas hoy" valor="$0" icono={ShoppingCart} color={colorMarca} />
        <TarjetaMetrica etiqueta="Ticket promedio" valor="$0" icono={Receipt} color={colorMarca} />
        <TarjetaMetrica etiqueta="Stock crítico" valor="0 ítems" icono={AlertTriangle} color={colorMarca} />
        <TarjetaMetrica etiqueta="Caja" valor="$0" icono={Wallet} color={colorMarca} nota="sin movimientos" />
      </div>

      <div className="grid grid-cols-1 gap-3 lg:grid-cols-[1.5fr_1fr]">
        <div className="rounded-lg border border-gray-200 p-4">
          <p className="mb-3 text-sm text-gray-500">Ventas — últimos 7 días</p>
          <div className="flex h-28 items-center justify-center">
            <p className="text-sm text-gray-400">Sin datos de ventas</p>
          </div>
        </div>
        <div className="flex flex-col items-center rounded-lg border border-gray-200 p-4">
          <p className="mb-3 self-start text-sm text-gray-500">Categorías top</p>
          <div className="flex h-28 items-center justify-center">
            <p className="text-sm text-gray-400">Sin categorías</p>
          </div>
        </div>
      </div>

      <div className="rounded-lg bg-gray-50 p-4">
        <p className="mb-1 text-sm text-gray-500">Top productos</p>
        <div className="flex h-20 items-center justify-center">
          <p className="text-sm text-gray-400">Sin productos vendidos</p>
        </div>
      </div>
    </div>
  )
}

interface TarjetaMetricaProps {
  etiqueta: string
  valor: string
  icono: typeof ShoppingCart
  color: string
  nota?: string
}

function TarjetaMetrica({ etiqueta, valor, icono: Icono, color, nota }: TarjetaMetricaProps) {
  return (
    <div className="rounded-lg border border-gray-200 p-3.5">
      <div className="mb-2.5 flex items-center justify-between">
        <span className="text-xs text-gray-500">{etiqueta}</span>
        <Icono size={16} color={color} />
      </div>
      <p className="text-xl font-medium">{valor}</p>
      {nota && <p className="mt-1 text-xs text-gray-500">{nota}</p>}
    </div>
  )
}
