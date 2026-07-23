import { useClienteActual } from '@/hooks/useClienteActual'
import { DashboardAdministrativo } from './DashboardAdministrativo'
import { DashboardOperativoGastronomico } from './operativo/DashboardOperativoGastronomico'
import { DashboardOperativoGenerico } from './operativo/DashboardOperativoGenerico'

// Punto de entrada de /dashboard -- decide qué pantalla mostrar según
// el rol del usuario logueado (rolActual.vista, ver useClienteActual):
// el resumen ejecutivo (DashboardAdministrativo) o un panel de accesos
// operativos (DashboardOperativo*). Para gastronómico hay una versión
// dedicada con KPIs de turno/mesas/cocina; el resto de los rubros usa
// un fallback genérico de accesos directos hasta que tengan su propio
// pack operativo (ver DashboardOperativoGenerico.tsx).
//
// rolActual puede venir null mientras carga, o para usuarios legados
// sin rol_id asignado todavía -- en ambos casos se muestra el
// administrativo, que era el comportamiento único antes de esta
// migración (0022_dashboard_operativo.sql), para no dejar a nadie con
// una pantalla vacía.
export function DashboardHome() {
  const { cliente, modulosActivos, rolActual, cargando } = useClienteActual()

  if (cargando) {
    return <div className="flex h-40 items-center justify-center text-gray-400">Cargando...</div>
  }

  if (rolActual?.vista === 'operativo') {
    // Fase 15: cualquiera de las dos variantes del kit gastronómico
    // (con o sin salón) usa el mismo dashboard operativo -- sus propias
    // tarjetas (mesas, cocina) ya muestran 0 sin romper nada si el
    // cliente no tiene mesas-salon/comandas-cocina activos.
    const esGastronomico =
      cliente?.tipo_negocio === 'gastronomico_con_salon' || cliente?.tipo_negocio === 'gastronomico_sin_salon'
    return esGastronomico ? (
      <DashboardOperativoGastronomico modulosActivos={modulosActivos} />
    ) : (
      <DashboardOperativoGenerico modulosActivos={modulosActivos} />
    )
  }

  return <DashboardAdministrativo />
}
