// Layout minimo: a diferencia de Caja por turno o Mesas y Salon (una
// sola pantalla), este modulo tiene dos vistas bien distintas (lista de
// comandas activas / detalle de una mesa) y cada una arma su propio
// encabezado, asi que este layout no agrega uno propio para no
// duplicarlo.
import { Outlet } from 'react-router-dom'

export function ComandasCocinaLayout() {
  return (
    <div className="flex flex-col gap-6">
      <Outlet />
    </div>
  )
}
