// Módulo Menú QR — entry point.
//
// A diferencia de los demás módulos, este no necesita Provider ni
// store propio: no hay estado que mutar, solo se muestra el link/QR
// derivados de `cliente.slug`. Una sola página alcanza.

import Index from './pages/Index'

export default function MenuQrModule() {
  return <Index />
}
