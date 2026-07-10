import { useEffect, useMemo, useState } from 'react'
import { useParams } from 'react-router-dom'
import { ShoppingCart, Plus, Minus, X, CheckCircle2, ArrowLeft } from 'lucide-react'
import { supabase } from '@/lib/supabase'

// Página pública del Catálogo -- sin login, sin DashboardLayout.
//
// Fase 7b (auditoría de conexiones Ventas↔Productos): hasta acá esta
// página era "solo menú visual, sin pedidos" -- una oferta pasiva sin
// ninguna acción comercial. Ahora el cliente arma un carrito y lo
// manda.
//
// Fase 8b/8c: esta MISMA página (y esta misma URL, /menu/:slug) sirve
// para CUALQUIER rubro, no solo Gastronomía -- fue decisión explícita
// del usuario no duplicar el motor de catálogo/carrito por kit. El
// pedido aterriza como una `orden_venta` (el motor central que
// también van a usar Presupuestos/Órdenes de venta manuales, Fase 8e)
// vía la función SQL crear_orden_venta_publica, que corre sin sesión
// (rol anon) y resuelve el precio real del lado del servidor -- nunca
// se confía en el precio que manda el navegador. Si el negocio tiene
// el Kit Gastronómico activo, esa orden además genera una fila de
// extensión logística que la hace aparecer en Delivery por WhatsApp,
// igual que antes de esta fase (ver store.tsx de delivery-whatsapp).
//
// Los datos se resuelven con una única llamada RPC a la función
// SECURITY DEFINER `edgy_gestion.menu_publico(p_slug)` -- esa función
// ya filtra disponible/activo, resuelve el precio con la lista de
// precio configurada si existe, y arma el JSON completo.

interface ProductoPublico {
  id: string
  nombre: string
  descripcion: string | null
  precio: number
  imagen: string | null
  tipo: 'unico' | 'con_variantes'
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

type Vista = 'menu' | 'checkout' | 'enviando' | 'exito' | 'error'
type Modalidad = 'retiro' | 'delivery'

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
  const [carrito, setCarrito] = useState<Map<string, number>>(new Map())
  const [vista, setVista] = useState<Vista>('menu')
  const [nombre, setNombre] = useState('')
  const [telefono, setTelefono] = useState('')
  const [modalidad, setModalidad] = useState<Modalidad>('retiro')
  const [direccion, setDireccion] = useState('')
  const [notas, setNotas] = useState('')
  const [errorMsg, setErrorMsg] = useState('')

  useEffect(() => {
    if (!slug) return
    let activo = true
    setCargando(true)
    supabase
      .rpc('menu_publico', { p_slug: slug })
      .then(({ data: resultado, error }) => {
        if (!activo) return
        if (error) {
          console.error('Catálogo público · error:', error)
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

  const productosPorId = useMemo(() => {
    const map = new Map<string, ProductoPublico>()
    for (const cat of data?.categorias ?? []) {
      for (const p of cat.productos) map.set(p.id, p)
    }
    return map
  }, [data])

  const itemsCarrito = useMemo(
    () =>
      Array.from(carrito.entries())
        .map(([productoId, cantidad]) => ({ producto: productosPorId.get(productoId), cantidad }))
        .filter((i): i is { producto: ProductoPublico; cantidad: number } => !!i.producto && i.cantidad > 0),
    [carrito, productosPorId],
  )

  const totalCarrito = itemsCarrito.reduce((sum, i) => sum + i.producto.precio * i.cantidad, 0)
  const cantidadCarrito = itemsCarrito.reduce((sum, i) => sum + i.cantidad, 0)

  function cambiarCantidad(productoId: string, delta: number) {
    setCarrito((prev) => {
      const next = new Map(prev)
      const actual = next.get(productoId) ?? 0
      const nueva = actual + delta
      if (nueva <= 0) next.delete(productoId)
      else next.set(productoId, nueva)
      return next
    })
  }

  async function confirmarPedido() {
    if (!slug || itemsCarrito.length === 0) return
    if (!nombre.trim() || !telefono.trim()) return
    if (modalidad === 'delivery' && !direccion.trim()) return

    setVista('enviando')
    setErrorMsg('')

    const { error } = await supabase.rpc('crear_orden_venta_publica', {
      p_slug: slug,
      p_cliente_nombre: nombre.trim(),
      p_telefono: telefono.trim(),
      p_canal_cumplimiento: modalidad,
      p_direccion: modalidad === 'retiro' ? 'Retiro en el local' : direccion.trim(),
      p_notas: notas.trim() || null,
      p_items: itemsCarrito.map((i) => ({ productoId: i.producto.id, cantidad: i.cantidad })),
    })

    if (error) {
      console.error('Catálogo público · error creando el pedido:', error)
      setErrorMsg(error.message || 'No se pudo enviar el pedido. Probá de nuevo.')
      setVista('error')
      return
    }

    setVista('exito')
  }

  function hacerOtroPedido() {
    setCarrito(new Map())
    setNombre('')
    setTelefono('')
    setModalidad('retiro')
    setDireccion('')
    setNotas('')
    setErrorMsg('')
    setVista('menu')
  }

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

  if (vista === 'exito') {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-3 px-4 text-center">
        <CheckCircle2 className="h-12 w-12" style={{ color }} />
        <h1 className="text-xl font-semibold">¡Pedido recibido!</h1>
        <p className="text-muted-foreground max-w-sm text-sm">
          {cliente.nombre} se va a contactar al {telefono} para coordinar la entrega.
        </p>
        <button
          onClick={hacerOtroPedido}
          className="mt-2 rounded-md px-4 py-2 text-sm font-medium text-white"
          style={{ backgroundColor: color }}
        >
          Hacer otro pedido
        </button>
      </div>
    )
  }

  if (vista === 'checkout' || vista === 'enviando' || vista === 'error') {
    return (
      <div className="min-h-screen bg-gray-50 pb-24">
        <div className="flex items-center gap-3 px-4 py-4 text-white" style={{ backgroundColor: color }}>
          <button onClick={() => setVista('menu')} disabled={vista === 'enviando'}>
            <ArrowLeft className="h-5 w-5" />
          </button>
          <h1 className="text-lg font-semibold">Confirmar pedido</h1>
        </div>

        <div className="mx-auto flex max-w-lg flex-col gap-4 px-4 pt-4">
          <div className="flex flex-col gap-2 rounded-lg border bg-white p-3">
            {itemsCarrito.map((i) => (
              <div key={i.producto.id} className="flex items-center justify-between text-sm">
                <span>
                  {i.cantidad} × {i.producto.nombre}
                </span>
                <span>{formatARS(i.producto.precio * i.cantidad)}</span>
              </div>
            ))}
            <div className="flex items-center justify-between border-t pt-2 font-semibold">
              <span>Total</span>
              <span>{formatARS(totalCarrito)}</span>
            </div>
          </div>

          {errorMsg && (
            <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
              {errorMsg}
            </div>
          )}

          <div className="flex flex-col gap-3 rounded-lg border bg-white p-3">
            <div className="flex flex-col gap-1">
              <label className="text-xs font-medium text-gray-600">Nombre</label>
              <input
                value={nombre}
                onChange={(e) => setNombre(e.target.value)}
                placeholder="Tu nombre"
                className="rounded-md border px-3 py-2 text-sm"
                disabled={vista === 'enviando'}
              />
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-xs font-medium text-gray-600">Teléfono</label>
              <input
                value={telefono}
                onChange={(e) => setTelefono(e.target.value)}
                placeholder="11 5555-5555"
                className="rounded-md border px-3 py-2 text-sm"
                disabled={vista === 'enviando'}
              />
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-xs font-medium text-gray-600">¿Cómo lo querés?</label>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setModalidad('retiro')}
                  disabled={vista === 'enviando'}
                  className={`flex-1 rounded-md border px-3 py-2 text-sm ${modalidad === 'retiro' ? 'border-current font-medium' : 'border-gray-200 text-gray-500'}`}
                  style={modalidad === 'retiro' ? { color } : undefined}
                >
                  Retiro en el local
                </button>
                <button
                  type="button"
                  onClick={() => setModalidad('delivery')}
                  disabled={vista === 'enviando'}
                  className={`flex-1 rounded-md border px-3 py-2 text-sm ${modalidad === 'delivery' ? 'border-current font-medium' : 'border-gray-200 text-gray-500'}`}
                  style={modalidad === 'delivery' ? { color } : undefined}
                >
                  Envío a domicilio
                </button>
              </div>
            </div>
            {modalidad === 'delivery' && (
              <div className="flex flex-col gap-1">
                <label className="text-xs font-medium text-gray-600">Dirección</label>
                <input
                  value={direccion}
                  onChange={(e) => setDireccion(e.target.value)}
                  placeholder="Calle 123, piso/depto"
                  className="rounded-md border px-3 py-2 text-sm"
                  disabled={vista === 'enviando'}
                />
              </div>
            )}
            <div className="flex flex-col gap-1">
              <label className="text-xs font-medium text-gray-600">Notas (opcional)</label>
              <input
                value={notas}
                onChange={(e) => setNotas(e.target.value)}
                placeholder="Sin cebolla, timbre roto..."
                className="rounded-md border px-3 py-2 text-sm"
                disabled={vista === 'enviando'}
              />
            </div>
          </div>

          <button
            onClick={confirmarPedido}
            disabled={
              vista === 'enviando' ||
              !nombre.trim() ||
              !telefono.trim() ||
              (modalidad === 'delivery' && !direccion.trim())
            }
            className="rounded-md px-4 py-3 text-sm font-semibold text-white disabled:opacity-50"
            style={{ backgroundColor: color }}
          >
            {vista === 'enviando' ? 'Enviando…' : `Confirmar pedido — ${formatARS(totalCarrito)}`}
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50 pb-24">
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
              {cat.productos.map((p) => {
                const cantidadEnCarrito = carrito.get(p.id) ?? 0
                const sePuedePedir = p.tipo !== 'con_variantes'
                return (
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
                      <span className="whitespace-nowrap font-semibold">{formatARS(p.precio)}</span>
                    </div>
                    {!sePuedePedir ? (
                      <span className="text-muted-foreground text-[11px]">Consultar en el local</span>
                    ) : cantidadEnCarrito === 0 ? (
                      <button
                        onClick={() => cambiarCantidad(p.id, 1)}
                        className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full text-white"
                        style={{ backgroundColor: color }}
                        aria-label={`Agregar ${p.nombre}`}
                      >
                        <Plus className="h-4 w-4" />
                      </button>
                    ) : (
                      <div className="flex flex-shrink-0 items-center gap-2">
                        <button
                          onClick={() => cambiarCantidad(p.id, -1)}
                          className="flex h-7 w-7 items-center justify-center rounded-full border"
                        >
                          <Minus className="h-3.5 w-3.5" />
                        </button>
                        <span className="w-4 text-center text-sm font-medium">{cantidadEnCarrito}</span>
                        <button
                          onClick={() => cambiarCantidad(p.id, 1)}
                          className="flex h-7 w-7 items-center justify-center rounded-full text-white"
                          style={{ backgroundColor: color }}
                        >
                          <Plus className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          </div>
        ))}
      </div>

      {cantidadCarrito > 0 && (
        <div className="fixed inset-x-0 bottom-0 border-t bg-white p-3 shadow-lg">
          <div className="mx-auto flex max-w-2xl items-center justify-between gap-3">
            <button
              onClick={() => setCarrito(new Map())}
              className="text-muted-foreground flex h-9 w-9 items-center justify-center rounded-full border"
              aria-label="Vaciar carrito"
            >
              <X className="h-4 w-4" />
            </button>
            <button
              onClick={() => setVista('checkout')}
              className="flex flex-1 items-center justify-center gap-2 rounded-md px-4 py-3 text-sm font-semibold text-white"
              style={{ backgroundColor: color }}
            >
              <ShoppingCart className="h-4 w-4" />
              Ver pedido ({cantidadCarrito}) · {formatARS(totalCarrito)}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
