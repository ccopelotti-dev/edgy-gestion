'use client'

import { useEffect, useMemo, useState } from 'react'
import { Plus, Pencil, Trash2, Percent, Tag, RotateCcw, Store } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { supabase } from '@/lib/supabase'
import { useClienteActual } from '@/hooks/useClienteActual'
import { useProductosStock } from '../data/store'
import { EmptyState, Amount } from '../components/productos/display'
import { ListaPrecioDialog } from '../components/productos/lista-precio-dialogs'
import type { ListaPrecio, Producto, ProductoPrecio } from '../types'

// ─── Page ─────────────────────────────────────────────────────────────────────
//
// Fase 3 del refactor de Productos: catálogo de listas de precio (ej.
// Mostrador/Salón, Delivery, Mayorista/Eventos), cada una con un % de recargo
// por defecto sobre el costo. A la derecha, para la lista seleccionada, se
// ve el precio calculado de cada producto y se puede pisar manualmente.
//
// Fase 6a: arriba se suma "Uso por canal de venta" -- acá se elige qué
// lista de precio usa Comandas/mostrador (guardado en clientes.
// lista_precio_comandas_id). Si no se elige ninguna, Comandas sigue
// usando precioVenta exactamente como antes -- cero riesgo para quien no
// toca esta config.
//
// Fase 6c: se suma un segundo selector para Ventas/Facturación
// (clientes.lista_precio_ventas_id), mismo criterio.
//
// Fase 6d: se suma un tercer selector para Delivery
// (clientes.lista_precio_delivery_id), mismo criterio -- cierra la Fase 6
// del refactor de Productos (Menú QR no genera ventas, así que no aplica).

const inputClass =
  'flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm'

// ─── Uso por canal de venta (Fase 6a / 6c / 6d) ─────────────────────────────────

interface SelectorCanalProps {
  label: string
  listasPrecio: ListaPrecio[]
  valor: string
  guardando: boolean
  onChange: (value: string) => void
}

function SelectorCanal({ label, listasPrecio, valor, guardando, onChange }: SelectorCanalProps) {
  return (
    <div className="grid gap-1.5">
      <label className="text-xs font-medium">{label}</label>
      <select className={inputClass} value={valor} onChange={(e) => onChange(e.target.value)} disabled={guardando}>
        <option value="">Precio de venta (default)</option>
        {listasPrecio.map((l) => (
          <option key={l.id} value={l.id}>
            {l.nombre}
          </option>
        ))}
      </select>
    </div>
  )
}

type CampoCanal = 'lista_precio_comandas_id' | 'lista_precio_ventas_id' | 'lista_precio_delivery_id'

function UsoPorCanal({ listasPrecio }: { listasPrecio: ListaPrecio[] }) {
  const { cliente } = useClienteActual()
  const [listaComandasId, setListaComandasId] = useState('')
  const [listaVentasId, setListaVentasId] = useState('')
  const [listaDeliveryId, setListaDeliveryId] = useState('')
  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    setListaComandasId(cliente?.lista_precio_comandas_id ?? '')
    setListaVentasId(cliente?.lista_precio_ventas_id ?? '')
    setListaDeliveryId(cliente?.lista_precio_delivery_id ?? '')
  }, [cliente?.lista_precio_comandas_id, cliente?.lista_precio_ventas_id, cliente?.lista_precio_delivery_id])

  async function handleChangeCanal(campo: CampoCanal, value: string) {
    if (!cliente?.id) return
    const anteriorComandas = listaComandasId
    const anteriorVentas = listaVentasId
    const anteriorDelivery = listaDeliveryId
    if (campo === 'lista_precio_comandas_id') setListaComandasId(value)
    else if (campo === 'lista_precio_ventas_id') setListaVentasId(value)
    else setListaDeliveryId(value)
    setGuardando(true)
    setError('')
    const { error: errUpdate } = await supabase
      .from('clientes')
      .update({ [campo]: value || null })
      .eq('id', cliente.id)
    setGuardando(false)
    if (errUpdate) {
      setListaComandasId(anteriorComandas)
      setListaVentasId(anteriorVentas)
      setListaDeliveryId(anteriorDelivery)
      setError('No se pudo guardar. Probá de nuevo.')
    }
  }

  return (
    <div className="rounded-lg border bg-card p-4 shadow-sm">
      <div className="flex items-center gap-2">
        <Store className="h-4 w-4 text-muted-foreground" />
        <h2 className="text-sm font-semibold">Uso por canal de venta</h2>
      </div>
      <p className="text-muted-foreground mt-1 text-xs">
        Elegí qué lista de precio usa cada canal. Si dejás "Precio de venta (default)", ese
        canal sigue funcionando exactamente como hasta ahora.
      </p>
      <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3 max-w-2xl">
        <SelectorCanal
          label="Comandas / Mostrador"
          listasPrecio={listasPrecio}
          valor={listaComandasId}
          guardando={guardando}
          onChange={(v) => handleChangeCanal('lista_precio_comandas_id', v)}
        />
        <SelectorCanal
          label="Ventas / Facturación"
          listasPrecio={listasPrecio}
          valor={listaVentasId}
          guardando={guardando}
          onChange={(v) => handleChangeCanal('lista_precio_ventas_id', v)}
        />
        <SelectorCanal
          label="Delivery"
          listasPrecio={listasPrecio}
          valor={listaDeliveryId}
          guardando={guardando}
          onChange={(v) => handleChangeCanal('lista_precio_delivery_id', v)}
        />
      </div>
      {error && <p className="mt-2 text-xs text-red-500">{error}</p>}
    </div>
  )
}

interface FilaPrecioProductoProps {
  producto: Producto
  lista: ListaPrecio
  override?: ProductoPrecio
  onGuardar: (precio: number) => void
  onQuitarOverride: () => void
}

function FilaPrecioProducto({
  producto,
  lista,
  override,
  onGuardar,
  onQuitarOverride,
}: FilaPrecioProductoProps) {
  const calculado = producto.costo * (1 + lista.porcentajeRecargo / 100)
  const [valor, setValor] = useState(String((override?.precio ?? calculado).toFixed(2)))

  useEffect(() => {
    setValor(String((override?.precio ?? calculado).toFixed(2)))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [override?.precio, producto.costo, lista.porcentajeRecargo])

  function handleBlur() {
    const num = parseFloat(valor)
    if (isNaN(num) || num < 0) {
      setValor(String((override?.precio ?? calculado).toFixed(2)))
      return
    }
    // Si escribió el mismo valor que el calculado y no había override, no
    // hace falta crear una fila de más en producto_precios.
    if (!override && Math.abs(num - calculado) < 0.005) return
    if (override && Math.abs(num - override.precio) < 0.005) return
    onGuardar(num)
  }

  return (
    <tr className="border-b last:border-0">
      <td className="px-4 py-2 font-medium">{producto.nombre}</td>
      <td className="px-4 py-2 text-right">
        <Amount value={producto.costo} />
      </td>
      <td className="px-4 py-2 text-right text-muted-foreground text-xs">
        <Amount value={calculado} />
      </td>
      <td className="px-4 py-2 text-right">
        <input
          className="h-8 w-28 rounded-md border border-input bg-background px-2 py-1 text-right text-sm"
          value={valor}
          onChange={(e) => setValor(e.target.value)}
          onBlur={handleBlur}
        />
      </td>
      <td className="px-4 py-2 text-right">
        {override && (
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7 text-muted-foreground"
            onClick={onQuitarOverride}
            title="Restablecer al precio calculado"
          >
            <RotateCcw className="h-3.5 w-3.5" />
          </Button>
        )}
      </td>
    </tr>
  )
}

export default function ListasPrecio() {
  const { state, dispatch } = useProductosStock()

  const [seleccionada, setSeleccionada] = useState<string | null>(null)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editing, setEditing] = useState<ListaPrecio | undefined>()
  const [busqueda, setBusqueda] = useState('')

  const listaActual = useMemo(
    () => state.listasPrecio.find((l) => l.id === seleccionada) ?? null,
    [state.listasPrecio, seleccionada],
  )

  const productosFiltrados = useMemo(() => {
    if (!busqueda.trim()) return state.productos
    const q = busqueda.toLowerCase()
    return state.productos.filter((p) => p.nombre.toLowerCase().includes(q))
  }, [state.productos, busqueda])

  const overridesPorProducto = useMemo(() => {
    const map = new Map<string, ProductoPrecio>()
    if (!listaActual) return map
    for (const pp of state.productosPrecios) {
      if (pp.listaId === listaActual.id) map.set(pp.productoId, pp)
    }
    return map
  }, [state.productosPrecios, listaActual])

  function handleNueva() {
    setEditing(undefined)
    setDialogOpen(true)
  }

  function handleEditar(l: ListaPrecio) {
    setEditing(l)
    setDialogOpen(true)
  }

  function handleGuardar(data: { nombre: string; porcentajeRecargo: number }) {
    if (editing) {
      dispatch({ type: 'UPDATE_LISTA_PRECIO', payload: { ...editing, ...data } })
    } else {
      dispatch({ type: 'ADD_LISTA_PRECIO', payload: data })
    }
  }

  function handleEliminar(l: ListaPrecio) {
    if (
      window.confirm(
        `¿Eliminar la lista "${l.nombre}"? Se van a perder los precios manuales cargados para esta lista.`,
      )
    ) {
      dispatch({ type: 'DELETE_LISTA_PRECIO', payload: l.id })
      if (seleccionada === l.id) setSeleccionada(null)
    }
  }

  return (
    <div className="space-y-6">
      <UsoPorCanal listasPrecio={state.listasPrecio} />

      <div className="grid gap-6 lg:grid-cols-[320px_1fr]">
        {/* Columna: Listas de precio */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold">Listas de precio</h2>
            <Button size="sm" onClick={handleNueva}>
              <Plus className="mr-1 h-4 w-4" />
              Nueva
            </Button>
          </div>

          {state.listasPrecio.length === 0 ? (
            <EmptyState
              icon={Percent}
              title="Sin listas de precio"
              description="Creá listas (ej: Mostrador, Delivery, Mayorista) con un % de recargo sobre el costo."
            >
              <Button variant="outline" size="sm" onClick={handleNueva}>
                Crear primera lista
              </Button>
            </EmptyState>
          ) : (
            <div className="divide-y rounded-lg border bg-card shadow-sm">
              {state.listasPrecio.map((l) => (
                <button
                  key={l.id}
                  type="button"
                  onClick={() => setSeleccionada(l.id)}
                  className={cn(
                    'flex w-full items-center justify-between gap-2 px-4 py-3 text-left text-sm transition-colors hover:bg-muted/50',
                    seleccionada === l.id && 'bg-muted/70',
                  )}
                >
                  <div className="min-w-0">
                    <p className="truncate font-medium">{l.nombre}</p>
                    <p className="text-muted-foreground text-xs">
                      +{l.porcentajeRecargo}% sobre costo
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-1">
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7"
                      onClick={(e) => {
                        e.stopPropagation()
                        handleEditar(l)
                      }}
                      title="Editar"
                    >
                      <Pencil className="h-3.5 w-3.5" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="text-muted-foreground h-7 w-7 hover:text-red-500"
                      onClick={(e) => {
                        e.stopPropagation()
                        handleEliminar(l)
                      }}
                      title="Eliminar"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </button>
              ))}
            </div>
          )}

          <p className="text-muted-foreground text-xs">
            El precio de venta del producto sigue siendo el default -- Comandas, Ventas y Delivery
            ya pueden usar una lista propia (arriba, "Uso por canal").
          </p>
        </div>

        {/* Columna: Precios por producto de la lista seleccionada */}
        <div className="space-y-3">
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-lg font-semibold">
              {listaActual ? `Precios en "${listaActual.nombre}"` : 'Precios por producto'}
            </h2>
            {listaActual && (
              <input
                className={cn(inputClass, 'w-56')}
                placeholder="Buscar producto..."
                value={busqueda}
                onChange={(e) => setBusqueda(e.target.value)}
              />
            )}
          </div>

          {!listaActual ? (
            <EmptyState
              icon={Tag}
              title="Seleccioná una lista"
              description="Elegí una lista de la izquierda para ver y ajustar los precios de cada producto."
            />
          ) : productosFiltrados.length === 0 ? (
            <EmptyState
              icon={Tag}
              title="Sin productos"
              description="No hay productos que coincidan con la búsqueda."
            />
          ) : (
            <div className="rounded-lg border bg-card shadow-sm overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left text-muted-foreground">
                    <th className="px-4 py-3 font-medium">Producto</th>
                    <th className="px-4 py-3 font-medium text-right">Costo</th>
                    <th className="px-4 py-3 font-medium text-right">
                      Calculado (+{listaActual.porcentajeRecargo}%)
                    </th>
                    <th className="px-4 py-3 font-medium text-right">Precio en esta lista</th>
                    <th className="px-4 py-3 font-medium text-right w-10"></th>
                  </tr>
                </thead>
                <tbody>
                  {productosFiltrados.map((p) => (
                    <FilaPrecioProducto
                      key={p.id}
                      producto={p}
                      lista={listaActual}
                      override={overridesPorProducto.get(p.id)}
                      onGuardar={(precio) =>
                        dispatch({
                          type: 'SET_PRECIO_PRODUCTO',
                          payload: { productoId: p.id, listaId: listaActual.id, precio },
                        })
                      }
                      onQuitarOverride={() =>
                        dispatch({
                          type: 'SET_PRECIO_PRODUCTO',
                          payload: { productoId: p.id, listaId: listaActual.id, precio: null },
                        })
                      }
                    />
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {/* Dialog */}
      <ListaPrecioDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        onSave={handleGuardar}
        editData={editing}
      />
    </div>
  )
}
