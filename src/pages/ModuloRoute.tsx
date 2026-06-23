import { Suspense } from 'react'
import { useParams } from 'react-router-dom'
import { REGISTRO_MODULOS } from '@/modules/registry'
import { ModuloPendiente } from '@/modules/ModuloPendiente'

export function ModuloRoute() {
  const { slug = '' } = useParams<{ slug: string }>()
  const Componente = REGISTRO_MODULOS[slug]

  if (!Componente) {
    return <ModuloPendiente slug={slug} />
  }

  return (
    <Suspense fallback={<p className="text-sm text-gray-400">Cargando módulo...</p>}>
      <Componente />
    </Suspense>
  )
}
