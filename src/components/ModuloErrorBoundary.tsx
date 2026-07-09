import { Component, type ErrorInfo, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { AlertTriangle } from 'lucide-react'
import { Button } from '@/components/ui/button'

interface Props {
  /** Nombre visible del módulo, para el mensaje de error (ej. "Comandas y cocina"). */
  nombreModulo: string
  children: ReactNode
}

interface State {
  error: Error | null
}

/**
 * Contiene los errores de renderizado de UN módulo para que no tumben toda la
 * app. Se usa envolviendo cada <Componente /> cargado por lazy() en
 * ModuloRoute.tsx, con `key={slug}` puesto por el padre -- así, al navegar a
 * otro módulo, React remonta el boundary entero y el estado de error se
 * limpia solo (no hace falta un botón de "reintentar" manual acá).
 *
 * Antes de esto no existía NINGÚN error boundary en la app: un error de
 * renderizado en, por ejemplo, Comandas y cocina, podía dejar en blanco toda
 * la pantalla en vez de quedarse contenido en ese módulo.
 */
export class ModuloErrorBoundary extends Component<Props, State> {
  state: State = { error: null }

  static getDerivedStateFromError(error: Error): State {
    return { error }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    // eslint-disable-next-line no-console
    console.error(`Error en el módulo "${this.props.nombreModulo}":`, error, info.componentStack)
  }

  render() {
    if (this.state.error) {
      return (
        <div className="flex min-h-[50vh] flex-col items-center justify-center gap-3 rounded-lg border border-dashed p-8 text-center">
          <AlertTriangle className="h-8 w-8 text-destructive" />
          <div>
            <p className="text-sm font-medium text-gray-900">
              El módulo "{this.props.nombreModulo}" tuvo un error y no se pudo mostrar.
            </p>
            <p className="mt-1 text-sm text-gray-500">
              El resto del sistema sigue funcionando normalmente. Probá volver al inicio o
              recargar la página.
            </p>
          </div>
          <div className="flex gap-2 pt-1">
            <Button asChild size="sm" variant="outline">
              <Link to="/dashboard">Volver al inicio</Link>
            </Button>
            <Button size="sm" onClick={() => window.location.reload()}>
              Recargar página
            </Button>
          </div>
        </div>
      )
    }

    return this.props.children
  }
}
