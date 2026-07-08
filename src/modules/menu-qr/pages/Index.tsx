import { useState } from 'react'
import { ExternalLink, Copy, Check } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { useClienteActual } from '@/hooks/useClienteActual'

// Módulo Menú QR -- lado administrativo. Scope acordado: "solo menú
// visual (sin pedidos)". Esta página no gestiona productos (eso ya
// vive en Productos y Stock) ni pedidos (no hay) -- solo le da al
// dueño el link público y el QR para imprimir/compartir. La página
// que ve el cliente final es src/pages/MenuPublico.tsx, servida sin
// login en /menu/:slug (fuera del DashboardLayout).
export default function Index() {
  const { cliente } = useClienteActual()
  const [copiado, setCopiado] = useState(false)

  if (!cliente?.slug) {
    return (
      <div className="flex flex-col gap-2">
        <h1 className="text-2xl font-bold tracking-tight">Menú QR</h1>
        <p className="text-muted-foreground text-sm">
          Todavía no tenés un identificador público configurado. Contactá a soporte para activarlo.
        </p>
      </div>
    )
  }

  const publicUrl = `${window.location.origin}/menu/${cliente.slug}`
  const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=280x280&data=${encodeURIComponent(publicUrl)}`

  async function copiarLink() {
    await navigator.clipboard.writeText(publicUrl)
    setCopiado(true)
    setTimeout(() => setCopiado(false), 2000)
  }

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Menú QR</h1>
        <p className="text-muted-foreground text-sm">
          Menú público de solo lectura: tus clientes lo ven escaneando el QR, sin necesidad de
          iniciar sesión. Los precios y productos se actualizan solos desde Productos y Stock.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card>
          <CardContent className="flex flex-col items-center gap-4 py-6">
            <img
              src={qrUrl}
              alt={`Código QR del menú de ${cliente.nombre}`}
              className="h-56 w-56 rounded-md border"
            />
            <a href={qrUrl} download={`menu-qr-${cliente.slug}.png`}>
              <Button variant="outline" size="sm">
                Descargar QR
              </Button>
            </a>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="flex flex-col gap-4 py-6">
            <div>
              <h3 className="mb-1.5 font-medium">Link público</h3>
              <div className="flex items-center gap-2">
                <code className="flex-1 truncate rounded-md border bg-gray-50 px-3 py-2 text-sm">
                  {publicUrl}
                </code>
                <Button variant="outline" size="sm" onClick={copiarLink}>
                  {copiado ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                </Button>
              </div>
            </div>

            <a href={publicUrl} target="_blank" rel="noreferrer">
              <Button className="w-full">
                <ExternalLink className="mr-1.5 h-4 w-4" />
                Ver menú público
              </Button>
            </a>

            <p className="text-muted-foreground text-xs">
              Solo se muestran los productos marcados como disponibles y activos en Productos y
              Stock, agrupados por rubro. No incluye pedidos ni pagos -- es un menú informativo.
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
