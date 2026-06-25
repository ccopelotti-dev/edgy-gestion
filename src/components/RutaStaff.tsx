import { Outlet } from 'react-router-dom'
import { usePersonalEdgy } from '@/hooks/usePersonalEdgy'

const URL_LOGIN = 'https://edgysistemas.tech'

/**
 * Protege todo lo que cuelga de /panel. Reutiliza el login que ya existe
 * en la landing (edgysistemas.tech) en vez de tener un login propio acá:
 * si no hay sesión, manda para allá. Si hay sesión pero la cuenta no
 * está en personal_edgy, bloquea con un mensaje — no redirige a ciegas,
 * porque esa persona sí está autenticada, solo que no es staff.
 */
export function RutaStaff() {
  const { esStaff, haySesion, cargando } = usePersonalEdgy()

  if (cargando) {
    return (
      <div className="flex h-screen items-center justify-center text-gray-400">
        Verificando acceso...
      </div>
    )
  }

  if (!haySesion) {
    window.location.href = URL_LOGIN
    return null
  }

  if (!esStaff) {
    return (
      <div className="flex h-screen flex-col items-center justify-center gap-2 text-center">
        <p className="text-base font-medium text-gray-900">Esta sección es solo para personal de Edgy</p>
        <p className="text-sm text-gray-500">
          Si pensás que esto es un error, hablalo con Pablo o Carlos.
        </p>
      </div>
    )
  }

  return <Outlet />
}
