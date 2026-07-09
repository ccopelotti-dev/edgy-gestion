// Módulo Delivery por WhatsApp — entry point.

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
