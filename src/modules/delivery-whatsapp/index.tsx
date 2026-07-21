// Módulo Ventas Online (antes "Delivery por WhatsApp") — entry point.
// La carpeta se mantiene con el nombre viejo (delivery-whatsapp) para no
// romper imports; el slug/label público es 'ventas-online' / "Ventas
// Online" -- ver src/modules/registry.ts y migración
// 0062_rename_delivery_whatsapp_a_ventas_online.sql.

import { Routes, Route } from 'react-router-dom'
import { DeliveryWhatsappProvider } from './data/store'
import { DeliveryWhatsappLayout } from './DeliveryWhatsappLayout'
import Index from './pages/Index'
import Pedido from './pages/Pedido'

export default function DeliveryWhatsappModule() {
  return (
    <DeliveryWhatsappProvider>
      <Routes>
        <Route element={<DeliveryWhatsappLayout />}>
          <Route index element={<Index />} />
          <Route path=":pedidoId" element={<Pedido />} />
        </Route>
      </Routes>
    </DeliveryWhatsappProvider>
  )
}
