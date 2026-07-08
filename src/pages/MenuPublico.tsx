import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { supabase } from '@/lib/supabase'

// Página pública del Menú QR -- sin login, sin DashboardLayout.
// Scope acordado con el usuario: "Solo menú visual (sin pedidos)".
// No integra con Ventas ni Comandas, es puramente informativa.
//
// Los datos se resuelven con una única llamada RPC a la función
// SECURITY DEFINER `edgy_gestion.menu_publico(p_slug)` (ver
// supabase/migrations/0020_menu_qr.sql) -- esa función ya filtra
// disponible/activo y arma el JSON completo, así que acá no hace
// falta ninguna otra consulta ni sesión de Supabase Auth.

interface ProductoPublico {
  id: string
  nombre: string
  descripcion: string | null
  precio: number
  imagen: string | null
}

interface CategoriaPublica {
  id: string
  nombre: string
  productos: ProductoPublico[]
}

interface MenuPublicoData {
  cliente: {
    nombre: string
    slug: string
    logoUrl: string | null
    colorMarca: string | null
  } | null
  categorias: CategoriaPublica[]
}

function formatARS(monto: number): string {
  return new Intl.NumberFormat('es-AR', {
    style: 'currency',
    currency: 'ARS',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(monto)
}

export default function MenuPublico() {
  const { slug } = useParams<{ slug: string }>()
  const [data, setData] = useState<MenuPublicoData | null>(null)
  const [cargando, setCargando] = useState(true)

  useEffect(() => {
    if (!slug) return
    let activo = true
    setCargando(true)
    supabase
      .rpc('menu_publico', { p_slug: slug })
      .then(({ data: resultado, error }) => {
        if (!activo) return
        if (error) {
          console.error('Menú público · error:', error)
          setData(null)
        } else {
          setData(resultado as MenuPublicoData)
        }
        setCargando(false)
      })
    return () => {
      activo = false
    }
  }, [slug])

  if (cargando) {
    return (
      <div className="flex min-h-screen items-center justify-center text-gray-400">
        Cargando menú...
      </div>
    )
  }

  if (!data?.cliente) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-2 px-4 text-center">
        <h1 className="text-xl font-semibold">Menú no encontrado</h1>
        <p className="text-muted-foreground text-sm">
          Este link no corresponde a ningún negocio activo.
        </p>
      </div>
    )
  }

  const { cliente, categorias } = data
  const color = cliente.colorMarca ?? '#111827'

  return (
    <div className="min-h-screen bg-gray-50 pb-16">
      <div className="flex flex-col items-center gap-3 px-4 pb-8 pt-10 text-center text-white" style={{ backgroundColor: color }}>
        {cliente.logoUrl && (
          <img src={cliente.logoUrl} alt={cliente.nombre} className="h-16 w-16 rounded-full border-2 border-white object-cover" />
        )}
        <h1 className="text-2xl font-bold">{cliente.nombre}</h1>
        <p className="text-sm text-white/80">Menú</p>
      </div>

      <div className="mx-auto flex max-w-2xl flex-col gap-8 px-4 pt-8">
        {categorias.length === 0 && (
          <p className="text-muted-foreground text-center text-sm">
            Todavía no hay productos publicados en este menú.
          </p>
        )}

        {categorias.map((cat) => (
          <div key={cat.id} className="flex flex-col gap-3">
            <h2 className="text-lg font-semibold" style={{ color }}>
              {cat.nombre}
            </h2>
            <div className="flex flex-col gap-3">
              {cat.productos.map((p) => (
                <div key={p.id} className="flex items-center gap-3 rounded-lg border bg-white p-3">
                  {p.imagen ? (
                    <img src={p.imagen} alt={p.nombre} className="h-16 w-16 flex-shrink-0 rounded-md object-cover" />
                  ) : (
                    <div className="h-16 w-16 flex-shrink-0 rounded-md bg-gray-100" />
                  )}
                  <div className="flex flex-1 flex-col gap-0.5">
                    <span className="font-medium">{p.nombre}</span>
                    {p.descripcion && (
                      <span className="text-muted-foreground text-xs">{p.descripcion}</span>
                    )}
                  </div>
                  <span className="whitespace-nowrap font-semibold">{formatARS(p.precio)}</span>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
