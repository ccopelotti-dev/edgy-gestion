import { useState } from 'react'
import { Plus, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { useRetencionesPercepciones, type NuevaRetencionPercepcion } from '../data/useRetencionesPercepciones'
import { formatARS, formatFecha, periodoActualISO, todayISO } from '../lib/format'
import { IMPUESTO_LABEL, type DireccionRetencionPercepcion, type ImpuestoRetencionPercepcion, type TipoRetencionPercepcion } from '../types'

const FORM_VACIO: NuevaRetencionPercepcion = {
  fecha: todayISO(),
  periodo: periodoActualISO(),
  tipo: 'retencion',
  direccion: 'sufrida',
  impuesto: 'iva',
  sujetoNombre: '',
  monto: 0,
}

export default function RetencionesPercepciones() {
  const { registros, cargando, error, crear, eliminar } = useRetencionesPercepciones()
  const [dialogAbierto, setDialogAbierto] = useState(false)
  const [form, setForm] = useState<NuevaRetencionPercepcion>(FORM_VACIO)
  const [guardando, setGuardando] = useState(false)

  function abrirNuevo() {
    setForm(FORM_VACIO)
    setDialogAbierto(true)
  }

  async function guardar() {
    if (!form.sujetoNombre.trim() || form.monto <= 0) return
    setGuardando(true)
    const ok = await crear(form)
    setGuardando(false)
    if (ok) setDialogAbierto(false)
  }

  async function handleEliminar(id: string, sujeto: string) {
    if (!confirm(`¿Eliminar el registro de "${sujeto}"?`)) return
    await eliminar(id)
  }

  if (cargando) return <p className="text-muted-foreground text-sm">Cargando retenciones y percepciones...</p>

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold">Retenciones y Percepciones</h3>
        <Button size="sm" onClick={abrirNuevo}>
          <Plus className="mr-1 h-3.5 w-3.5" />
          Nuevo registro
        </Button>
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}

      {registros.length === 0 ? (
        <p className="text-muted-foreground text-sm">No hay retenciones ni percepciones cargadas todavía.</p>
      ) : (
        <div className="rounded-xl border border-gray-200 bg-white overflow-x-auto scroll-shadow-x">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 text-left text-gray-500">
                <th className="px-3 py-2 font-medium">Fecha</th>
                <th className="px-3 py-2 font-medium">Tipo</th>
                <th className="px-3 py-2 font-medium">Impuesto</th>
                <th className="px-3 py-2 font-medium">Sujeto</th>
                <th className="px-3 py-2 font-medium">Nº Certificado</th>
                <th className="px-3 py-2 text-right font-medium">Monto</th>
                <th className="px-3 py-2 font-medium">Acciones</th>
              </tr>
            </thead>
            <tbody>
              {registros.map((r) => (
                <tr key={r.id} className="border-t border-gray-100 hover:bg-gray-50/50">
                  <td className="px-3 py-2 text-xs">{formatFecha(r.fecha)}</td>
                  <td className="px-3 py-2 text-xs">
                    <span
                      className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${
                        r.direccion === 'sufrida' ? 'bg-blue-100 text-blue-700' : 'bg-purple-100 text-purple-700'
                      }`}
                    >
                      {r.tipo === 'retencion' ? 'Retención' : 'Percepción'} {r.direccion === 'sufrida' ? 'sufrida' : 'practicada'}
                    </span>
                  </td>
                  <td className="px-3 py-2 text-xs">{IMPUESTO_LABEL[r.impuesto]}</td>
                  <td className="px-3 py-2 text-xs">
                    {r.sujetoNombre}
                    {r.sujetoDocumento && <span className="text-muted-foreground"> · {r.sujetoDocumento}</span>}
                  </td>
                  <td className="px-3 py-2 text-xs">{r.numeroCertificado ?? '—'}</td>
                  <td className="px-3 py-2 text-right text-xs font-semibold">{formatARS(r.monto)}</td>
                  <td className="px-3 py-2">
                    <button
                      onClick={() => handleEliminar(r.id, r.sujetoNombre)}
                      className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg"
                      title="Eliminar"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <Dialog open={dialogAbierto} onOpenChange={setDialogAbierto}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Nueva retención / percepción</DialogTitle>
          </DialogHeader>
          <div className="flex flex-col gap-3">
            <div className="grid grid-cols-2 gap-3">
              <div className="flex flex-col gap-1.5">
                <Label>Tipo</Label>
                <Select value={form.tipo} onValueChange={(v) => setForm((f) => ({ ...f, tipo: v as TipoRetencionPercepcion }))}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="retencion">Retención</SelectItem>
                    <SelectItem value="percepcion">Percepción</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="flex flex-col gap-1.5">
                <Label>Dirección</Label>
                <Select value={form.direccion} onValueChange={(v) => setForm((f) => ({ ...f, direccion: v as DireccionRetencionPercepcion }))}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="sufrida">Sufrida (me la hicieron a mí)</SelectItem>
                    <SelectItem value="practicada">Practicada (yo se la hice a otro)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="flex flex-col gap-1.5">
                <Label>Impuesto</Label>
                <Select value={form.impuesto} onValueChange={(v) => setForm((f) => ({ ...f, impuesto: v as ImpuestoRetencionPercepcion }))}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {(Object.keys(IMPUESTO_LABEL) as ImpuestoRetencionPercepcion[]).map((i) => (
                      <SelectItem key={i} value={i}>
                        {IMPUESTO_LABEL[i]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="rp-periodo">Período</Label>
                <Input id="rp-periodo" type="month" value={form.periodo} onChange={(e) => setForm((f) => ({ ...f, periodo: e.target.value }))} />
              </div>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="rp-fecha">Fecha</Label>
              <Input id="rp-fecha" type="date" value={form.fecha} onChange={(e) => setForm((f) => ({ ...f, fecha: e.target.value }))} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="rp-sujeto">{form.direccion === 'sufrida' ? 'Agente que me retuvo' : 'Sujeto retenido'}</Label>
                <Input id="rp-sujeto" value={form.sujetoNombre} onChange={(e) => setForm((f) => ({ ...f, sujetoNombre: e.target.value }))} />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="rp-documento">CUIT (opcional)</Label>
                <Input id="rp-documento" value={form.sujetoDocumento ?? ''} onChange={(e) => setForm((f) => ({ ...f, sujetoDocumento: e.target.value }))} />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="rp-certificado">Nº Certificado (opcional)</Label>
                <Input id="rp-certificado" value={form.numeroCertificado ?? ''} onChange={(e) => setForm((f) => ({ ...f, numeroCertificado: e.target.value }))} />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="rp-monto">Monto</Label>
                <Input
                  id="rp-monto"
                  type="number"
                  min={0}
                  value={form.monto || ''}
                  onChange={(e) => setForm((f) => ({ ...f, monto: Number(e.target.value) }))}
                />
              </div>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="rp-notas">Notas (opcional)</Label>
              <Input id="rp-notas" value={form.notas ?? ''} onChange={(e) => setForm((f) => ({ ...f, notas: e.target.value }))} />
            </div>
          </div>
          <DialogFooter>
            <Button onClick={guardar} disabled={!form.sujetoNombre.trim() || form.monto <= 0 || guardando}>
              {guardando ? 'Guardando...' : 'Crear registro'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
