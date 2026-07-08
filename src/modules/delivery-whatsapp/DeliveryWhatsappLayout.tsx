import { Outlet } from 'react-router-dom'

// Listado y detalle de pedido no necesitan tabs propias -- mismo
// criterio que ViandasLayout: un wrapper simple alcanza.
export function DeliveryWhatsappLayout() {
  return (
    <div className="flex flex-col gap-6">
      <Outlet />
    </div>
  )
}
