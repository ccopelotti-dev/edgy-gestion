import { ShoppingCart, Receipt, AlertTriangle, Wallet, ArrowUpRight } from 'lucide-react'
import { useClienteActual } from '@/hooks/useClienteActual'
import { mezclarConBlanco } from '@/lib/colorContraste'

// Los indicadores de esta pantalla son de ejemplo a propósito — todavía
// no hay métricas reales conectadas (ver decisión en la sesión de
// diseño: "la prioridad es el diseño visual, no los datos reales").
// Cuando se conecten datos reales de Ventas/Tesorería, estos bloques
// se reemplazan; la estructura visual (tarjetas, gráfico, dona, top
// productos) ya queda lista.
const VENTAS_7_DIAS = [
  { dia: 'Vie', valor: 57 },
  { dia: 'Sáb', valor: 83 },
  { dia: 'Dom', valor: 69 },
  { dia: 'Lun', valor: 47 },
  { dia: 'Mar', valor: 76 },
  { dia: 'Mié', valor: 88 },
  { dia: 'Hoy', valor: 100 },
]

const TOP_PRODUCTOS = [
  { nombre: 'Producto más vendido', vendidos: 142, monto: '$56.800' },
  { nombre: 'Segundo más vendido', vendidos: 118, monto: '$41.200' },
  { nombre: 'Tercero más vendido', vendidos: 64, monto: '$38.500' },
  { nombre: 'Cuarto más vendido', vendidos: 39, monto: '$35.100' },
]

export function DashboardHome() {
  const { cliente } = useClienteActual()
  const colorMarca = cliente?.color_marca ?? '#0C1A2E'

  const tintesD = [colorMarca, mezclarConBlanco(colorMarca, 0.45), mezclarConBlanco(colorMarca, 0.78), '#DAD8D1']
  const categorias = [
    { nombre: 'Categoría 1', porcentaje: 38 },
    { nombre: 'Categoría 2', porcentaje: 27 },
    { nombre: 'Categoría 3', porcentaje: 18 },
    { nombre: 'Otros', porcentaje: 17 },
  ]
  const gradiente = (() => {
    let acumulado = 0
    const partes = categorias.map((c, i) => {
      const desde = acumulado
      acumulado += c.porcentaje
      return `${tintesD[i]} ${desde}% ${acumulado}%`
    })
    return `conic-gradient(${partes.join(', ')})`
  })()

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <TarjetaMetrica
          etiqueta="Ventas hoy"
          valor="$184.500"
          icono={ShoppingCart}
          color={colorMarca}
          delta="12% vs ayer"
        />
        <TarjetaMetrica
          etiqueta="Ticket promedio"
          valor="$3.200"
          icono={Receipt}
          color={colorMarca}
          delta="4% vs ayer"
        />
        <TarjetaMetrica
          etiqueta="Stock crítico"
          valor="4 ítems"
          icono={AlertTriangle}
          color={colorMarca}
          nota="revisar reposición"
        />
        <TarjetaMetrica
          etiqueta="Caja"
          valor="$612.300"
          icono={Wallet}
          color={colorMarca}
          nota="actualizado hace 5 min"
        />
      </div>

      <div className="grid grid-cols-1 gap-3 lg:grid-cols-[1.5fr_1fr]">
        <div className="rounded-lg border border-gray-200 p-4">
          <p className="mb-3 text-sm text-gray-500">Ventas — últimos 7 días</p>
          <div className="flex h-28 items-end gap-2">
            {VENTAS_7_DIAS.map((d) => (
              <div key={d.dia} className="flex h-full flex-1 flex-col items-center justify-end">
                <div
                  className="w-full max-w-[22px] rounded-md"
                  style={{
                    height: `${d.valor}%`,
                    backgroundColor: d.dia === 'Hoy' ? colorMarca : '#E3E1D9',
                  }}
                />
              </div>
            ))}
          </div>
          <div className="mt-2 flex gap-2">
            {VENTAS_7_DIAS.map((d) => (
              <span
                key={d.dia}
                className="flex-1 text-center text-xs"
                style={{ color: d.dia === 'Hoy' ? colorMarca : '#8A887F', fontWeight: d.dia === 'Hoy' ? 500 : 400 }}
              >
                {d.dia}
              </span>
            ))}
          </div>
        </div>

        <div className="flex flex-col items-center rounded-lg border border-gray-200 p-4">
          <p className="mb-3 self-start text-sm text-gray-500">Categorías top</p>
          <div
            className="relative h-26 w-26 flex-shrink-0 rounded-full"
            style={{ width: 104, height: 104, background: gradiente }}
          >
            <div
              className="absolute flex flex-col items-center justify-center rounded-full bg-white"
              style={{ top: 16, left: 16, width: 72, height: 72 }}
            >
              <span className="text-base font-medium">{categorias[0].porcentaje}%</span>
              <span className="text-[9px] text-gray-500">{categorias[0].nombre}</span>
            </div>
          </div>
          <div className="mt-3.5 w-full space-y-1.5">
            {categorias.map((c, i) => (
              <div key={c.nombre} className="flex items-center justify-between">
                <span className="flex items-center gap-1.5 text-xs text-gray-900">
                  <span
                    className="inline-block h-2 w-2 rounded-full"
                    style={{ backgroundColor: tintesD[i] }}
                  />
                  {c.nombre}
                </span>
                <span className="text-xs text-gray-500">{c.porcentaje}%</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="rounded-lg bg-gray-50 p-4">
        <p className="mb-1 text-sm text-gray-500">Top productos</p>
        {TOP_PRODUCTOS.map((p, i) => (
          <div
            key={p.nombre}
            className={`flex items-center justify-between gap-3 py-2.5 ${i > 0 ? 'border-t border-gray-200' : ''}`}
          >
            <div className="flex min-w-0 items-center gap-2.5">
              <span className="flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full border border-gray-200 bg-white text-xs text-gray-500">
                {i + 1}
              </span>
              <span className="truncate text-sm">{p.nombre}</span>
            </div>
            <div className="flex flex-shrink-0 items-center gap-5">
              <span className="whitespace-nowrap text-xs text-gray-500">{p.vendidos} vendidos</span>
              <span className="whitespace-nowrap text-sm font-medium">{p.monto}</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

interface TarjetaMetricaProps {
  etiqueta: string
  valor: string
  icono: typeof ShoppingCart
  color: string
  delta?: string
  nota?: string
}

function TarjetaMetrica({ etiqueta, valor, icono: Icono, color, delta, nota }: TarjetaMetricaProps) {
  return (
    <div className="rounded-lg border border-gray-200 p-3.5">
      <div className="mb-2.5 flex items-center justify-between">
        <span className="text-xs text-gray-500">{etiqueta}</span>
        <Icono size={16} color={color} />
      </div>
      <p className="text-xl font-medium">{valor}</p>
      {delta && (
        <p className="mt-1 flex items-center gap-1 text-xs text-gray-500">
          <ArrowUpRight size={13} color={color} />
          {delta}
        </p>
      )}
      {nota && <p className="mt-1 text-xs text-gray-500">{nota}</p>}
    </div>
  )
}
