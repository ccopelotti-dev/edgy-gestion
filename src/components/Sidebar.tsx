import { NavLink } from 'react-router-dom'
import type { ModuloActivo } from '@/hooks/useClienteActual'
import { colorDeContraste } from '@/lib/colorContraste'
import { iconoDeModulo, IconoInicio } from '@/modules/iconosModulo'
import { colorDeKit, labelDeVertical } from '@/modules/kits'

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

// Orden fijo del resto de los íconos (arriba hacia abajo), independiente
// del orden en que vengan de cliente_modulos. Servicios va justo debajo
// de Productos y stock, arriba de Ventas. Cualquier slug que no esté acá
// (módulo nuevo que todavía no se agregó a esta lista) cae al final, en
// vez de desaparecer.
const ORDEN_PRINCIPALES = [
  'tesoreria',
  'productos-stock',
  'servicios',
  'ventas',
  'compras',
  'mesas-salon',
  'comandas-cocina',
  'menu-qr',
  'ventas-online',
  'caja-turno',
  'reportes',
  'contable',
]

function ordenarPrincipales(modulos: ModuloActivo[]): ModuloActivo[] {
  return [...modulos].sort((a, b) => {
    const ia = ORDEN_PRINCIPALES.indexOf(a.slug)
    const ib = ORDEN_PRINCIPALES.indexOf(b.slug)
    const posA = ia === -1 ? ORDEN_PRINCIPALES.length : ia
    const posB = ib === -1 ? ORDEN_PRINCIPALES.length : ib
    return posA - posB
  })
}

// Fase 25a: segregación visual núcleo vs kit. `vertical` viene de la
// tabla `modulos` ('core' para el núcleo administrativo, cualquier otro
// valor identifica un kit -- hoy solo 'gastronomico', a futuro puede
// haber otros ej. 'transporte'). Color/label por kit centralizados en
// src/modules/kits.ts (compartido con el panel interno y el wizard).

/** Agrupa los módulos no-núcleo por `vertical`, preservando el orden de
 * ORDEN_PRINCIPALES dentro de cada grupo y el orden de primera aparición
 * entre grupos (si mañana hay dos kits activos a la vez, no debería
 * pasar en la práctica, pero no se rompe si pasa). */
function agruparPorKit(modulos: ModuloActivo[]): { vertical: string; modulos: ModuloActivo[] }[] {
  const grupos = new Map<string, ModuloActivo[]>()
  for (const m of modulos) {
    const lista = grupos.get(m.vertical) ?? []
    lista.push(m)
    grupos.set(m.vertical, lista)
  }
  return Array.from(grupos.entries()).map(([vertical, mods]) => ({ vertical, modulos: mods }))
}

/** Rail vertical de íconos, pintado por completo en el color de marca
 * del cliente — el ícono del módulo activo se resalta con el color de
 * contraste que mejor se vea contra ese color (blanco o gris oscuro,
 * calculado, no fijo). El logo va en el header (Layout.tsx), no acá. */
export function Sidebar({ colorMarca, modulos }: SidebarProps) {
  const fondo = colorMarca ?? '#0C1A2E'
  const contraste = colorDeContraste(fondo)
  const inactivoOpacidad = contraste === '#FFFFFF' ? 'rgba(255,255,255,0.55)' : 'rgba(32,31,27,0.55)'
  const activoFondo = contraste === '#FFFFFF' ? 'rgba(255,255,255,0.18)' : 'rgba(32,31,27,0.12)'

  const principales = ordenarPrincipales(modulos.filter((m) => !SLUGS_PIE.includes(m.slug)))
  const deSistema = SLUGS_PIE
    .map((slug) => modulos.find((m) => m.slug === slug))
    .filter((m): m is ModuloActivo => !!m)

  // Fase 25a: núcleo primero (sin recuadro), después un grupo con
  // recuadro de color por cada kit activo (hoy solo 'gastronomico').
  const nucleo = principales.filter((m) => m.vertical === 'core')
  const gruposKit = agruparPorKit(principales.filter((m) => m.vertical !== 'core'))

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

      {nucleo.map(botonModulo)}

      {gruposKit.map(({ vertical, modulos: modulosDelKit }) => {
        const color = colorDeKit(vertical)
        return (
          <div key={vertical} className="flex flex-col items-center gap-1.5">
            <div className="my-0.5 h-px w-8" style={{ backgroundColor: inactivoOpacidad }} />
            <div
              className="flex flex-col items-center gap-1.5 rounded-xl px-1 py-1.5"
              style={{ backgroundColor: `${color}33`, boxShadow: `inset 0 0 0 1px ${color}66` }}
              title={labelDeVertical(vertical)}
            >
              {modulosDelKit.map(botonModulo)}
            </div>
          </div>
        )
      })}

      {deSistema.length > 0 && (
        <div className="mt-auto flex flex-col items-center gap-1.5">
          {deSistema.map(botonModulo)}
        </div>
      )}
    </aside>
  )
}
