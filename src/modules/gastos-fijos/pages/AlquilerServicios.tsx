import { useState } from 'react'
import { Download, Paperclip, Plus, Trash2, Wallet } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { useGastosFijos, type NuevoGastoFijo } from '../data/useGastosFijos'
import { obtenerUrlComprobanteGasto } from '../lib/comprobantesGastos'
import { formatARS, formatFecha, formatPeriodo, periodoActualISO, todayISO } from '../lib/format'
import { ESTADO_GASTO_FIJO_LABEL, TIPO_GASTO_FIJO_LABEL, type GastoFijo, type TipoGastoFijo } from '../types'

const MEDIOS_PAGO = [
  { value: 'efectivo', label: 'Efectivo' },
  { value: 'transferencia', label: 'Transferencia' },
  { value: 'tarjeta_debito', label: 'Tarjeta débito' },
]

const FORM_VACIO: NuevoGastoFijo = { concepto: '', tipo: 'alquiler', proveedor: '', periodo: periodoActualISO(), monto: 0, vencimiento: '' }

export default function AlquilerServicios() {
  const { gastos, cargando, error, crear, marcarPagado, eliminar } = useGastosFijos()

  const [dialogNuevoAbierto, setDialogNuevoAbierto] = useState(false)
  const [form, setForm] = useState<NuevoGastoFijo>(FORM_VACIO)
  const [comprobante, setComprobante] = useState<File | null>(null)
  const [guardando, setGuardando] = useState(false)

  const [pagoDialogGasto, setPagoDialogGasto] = useState<GastoFijo | null>(null)
  const [fechaPago, setFechaPago] = useState(todayISO())
  const [medioPago, setMedioPago] = useState('transferencia')

  function abrirNuevo() {
    setForm(FORM_VACIO)
    setComprobante(null)
    setDialogNuevoAbierto(true)
  }

  async function guardar() {
    if (!form.concepto.trim() || !form.periodo || form.monto <= 0) return
    setGuardando(true)
    const ok = await crear(form, comprobante ?? undefined)
    setGuardando(false)
    if (ok) setDialogNuevoAbierto(false)
  }

  function abrirPago(gasto: GastoFijo) {
    setPagoDialogGasto(gasto)
    setFechaPago(todayISO())
    setMedioPago('transferencia')
  }

  async function confirmarPago() {
    if (!pagoDialogGasto) return
    const ok = await marcarPagado(pagoDialogGasto, fechaPago, medioPago)
    if (ok) setPagoDialogGasto(null)
  }

  async function handleEliminar(gasto: GastoFijo) {
    if (!confirm(`¿Eliminar "${gasto.concepto}"?`)) return
    await eliminar(gasto)
  }

  async function verComprobante(path: string) {
    try {
      const url = await obtenerUrlComprobanteGasto(path)
      window.open(url, '_blank')
    } catch {
      alert('No pudimos abrir el comprobante.')
    }
  }

  if (cargando) return <p className="text-muted-foreground text-sm">Cargando gastos fijos...</p>

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold">Alquiler y Servicios</h3>
        <Button size="sm" onClick={abrirNuevo}>
          <Plus className="mr-1 h-3.5 w-3.5" />
          Nuevo gasto
        </Button>
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}

      {gastos.length === 0 ? (
        <p className="text-muted-foreground text-sm">No hay gastos fijos cargados todavía.</p>
      ) : (
        <div className="rounded-xl border border-gray-200 bg-white overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 text-left text-gray-500">
                <th className="px-4 py-2 font-medium">Concepto</th>
                <th className="px-4 py-2 font-medium">Tipo</th>
                <th className="px-4 py-2 font-medium">Período</th>
                <th className="px-4 py-2 font-medium">Vencimiento</th>
                <th className="px-4 py-2 text-right font-medium">Monto</th>
                <th className="px-4 py-2 font-medium">Estado</th>
                <th className="px-4 py-2 font-medium">Acciones</th>
              </tr>
            </thead>
            <tbody>
              {gastos.map((g) => (
                <tr key={g.id} className="border-t border-gray-100 hover:bg-gray-50/50">
                  <td className="px-4 py-2.5 text-xs font-medium">
                    {g.concepto}
                    {g.proveedor && <span className="text-muted-foreground"> · {g.proveedor}</span>}
                  </td>
                  <td className="px-4 py-2.5 text-xs">{TIPO_GASTO_FIJO_LABEL[g.tipo]}</td>
                  <td className="px-4 py-2.5 text-xs">{formatPeriodo(g.periodo)}</td>
                  <td className="px-4 py-2.5 text-xs">{g.vencimiento ? formatFecha(g.vencimiento) : '—'}</td>
                  <td className="px-4 py-2.5 text-right text-xs font-semibold">{formatARS(g.monto)}</td>
                  <td className="px-4 py-2.5">
                    <span
                      className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${
                        g.estado === 'pagado' ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-600'
                      }`}
                    >
                      {ESTADO_GASTO_FIJO_LABEL[g.estado]}
                    </span>
                  </td>
                  <td className="px-4 py-2.5">
                    <div className="flex items-center gap-1">
                      {g.estado !== 'pagado' && (
                        <button onClick={() => abrirPago(g)} className="p-1.5 text-gray-400 hover:text-green-600 hover:bg-green-50 rounded-lg" title="Marcar pagado">
                          <Wallet className="h-3.5 w-3.5" />
                        </button>
                      )}
                      {g.comprobantePath && (
                        <button onClick={() => verComprobante(g.comprobantePath!)} className="p-1.5 text-gray-400 hover:text-gray-700 hover:bg-gray-100 rounded-lg" title="Ver comprobante">
                          <Download className="h-3.5 w-3.5" />
                        </button>
                      )}
                      <button onClick={() => handleEliminar(g)} className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg" title="Eliminar">
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <Dialog open={dialogNuevoAbierto} onOpenChange={setDialogNuevoAbierto}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Nuevo gasto fijo</DialogTitle>
          </DialogHeader>
          <div className="flex flex-col gap-3">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="gasto-concepto">Concepto</Label>
              <Input
                id="gasto-concepto"
                placeholder="Ej. Alquiler local"
                value={form.concepto}
                onChange={(e) => setForm((f) => ({ ...f, concepto: e.target.value }))}
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="flex flex-col gap-1.5">
                <Label>Tipo</Label>
                <Select value={form.tipo} onValueChange={(v) => setForm((f) => ({ ...f, tipo: v as TipoGastoFijo }))}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {(Object.keys(TIPO_GASTO_FIJO_LABEL) as TipoGastoFijo[]).map((t) => (
                      <SelectItem key={t} value={t}>
                        {TIPO_GASTO_FIJO_LABEL[t]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="gasto-proveedor">Proveedor (opcional)</Label>
                <Input id="gasto-proveedor" value={form.proveedor} onChange={(e) => setForm((f) => ({ ...f, proveedor: e.target.value }))} />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="gasto-periodo">Período</Label>
                <Input id="gasto-periodo" type="month" value={form.periodo} onChange={(e) => setForm((f) => ({ ...f, periodo: e.target.value }))} />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="gasto-monto">Monto</Label>
                <Input
                  id="gasto-monto"
                  type="number"
                  min={0}
                  value={form.monto || ''}
                  onChange={(e) => setForm((f) => ({ ...f, monto: Number(e.target.value) }))}
                />
              </div>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="gasto-vencimiento">Vencimiento (opcional)</Label>
              <Input id="gasto-vencimiento" type="date" value={form.vencimiento} onChange={(e) => setForm((f) => ({ ...f, vencimiento: e.target.value }))} />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="gasto-comprobante">Comprobante (opcional)</Label>
              <label
                htmlFor="gasto-comprobante"
                className="flex cursor-pointer items-center gap-2 rounded-lg border border-dashed border-gray-300 px-3 py-2 text-xs text-muted-foreground hover:bg-gray-50"
              >
                <Paperclip className="h-3.5 w-3.5" />
                {comprobante ? comprobante.name : 'Adjuntar archivo'}
              </label>
              <input
                id="gasto-comprobante"
                type="file"
                className="hidden"
                onChange={(e) => setComprobante(e.target.files?.[0] ?? null)}
              />
            </div>
          </div>
          <DialogFooter>
            <Button onClick={guardar} disabled={!form.concepto.trim() || !form.periodo || form.monto <= 0 || guardando}>
              {guardando ? 'Guardando...' : 'Crear gasto'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={pagoDialogGasto !== null} onOpenChange={(v) => !v && setPagoDialogGasto(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Marcar gasto como pagado</DialogTitle>
          </DialogHeader>
          <div className="flex flex-col gap-3">
            <p className="text-sm">
              Monto: <span className="font-semibold">{pagoDialogGasto ? formatARS(pagoDialogGasto.monto) : ''}</span>
            </p>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="fecha-pago-gasto">Fecha de pago</Label>
              <Input id="fecha-pago-gasto" type="date" value={fechaPago} onChange={(e) => setFechaPago(e.target.value)} />
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
            <p className="text-muted-foreground text-xs">Esto registra un egreso en Tesorería.</p>
          </div>
          <DialogFooter>
            <Button onClick={confirmarPago}>Confirmar pago</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
