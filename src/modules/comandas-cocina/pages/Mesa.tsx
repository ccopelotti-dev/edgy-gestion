import { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { ArrowLeft, Minus, Plus, Receipt, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { supabase } from '@/lib/supabase'
import { useClienteActual } from '@/hooks/useClienteActual'
import { useTurnoActivo } from '@/hooks/useTurnoActivo'
import { MEDIO_PAGO_LABEL, type MedioPago } from '@/modules/ventas/types'
import { useComandasCocina, useComandaDeMesa } from '../data/store'
import { formatARS, formatHora, ESTADO_COCINA_LABEL } from '../lib/format'
import { cerrarComandaComoVenta } from '../lib/cerrarComandaVenta'

interface MesaLite {
  id: string
  numero: number
  capacidad: number
}

interface ProductoLite {
  id: string
  nombre: string
  precioVenta: number
}

// Detalle de una mesa: abrir comanda, cargar/editar items, pasar a
// cobro y cerrar. La mesa se resuelve con una consulta directa a
// `mesas` (no via MesasSalonProvider, que vive en otro modulo y no esta
// montado aca) -- mismo criterio cross-modulo que useTurnoActivo.
export default function Mesa() {
  const { mesaId } = useParams<{ mesaId: string }>()
  const navigate = useNavigate()
  const { cliente } = useClienteActual()
  const { turno } = useTurnoActivo()
  const { dispatch } = useComandasCocina()
  const comanda = useComandaDeMesa(mesaId ?? '')

  const [mesa, setMesa] = useState<MesaLite | null>(null)
  const [cargandoMesa, setCargandoMesa] = useState(true)
  const [productos, setProductos] = useState<ProductoLite[]>([])
  const [productoId, setProductoId] = useState('')
  const [cantidadNueva, setCantidadNueva] = useState(1)
  const [nota, setNota] = useState('')
  const [medioPago, setMedioPago] = useState<MedioPago>('efectivo')
  const [cerrando, setCerrando] = useState(false)

  useEffect(() => {
    if (!mesaId) return
    setCargandoMesa(true)
    supabase
      .from('mesas')
      .select('id, numero, capacidad')
      .eq('id', mesaId)
      .maybeSingle()
      .then(({ data }) => {
        setMesa(data ? { id: data.id, numero: data.numero, capacidad: data.capacidad } : null)
        setCargandoMesa(false)
      })
  }, [mesaId])

  // Fase 6a del refactor de Productos: si el cliente configuró una lista
  // de precio para Comandas/mostrador (Productos → Listas de precio →
  // "Uso por canal"), el precio de cada producto se calcula igual que
  // calcularPrecioLista() en productos-stock/data/store.tsx (override
  // manual en producto_precios, si no costo * (1 + %recargo)) -- pero
  // reimplementado acá con consultas directas a Supabase, porque este
  // módulo no está montado dentro de ProductosStockProvider. Si NO hay
  // lista configurada (comportamiento default), el precio sigue siendo
  // precio_venta del producto, exactamente como antes de esta fase.
  useEffect(() => {
    if (!cliente?.id) return
    let activo = true
    const listaId = cliente.lista_precio_comandas_id

    async function cargarProductos() {
      if (!listaId) {
        const { data } = await supabase
          .from('productos')
          .select('id, nombre, precio_venta')
          .eq('cliente_id', cliente!.id)
          .eq('disponible', true)
          .eq('estado', 'activo')
          .order('nombre')
        if (activo) {
          setProductos(
            (data ?? []).map((p: any) => ({
              id: p.id,
              nombre: p.nombre,
              precioVenta: Number(p.precio_venta),
            })),
          )
        }
        return
      }

      const [{ data: productosData }, { data: listaData }, { data: overridesData }] =
        await Promise.all([
          supabase
            .from('productos')
            .select('id, nombre, precio_venta, costo')
            .eq('cliente_id', cliente!.id)
            .eq('disponible', true)
            .eq('estado', 'activo')
            .order('nombre'),
          supabase.from('listas_precio').select('porcentaje_recargo').eq('id', listaId).maybeSingle(),
          supabase.from('producto_precios').select('producto_id, precio').eq('lista_id', listaId),
        ])

      if (!activo) return

      const porcentaje = listaData ? Number(listaData.porcentaje_recargo) : 0
      const overridesPorProducto = new Map<string, number>()
      for (const o of overridesData ?? []) {
        overridesPorProducto.set(o.producto_id, Number(o.precio))
      }

      setProductos(
        (productosData ?? []).map((p: any) => {
          const override = overridesPorProducto.get(p.id)
          const calculado = Number(p.costo) * (1 + porcentaje / 100)
          return { id: p.id, nombre: p.nombre, precioVenta: override ?? calculado }
        }),
      )
    }

    cargarProductos()
    return () => {
      activo = false
    }
  }, [cliente?.id, cliente?.lista_precio_comandas_id])

  const productoSeleccionado = productos.find((p) => p.id === productoId)

  function abrirComanda() {
    if (!mesaId || !turno) return
    dispatch({ type: 'ABRIR_COMANDA', payload: { mesaId, turnoId: turno.id } })
  }

  function agregarItem() {
    if (!comanda || !productoSeleccionado || cantidadNueva <= 0) return
    dispatch({
      type: 'AGREGAR_ITEM',
      payload: {
        comandaId: comanda.id,
        productoId: productoSeleccionado.id,
        descripcion: productoSeleccionado.nombre,
        cantidad: cantidadNueva,
        precioUnitario: productoSeleccionado.precioVenta,
        nota: nota || undefined,
      },
    })
    setProductoId('')
    setCantidadNueva(1)
    setNota('')
  }

  function cambiarCantidad(itemId: string, cantidadActual: number, delta: number) {
    if (!comanda) return
    const nueva = cantidadActual + delta
    if (nueva <= 0) {
      dispatch({ type: 'QUITAR_ITEM', payload: { comandaId: comanda.id, itemId } })
    } else {
      dispatch({ type: 'ACTUALIZAR_CANTIDAD_ITEM', payload: { comandaId: comanda.id, itemId, cantidad: nueva } })
    }
  }

  function quitarItem(itemId: string) {
    if (!comanda) return
    dispatch({ type: 'QUITAR_ITEM', payload: { comandaId: comanda.id, itemId } })
  }

  function pasarACobro() {
    if (!comanda) return
    dispatch({ type: 'PASAR_A_COBRO', payload: { comandaId: comanda.id } })
  }

  async function cerrarComanda() {
    if (!comanda || !cliente?.id) return
    setCerrando(true)
    // Antes de cerrar la comanda acá, se genera el Comprobante real en
    // Ventas y se refleja el cobro en Tesorería (Tarea F) — recién con
    // ese comprobanteId resuelto se despacha CERRAR_COMANDA, mismo
    // criterio que Ventas/Compras resolviendo `numero` antes de llegar
    // al reducer.
    const comprobanteId = await cerrarComandaComoVenta(comanda, cliente.id, medioPago)
    if (!comprobanteId) {
      window.alert('No se pudo generar el comprobante de venta. Revisá la consola e intentá de nuevo.')
      setCerrando(false)
      return
    }
    dispatch({ type: 'CERRAR_COMANDA', payload: { comandaId: comanda.id, comprobanteId } })
    navigate('/m/mesas-salon')
  }

  function cancelarComanda() {
    if (!comanda) return
    if (!window.confirm('¿Cancelar esta comanda? Se perderán los ítems cargados.')) return
    dispatch({ type: 'CANCELAR_COMANDA', payload: { comandaId: comanda.id } })
    navigate('/m/mesas-salon')
  }

  if (cargandoMesa) {
    return <div className="text-muted-foreground py-12 text-center text-sm">Cargando mesa…</div>
  }

  if (!mesa) {
    return (
      <div className="flex flex-col items-center gap-3 py-12 text-center">
        <p className="text-muted-foreground">No se encontró la mesa.</p>
        <Button variant="outline" onClick={() => navigate('/m/mesas-salon')}>
          <ArrowLeft className="mr-1.5 h-4 w-4" />
          Volver al salón
        </Button>
      </div>
    )
  }

  const columnas = comanda?.estado === 'abierta' ? 6 : 5

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-start justify-between">
        <div>
          <Button variant="ghost" size="sm" onClick={() => navigate('/m/mesas-salon')} className="mb-1 -ml-2">
            <ArrowLeft className="mr-1.5 h-4 w-4" />
            Salón
          </Button>
          <h1 className="text-2xl font-bold tracking-tight">Mesa {mesa.numero}</h1>
          <p className="text-muted-foreground text-sm">{mesa.capacidad} sillas</p>
        </div>
        {comanda && (
          <div className="text-right">
            <span className="rounded-full bg-gray-100 px-3 py-1 text-xs font-medium">
              {comanda.estado === 'abierta' ? 'Comanda abierta' : 'En cobro'}
            </span>
            <p className="text-muted-foreground mt-1 text-xs">Desde {formatHora(comanda.fechaApertura)}</p>
          </div>
        )}
      </div>

      {!turno ? (
        <Card className="border-amber-300 bg-amber-50">
          <CardContent className="py-4 text-sm text-amber-900">
            Debe abrir un turno de caja para tomar comandas.
          </CardContent>
        </Card>
      ) : !comanda ? (
        <Card className="max-w-sm">
          <CardContent className="flex flex-col gap-3 py-6">
            <h2 className="font-semibold">Mesa libre</h2>
            <p className="text-muted-foreground text-sm">Abrí una comanda para empezar a cargar el pedido.</p>
            <Button onClick={abrirComanda}>Abrir comanda</Button>
          </CardContent>
        </Card>
      ) : (
        <div className="flex flex-col gap-6">
          {comanda.estado === 'abierta' && (
            <Card>
              <CardContent className="flex flex-col gap-3 py-4">
                <h3 className="font-medium">Agregar ítem</h3>
                <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
                  <div className="flex flex-1 flex-col gap-1.5">
                    <Label htmlFor="producto">Producto</Label>
                    <Select value={productoId} onValueChange={setProductoId}>
                      <SelectTrigger id="producto">
                        <SelectValue placeholder="Elegir producto" />
                      </SelectTrigger>
                      <SelectContent>
                        {productos.map((p) => (
                          <SelectItem key={p.id} value={p.id}>
                            {p.nombre} · {formatARS(p.precioVenta)}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <Label htmlFor="cantidad-nueva">Cant.</Label>
                    <Input
                      id="cantidad-nueva"
                      type="number"
                      min={1}
                      value={cantidadNueva}
                      onChange={(e) => setCantidadNueva(Number(e.target.value) || 1)}
                      className="w-20"
                    />
                  </div>
                  <div className="flex flex-1 flex-col gap-1.5">
                    <Label htmlFor="nota">Nota (opcional)</Label>
                    <Input
                      id="nota"
                      value={nota}
                      onChange={(e) => setNota(e.target.value)}
                      placeholder="sin sal, para llevar..."
                    />
                  </div>
                  <Button onClick={agregarItem} disabled={!productoSeleccionado}>
                    <Plus className="mr-1.5 h-4 w-4" />
                    Agregar
                  </Button>
                </div>
              </CardContent>
            </Card>
          )}

          <div className="overflow-x-auto rounded-md border">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-left text-muted-foreground">
                <tr>
                  <th className="px-3 py-2">Ítem</th>
                  <th className="px-3 py-2">Estado cocina</th>
                  <th className="px-3 py-2 text-right">Cant.</th>
                  <th className="px-3 py-2 text-right">Precio</th>
                  <th className="px-3 py-2 text-right">Subtotal</th>
                  {comanda.estado === 'abierta' && <th className="px-3 py-2" />}
                </tr>
              </thead>
              <tbody>
                {comanda.items.length === 0 ? (
                  <tr>
                    <td colSpan={columnas} className="text-muted-foreground px-3 py-6 text-center">
                      Todavía no hay ítems cargados.
                    </td>
                  </tr>
                ) : (
                  comanda.items.map((item) => (
                    <tr key={item.id} className="border-t">
                      <td className="px-3 py-2">
                        <div className="font-medium">{item.descripcion}</div>
                        {item.nota && <div className="text-muted-foreground text-xs">{item.nota}</div>}
                      </td>
                      <td className="px-3 py-2 text-xs">{ESTADO_COCINA_LABEL[item.estadoCocina]}</td>
                      <td className="px-3 py-2 text-right">
                        {comanda.estado === 'abierta' ? (
                          <div className="flex items-center justify-end gap-1">
                            <Button
                              size="icon"
                              variant="ghost"
                              className="h-6 w-6"
                              onClick={() => cambiarCantidad(item.id, item.cantidad, -1)}
                            >
                              <Minus className="h-3 w-3" />
                            </Button>
                            <span className="w-6 text-center">{item.cantidad}</span>
                            <Button
                              size="icon"
                              variant="ghost"
                              className="h-6 w-6"
                              onClick={() => cambiarCantidad(item.id, item.cantidad, 1)}
                            >
                              <Plus className="h-3 w-3" />
                            </Button>
                          </div>
                        ) : (
                          item.cantidad
                        )}
                      </td>
                      <td className="px-3 py-2 text-right">{formatARS(item.precioUnitario)}</td>
                      <td className="px-3 py-2 text-right font-medium">{formatARS(item.subtotal)}</td>
                      {comanda.estado === 'abierta' && (
                        <td className="px-3 py-2 text-right">
                          <Button
                            size="icon"
                            variant="ghost"
                            className="h-6 w-6 text-red-600"
                            onClick={() => quitarItem(item.id)}
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </td>
                      )}
                    </tr>
                  ))
                )}
              </tbody>
              <tfoot>
                <tr className="border-t bg-gray-50 font-semibold">
                  <td className="px-3 py-2" colSpan={4}>
                    Total
                  </td>
                  <td className="px-3 py-2 text-right">{formatARS(comanda.total)}</td>
                  {comanda.estado === 'abierta' && <td />}
                </tr>
              </tfoot>
            </table>
          </div>

          {comanda.estado === 'abierta' ? (
            <div className="flex flex-wrap gap-2">
              <Button onClick={pasarACobro} disabled={comanda.items.length === 0}>
                <Receipt className="mr-1.5 h-4 w-4" />
                Pasar a cobro
              </Button>
              <Button variant="outline" className="text-red-600" onClick={cancelarComanda}>
                Cancelar comanda
              </Button>
            </div>
          ) : (
            <Card className="max-w-sm">
              <CardContent className="flex flex-col gap-3 py-4">
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="medio-pago">Medio de pago</Label>
                  <Select value={medioPago} onValueChange={(v) => setMedioPago(v as MedioPago)}>
                    <SelectTrigger id="medio-pago">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {(Object.keys(MEDIO_PAGO_LABEL) as MedioPago[])
                        .filter((mp) => mp !== 'cuenta_corriente')
                        .map((mp) => (
                          <SelectItem key={mp} value={mp}>
                            {MEDIO_PAGO_LABEL[mp]}
                          </SelectItem>
                        ))}
                    </SelectContent>
                  </Select>
                </div>
                <Button onClick={cerrarComanda} disabled={cerrando}>
                  {cerrando ? 'Generando comprobante…' : `Cobrar ${formatARS(comanda.total)} y cerrar`}
                </Button>
              </CardContent>
            </Card>
          )}
        </div>
      )}
    </div>
  )
}
