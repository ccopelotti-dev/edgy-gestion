import { Link } from 'react-router-dom'
import type { ModuloActivo } from '@/hooks/useClienteActual'
import { iconoDeModulo } from '@/modules/iconosModulo'

const SLUGS_EXCLUIDOS = ['utilidades', 'configuracion']

interface Props {
  modulosActivos: ModuloActivo[]
}

// Dashboard operativo genérico -- para rubros que todavía no tienen un
// pack de módulos operativos propio (a diferencia de gastronómico, ver
// DashboardOperativoGastronomico.tsx). Deliberadamente simple: solo
// accesos directos a los módulos activos del cliente, sin KPIs
// específicos de ningún rubro. Utilidades/Configuración quedan afuera
// porque ya son siempre visibles al pie del Sidebar, no hace falta
// duplicarlas acá como accesos grandes.
//
// Cuando se construya el pack operativo de otro rubro (ej. logística),
// reemplazar este fallback por uno dedicado, igual que se hizo con
// gastronómico.
export function DashboardOperativoGenerico({ modulosActivos }: Props) {
  const accesos = modulosActivos.filter((m) => !SLUGS_EXCLUIDOS.includes(m.slug))

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-lg font-medium text-gray-900">Tus accesos</h1>
        <p className="text-sm text-gray-500">Entrá directo al módulo que necesitás.</p>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        {accesos.map((m) => {
          const Icono = iconoDeModulo(m.slug)
          return (
            <Link
              key={m.id}
              to={`/m/${m.slug}`}
              className="flex flex-col items-center gap-2 rounded-lg border border-gray-200 p-4 text-center hover:border-gray-300 hover:bg-gray-50"
            >
              <span className="flex h-10 w-10 items-center justify-center rounded-full bg-gray-100 text-indigo-600">
                <Icono size={18} />
              </span>
              <span className="text-sm font-medium text-gray-700">{m.nombre}</span>
            </Link>
          )
        })}
        {accesos.length === 0 && (
          <p className="col-span-full py-6 text-center text-sm text-gray-400">
            Todavía no hay módulos activos para este negocio.
          </p>
        )}
      </div>
    </div>
  )
}
