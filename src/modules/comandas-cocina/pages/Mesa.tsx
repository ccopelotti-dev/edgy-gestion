import { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { ArrowLeft, Minus, Plus, Receipt, Trash2, AlertTriangle, ShieldCheck, ArrowRightLeft, BellRing } from 'lucide-react'
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
import { cerrarComandaComoVenta, validarStockComanda, type ErrorStockComanda } from '../lib/cerrarComandaVenta'
import { useCatalogoComandas } from '../lib/catalogoComandas'
import { listarMesasLibres, trasladarComanda, type MesaLibre } from '../lib/trasladarMesa'
import { crearLlamadoPersonal } from '@/modules/mesas-salon/lib/llamadosMozo'

interface MesaLite {
  id: string
  numero: number
  capacidad: number
}

interface ClienteVentaLite {
  id: string
  nombre: string
  telefono?: string
}

// Detalle de una mesa: abrir comanda, cargar/editar items, pasar a
// cobro y cerrar. La mesa se resuelve con una consulta directa a
// `mesas` (no via MesasSalonProvider, que vive en otro modulo y no esta
// montado aca) -- mismo criterio cross-modulo que useTurnoActivo.
//
// Fase 7a del refactor de Productos (auditoría de conexiones Ventas↔
// Productos): el catálogo ahora trae también stock/garantía, se puede
// vincular la comanda a un cliente registrado (habilita cuenta
// corriente), y el panel de facturación aparece directo -- sin el paso
// manual de "Pasar a cobro" -- apenas todos los ítems están "listos" en
// cocina. Al facturar se valida y descuenta stock, se activa garantía,
// y si el pago es de contado se genera un recibo real y se refleja en
// Tesorería.
//
// Fase 8d (auditoría de conexiones, terminología por Kit): esta
// "Comanda" es específicamente la de mesa/salón -- desde que existe el
// motor central de Órdenes de Venta (Fase 8a/8b/8c, que en Gastronomía
// se muestra enmascarado como "Comanda" también, ver
// src/lib/terminologia.ts), hace falta distinguirlas en pantalla. Acá
// se le agrega "de salón" en todos los textos visibles para el
// operador -- los nombres de variables/funciones internas (`comanda`,
// `abrirComanda`, `ABRIR_COMANDA`, etc.) no cambian, es puramente una
// aclaración de UI.
//
// Fase 13a (Mejoras de Salón): se agrega el traslado de esta comanda a
// otra mesa libre -- ver ../lib/trasladarMesa.ts. Se persiste con el
// RPC `trasladar_comanda` (transaccional) ANTES de despachar
// TRASLADAR_COMANDA al store local, mismo criterio que CERRAR_COMANDA
// con el comprobanteId ya resuelto.
//
// Fase 13c: botón "Llamar mozo" (aviso interno, origen='personal') --
// ver src/modules/mesas-salon/lib/llamadosMozo.ts. Se muestra en
// Salon.tsx en tiempo real vía Supabase Realtime.
export default function Mesa() {
  const { mesaId } = useParams<{ mesaId: string }>()
  const navigate = useNavigate()
  const { cliente } = useClienteActual()
  const { turno } = useTurnoActivo()
  const { dispatch } = useComandasCocina()
  const comanda = useComandaDeMesa(mesaId ?? '')
  const { productos, porId: catalogoPorId } = useCatalogoComandas(cliente?.id, cliente?.lista_precio_comandas_id)

  const [mesa, setMesa] = useState<MesaLite | null>(null)
  const [cargandoMesa, setCargandoMesa] = useState(true)
  const [clientesVenta, setClientesVenta] = useState<ClienteVentaLite[]>([])
  const [productoId, setProductoId] = useState('')
  const [cantidadNueva, setCantidadNueva] = useState(1)
  const [nota, setNota] = useState('')
  const [medioPago, setMedioPago] = useState<MedioPago>('efectivo')
  const [cerrando, setCerrando] = useState(false)
  const [erroresStock, setErroresStock] = useState<ErrorStockComanda[] | null>(null)
  const [contactoNombre, setContactoNombre] = useState('')
  const [contactoTelefono, setContactoTelefono] = useState('')

  // Fase 13a: traslado de mesas -- ver ../lib/trasladarMesa.ts.
  const [trasladoAbierto, setTrasladoAbierto] = useState(false)
  const [mesasLibres, setMesasLibres] = useState<MesaLibre[]>([])
  const [mesaDestinoId, setMesaDestinoId] = useState('')
  const [trasladando, setTrasladando] = useState(false)
  const [errorTraslado, setErrorTraslado] = useState('')

  // Fase 13c: aviso interno de "llamar mozo" (origen='personal') -- ver
  // src/modules/mesas-salon/lib/llamadosMozo.ts. El otro origen
  // ('cliente', desde el Menú QR) no pasa por acá.
  const [llamandoMozo, setLlamandoMozo] = useState(false)
  const [avisoEnviado, setAvisoEnviado] = useState(false)

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

  useEffect(() => {
    if (!cliente?.id) return
    supabase
      .from('clientes_venta')
      .select('id, nombre, telefono')
      .eq('cliente_id', cliente.id)
      .eq('activo', true)
      .order('nombre')
      .then(({ data }) => setClientesVenta((data ?? []).map((c: any) => ({ id: c.id, nombre: c.nombre, telefono: c.telefono ?? undefined }))))
  }, [cliente?.id])

  const productoSeleccionado = productos.find((p) => p.id === productoId)

  // Fase 7a: la comanda queda "lista para cobrar" apenas todos sus
  // ítems llegan a listo/entregado en cocina -- derivado, no se guarda
  // ningún estado nuevo. Si el mozo agrega otro ítem después, vuelve a
  // false solo (el ítem nuevo arranca "pendiente"), sin que haga falta
  // tocar nada a mano.
  const todosListos =
    !!comanda &&
    comanda.items.length > 0 &&
    comanda.items.every((i) => i.estadoCocina === 'listo' || i.estadoCocina === 'entregado')

  const mostrarPanelFacturacion = comanda?.estado === 'cobro' || (comanda?.estado === 'abierta' && todosListos)

  const clienteRegistrado = clientesVenta.find((c) => c.id === comanda?.clienteVentaId)

  const itemsConGarantia = (comanda?.items ?? []).filter(
    (i) => i.productoId && catalogoPorId.get(i.productoId)?.plantillaGarantia,
  )
  const necesitaContactoGarantia = itemsConGarantia.length > 0 && !comanda?.clienteVentaId
  const faltaContactoGarantia =
    necesitaContactoGarantia && (!contactoNombre.trim() || !contactoTelefono.trim())

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

  function asignarCliente(clienteVentaId: string) {
    if (!comanda) return
    const c = clientesVenta.find((cv) => cv.id === clienteVentaId)
    dispatch({
      type: 'ASIGNAR_CLIENTE',
      payload: { comandaId: comanda.id, clienteVentaId: c?.id, clienteVentaNombre: c?.nombre },
    })
    if (medioPago === 'cuenta_corriente' && !c) setMedioPago('efectivo')
  }

  function pasarACobro() {
    if (!comanda) return
    dispatch({ type: 'PASAR_A_COBRO', payload: { comandaId: comanda.id } })
  }

  async function cerrarComanda() {
    if (!comanda || !cliente?.id || faltaContactoGarantia) return
    setCerrando(true)
    setErroresStock(null)

    const itemsCatalogo = comanda.items.filter((i) => i.productoId)
    if (itemsCatalogo.length > 0) {
      const errores = await validarStockComanda(comanda)
      if (errores.length > 0) {
        setErroresStock(errores)
        setCerrando(false)
        return
      }
    }

    const nombreContacto = comanda.clienteVentaId ? clienteRegistrado?.nombre ?? '' : contactoNombre
    const telefonoContacto = comanda.clienteVentaId ? clienteRegistrado?.telefono ?? '' : contactoTelefono

    // Antes de cerrar la comanda acá, se genera el Comprobante real en
    // Ventas y se refleja el cobro en Tesorería — recién con ese
    // comprobanteId resuelto se despacha CERRAR_COMANDA, mismo criterio
    // que Ventas/Compras resolviendo `numero` antes de llegar al reducer.
    const comprobanteId = await cerrarComandaComoVenta(
      comanda,
      cliente.id,
      medioPago,
      catalogoPorId,
      nombreContacto,
      telefonoContacto,
    )
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
    if (!window.confirm('¿Cancelar esta comanda de salón? Se perderán los ítems cargados.')) return
    dispatch({ type: 'CANCELAR_COMANDA', payload: { comandaId: comanda.id } })
    navigate('/m/mesas-salon')
  }

  async function abrirTraslado() {
    if (!mesaId) return
    setErrorTraslado('')
    setMesaDestinoId('')
    setTrasladoAbierto(true)
    setMesasLibres(await listarMesasLibres(mesaId))
  }

  async function confirmarTraslado() {
    if (!comanda || !mesaDestinoId) return
    setTrasladando(true)
    setErrorTraslado('')
    const resultado = await trasladarComanda(comanda.id, mesaDestinoId)
    if (!resultado.ok) {
      setErrorTraslado(resultado.error ?? 'No se pudo trasladar la comanda de salón.')
      setTrasladando(false)
      return
    }
    dispatch({ type: 'TRASLADAR_COMANDA', payload: { comandaId: comanda.id, mesaDestinoId } })
    setTrasladando(false)
    setTrasladoAbierto(false)
    navigate(`/m/comandas-cocina/mesa/${mesaDestinoId}`)
  }

  async function llamarMozo() {
    if (!mesaId || !cliente?.id) return
    setLlamandoMozo(true)
    const ok = await crearLlamadoPersonal(cliente.id, mesaId)
    setLlamandoMozo(false)
    if (ok) {
      setAvisoEnviado(true)
      setTimeout(() => setAvisoEnviado(false), 4000)
    }
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
        {comanda && (comanda.estado === 'abierta' || comanda.estado === 'cobro') && (
          <div className="flex flex-col items-end gap-1">
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={llamarMozo} disabled={llamandoMozo}>
                <BellRing className="mr-1.5 h-4 w-4" />
                Llamar mozo
              </Button>
              <Button variant="outline" size="sm" onClick={abrirTraslado}>
                <ArrowRightLeft className="mr-1.5 h-4 w-4" />
                Trasladar
              </Button>
            </div>
            {avisoEnviado && <span className="text-xs font-medium text-violet-700">Aviso enviado</span>}
          </div>
        )}
        {comanda && (
          <div className="text-right">
            <span className="rounded-full bg-gray-100 px-3 py-1 text-xs font-medium">
              {comanda.estado === 'cobro'
                ? 'En cobro'
                : todosListos
                  ? 'Lista para cobrar'
                  : 'Comanda de salón abierta'}
            </span>
            <p className="text-muted-foreground mt-1 text-xs">Desde {formatHora(comanda.fechaApertura)}</p>
          </div>
        )}
      </div>

      {/* Fase 13a: traslado de esta comanda a otra mesa libre. */}
      {trasladoAbierto && comanda && (
        <Card className="max-w-sm border-indigo-200 bg-indigo-50/50">
          <CardContent className="flex flex-col gap-3 py-4">
            <h3 className="flex items-center gap-1.5 font-medium">
              <ArrowRightLeft className="h-4 w-4" />
              Trasladar a otra mesa
            </h3>
            {mesasLibres.length === 0 ? (
              <p className="text-muted-foreground text-sm">No hay mesas libres en este momento.</p>
            ) : (
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="mesa-destino">Mesa destino</Label>
                <Select value={mesaDestinoId} onValueChange={setMesaDestinoId}>
                  <SelectTrigger id="mesa-destino">
                    <SelectValue placeholder="Elegir mesa libre" />
                  </SelectTrigger>
                  <SelectContent>
                    {mesasLibres.map((m) => (
                      <SelectItem key={m.id} value={m.id}>
                        Mesa {m.numero}{m.sectorNombre ? ` · ${m.sectorNombre}` : ''}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
            {errorTraslado && <p className="text-sm text-red-600">{errorTraslado}</p>}
            <div className="flex gap-2">
              <Button onClick={confirmarTraslado} disabled={!mesaDestinoId || trasladando}>
                {trasladando ? 'Trasladando…' : 'Confirmar traslado'}
              </Button>
              <Button variant="outline" onClick={() => setTrasladoAbierto(false)}>
                Cancelar
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Bloqueo por stock insuficiente -- Fase 7a, mismo criterio que
          Ventas (6c) y Delivery (6d): un faltante de stock es un desvío
          operativo humano, no un error del sistema, y bloquea el cierre
          hasta que se corrija el stock a mano en Productos. */}
      {erroresStock && erroresStock.length > 0 && (
        <div className="rounded-lg border-2 border-red-300 bg-red-50 px-4 py-3">
          <div className="flex items-center gap-2 text-sm font-bold text-red-800">
            <AlertTriangle className="h-5 w-5" />
            No se pudo cerrar: stock insuficiente
          </div>
          <ul className="mt-2 space-y-1 text-sm text-red-800">
            {erroresStock.map((e, i) => (
              <li key={i}>
                <span className="font-semibold">{e.nombre}</span>: pedido {e.solicitado}, disponible{' '}
                {e.disponible}
              </li>
            ))}
          </ul>
          <p className="mt-2 text-xs font-medium text-red-700">
            Esto refleja un desvío en el control de stock, no un error del sistema. Corregí el
            stock manualmente en Productos antes de volver a intentar cerrar.
          </p>
        </div>
      )}

      {!turno ? (
        <Card className="border-amber-300 bg-amber-50">
          <CardContent className="py-4 text-sm text-amber-900">
            Debe abrir un turno de caja para tomar comandas de salón.
          </CardContent>
        </Card>
      ) : !comanda ? (
        <Card className="max-w-sm">
          <CardContent className="flex flex-col gap-3 py-6">
            <h2 className="font-semibold">Mesa libre</h2>
            <p className="text-muted-foreground text-sm">Abrí una comanda de salón para empezar a cargar el pedido.</p>
            <Button onClick={abrirComanda}>Abrir comanda de salón</Button>
          </CardContent>
        </Card>
      ) : (
        <div className="flex flex-col gap-6">
          {/* Cliente registrado (Fase 7a): opcional -- habilita cuenta
              corriente y autocompleta nombre/teléfono si hay garantía. */}
          <div className="flex max-w-sm flex-col gap-1.5">
            <Label htmlFor="cliente-comanda">Cliente registrado (opcional)</Label>
            <Select value={comanda.clienteVentaId ?? ''} onValueChange={asignarCliente}>
              <SelectTrigger id="cliente-comanda">
                <SelectValue placeholder="Consumidor Final" />
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
                            <span className="flex items-center gap-1.5">
                              {p.nombre} · {formatARS(p.precioVenta)}
                              {p.plantillaGarantia && ' · con garantía'}
                            </span>
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
                  comanda.items.map((item) => {
                    const producto = item.productoId ? catalogoPorId.get(item.productoId) : undefined
                    return (
                      <tr key={item.id} className="border-t">
                        <td className="px-3 py-2">
                          <div className="flex items-center gap-1.5 font-medium">
                            {item.descripcion}
                            {producto?.plantillaGarantia && (
                              <ShieldCheck className="h-3.5 w-3.5 text-emerald-600" />
                            )}
                          </div>
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
                    )
                  })
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

          {mostrarPanelFacturacion ? (
            <Card className="max-w-sm">
              <CardContent className="flex flex-col gap-3 py-4">
                {todosListos && comanda.estado === 'abierta' && (
                  <p className="text-xs font-medium text-emerald-700">
                    Cocina terminó todos los ítems -- ya se puede facturar directo.
                  </p>
                )}

                {necesitaContactoGarantia && (
                  <div className="flex flex-col gap-2 rounded-md border border-emerald-200 bg-emerald-50 p-3">
                    <p className="flex items-center gap-1.5 text-xs font-medium text-emerald-800">
                      <ShieldCheck className="h-3.5 w-3.5" />
                      Hay un producto con garantía. Sin cliente registrado, hacen falta datos de
                      contacto para poder activarla.
                    </p>
                    <Input
                      value={contactoNombre}
                      onChange={(e) => setContactoNombre(e.target.value)}
                      placeholder="Nombre del cliente"
                    />
                    <Input
                      value={contactoTelefono}
                      onChange={(e) => setContactoTelefono(e.target.value)}
                      placeholder="Teléfono"
                    />
                  </div>
                )}

                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="medio-pago">Medio de pago</Label>
                  <Select value={medioPago} onValueChange={(v) => setMedioPago(v as MedioPago)}>
                    <SelectTrigger id="medio-pago">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {(Object.keys(MEDIO_PAGO_LABEL) as MedioPago[])
                        .filter((mp) => mp !== 'cuenta_corriente' || !!comanda.clienteVentaId)
                        .map((mp) => (
                          <SelectItem key={mp} value={mp}>
                            {MEDIO_PAGO_LABEL[mp]}
                          </SelectItem>
                        ))}
                    </SelectContent>
                  </Select>
                  {!comanda.clienteVentaId && (
                    <p className="text-muted-foreground text-[11px]">
                      Elegí un cliente registrado arriba para poder cobrar a cuenta corriente.
                    </p>
                  )}
                </div>
                <Button onClick={cerrarComanda} disabled={cerrando || faltaContactoGarantia}>
                  <Receipt className="mr-1.5 h-4 w-4" />
                  {cerrando
                    ? 'Generando comprobante…'
                    : medioPago === 'cuenta_corriente'
                      ? `Facturar ${formatARS(comanda.total)} a cuenta corriente`
                      : `Cobrar ${formatARS(comanda.total)} y facturar`}
                </Button>
              </CardContent>
            </Card>
          ) : (
            comanda.estado === 'abierta' && (
              <div className="flex flex-wrap gap-2">
                <Button onClick={pasarACobro} disabled={comanda.items.length === 0}>
                  <Receipt className="mr-1.5 h-4 w-4" />
                  Pasar a cobro
                </Button>
                <Button variant="outline" className="text-red-600" onClick={cancelarComanda}>
                  Cancelar comanda de salón
                </Button>
              </div>
            )
          )}
        </div>
      )}
    </div>
  )
}
