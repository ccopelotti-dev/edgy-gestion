import { useEffect, useMemo, useState } from 'react'
import { useParams, useSearchParams } from 'react-router-dom'
import { ShoppingCart, Plus, Minus, X, CheckCircle2, ArrowLeft, BellRing } from 'lucide-react'
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
//
// Fase 13c (Mejoras de Salón): si la URL trae `?mesa=<numero>` (QR
// impreso por mesa, ver menu-qr/pages/Index.tsx), aparece un botón
// flotante "Llamar mozo" que dispara el RPC público
// `crear_llamado_mozo_publico` -- mismo mecanismo security definer que
// crear_orden_venta_publica, resuelve cliente_id y mesa_id del lado
// del servidor a partir de slug + número de mesa. Sin ese parámetro
// (QR genérico del local, sin mesa asociada) el botón no se muestra.
//
// Fase 12 (Cobro online): si el negocio tiene Mercado Pago habilitado
// (menu_publico() ya trae `pagoOnlineHabilitado`), la pantalla de
// éxito ofrece además "Pagar online ahora" -- llama a la Netlify
// Function pública crear-preferencia-pago.js (crea la Preference de
// Checkout Pro para la orden recién creada) y redirige al comprador al
// checkout de Mercado Pago. Vuelve acá con `?pago=exito|pendiente|
// error` (back_urls de la Preference), lo que dispara una de las tres
// pantallas de retorno nuevas (ver tipo Vista).

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

// Fase 19.3 (Combos en Menú público): un Combo no tiene stock propio ni
// rubro -- se muestra en una sección aparte, siempre primero, con
// título personalizable (combosTituloSeccion, ver Configuración >
// Empresa). No tiene variantes, así que siempre es pedible mientras el
// local esté abierto.
interface ComboPublico {
  id: string
  nombre: string
  descripcion: string | null
  precio: number
  imagen: string | null
  etiqueta?: string | null
}

interface MenuPublicoData {
  cliente: {
    nombre: string
    slug: string
    logoUrl: string | null
    colorMarca: string | null
    // Fase 12 (Cobro online): si el negocio tiene Mercado Pago
    // configurado y habilitado (clientes_pago_config), se ofrece
    // "Pagar online" después de confirmar el pedido -- ver
    // netlify/functions/crear-preferencia-pago.js.
    pagoOnlineHabilitado?: boolean
    // Fase 16 (Backlog menor): horario de atención opcional. Si
    // horarioActivo es false (default), el Catálogo acepta pedidos las
    // 24 hs como siempre. horarioDias usa la convención de
    // Date.getDay(): 0 = domingo … 6 = sábado.
    horarioActivo?: boolean
    horarioApertura?: string | null
    horarioCierre?: string | null
    horarioDias?: number[]
    // Fase 19.3: título personalizable de la sección de Combos.
    combosTituloSeccion?: string
  } | null
  categorias: CategoriaPublica[]
  combos: ComboPublico[]
}

type Vista = 'menu' | 'checkout' | 'enviando' | 'exito' | 'error' | 'pago-exito' | 'pago-pendiente' | 'pago-error'
type Modalidad = 'retiro' | 'delivery'

function formatARS(monto: number): string {
  return new Intl.NumberFormat('es-AR', {
    style: 'currency',
    currency: 'ARS',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(monto)
}

// Fase 16: horario de atención opcional del Catálogo público. Mismo
// criterio de días que Date.getDay(): 0 = domingo … 6 = sábado.
const DIA_LABELS = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb']

function estaAbiertoAhora(cliente: MenuPublicoData['cliente']): boolean {
  if (!cliente?.horarioActivo || !cliente.horarioApertura || !cliente.horarioCierre) return true

  const dias = cliente.horarioDias && cliente.horarioDias.length > 0 ? cliente.horarioDias : [0, 1, 2, 3, 4, 5, 6]
  const ahora = new Date()
  if (!dias.includes(ahora.getDay())) return false

  const [hA, mA] = cliente.horarioApertura.slice(0, 5).split(':').map(Number)
  const [hC, mC] = cliente.horarioCierre.slice(0, 5).split(':').map(Number)
  const minutosApertura = hA * 60 + mA
  const minutosCierre = hC * 60 + mC
  const minutosAhora = ahora.getHours() * 60 + ahora.getMinutes()

  if (minutosApertura <= minutosCierre) {
    return minutosAhora >= minutosApertura && minutosAhora <= minutosCierre
  }
  // Horario que cruza medianoche (ej. 20:00 a 02:00).
  return minutosAhora >= minutosApertura || minutosAhora <= minutosCierre
}

function textoHorario(cliente: MenuPublicoData['cliente']): string {
  if (!cliente?.horarioApertura || !cliente.horarioCierre) return ''
  const dias = cliente.horarioDias && cliente.horarioDias.length > 0 ? cliente.horarioDias : [0, 1, 2, 3, 4, 5, 6]
  const diasTexto = [1, 2, 3, 4, 5, 6, 0]
    .filter((d) => dias.includes(d))
    .map((d) => DIA_LABELS[d])
    .join(', ')
  return `${diasTexto} de ${cliente.horarioApertura.slice(0, 5)} a ${cliente.horarioCierre.slice(0, 5)}`
}

export default function MenuPublico() {
  const { slug } = useParams<{ slug: string }>()
  const [searchParams] = useSearchParams()
  const numeroMesa = (() => {
    const raw = searchParams.get('mesa')
    const n = raw ? Number(raw) : NaN
    return Number.isFinite(n) && n > 0 ? n : null
  })()
  const [data, setData] = useState<MenuPublicoData | null>(null)
  const [cargando, setCargando] = useState(true)
  const [carrito, setCarrito] = useState<Map<string, number>>(new Map())
  // Fase 12: si volvemos de Mercado Pago (?pago=exito|pendiente|error),
  // arrancamos directo en la pantalla de retorno correspondiente.
  const [vista, setVista] = useState<Vista>(() => {
    const p = searchParams.get('pago')
    if (p === 'exito') return 'pago-exito'
    if (p === 'pendiente') return 'pago-pendiente'
    if (p === 'error') return 'pago-error'
    return 'menu'
  })
  const [nombre, setNombre] = useState('')
  const [telefono, setTelefono] = useState('')
  const [modalidad, setModalidad] = useState<Modalidad>('retiro')
  const [direccion, setDireccion] = useState('')
  const [notas, setNotas] = useState('')
  const [errorMsg, setErrorMsg] = useState('')

  // Fase 12: id de la orden recién creada -- lo necesita "Pagar online
  // ahora" para pedirle a crear-preferencia-pago.js que arme el
  // checkout de esa orden puntual.
  const [ordenIdCreada, setOrdenIdCreada] = useState<string | null>(null)
  const [pagandoOnline, setPagandoOnline] = useState(false)
  const [errorPago, setErrorPago] = useState('')

  // Fase 13c: "Llamar mozo" -- solo disponible si el QR escaneado es de
  // una mesa específica (?mesa=<numero>).
  const [llamandoMozo, setLlamandoMozo] = useState(false)
  const [avisoMozoEnviado, setAvisoMozoEnviado] = useState(false)

  async function llamarMozo() {
    if (!slug || !numeroMesa) return
    setLlamandoMozo(true)
    const { error } = await supabase.rpc('crear_llamado_mozo_publico', {
      p_slug: slug,
      p_numero_mesa: numeroMesa,
      p_motivo: null,
    })
    setLlamandoMozo(false)
    if (!error) {
      setAvisoMozoEnviado(true)
      setTimeout(() => setAvisoMozoEnviado(false), 4000)
    }
  }

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

  // Fase 16: si el negocio configuró horario de atención y estamos
  // fuera de él, se bloquea el agregado al carrito (ver sePuedePedir
  // más abajo) -- el servidor (crear_orden_venta_publica) hace la
  // misma validación como defensa en profundidad.
  const estaAbierto = useMemo(() => estaAbiertoAhora(data?.cliente ?? null), [data])

  const productosPorId = useMemo(() => {
    const map = new Map<string, ProductoPublico>()
    for (const cat of data?.categorias ?? []) {
      for (const p of cat.productos) map.set(p.id, p)
    }
    return map
  }, [data])

  const combosPorId = useMemo(() => {
    const map = new Map<string, ComboPublico>()
    for (const c of data?.combos ?? []) map.set(c.id, c)
    return map
  }, [data])

  // Fase 19.3: el carrito sigue siendo un Map<string, number>, pero la
  // clave ahora puede ser un id de producto (tal cual) o un id de combo
  // prefijado como `combo:<id>` -- mismo criterio que Mesa.tsx en
  // Comandas (Fase 19.2), para no duplicar el estado del carrito en dos
  // estructuras separadas.
  interface ItemCarrito {
    key: string
    nombre: string
    precio: number
    cantidad: number
    productoId?: string
    comboId?: string
  }

  const itemsCarrito = useMemo(() => {
    const result: ItemCarrito[] = []
    for (const [key, cantidad] of carrito.entries()) {
      if (cantidad <= 0) continue
      if (key.startsWith('combo:')) {
        const comboId = key.slice('combo:'.length)
        const combo = combosPorId.get(comboId)
        if (!combo) continue
        result.push({
          key,
          nombre: combo.etiqueta ? `${combo.nombre} (${combo.etiqueta})` : combo.nombre,
          precio: combo.precio,
          cantidad,
          comboId,
        })
      } else {
        const producto = productosPorId.get(key)
        if (!producto) continue
        result.push({ key, nombre: producto.nombre, precio: producto.precio, cantidad, productoId: key })
      }
    }
    return result
  }, [carrito, productosPorId, combosPorId])

  const totalCarrito = itemsCarrito.reduce((sum, i) => sum + i.precio * i.cantidad, 0)
  const cantidadCarrito = itemsCarrito.reduce((sum, i) => sum + i.cantidad, 0)

  function cambiarCantidad(key: string, delta: number) {
    setCarrito((prev) => {
      const next = new Map(prev)
      const actual = next.get(key) ?? 0
      const nueva = actual + delta
      if (nueva <= 0) next.delete(key)
      else next.set(key, nueva)
      return next
    })
  }

  async function confirmarPedido() {
    if (!slug || itemsCarrito.length === 0) return
    if (!nombre.trim() || !telefono.trim()) return
    if (modalidad === 'delivery' && !direccion.trim()) return
    if (!estaAbierto) {
      setErrorMsg('El local está cerrado en este momento. Volvé a intentar dentro del horario de atención.')
      setVista('error')
      return
    }

    setVista('enviando')
    setErrorMsg('')

    const { data: resultado, error } = await supabase.rpc('crear_orden_venta_publica', {
      p_slug: slug,
      p_cliente_nombre: nombre.trim(),
      p_telefono: telefono.trim(),
      p_canal_cumplimiento: modalidad,
      p_direccion: modalidad === 'retiro' ? 'Retiro en el local' : direccion.trim(),
      p_notas: notas.trim() || null,
      p_items: itemsCarrito.map((i) =>
        i.comboId ? { comboId: i.comboId, cantidad: i.cantidad } : { productoId: i.productoId, cantidad: i.cantidad },
      ),
    })

    if (error) {
      console.error('Catálogo público · error creando el pedido:', error)
      setErrorMsg(error.message || 'No se pudo enviar el pedido. Probá de nuevo.')
      setVista('error')
      return
    }

    // Fase 12: guardamos el id de la orden por si el negocio tiene
    // cobro online habilitado y el comensal elige "Pagar online ahora"
    // en la pantalla de éxito.
    const idOrden = (resultado as { id?: string } | null)?.id ?? null
    setOrdenIdCreada(idOrden)
    setVista('exito')
  }

  async function pagarOnline() {
    if (!slug || !ordenIdCreada) return
    setPagandoOnline(true)
    setErrorPago('')
    try {
      const res = await fetch('/.netlify/functions/crear-preferencia-pago', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ slug, ordenId: ordenIdCreada }),
      })
      const resultado = await res.json()
      if (!res.ok || !resultado.ok) {
        setErrorPago(resultado.error || 'No se pudo iniciar el pago online.')
        setPagandoOnline(false)
        return
      }
      window.location.href = resultado.initPoint
    } catch (err) {
      console.error('Catálogo público · error iniciando el pago online:', err)
      setErrorPago('No se pudo iniciar el pago online. Probá de nuevo.')
      setPagandoOnline(false)
    }
  }

  function hacerOtroPedido() {
    setCarrito(new Map())
    setNombre('')
    setTelefono('')
    setModalidad('retiro')
    setDireccion('')
    setNotas('')
    setErrorMsg('')
    setOrdenIdCreada(null)
    setErrorPago('')
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

  const { cliente, categorias, combos } = data
  const color = cliente.colorMarca ?? '#111827'

  if (vista === 'exito') {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-3 px-4 text-center">
        <CheckCircle2 className="h-12 w-12" style={{ color }} />
        <h1 className="text-xl font-semibold">¡Pedido recibido!</h1>
        <p className="text-muted-foreground max-w-sm text-sm">
          {cliente.nombre} se va a contactar al {telefono} para coordinar la entrega.
        </p>

        {/* Fase 12: solo si el negocio tiene Mercado Pago habilitado --
            pagar al recibir sigue siendo la opción por defecto. */}
        {cliente.pagoOnlineHabilitado && ordenIdCreada && (
          <div className="mt-2 flex flex-col items-center gap-2">
            <button
              onClick={pagarOnline}
              disabled={pagandoOnline}
              className="rounded-md border-2 px-4 py-2 text-sm font-semibold disabled:opacity-60"
              style={{ borderColor: color, color }}
            >
              {pagandoOnline ? 'Redirigiendo…' : 'Pagar online ahora'}
            </button>
            {errorPago && <p className="text-xs text-red-600">{errorPago}</p>}
          </div>
        )}

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

  // Fase 12: pantallas de retorno de Mercado Pago (back_urls de la
  // Preference, ver crear-preferencia-pago.js). El estado real y
  // definitivo del pago lo termina de confirmar el webhook (mp-
  // webhook.js) -- estas pantallas son solo feedback inmediato al
  // comprador, no la fuente de verdad.
  if (vista === 'pago-exito') {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-3 px-4 text-center">
        <CheckCircle2 className="h-12 w-12" style={{ color }} />
        <h1 className="text-xl font-semibold">¡Pago acreditado!</h1>
        <p className="text-muted-foreground max-w-sm text-sm">
          Tu pedido en {cliente.nombre} ya está pagado y confirmado.
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

  if (vista === 'pago-pendiente') {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-3 px-4 text-center">
        <CheckCircle2 className="h-12 w-12" style={{ color }} />
        <h1 className="text-xl font-semibold">Pago en proceso</h1>
        <p className="text-muted-foreground max-w-sm text-sm">
          Tu pago todavía se está procesando. En cuanto se acredite, {cliente.nombre} confirma tu
          pedido.
        </p>
        <button
          onClick={hacerOtroPedido}
          className="mt-2 rounded-md px-4 py-2 text-sm font-medium text-white"
          style={{ backgroundColor: color }}
        >
          Volver al menú
        </button>
      </div>
    )
  }

  if (vista === 'pago-error') {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-3 px-4 text-center">
        <X className="h-12 w-12 text-red-500" />
        <h1 className="text-xl font-semibold">El pago no se pudo procesar</h1>
        <p className="text-muted-foreground max-w-sm text-sm">
          Podés reintentarlo o coordinar el pago directamente con {cliente.nombre} al recibir el
          pedido.
        </p>
        <button
          onClick={hacerOtroPedido}
          className="mt-2 rounded-md px-4 py-2 text-sm font-medium text-white"
          style={{ backgroundColor: color }}
        >
          Volver al menú
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
              <div key={i.key} className="flex items-center justify-between text-sm">
                <span>
                  {i.cantidad} × {i.nombre}
                </span>
                <span>{formatARS(i.precio * i.cantidad)}</span>
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
      {/* Fase 13c: solo aparece si el QR era de una mesa específica. */}
      {numeroMesa && (
        <button
          onClick={llamarMozo}
          disabled={llamandoMozo || avisoMozoEnviado}
          className="fixed right-3 top-3 z-20 flex items-center gap-1.5 rounded-full bg-white px-3 py-2 text-xs font-semibold shadow-md disabled:opacity-70"
          style={{ color }}
        >
          <BellRing className="h-3.5 w-3.5" />
          {avisoMozoEnviado ? 'Aviso enviado' : llamandoMozo ? 'Enviando…' : 'Llamar mozo'}
        </button>
      )}

      <div className="flex flex-col items-center gap-3 px-4 pb-8 pt-10 text-center text-white" style={{ backgroundColor: color }}>
        {cliente.logoUrl && (
          <img src={cliente.logoUrl} alt={cliente.nombre} className="h-16 w-16 rounded-full border-2 border-white object-cover" />
        )}
        <h1 className="text-2xl font-bold">{cliente.nombre}</h1>
        <p className="text-sm text-white/80">Menú</p>
      </div>

      <div className="mx-auto flex max-w-2xl flex-col gap-8 px-4 pt-8">
        {!estaAbierto && (
          <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-center text-sm text-amber-800">
            <p className="font-semibold">Cerrado ahora</p>
            {textoHorario(cliente) && <p className="text-xs">Horario de atención: {textoHorario(cliente)}</p>}
          </div>
        )}

        {categorias.length === 0 && combos.length === 0 && (
          <p className="text-muted-foreground text-center text-sm">
            Todavía no hay productos publicados en este menú.
          </p>
        )}

        {combos.length > 0 && (
          <div className="flex flex-col gap-3">
            <h2 className="text-lg font-semibold" style={{ color }}>
              {cliente.combosTituloSeccion || 'Combos'}
            </h2>
            <div className="flex flex-col gap-3">
              {combos.map((c) => {
                const key = `combo:${c.id}`
                const cantidadEnCarrito = carrito.get(key) ?? 0
                return (
                  <div key={c.id} className="flex items-center gap-3 rounded-lg border bg-white p-3">
                    {c.imagen ? (
                      <img src={c.imagen} alt={c.nombre} className="h-16 w-16 flex-shrink-0 rounded-md object-cover" />
                    ) : (
                      <div className="h-16 w-16 flex-shrink-0 rounded-md bg-gray-100" />
                    )}
                    <div className="flex flex-1 flex-col gap-0.5">
                      <div className="flex items-center gap-1.5">
                        <span className="font-medium">{c.nombre}</span>
                        {c.etiqueta && (
                          <span
                            className="rounded-full px-1.5 py-0.5 text-[10px] font-semibold text-white"
                            style={{ backgroundColor: color }}
                          >
                            {c.etiqueta}
                          </span>
                        )}
                      </div>
                      {c.descripcion && <span className="text-muted-foreground text-xs">{c.descripcion}</span>}
                      <span className="whitespace-nowrap font-semibold">{formatARS(c.precio)}</span>
                    </div>
                    {!estaAbierto ? (
                      <span className="text-muted-foreground text-[11px]">Cerrado</span>
                    ) : cantidadEnCarrito === 0 ? (
                      <button
                        onClick={() => cambiarCantidad(key, 1)}
                        className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full text-white"
                        style={{ backgroundColor: color }}
                        aria-label={`Agregar ${c.nombre}`}
                      >
                        <Plus className="h-4 w-4" />
                      </button>
                    ) : (
                      <div className="flex flex-shrink-0 items-center gap-2">
                        <button
                          onClick={() => cambiarCantidad(key, -1)}
                          className="flex h-7 w-7 items-center justify-center rounded-full border"
                        >
                          <Minus className="h-3.5 w-3.5" />
                        </button>
                        <span className="w-4 text-center text-sm font-medium">{cantidadEnCarrito}</span>
                        <button
                          onClick={() => cambiarCantidad(key, 1)}
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
        )}

        {categorias.map((cat) => (
          <div key={cat.id} className="flex flex-col gap-3">
            <h2 className="text-lg font-semibold" style={{ color }}>
              {cat.nombre}
            </h2>
            <div className="flex flex-col gap-3">
              {cat.productos.map((p) => {
                const cantidadEnCarrito = carrito.get(p.id) ?? 0
                const sePuedePedir = p.tipo !== 'con_variantes' && estaAbierto
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
                      <span className="text-muted-foreground text-[11px]">
                        {!estaAbierto ? 'Cerrado' : 'Consultar en el local'}
                      </span>
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
