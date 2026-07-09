import { Suspense } from 'react'
import { useParams } from 'react-router-dom'
import { REGISTRO_MODULOS } from '@/modules/registry'
import { ModuloPendiente } from '@/modules/ModuloPendiente'
import { ModuloErrorBoundary } from '@/components/ModuloErrorBoundary'

export function ModuloRoute() {
  const { slug = '' } = useParams<{ slug: string }>()
  const Componente = REGISTRO_MODULOS[slug]

  if (!Componente) {
    return <ModuloPendiente slug={slug} />
  }

  return (
    // key={slug}: al navegar a otro módulo, React remonta el boundary desde
    // cero, así el estado de error de un módulo no persiste al entrar a otro.
    <ModuloErrorBoundary key={slug} nombreModulo={slug}>
      <Suspense fallback={<p className="text-sm text-gray-400">Cargando módulo...</p>}>
        <Componente />
      </Suspense>
    </ModuloErrorBoundary>
  )
}
