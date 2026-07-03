import { NavLink } from 'react-router-dom'
import type { ModuloActivo } from '@/hooks/useClienteActual'
import { colorDeContraste } from '@/lib/colorContraste'
import { iconoDeModulo, IconoInicio } from '@/modules/iconosModulo'

interface SidebarProps {
  colorMarca: string | null
  modulos: ModuloActivo[]
}

// Utilidades y Configuración son transversales (no un área de negocio
// como Ventas/Tesorería/etc.), así que van separadas al pie del rail
// -- mismo criterio visual que un "engranaje al fondo" de cualquier
// panel con navegación lateral. El orden acá (utilidades, configuracion)
// es el orden en que se dibujan de arriba hacia abajo dentro de ese
// grupo pegado al fondo.
const SLUGS_PIE = ['utilidades', 'configuracion']

/** Rail vertical de íconos, pintado por completo en el color de marca
 * del cliente — el ícono del módulo activo se resalta con el color de
 * contraste que mejor se vea contra ese color (blanco o gris oscuro,
 * calculado, no fijo). El logo va en el header (Layout.tsx), no acá. */
export function Sidebar({ colorMarca, modulos }: SidebarProps) {
  const fondo = colorMarca ?? '#0C1A2E'
  const contraste = colorDeContraste(fondo)
  const inactivoOpacidad = contraste === '#FFFFFF' ? 'rgba(255,255,255,0.55)' : 'rgba(32,31,27,0.55)'
  const activoFondo = contraste === '#FFFFFF' ? 'rgba(255,255,255,0.18)' : 'rgba(32,31,27,0.12)'

  const principales = modulos.filter((m) => !SLUGS_PIE.includes(m.slug))
  const deSistema = SLUGS_PIE
    .map((slug) => modulos.find((m) => m.slug === slug))
    .filter((m): m is ModuloActivo => !!m)

  function botonModulo(modulo: ModuloActivo) {
    const Icono = iconoDeModulo(modulo.slug)
    return (
      <NavLink
        key={modulo.id}
        to={`/m/${modulo.slug}`}
        title={modulo.nombre}
        className="flex h-10 w-10 items-center justify-center rounded-xl transition-colors"
        style={({ isActive }) => ({
          backgroundColor: isActive ? activoFondo : 'transparent',
        })}
      >
        {({ isActive }) => <Icono size={18} color={isActive ? contraste : inactivoOpacidad} />}
      </NavLink>
    )
  }

  return (
    <aside
      className="flex h-screen w-16 flex-shrink-0 flex-col items-center gap-1.5 py-4"
      style={{ backgroundColor: fondo }}
    >
      <NavLink
        to="/dashboard"
        end
        className="flex h-10 w-10 items-center justify-center rounded-xl transition-colors"
        style={({ isActive }) => ({
          backgroundColor: isActive ? activoFondo : 'transparent',
        })}
      >
        {({ isActive }) => <IconoInicio size={18} color={isActive ? contraste : inactivoOpacidad} />}
      </NavLink>

      {principales.map(botonModulo)}

      {deSistema.length > 0 && (
        <div className="mt-auto flex flex-col items-center gap-1.5">
          {deSistema.map(botonModulo)}
        </div>
      )}
    </aside>
  )
}
