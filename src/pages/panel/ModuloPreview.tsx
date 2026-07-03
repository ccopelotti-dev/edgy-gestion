import { Suspense } from 'react'
import { useParams, Link } from 'react-router-dom'
import { REGISTRO_MODULOS } from '@/modules/registry'
import { ModuloPendiente } from '@/modules/ModuloPendiente'

/**
 * Vista previa de un módulo para personal de Edgy, sin pasar por
 * DashboardLayout/useClienteActual (que exige que el usuario logueado
 * esté vinculado a un cliente real vía usuarios_cliente -- el staff
 * nunca lo está, por eso /m/:slug le muestra "No encontramos un
 * negocio asociado a este usuario").
 *
 * Acá se monta el mismo componente lazy del registro directo, sin ese
 * gate. Las pantallas que consultan Supabase van a traer listas vacías
 * (RLS filtra por cliente_id, que para este usuario no matchea
 * ninguno) -- exactamente el "módulo vacío" que se busca para revisar
 * qué pantallas y funciones tiene, no para ver datos de un cliente
 * real. Los módulos con datos de demo en memoria (Provider con seed)
 * sí van a mostrar esos datos de ejemplo tal cual.
 */
export function ModuloPreview() {
  const { slug = '' } = useParams<{ slug: string }>()
  const Componente = REGISTRO_MODULOS[slug]

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between rounded-md border border-dashed border-gray-300 bg-gray-50 px-4 py-2">
        <div>
          <Link to="/panel/modulos" className="text-sm text-gray-400 hover:text-gray-600">
            ← Módulos
          </Link>
          <p className="text-sm text-gray-600">
            Vista previa de staff · sin cliente asociado, así que las pantallas que leen
            Supabase se ven vacías. Sirve para revisar qué tiene el módulo, no para probar
            datos reales.
          </p>
        </div>
      </div>

      {!Componente ? (
        <ModuloPendiente slug={slug} />
      ) : (
        <Suspense fallback={<p className="text-sm text-gray-400">Cargando módulo...</p>}>
          <Componente />
        </Suspense>
      )}
    </div>
  )
}
