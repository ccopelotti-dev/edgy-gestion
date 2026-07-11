import { useEffect, useState } from 'react'
import { ExternalLink, Copy, Check, Table2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { useClienteActual } from '@/hooks/useClienteActual'
import { supabase } from '@/lib/supabase'

// Módulo Menú QR -- lado administrativo. Scope acordado: "solo menú
// visual (sin pedidos)". Esta página no gestiona productos (eso ya
// vive en Productos y Stock) ni pedidos (no hay) -- solo le da al
// dueño el link público y el QR para imprimir/compartir. La página
// que ve el cliente final es src/pages/MenuPublico.tsx, servida sin
// login en /menu/:slug (fuera del DashboardLayout).
//
// Fase 13c (Mejoras de Salón): si el negocio tiene mesas cargadas
// (módulo Mesas y Salón -- lectura cross-módulo directa a `mesas`,
// mismo criterio que el dashboard leyendo tablas de otros módulos),
// se puede imprimir un QR POR MESA (`/menu/:slug?mesa=<numero>`) en
// vez de -- o adicional a -- el QR genérico del local. Ese parámetro
// es lo que habilita el botón "Llamar mozo" en MenuPublico.tsx.
interface MesaLite {
  id: string
  numero: number
}

export default function Index() {
  const { cliente } = useClienteActual()
  const [copiado, setCopiado] = useState(false)
  const [mesas, setMesas] = useState<MesaLite[]>([])

  useEffect(() => {
    if (!cliente?.id) return
    supabase
      .from('mesas')
      .select('id, numero')
      .eq('cliente_id', cliente.id)
      .order('numero')
      .then(({ data }) => setMesas((data ?? []).map((m: any) => ({ id: m.id, numero: m.numero }))))
  }, [cliente?.id])

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

      {/* Fase 13c: QR por mesa -- solo si el negocio tiene mesas
          cargadas en Mesas y Salón. Habilita "Llamar mozo" desde el
          celular del comensal (MenuPublico.tsx lee ?mesa=<numero>). */}
      {mesas.length > 0 && (
        <div className="flex flex-col gap-3">
          <div className="flex items-center gap-2">
            <Table2 className="h-4 w-4 text-muted-foreground" />
            <h2 className="font-medium">QR por mesa</h2>
          </div>
          <p className="text-muted-foreground text-sm">
            Un QR distinto para cada mesa: además del menú, le suma al comensal el botón "Llamar
            mozo" desde su celular. Imprimí el que corresponda y pegalo en cada mesa.
          </p>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
            {mesas.map((m) => {
              const urlMesa = `${publicUrl}?mesa=${m.numero}`
              const qrMesa = `https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(urlMesa)}`
              return (
                <Card key={m.id}>
                  <CardContent className="flex flex-col items-center gap-2 py-4">
                    <span className="text-sm font-semibold">Mesa {m.numero}</span>
                    <img src={qrMesa} alt={`QR mesa ${m.numero}`} className="h-32 w-32 rounded-md border" />
                    <a href={qrMesa} download={`menu-qr-mesa-${m.numero}.png`}>
                      <Button variant="outline" size="sm">
                        Descargar
                      </Button>
                    </a>
                  </CardContent>
                </Card>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}
