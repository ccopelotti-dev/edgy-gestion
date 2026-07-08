import { Outlet } from 'react-router-dom'

// Listado y detalle de plan no necesitan tabs propias (a diferencia de
// comandas-cocina, que alterna entre Comandas y Cocina) -- un wrapper
// simple alcanza, mismo criterio que el resto de los módulos sin
// sub-navegación.
export function ViandasLayout() {
  return (
    <div className="flex flex-col gap-6">
      <Outlet />
    </div>
  )
}
