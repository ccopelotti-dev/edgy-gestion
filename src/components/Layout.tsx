import { Outlet, Navigate, Link } from 'react-router-dom'
import { Store } from 'lucide-react'
import { Sidebar } from '@/components/Sidebar'
import { useClienteActual } from '@/hooks/useClienteActual'
import { usePersonalEdgy } from '@/hooks/usePersonalEdgy'
import { colorDeContraste } from '@/lib/colorContraste'

export function DashboardLayout() {
  const { cliente, modulosActivos, cargando, error } = useClienteActual()
  const { esStaff, cargando: cargandoStaff } = usePersonalEdgy()

  if (cargando || cargandoStaff) {
    return <div className="flex h-screen items-center justify-center text-gray-400">Cargando...</div>
  }

  // Sin sesión en absoluto (no hay user_id, no hay error de negocio
  // asociado) -> a loguearse, no a un mensaje sin salida.
  if (!error && !cliente) {
    return <Navigate to="/ingresar" replace />
  }

  if (error || !cliente) {
    // Personal de Edgy sin cliente asociado (el caso normal: el staff
    // no es usuario de ningún cliente) -- en vez de bloquear, se deja
    // pasar en modo "vista previa": el módulo se monta igual, vacío
    // (RLS filtra por cliente_id, que no matchea ninguno), para poder
    // revisar qué pantallas y funciones tiene sin necesidad de logins
    // de cliente ni de tocar cliente_modulos. Un cliente real sin
    // negocio asociado (que no es staff) sigue viendo el bloqueo de
    // siempre, sin acceso a nada.
    if (esStaff) {
      return (
        <div className="flex h-screen flex-col">
          <div className="flex items-center gap-3 border-b border-dashed border-gray-300 bg-gray-50 px-4 py-2 text-sm text-gray-600">
            <Link to="/panel/modulos" className="text-gray-400 hover:text-gray-600">
              ← Módulos
            </Link>
            <span>
              Vista previa de staff · sin cliente asociado, así que se ve vacío. Sirve para
              revisar qué tiene el módulo, no para probar datos reales.
            </span>
          </div>
          <main className="flex-1 overflow-y-auto bg-white p-8">
            <Outlet />
          </main>
        </div>
      )
    }

    return (
      <div className="flex h-screen items-center justify-center text-gray-500">
        {error ?? 'No hay un negocio configurado para este usuario.'}
      </div>
    )
  }

  const colorMarca = cliente.color_marca ?? '#0C1A2E'
  const contraste = colorDeContraste(colorMarca)
  const bordeLogo = contraste === '#FFFFFF' ? 'rgba(255,255,255,0.5)' : 'rgba(32,31,27,0.35)'

  return (
    <div className="flex h-screen">
      <Sidebar colorMarca={cliente.color_marca} modulos={modulosActivos} />

      <div className="flex flex-1 flex-col overflow-hidden">
        <header
          className="flex items-center gap-3 px-6 py-4"
          style={{ backgroundColor: colorMarca }}
        >
          <div
            className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-[10px] border-[1.5px] border-dashed bg-white"
            style={{ borderColor: bordeLogo }}
          >
            {cliente.logo_url ? (
              <img
                src={cliente.logo_url}
                alt={cliente.nombre}
                className="h-full w-full rounded-[10px] object-cover"
              />
            ) : (
              <Store size={18} className="text-gray-400" />
            )}
          </div>
          <span className="truncate text-base font-medium" style={{ color: contraste }}>
            {cliente.nombre}
          </span>
        </header>

        <main className="flex-1 overflow-y-auto bg-white p-8">
          <Outlet />
        </main>
      </div>
    </div>
  )
}
