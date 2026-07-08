import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Plus } from 'lucide-react'
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
import { usePlanesVianda, useViandas } from '../data/store'
import { formatARS, formatFecha, daysUntil, todayISO } from '../lib/format'
import { PERIODO_VIANDA_LABEL, ESTADO_PLAN_VIANDA_LABEL, type PeriodoVianda } from '../types'

interface ClienteVentaLite {
  id: string
  nombre: string
}

// Listado de planes + alta inline (sin página separada, mismo criterio
// que Mesa.tsx en comandas-cocina para "abrir comanda"). El cliente se
// resuelve con una consulta directa a `clientes_venta` -- Ventas no
// está montado en este módulo, mismo criterio cross-módulo que el
// resto del pack gastronómico.
export default function Index() {
  const { cliente } = useClienteActual()
  const { dispatch } = useViandas()
  const planes = usePlanesVianda()

  const [clientesVenta, setClientesVenta] = useState<ClienteVentaLite[]>([])
  const [mostrarForm, setMostrarForm] = useState(false)
  const [clienteVentaId, setClienteVentaId] = useState('')
  const [cantidadPeriodo, setCantidadPeriodo] = useState(5)
  const [periodo, setPeriodo] = useState<PeriodoVianda>('semanal')
  const [precioAbono, setPrecioAbono] = useState(0)
  const [fechaVencimiento, setFechaVencimiento] = useState('')

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

  const clienteSeleccionado = clientesVenta.find((c) => c.id === clienteVentaId)

  function crearPlan() {
    if (!clienteSeleccionado || !fechaVencimiento || precioAbono <= 0) return
    dispatch({
      type: 'CREAR_PLAN',
      payload: {
        clienteVentaId: clienteSeleccionado.id,
        clienteVentaNombre: clienteSeleccionado.nombre,
        cantidadPeriodo,
        periodo,
        precioAbono,
        fechaInicio: todayISO(),
        fechaVencimiento,
      },
    })
    setMostrarForm(false)
    setClienteVentaId('')
    setCantidadPeriodo(5)
    setPeriodo('semanal')
    setPrecioAbono(0)
    setFechaVencimiento('')
  }

  const planesOrdenados = [...planes].sort((a, b) => {
    if (a.estado !== b.estado) return a.estado === 'activo' ? -1 : 1
    return a.fechaVencimiento.localeCompare(b.fechaVencimiento)
  })

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Viandas</h1>
          <p className="text-muted-foreground text-sm">Planes de vianda por abono y sus entregas.</p>
        </div>
        <Button onClick={() => setMostrarForm((v) => !v)}>
          <Plus className="mr-1.5 h-4 w-4" />
          Nuevo plan
        </Button>
      </div>

      {mostrarForm && (
        <Card>
          <CardContent className="flex flex-col gap-3 py-4">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="cliente-venta">Cliente</Label>
                <Select value={clienteVentaId} onValueChange={setClienteVentaId}>
                  <SelectTrigger id="cliente-venta">
                    <SelectValue placeholder="Elegir cliente" />
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
                <Label htmlFor="cantidad-periodo">Viandas por período</Label>
                <Input
                  id="cantidad-periodo"
                  type="number"
                  min={1}
                  value={cantidadPeriodo}
                  onChange={(e) => setCantidadPeriodo(Number(e.target.value) || 1)}
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="periodo">Período</Label>
                <Select value={periodo} onValueChange={(v) => setPeriodo(v as PeriodoVianda)}>
                  <SelectTrigger id="periodo">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {(Object.keys(PERIODO_VIANDA_LABEL) as PeriodoVianda[]).map((p) => (
                      <SelectItem key={p} value={p}>
                        {PERIODO_VIANDA_LABEL[p]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="precio-abono">Precio del abono</Label>
                <Input
                  id="precio-abono"
                  type="number"
                  min={0}
                  value={precioAbono}
                  onChange={(e) => setPrecioAbono(Number(e.target.value) || 0)}
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="fecha-vencimiento">Vence el</Label>
                <Input
                  id="fecha-vencimiento"
                  type="date"
                  value={fechaVencimiento}
                  onChange={(e) => setFechaVencimiento(e.target.value)}
                />
              </div>
            </div>
            <div>
              <Button onClick={crearPlan} disabled={!clienteSeleccionado || !fechaVencimiento || precioAbono <= 0}>
                Crear plan
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      <div className="overflow-x-auto rounded-md border">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-left text-muted-foreground">
            <tr>
              <th className="px-3 py-2">Cliente</th>
              <th className="px-3 py-2">Plan</th>
              <th className="px-3 py-2 text-right">Abono</th>
              <th className="px-3 py-2">Vence</th>
              <th className="px-3 py-2">Estado</th>
            </tr>
          </thead>
          <tbody>
            {planesOrdenados.length === 0 ? (
              <tr>
                <td colSpan={5} className="text-muted-foreground px-3 py-6 text-center">
                  Todavía no hay planes de vianda cargados.
                </td>
              </tr>
            ) : (
              planesOrdenados.map((p) => {
                const dias = daysUntil(p.fechaVencimiento)
                const vencido = p.estado === 'activo' && dias < 0
                return (
                  <tr key={p.id} className="border-t">
                    <td className="px-3 py-2">
                      <Link to={p.id} className="font-medium hover:underline">
                        {p.clienteVentaNombre ?? 'Cliente'}
                      </Link>
                    </td>
                    <td className="px-3 py-2">
                      {p.cantidadPeriodo} viandas / {PERIODO_VIANDA_LABEL[p.periodo].toLowerCase()}
                    </td>
                    <td className="px-3 py-2 text-right">{formatARS(p.precioAbono)}</td>
                    <td className="px-3 py-2">
                      {formatFecha(p.fechaVencimiento)}
                      {vencido && <span className="ml-1.5 text-xs font-medium text-red-600">Vencido</span>}
                    </td>
                    <td className="px-3 py-2">
                      <span
                        className={
                          p.estado === 'activo'
                            ? 'rounded-full bg-green-100 px-2 py-0.5 text-xs font-medium text-green-800'
                            : 'rounded-full bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-600'
                        }
                      >
                        {ESTADO_PLAN_VIANDA_LABEL[p.estado]}
                      </span>
                    </td>
                  </tr>
                )
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
