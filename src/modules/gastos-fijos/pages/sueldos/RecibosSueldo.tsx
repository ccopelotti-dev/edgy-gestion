import { Fragment, useMemo, useState } from 'react'
import { ChevronDown, ChevronUp, Download, FileCheck, Loader2, Plus, Settings2, Trash2, Wallet } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { useClienteActual } from '@/hooks/useClienteActual'
import { useEmpleados } from '../../data/useEmpleados'
import { useParametrosLiquidacion } from '../../data/useParametrosLiquidacion'
import { useRecibosSueldo } from '../../data/useRecibosSueldo'
import { formatARS, formatFecha, formatPeriodo, periodoActualISO, todayISO } from '../../lib/format'
import { generarReciboSueldoPdf } from '../../lib/generarReciboSueldoPdf'
import { ALICUOTAS_LABEL, type AlicuotasLiquidacion, type ReciboSueldo } from '../../types'

const MEDIOS_PAGO = [
  { value: 'efectivo', label: 'Efectivo' },
  { value: 'transferencia', label: 'Transferencia' },
  { value: 'tarjeta_debito', label: 'Tarjeta débito' },
]

export default function RecibosSueldo() {
  const { cliente } = useClienteActual()
  const { empleados } = useEmpleados()
  const { alicuotas, guardar: guardarAlicuotas } = useParametrosLiquidacion()
  const { recibos, cargando, error, generar, emitir, marcarPagado, eliminar } = useRecibosSueldo()

  const [dialogNuevoAbierto, setDialogNuevoAbierto] = useState(false)
  const [empleadoId, setEmpleadoId] = useState('')
  const [periodo, setPeriodo] = useState(periodoActualISO())
  const [presentismo, setPresentismo] = useState(true)
  const [generando, setGenerando] = useState(false)

  const [dialogParamsAbierto, setDialogParamsAbierto] = useState(false)
  const [formAlicuotas, setFormAlicuotas] = useState<AlicuotasLiquidacion>(alicuotas)

  const [expandidoId, setExpandidoId] = useState<string | null>(null)
  const [pagoDialogRecibo, setPagoDialogRecibo] = useState<ReciboSueldo | null>(null)
  const [fechaPago, setFechaPago] = useState(todayISO())
  const [medioPago, setMedioPago] = useState('transferencia')
  const [generandoPdfId, setGenerandoPdfId] = useState<string | null>(null)

  const empleadosActivos = empleados.filter((e) => e.activo)

  const periodos = useMemo(() => Array.from(new Set(recibos.map((r) => r.periodo))), [recibos])

  function abrirParametros() {
    setFormAlicuotas(alicuotas)
    setDialogParamsAbierto(true)
  }

  async function guardarParametros() {
    const ok = await guardarAlicuotas(formAlicuotas)
    if (ok) setDialogParamsAbierto(false)
  }

  async function handleGenerar() {
    const empleado = empleadosActivos.find((e) => e.id === empleadoId)
    if (!empleado) return
    setGenerando(true)
    const ok = await generar(empleado, alicuotas, { periodo, presentismo })
    setGenerando(false)
    if (ok) {
      setDialogNuevoAbierto(false)
      setEmpleadoId('')
    }
  }

  async function handleDescargarPdf(recibo: ReciboSueldo) {
    if (!cliente) return
    setGenerandoPdfId(recibo.id)
    try {
      await generarReciboSueldoPdf(
        {
          nombre: cliente.nombre,
          cuit: cliente.cuit,
          direccion: cliente.direccion,
          telefono: cliente.telefono,
          logoUrl: cliente.logo_url,
          colorMarca: cliente.color_marca,
        },
        {
          numero: `REC-${String(recibo.numero).padStart(5, '0')}`,
          periodo: recibo.periodo,
          fechaPago: recibo.fechaPagoReal,
          empleadoNombre: recibo.empleadoNombre ?? '',
          empleadoCuil: recibo.empleadoCuil ?? null,
          empleadoCategoria: recibo.empleadoCategoria ?? null,
          fechaIngreso: recibo.empleadoFechaIngreso ?? todayISO(),
          presentismo: recibo.presentismo,
          esRectificativa: recibo.esRectificativa,
          conceptos: recibo.conceptos ?? [],
          totalRemunerativo: recibo.totalRemunerativo,
          totalDeducciones: recibo.totalDeducciones,
          neto: recibo.neto,
          totalContribucionesPatronales: recibo.totalContribucionesPatronales,
        },
        `recibo-sueldo-${recibo.numero}`,
      )
    } finally {
      setGenerandoPdfId(null)
    }
  }

  function abrirPago(recibo: ReciboSueldo) {
    setPagoDialogRecibo(recibo)
    setFechaPago(todayISO())
    setMedioPago('transferencia')
  }

  async function confirmarPago() {
    if (!pagoDialogRecibo) return
    const ok = await marcarPagado(pagoDialogRecibo, fechaPago, medioPago)
    if (ok) setPagoDialogRecibo(null)
  }

  async function handleEliminar(recibo: ReciboSueldo) {
    if (!confirm(`¿Eliminar el recibo borrador N.º ${recibo.numero}?`)) return
    await eliminar(recibo.id)
  }

  if (cargando) return <p className="text-muted-foreground text-sm">Cargando recibos...</p>

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-sm font-semibold">Recibos de sueldo</h3>
        <div className="flex items-center gap-2">
          <Button size="sm" variant="outline" onClick={abrirParametros}>
            <Settings2 className="mr-1 h-3.5 w-3.5" />
            Parámetros
          </Button>
          <Button size="sm" onClick={() => setDialogNuevoAbierto(true)} disabled={empleadosActivos.length === 0}>
            <Plus className="mr-1 h-3.5 w-3.5" />
            Generar recibo
          </Button>
        </div>
      </div>

      {empleadosActivos.length === 0 && (
        <p className="text-muted-foreground text-xs">Cargá al menos un empleado para poder generar recibos.</p>
      )}

      {error && <p className="text-sm text-red-600">{error}</p>}

      {recibos.length === 0 ? (
        <p className="text-muted-foreground text-sm">No hay recibos generados todavía.</p>
      ) : (
        periodos.map((p) => (
          <div key={p} className="flex flex-col gap-2">
            <h4 className="text-muted-foreground text-xs font-semibold uppercase">{formatPeriodo(p)}</h4>
            <div className="rounded-xl border border-gray-200 bg-white overflow-x-auto scroll-shadow-x">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-gray-50 text-left text-gray-500">
                    <th className="px-4 py-2 font-medium w-8" />
                    <th className="px-4 py-2 font-medium">Número</th>
                    <th className="px-4 py-2 font-medium">Empleado</th>
                    <th className="px-4 py-2 text-right font-medium">Neto</th>
                    <th className="px-4 py-2 font-medium">Estado</th>
                    <th className="px-4 py-2 font-medium">Acciones</th>
                  </tr>
                </thead>
                <tbody>
                  {recibos
                    .filter((r) => r.periodo === p)
                    .map((r) => {
                      const isExpanded = expandidoId === r.id
                      return (
                        <Fragment key={r.id}>
                          <tr className="border-t border-gray-100 hover:bg-gray-50/50 cursor-pointer" onClick={() => setExpandidoId(isExpanded ? null : r.id)}>
                            <td className="px-4 py-2.5 text-gray-400">
                              {isExpanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                            </td>
                            <td className="px-4 py-2.5 font-mono text-xs">
                              REC-{String(r.numero).padStart(5, '0')}
                              {r.esRectificativa && <span className="ml-1 text-amber-600">(rect.)</span>}
                            </td>
                            <td className="px-4 py-2.5 text-xs font-medium">{r.empleadoNombre}</td>
                            <td className="px-4 py-2.5 text-right text-xs font-semibold">{formatARS(r.neto)}</td>
                            <td className="px-4 py-2.5">
                              <span
                                className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${
                                  r.pagado
                                    ? 'bg-green-100 text-green-700'
                                    : r.estado === 'emitido'
                                      ? 'bg-blue-100 text-blue-700'
                                      : 'bg-gray-100 text-gray-600'
                                }`}
                              >
                                {r.pagado ? 'Pagado' : r.estado === 'emitido' ? 'Emitido' : 'Borrador'}
                              </span>
                            </td>
                            <td className="px-4 py-2.5" onClick={(e) => e.stopPropagation()}>
                              <div className="flex items-center gap-1">
                                {r.estado === 'borrador' && (
                                  <button onClick={() => emitir(r.id)} className="p-1.5 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg" title="Emitir">
                                    <FileCheck className="h-3.5 w-3.5" />
                                  </button>
                                )}
                                {r.estado === 'emitido' && !r.pagado && (
                                  <button onClick={() => abrirPago(r)} className="p-1.5 text-gray-400 hover:text-green-600 hover:bg-green-50 rounded-lg" title="Marcar pagado">
                                    <Wallet className="h-3.5 w-3.5" />
                                  </button>
                                )}
                                <button
                                  onClick={() => handleDescargarPdf(r)}
                                  disabled={generandoPdfId === r.id}
                                  className="p-1.5 text-gray-400 hover:text-gray-700 hover:bg-gray-100 rounded-lg disabled:opacity-50"
                                  title="Descargar PDF"
                                >
                                  {generandoPdfId === r.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5" />}
                                </button>
                                {r.estado === 'borrador' && (
                                  <button onClick={() => handleEliminar(r)} className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg" title="Eliminar">
                                    <Trash2 className="h-3.5 w-3.5" />
                                  </button>
                                )}
                              </div>
                            </td>
                          </tr>
                          {isExpanded && (
                            <tr>
                              <td colSpan={6} className="bg-gray-50/50 px-8 py-4">
                                <div className="grid grid-cols-1 gap-4 md:grid-cols-3 text-xs">
                                  <div>
                                    <p className="font-semibold text-gray-700 mb-1">Remunerativo</p>
                                    {(r.conceptos ?? []).filter((c) => c.tipo === 'remunerativo').map((c) => (
                                      <div key={c.id} className="flex justify-between py-0.5">
                                        <span>{c.concepto}</span>
                                        <span>{formatARS(c.monto)}</span>
                                      </div>
                                    ))}
                                    <div className="flex justify-between border-t border-gray-200 pt-1 mt-1 font-semibold">
                                      <span>Total</span>
                                      <span>{formatARS(r.totalRemunerativo)}</span>
                                    </div>
                                  </div>
                                  <div>
                                    <p className="font-semibold text-gray-700 mb-1">Deducciones</p>
                                    {(r.conceptos ?? []).filter((c) => c.tipo === 'deduccion').map((c) => (
                                      <div key={c.id} className="flex justify-between py-0.5">
                                        <span>{c.concepto}</span>
                                        <span>-{formatARS(c.monto)}</span>
                                      </div>
                                    ))}
                                    <div className="flex justify-between border-t border-gray-200 pt-1 mt-1 font-semibold">
                                      <span>Neto</span>
                                      <span>{formatARS(r.neto)}</span>
                                    </div>
                                  </div>
                                  <div>
                                    <p className="font-semibold text-gray-700 mb-1">Contribuciones patronales</p>
                                    {(r.conceptos ?? []).filter((c) => c.tipo === 'contribucion_patronal').map((c) => (
                                      <div key={c.id} className="flex justify-between py-0.5">
                                        <span>{c.concepto}</span>
                                        <span>{formatARS(c.monto)}</span>
                                      </div>
                                    ))}
                                    <div className="flex justify-between border-t border-gray-200 pt-1 mt-1 font-semibold">
                                      <span>Total</span>
                                      <span>{formatARS(r.totalContribucionesPatronales)}</span>
                                    </div>
                                  </div>
                                </div>
                                {r.pagado && r.fechaPagoReal && (
                                  <p className="text-muted-foreground mt-3 text-xs">Pagado el {formatFecha(r.fechaPagoReal)}.</p>
                                )}
                              </td>
                            </tr>
                          )}
                        </Fragment>
                      )
                    })}
                </tbody>
              </table>
            </div>
          </div>
        ))
      )}

      {/* Nuevo recibo */}
      <Dialog open={dialogNuevoAbierto} onOpenChange={setDialogNuevoAbierto}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Generar recibo de sueldo</DialogTitle>
          </DialogHeader>
          <div className="flex flex-col gap-3">
            <div className="flex flex-col gap-1.5">
              <Label>Empleado</Label>
              <Select value={empleadoId} onValueChange={setEmpleadoId}>
                <SelectTrigger>
                  <SelectValue placeholder="Elegir empleado..." />
                </SelectTrigger>
                <SelectContent>
                  {empleadosActivos.map((e) => (
                    <SelectItem key={e.id} value={e.id}>
                      {e.nombre}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="periodo-recibo">Período</Label>
              <Input id="periodo-recibo" type="month" value={periodo} onChange={(e) => setPeriodo(e.target.value)} />
            </div>
            <div className="flex items-center gap-2">
              <input
                id="presentismo"
                type="checkbox"
                checked={presentismo}
                onChange={(e) => setPresentismo(e.target.checked)}
              />
              <Label htmlFor="presentismo" className="font-normal">
                Corresponde presentismo este período
              </Label>
            </div>
            <p className="text-muted-foreground text-xs">
              El recibo se genera en borrador -- podés revisar/editar los conceptos antes de emitirlo.
            </p>
          </div>
          <DialogFooter>
            <Button onClick={handleGenerar} disabled={!empleadoId || !periodo || generando}>
              {generando ? 'Generando...' : 'Generar'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Marcar pagado */}
      <Dialog open={pagoDialogRecibo !== null} onOpenChange={(v) => !v && setPagoDialogRecibo(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Marcar recibo como pagado</DialogTitle>
          </DialogHeader>
          <div className="flex flex-col gap-3">
            <p className="text-sm">
              Neto a pagar: <span className="font-semibold">{pagoDialogRecibo ? formatARS(pagoDialogRecibo.neto) : ''}</span>
            </p>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="fecha-pago-recibo">Fecha de pago</Label>
              <Input id="fecha-pago-recibo" type="date" value={fechaPago} onChange={(e) => setFechaPago(e.target.value)} />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label>Medio de pago</Label>
              <Select value={medioPago} onValueChange={setMedioPago}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {MEDIOS_PAGO.map((m) => (
                    <SelectItem key={m.value} value={m.value}>
                      {m.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <p className="text-muted-foreground text-xs">Esto registra un egreso en Tesorería por el neto pagado.</p>
          </div>
          <DialogFooter>
            <Button onClick={confirmarPago}>Confirmar pago</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Parámetros de liquidación */}
      <Dialog open={dialogParamsAbierto} onOpenChange={setDialogParamsAbierto}>
        <DialogContent className="max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Parámetros de liquidación</DialogTitle>
          </DialogHeader>
          <p className="text-muted-foreground text-xs">
            Valores de referencia -- confirmalos con tu contador antes de emitir recibos reales. Los porcentajes se aplican
            sobre el total remunerativo del período; los importes fijos (seguro de vida, cuota ART) se cargan tal cual.
          </p>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {(Object.keys(ALICUOTAS_LABEL) as (keyof AlicuotasLiquidacion)[]).map((k) => (
              <div key={k} className="flex flex-col gap-1.5">
                <Label htmlFor={`alicuota-${k}`}>{ALICUOTAS_LABEL[k]}</Label>
                <Input
                  id={`alicuota-${k}`}
                  type="number"
                  step="0.01"
                  value={formAlicuotas[k]}
                  onChange={(e) => setFormAlicuotas((f) => ({ ...f, [k]: Number(e.target.value) }))}
                />
              </div>
            ))}
          </div>
          <DialogFooter>
            <Button onClick={guardarParametros}>Guardar parámetros</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
