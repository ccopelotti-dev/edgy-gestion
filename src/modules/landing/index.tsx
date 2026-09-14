// Módulo Landing -- entry point.
//
// Mismo criterio que menu-qr: sin Provider ni store propio, una sola
// página administrativa alcanza (ver pages/Index.tsx).

import Index from './pages/Index'

export default function LandingModule() {
  return <Index />
}
