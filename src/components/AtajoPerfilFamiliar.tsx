// Fase 71d (05/09, a pedido de Carlos): atajo a Perfil Familiar dentro
// del renglón de pestañas de cada módulo con tabs (Compras/Ventas/Home
// Keep) -- ubicado a la derecha, a la altura de la última pestaña, justo
// debajo de "Edgy Gestion" en el encabezado. Es una segunda entrada al
// mismo lugar que ya vive en el dropdown "Cuenta" del header general
// (Layout.tsx) -- Carlos lo pidió más a mano que el dropdown. Mismo
// criterio de visibilidad: solo para quien administra la cuenta (ver
// useClienteActual.ts, Fase 71).
import { Link } from 'react-router-dom'
import { Users } from 'lucide-react'
import { useClienteActual } from '@/hooks/useClienteActual'

export function AtajoPerfilFamiliar() {
  const { rolActual } = useClienteActual()
  if (rolActual && !rolActual.esAdmin) return null

  return (
    <Link
      to="/perfil-familiar"
      className="flex shrink-0 items-center gap-1 text-xs text-gray-500 hover:text-gray-700"
    >
      <Users className="h-3 w-3" />
      Perfil Familiar
    </Link>
  )
}
