import { Link } from 'react-router-dom'
import { Armchair, ChefHat, Banknote, Truck, Soup, QrCode, CircleCheck, CircleAlert, type LucideIcon } from 'lucide-react'
import { useClienteActual, type ModuloActivo } from '@/hooks/useClienteActual'
import { useResumenOperativoGastronomico } from '@/hooks/useResumenOperativoGastronomico'

// Dashboard operativo del pack gastronómico -- lo que ve un Mozo,
// Cocina, Cajero o Delivery al entrar a /dashboard (rolActual.vista =
// 'operativo', ver DashboardHome.tsx). A diferencia de
// DashboardAdministrativo, no muestra caja/bancos/cheques: en vez de
// eso, un pulso rápido del turno (mesas, cocina) y accesos directos a
// los módulos operativos que este cliente tenga activos.
//
// Los accesos se filtran solo por módulo activo (mismo criterio que
// Sidebar.tsx), no por nivel de permiso del rol -- si alguien entra a
// un módulo para el que no tiene permiso, RLS ya lo bloquea del lado
// de los datos. No se duplica esa lógica acá.

const ORDEN_OPERATIVO = ['mesas-salon', 'comandas-cocina', 'caja-turno', 'ventas-online', 'viandas', 'menu-qr']

const ETIQUETA_POR_SLUG: Record<string, string> = {
  'mesas-salon': 'Mesas y Salón',
  'comandas-cocina': 'Comandas y cocina',
  'caja-turno': 'Caja por turno',
  'ventas-online': 'Ventas Online',
  viandas: 'Viandas',
  'menu-qr': 'Menú QR',
}

const ICONO_POR_SLUG: Record<string, LucideIcon> = {
  'mesas-salon': Armchair,
  'comandas-cocina': ChefHat,
  'caja-turno': Banknote,
  'ventas-online': Truck,
  viandas: Soup,
  'menu-qr': QrCode,
}

interface Props {
  modulosActivos: ModuloActivo[]
}

export function DashboardOperativoGastronomico({ modulosActivos }: Props) {
  const { cliente } = useClienteActual()
  const resumen = useResumenOperativoGastronomico(cliente?.id)

  const activosPorSlug = new Set(modulosActivos.map((m) => m.slug))
  const accesos = ORDEN_OPERATIVO.filter((slug) => activosPorSlug.has(slug))

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-lg font-medium text-gray-900">Así está el turno</h1>
        <p className="text-sm text-gray-500">Un vistazo rápido antes de entrar a trabajar.</p>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <ResumenCard
          label="Turno de caja"
          value={resumen.cargando ? '…' : resumen.turnoAbierto ? 'Abierto' : 'Cerrado'}
          icon={resumen.turnoAbierto ? CircleCheck : CircleAlert}
          accent={resumen.turnoAbierto ? 'text-emerald-600' : 'text-amber-600'}
        />
        <ResumenCard
          label="Mesas libres"
          value={resumen.cargando ? '…' : String(resumen.mesasLibres)}
          icon={Armchair}
          accent="text-gray-700"
        />
        <ResumenCard
          label="Mesas ocupadas"
          value={resumen.cargando ? '…' : String(resumen.mesasOcupadas)}
          icon={Armchair}
          accent="text-gray-700"
        />
        <ResumenCard
          label="Pendientes en cocina"
          value={resumen.cargando ? '…' : String(resumen.comandasPendientesCocina)}
          icon={ChefHat}
          accent={resumen.comandasPendientesCocina > 0 ? 'text-amber-600' : 'text-gray-700'}
        />
      </div>

      <div>
        <p className="mb-3 text-sm text-gray-500">Accesos</p>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          {accesos.map((slug) => {
            const Icono = ICONO_POR_SLUG[slug] ?? Armchair
            return (
              <Link
                key={slug}
                to={`/m/${slug}`}
                className="flex flex-col items-center gap-2 rounded-lg border border-gray-200 p-4 text-center hover:border-gray-300 hover:bg-gray-50"
              >
                <span className="flex h-10 w-10 items-center justify-center rounded-full bg-gray-100 text-indigo-600">
                  <Icono size={18} />
                </span>
                <span className="text-sm font-medium text-gray-700">{ETIQUETA_POR_SLUG[slug]}</span>
              </Link>
            )
          })}
          {accesos.length === 0 && (
            <p className="col-span-full py-6 text-center text-sm text-gray-400">
              Todavía no hay módulos operativos activos para este negocio.
            </p>
          )}
        </div>
      </div>
    </div>
  )
}

function ResumenCard({
  label,
  value,
  icon: Icon,
  accent,
}: {
  label: string
  value: string
  icon: LucideIcon
  accent: string
}) {
  return (
    <div className="rounded-lg border border-gray-200 p-4">
      <div className="mb-2 flex items-center justify-between">
        <span className="text-xs text-gray-500">{label}</span>
        <Icon size={16} className={accent} />
      </div>
      <p className="text-lg font-semibold text-gray-900">{value}</p>
    </div>
  )
}
