import { Suspense } from 'react'
import { useParams } from 'react-router-dom'
import { REGISTRO_MODULOS } from '@/modules/registry'
import { ModuloPendiente } from '@/modules/ModuloPendiente'
import { AccesoRestringido } from '@/modules/AccesoRestringido'
import { ModuloErrorBoundary } from '@/components/ModuloErrorBoundary'
import { useClienteActual } from '@/hooks/useClienteActual'

export function ModuloRoute() {
  const { slug = '' } = useParams<{ slug: string }>()
  const Componente = REGISTRO_MODULOS[slug]
  // Fase 71: modulosActivos ya viene filtrado por permisos_rol (ver
  // useClienteActual) -- si el slug no está ahí, o no está activo para
  // el cliente, o su rol lo tiene bloqueado. `cliente` en null cubre
  // además el modo "vista previa" de staff sin negocio asociado (ver
  // Layout.tsx) -- ahí no hay nada que restringir, se deja pasar igual
  // que siempre.
  const { cliente, modulosActivos, cargando } = useClienteActual()

  if (!Componente) {
    return <ModuloPendiente slug={slug} />
  }

  if (cargando) {
    return <p className="text-sm text-gray-400">Cargando...</p>
  }

  if (cliente && !modulosActivos.some((m) => m.slug === slug)) {
    return <AccesoRestringido slug={slug} />
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
