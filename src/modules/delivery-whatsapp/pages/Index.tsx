import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Plus, Trash2 } from 'lucide-react'
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
import { usePedidosDelivery, useDeliveryWhatsapp } from '../data/store'
import { formatARS, formatFecha } from '../lib/format'
import { ESTADO_PEDIDO_DELIVERY_LABEL } from '../types'
import type { ItemPedidoDelivery } from '../types'

interface ClienteVentaLite {
  id: string
  nombre: string
}

const ITEM_VACIO: ItemPedidoDelivery = { descripcion: '', cantidad: 1, precioUnitario: 0 }

// Listado de pedidos + alta inline con el registro manual del
// pedido recibido por WhatsApp -- mismo criterio de "sin página
// separada" que el resto del pack gastronómico. El cliente es
// opcional: si no está registrado en Ventas alcanza con nombre y
// dirección sueltos.
export default function Index() {
  const { cliente } = useClienteActual()
  const { dispatch } = useDeliveryWhatsapp()
  const pedidos = usePedidosDelivery()

  const [clientesVenta, setClientesVenta] = useState<ClienteVentaLite[]>([])
  const [mostrarForm, setMostrarForm] = useState(false)
  const [clienteVentaId, setClienteVentaId] = useState('')
  const [clienteNombre, setClienteNombre] = useState('')
  const [telefono, setTelefono] = useState('')
  const [direccion, setDireccion] = useState('')
  const [notas, setNotas] = useState('')
  const [items, setItems] = useState<ItemPedidoDelivery[]>([{ ...ITEM_VACIO }])

  useEffect(() => {
    if (!cliente?.id) return
    supabase
      .from('clientes_venta')
      .select('id, nombre')
      .eq('cliente_id', cliente.id)
      .eq('activo', true)
      .order('nombre')
      .then(({ data }) => setClientesVenta(data ?? []))
  }, [cliente?.id])

  const total = items.reduce((sum, i) => sum + i.cantidad * i.precioUnitario, 0)

  function actualizarItem(idx: number, campo: keyof ItemPedidoDelivery, valor: string | number) {
    setItems((prev) => prev.map((it, i) => (i === idx ? { ...it, [campo]: valor } : it)))
  }

  function agregarItem() {
    setItems((prev) => [...prev, { ...ITEM_VACIO }])
  }

  function quitarItem(idx: number) {
    setItems((prev) => prev.filter((_, i) => i !== idx))
  }

  function limpiarForm() {
    setMostrarForm(false)
    setClienteVentaId('')
    setClienteNombre('')
    setTelefono('')
    setDireccion('')
    setNotas('')
    setItems([{ ...ITEM_VACIO }])
  }

  function crearPedido() {
    const itemsValidos = items.filter((i) => i.descripcion.trim() && i.cantidad > 0)
    if (!clienteNombre.trim() || !direccion.trim() || itemsValidos.length === 0) return

    const clienteVenta = clientesVenta.find((c) => c.id === clienteVentaId)

    dispatch({
      type: 'CREAR_PEDIDO',
      payload: {
        clienteVentaId: clienteVenta?.id,
        clienteVentaNombre: clienteVenta?.nombre,
        clienteNombre: clienteNombre.trim(),
        telefono: telefono.trim() || undefined,
        direccion: direccion.trim(),
        items: itemsValidos,
        notas: notas.trim() || undefined,
      },
    })
    limpiarForm()
  }

  const pedidosOrdenados = [...pedidos].sort((a, b) => b.createdAt.localeCompare(a.createdAt))
  const activos = pedidosOrdenados.filter((p) => p.estado === 'pendiente' || p.estado === 'en_camino')
  const finalizados = pedidosOrdenados.filter((p) => p.estado === 'entregado' || p.estado === 'cancelado')

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Delivery por WhatsApp</h1>
          <p className="text-muted-foreground text-sm">
            Cargá acá los pedidos que te llegan por WhatsApp para hacer el seguimiento de entrega y
            que se reflejen en Ventas y Tesorería.
          </p>
        </div>
        <Button onClick={() => setMostrarForm((v) => !v)}>
          <Plus className="mr-1.5 h-4 w-4" />
          Nuevo pedido
        </Button>
      </div>

      {mostrarForm && (
        <Card>
          <CardContent className="flex flex-col gap-4 py-4">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="cliente-venta">Cliente registrado (opcional)</Label>
                <Select
                  value={clienteVentaId}
                  onValueChange={(v) => {
                    setClienteVentaId(v)
                    const c = clientesVenta.find((cv) => cv.id === v)
                    if (c) setClienteNombre(c.nombre)
                  }}
                >
                  <SelectTrigger id="cliente-venta">
                    <SelectValue placeholder="Sin cliente registrado" />
                  </SelectTrigger>
                  <SelectContent>
                    {clientesVenta.map((c) => (
                      <SelectItem key={c.id} value={c.id}>
                        {c.nombre}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="cliente-nombre">Nombre del cliente</Label>
                <Input
                  id="cliente-nombre"
                  value={clienteNombre}
                  onChange={(e) => setClienteNombre(e.target.value)}
                  placeholder="Nombre y apellido"
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="telefono">Teléfono</Label>
                <Input
                  id="telefono"
                  value={telefono}
                  onChange={(e) => setTelefono(e.target.value)}
                  placeholder="11 5555-5555"
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="direccion">Dirección</Label>
                <Input
                  id="direccion"
                  value={direccion}
                  onChange={(e) => setDireccion(e.target.value)}
                  placeholder="Calle 123, piso/depto"
                />
              </div>
            </div>

            <div className="flex flex-col gap-2">
              <Label>Ítems del pedido</Label>
              {items.map((item, idx) => (
                <div key={idx} className="flex items-center gap-2">
                  <Input
                    value={item.descripcion}
                    onChange={(e) => actualizarItem(idx, 'descripcion', e.target.value)}
                    placeholder="2 empanadas de carne..."
                    className="flex-1"
                  />
                  <Input
                    type="number"
                    min={1}
                    value={item.cantidad}
                    onChange={(e) => actualizarItem(idx, 'cantidad', Number(e.target.value) || 1)}
                    className="w-20"
                  />
                  <Input
                    type="number"
                    min={0}
                    value={item.precioUnitario}
                    onChange={(e) => actualizarItem(idx, 'precioUnitario', Number(e.target.value) || 0)}
                    className="w-28"
                    placeholder="Precio unit."
                  />
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => quitarItem(idx)}
                    disabled={items.length === 1}
                  >
                    <Trash2 className="h-4 w-4 text-red-600" />
                  </Button>
                </div>
              ))}
              <Button variant="outline" size="sm" onClick={agregarItem} className="w-fit">
                <Plus className="mr-1.5 h-4 w-4" />
                Agregar ítem
              </Button>
            </div>

            <div className="flex flex-col gap-1.5">
              <Label htmlFor="notas">Notas (opcional)</Label>
              <Input
                id="notas"
                value={notas}
                onChange={(e) => setNotas(e.target.value)}
                placeholder="Sin cebolla, timbre roto..."
              />
            </div>

            <div className="flex items-center justify-between">
              <span className="text-lg font-semibold">Total: {formatARS(total)}</span>
              <Button
                onClick={crearPedido}
                disabled={!clienteNombre.trim() || !direccion.trim() || total <= 0}
              >
                Cargar pedido
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      <div className="flex flex-col gap-3">
        <h2 className="text-lg font-semibold">En curso</h2>
        <div className="overflow-x-auto rounded-md border">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-left text-muted-foreground">
              <tr>
                <th className="px-3 py-2">Cliente</th>
                <th className="px-3 py-2">Dirección</th>
                <th className="px-3 py-2 text-right">Total</th>
                <th className="px-3 py-2">Estado</th>
              </tr>
            </thead>
            <tbody>
              {activos.length === 0 ? (
                <tr>
                  <td colSpan={4} className="text-muted-foreground px-3 py-6 text-center">
                    No hay pedidos en curso.
                  </td>
                </tr>
              ) : (
                activos.map((p) => (
                  <tr key={p.id} className="border-t">
                    <td className="px-3 py-2">
                      <Link to={p.id} className="font-medium hover:underline">
                        {p.clienteNombre}
                      </Link>
                    </td>
                    <td className="px-3 py-2">{p.direccion}</td>
                    <td className="px-3 py-2 text-right">{formatARS(p.total)}</td>
                    <td className="px-3 py-2">
                      <span
                        className={
                          p.estado === 'en_camino'
                            ? 'rounded-full bg-blue-100 px-2 py-0.5 text-xs font-medium text-blue-800'
                            : 'rounded-full bg-yellow-100 px-2 py-0.5 text-xs font-medium text-yellow-800'
                        }
                      >
                        {ESTADO_PEDIDO_DELIVERY_LABEL[p.estado]}
                      </span>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {finalizados.length > 0 && (
        <div className="flex flex-col gap-3">
          <h2 className="text-lg font-semibold">Historial</h2>
          <div className="overflow-x-auto rounded-md border">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-left text-muted-foreground">
                <tr>
                  <th className="px-3 py-2">Cliente</th>
                  <th className="px-3 py-2">Fecha</th>
                  <th className="px-3 py-2 text-right">Total</th>
                  <th className="px-3 py-2">Estado</th>
                </tr>
              </thead>
              <tbody>
                {finalizados.map((p) => (
                  <tr key={p.id} className="border-t">
                    <td className="px-3 py-2">
                      <Link to={p.id} className="font-medium hover:underline">
                        {p.clienteNombre}
                      </Link>
                    </td>
                    <td className="px-3 py-2">{formatFecha(p.fecha)}</td>
                    <td className="px-3 py-2 text-right">{formatARS(p.total)}</td>
                    <td className="px-3 py-2">
                      <span
                        className={
                          p.estado === 'entregado'
                            ? 'rounded-full bg-green-100 px-2 py-0.5 text-xs font-medium text-green-800'
                            : 'rounded-full bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-600'
                        }
                      >
                        {ESTADO_PEDIDO_DELIVERY_LABEL[p.estado]}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}
