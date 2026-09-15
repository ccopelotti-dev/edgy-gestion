'use client'

import { useEffect, useState } from 'react'
import { Plus, Trash2 } from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import type {
  Propietario,
  Propiedad,
  Unidad,
  TipoUnidad,
  EstadoUnidad,
  Inquilino,
  Garante,
  Pago,
  FormaPago,
} from '../types'
import { TIPOS_UNIDAD, ESTADOS_UNIDAD, FORMAS_PAGO } from '../types'

const inputClass =
  'flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm'
const textareaClass =
  'flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm min-h-16'

// ─── PropietarioDialog ────────────────────────────────────────────────────────

interface PropietarioFormData {
  nombreCompleto: string
  documento: string
  telefono: string
  email: string
  direccion: string
  comisionPorcentaje: string
}

function emptyPropietarioForm(): PropietarioFormData {
  return { nombreCompleto: '', documento: '', telefono: '', email: '', direccion: '', comisionPorcentaje: '' }
}

function propietarioToForm(p: Propietario): PropietarioFormData {
  return {
    nombreCompleto: p.nombreCompleto,
    documento: p.documento,
    telefono: p.telefono,
    email: p.email ?? '',
    direccion: p.direccion ?? '',
    comisionPorcentaje: String(p.comisionPorcentaje),
  }
}

interface PropietarioDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onSave: (data: Omit<Propietario, 'id' | 'createdAt'>) => void
  editData?: Propietario
}

export function PropietarioDialog({ open, onOpenChange, onSave, editData }: PropietarioDialogProps) {
  const [form, setForm] = useState<PropietarioFormData>(emptyPropietarioForm())

  useEffect(() => {
    if (open) setForm(editData ? propietarioToForm(editData) : emptyPropietarioForm())
  }, [open, editData])

  const esValido = form.nombreCompleto.trim().length > 0 && form.documento.trim().length > 0 && form.telefono.trim().length > 0

  function handleSave() {
    if (!esValido) return
    onSave({
      nombreCompleto: form.nombreCompleto.trim(),
      documento: form.documento.trim(),
      telefono: form.telefono.trim(),
      email: form.email.trim() || undefined,
      direccion: form.direccion.trim() || undefined,
      comisionPorcentaje: form.comisionPorcentaje ? parseFloat(form.comisionPorcentaje) : 0,
    })
    onOpenChange(false)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{editData ? 'Editar propietario' : 'Nuevo propietario'}</DialogTitle>
          <DialogDescription>Dueño real del inmueble -- recibe el alquiler menos la comisión de administración.</DialogDescription>
        </DialogHeader>

        <div className="grid gap-4 py-2">
          <div className="grid gap-1.5">
            <label className="text-sm font-medium">Nombre completo *</label>
            <input className={inputClass} value={form.nombreCompleto} onChange={(e) => setForm((f) => ({ ...f, nombreCompleto: e.target.value }))} autoFocus />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="grid gap-1.5">
              <label className="text-sm font-medium">Documento *</label>
              <input className={inputClass} value={form.documento} onChange={(e) => setForm((f) => ({ ...f, documento: e.target.value }))} />
            </div>
            <div className="grid gap-1.5">
              <label className="text-sm font-medium">Teléfono *</label>
              <input className={inputClass} value={form.telefono} onChange={(e) => setForm((f) => ({ ...f, telefono: e.target.value }))} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="grid gap-1.5">
              <label className="text-sm font-medium">Email</label>
              <input className={inputClass} type="email" value={form.email} onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))} />
            </div>
            <div className="grid gap-1.5">
              <label className="text-sm font-medium">% Comisión administración</label>
              <input className={inputClass} type="number" min={0} max={100} step={0.1} value={form.comisionPorcentaje} onChange={(e) => setForm((f) => ({ ...f, comisionPorcentaje: e.target.value }))} placeholder="Ej: 7.5" />
            </div>
          </div>
          <div className="grid gap-1.5">
            <label className="text-sm font-medium">Dirección</label>
            <input className={inputClass} value={form.direccion} onChange={(e) => setForm((f) => ({ ...f, direccion: e.target.value }))} />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button onClick={handleSave} disabled={!esValido}>{editData ? 'Guardar cambios' : 'Crear propietario'}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// ─── PropiedadDialog ──────────────────────────────────────────────────────────

interface PropiedadFormData {
  nombre: string
  direccion: string
  propietarioId: string
}

function emptyPropiedadForm(propietarioId?: string): PropiedadFormData {
  return { nombre: '', direccion: '', propietarioId: propietarioId ?? '' }
}

function propiedadToForm(p: Propiedad): PropiedadFormData {
  return { nombre: p.nombre, direccion: p.direccion ?? '', propietarioId: p.propietarioId }
}

interface PropiedadDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onSave: (data: Omit<Propiedad, 'id' | 'createdAt'>) => void
  editData?: Propiedad
  propietarios: Propietario[]
  propietarioIdPorDefecto?: string
}

export function PropiedadDialog({ open, onOpenChange, onSave, editData, propietarios, propietarioIdPorDefecto }: PropiedadDialogProps) {
  const [form, setForm] = useState<PropiedadFormData>(emptyPropiedadForm())

  useEffect(() => {
    if (open) setForm(editData ? propiedadToForm(editData) : emptyPropiedadForm(propietarioIdPorDefecto))
  }, [open, editData, propietarioIdPorDefecto])

  const esValido = form.nombre.trim().length > 0 && form.propietarioId.length > 0

  function handleSave() {
    if (!esValido) return
    onSave({ nombre: form.nombre.trim(), direccion: form.direccion.trim() || undefined, propietarioId: form.propietarioId })
    onOpenChange(false)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{editData ? 'Editar propiedad' : 'Nueva propiedad'}</DialogTitle>
          <DialogDescription>Un edificio o complejo -- agrupa las unidades que efectivamente se alquilan.</DialogDescription>
        </DialogHeader>

        <div className="grid gap-4 py-2">
          <div className="grid gap-1.5">
            <label className="text-sm font-medium">Nombre *</label>
            <input className={inputClass} value={form.nombre} onChange={(e) => setForm((f) => ({ ...f, nombre: e.target.value }))} placeholder="Ej: Departamentos Neuquén 550" autoFocus />
          </div>
          <div className="grid gap-1.5">
            <label className="text-sm font-medium">Propietario *</label>
            <select className={inputClass} value={form.propietarioId} onChange={(e) => setForm((f) => ({ ...f, propietarioId: e.target.value }))}>
              <option value="">Seleccionar...</option>
              {propietarios.map((p) => (
                <option key={p.id} value={p.id}>{p.nombreCompleto}</option>
              ))}
            </select>
            {propietarios.length === 0 && <p className="text-xs text-muted-foreground">Creá un propietario primero, en la pestaña "Propietarios".</p>}
          </div>
          <div className="grid gap-1.5">
            <label className="text-sm font-medium">Dirección</label>
            <input className={inputClass} value={form.direccion} onChange={(e) => setForm((f) => ({ ...f, direccion: e.target.value }))} />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button onClick={handleSave} disabled={!esValido}>{editData ? 'Guardar cambios' : 'Crear propiedad'}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// ─── UnidadDialog ─────────────────────────────────────────────────────────────

interface UnidadFormData {
  nombre: string
  tipo: TipoUnidad
  ambientes: string
  superficieM2: string
  extras: string
  estado: EstadoUnidad
}

function emptyUnidadForm(): UnidadFormData {
  return { nombre: '', tipo: 'departamento', ambientes: '', superficieM2: '', extras: '', estado: 'disponible' }
}

function unidadToForm(u: Unidad): UnidadFormData {
  return {
    nombre: u.nombre,
    tipo: u.tipo,
    ambientes: u.ambientes != null ? String(u.ambientes) : '',
    superficieM2: u.superficieM2 != null ? String(u.superficieM2) : '',
    extras: u.extras ?? '',
    estado: u.estado,
  }
}

interface UnidadDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onSave: (data: Omit<Unidad, 'id' | 'createdAt' | 'propiedadId'>) => void
  editData?: Unidad
  propiedadNombre: string
}

export function UnidadDialog({ open, onOpenChange, onSave, editData, propiedadNombre }: UnidadDialogProps) {
  const [form, setForm] = useState<UnidadFormData>(emptyUnidadForm())

  useEffect(() => {
    if (open) setForm(editData ? unidadToForm(editData) : emptyUnidadForm())
  }, [open, editData])

  const esValido = form.nombre.trim().length > 0

  function handleSave() {
    if (!esValido) return
    onSave({
      nombre: form.nombre.trim(),
      tipo: form.tipo,
      ambientes: form.ambientes ? parseInt(form.ambientes, 10) : undefined,
      superficieM2: form.superficieM2 ? parseFloat(form.superficieM2) : undefined,
      extras: form.extras.trim() || undefined,
      estado: form.estado,
    })
    onOpenChange(false)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{editData ? 'Editar unidad' : 'Nueva unidad'}</DialogTitle>
          <DialogDescription>Dentro de: {propiedadNombre}</DialogDescription>
        </DialogHeader>

        <div className="grid gap-4 py-2">
          <div className="grid grid-cols-2 gap-4">
            <div className="grid gap-1.5">
              <label className="text-sm font-medium">Nombre / número *</label>
              <input className={inputClass} value={form.nombre} onChange={(e) => setForm((f) => ({ ...f, nombre: e.target.value }))} placeholder="Ej: 1, 2, PB..." autoFocus />
            </div>
            <div className="grid gap-1.5">
              <label className="text-sm font-medium">Tipo</label>
              <select className={inputClass} value={form.tipo} onChange={(e) => setForm((f) => ({ ...f, tipo: e.target.value as TipoUnidad }))}>
                {TIPOS_UNIDAD.map((t) => (
                  <option key={t.value} value={t.value}>{t.label}</option>
                ))}
              </select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="grid gap-1.5">
              <label className="text-sm font-medium">Ambientes</label>
              <input className={inputClass} type="number" min={0} value={form.ambientes} onChange={(e) => setForm((f) => ({ ...f, ambientes: e.target.value }))} />
            </div>
            <div className="grid gap-1.5">
              <label className="text-sm font-medium">Superficie (m²)</label>
              <input className={inputClass} type="number" min={0} step={0.1} value={form.superficieM2} onChange={(e) => setForm((f) => ({ ...f, superficieM2: e.target.value }))} />
            </div>
          </div>
          <div className="grid gap-1.5">
            <label className="text-sm font-medium">Estado</label>
            <select className={inputClass} value={form.estado} onChange={(e) => setForm((f) => ({ ...f, estado: e.target.value as EstadoUnidad }))}>
              {ESTADOS_UNIDAD.map((e) => (
                <option key={e.value} value={e.value}>{e.label}</option>
              ))}
            </select>
          </div>
          <div className="grid gap-1.5">
            <label className="text-sm font-medium">Extras</label>
            <input className={inputClass} value={form.extras} onChange={(e) => setForm((f) => ({ ...f, extras: e.target.value }))} placeholder="Ej: con balcón, cochera incluida..." />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button onClick={handleSave} disabled={!esValido}>{editData ? 'Guardar cambios' : 'Crear unidad'}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// ─── InquilinoDialog ──────────────────────────────────────────────────────────

interface InquilinoFormData {
  nombre: string
  apellido: string
  documento: string
  direccion: string
  ciudad: string
  provincia: string
  codigoPostal: string
  telefono: string
  email: string
  montoAlquiler: string
  inicioContrato: string
  finContrato: string
  montoDeposito: string
  frecuenciaAjuste: string
  garantes: Garante[]
  notas: string
}

function emptyInquilinoForm(): InquilinoFormData {
  return {
    nombre: '', apellido: '', documento: '', direccion: '', ciudad: '', provincia: '', codigoPostal: '',
    telefono: '', email: '', montoAlquiler: '', inicioContrato: '', finContrato: '', montoDeposito: '',
    frecuenciaAjuste: '', garantes: [], notas: '',
  }
}

function inquilinoToForm(i: Inquilino): InquilinoFormData {
  return {
    nombre: i.nombre, apellido: i.apellido, documento: i.documento ?? '', direccion: i.direccion ?? '',
    ciudad: i.ciudad ?? '', provincia: i.provincia ?? '', codigoPostal: i.codigoPostal ?? '',
    telefono: i.telefono ?? '', email: i.email ?? '', montoAlquiler: String(i.montoAlquiler),
    inicioContrato: i.inicioContrato ?? '', finContrato: i.finContrato ?? '', montoDeposito: String(i.montoDeposito),
    frecuenciaAjuste: i.frecuenciaAjuste ?? '', garantes: i.garantes.map((g) => ({ ...g })), notas: i.notas ?? '',
  }
}

interface InquilinoDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onSave: (data: Omit<Inquilino, 'id' | 'createdAt' | 'unidadId'>) => void
  editData?: Inquilino
  unidadNombre: string
}

export function InquilinoDialog({ open, onOpenChange, onSave, editData, unidadNombre }: InquilinoDialogProps) {
  const [form, setForm] = useState<InquilinoFormData>(emptyInquilinoForm())

  useEffect(() => {
    if (open) setForm(editData ? inquilinoToForm(editData) : emptyInquilinoForm())
  }, [open, editData])

  const esValido = form.nombre.trim().length > 0 && form.apellido.trim().length > 0

  function handleAddGarante() {
    setForm((f) => ({ ...f, garantes: [...f.garantes, { nombre: '', apellido: '' }] }))
  }
  function handleUpdateGarante(idx: number, updates: Partial<Garante>) {
    setForm((f) => ({ ...f, garantes: f.garantes.map((g, i) => (i === idx ? { ...g, ...updates } : g)) }))
  }
  function handleDeleteGarante(idx: number) {
    setForm((f) => ({ ...f, garantes: f.garantes.filter((_, i) => i !== idx) }))
  }

  function handleSave() {
    if (!esValido) return
    onSave({
      nombre: form.nombre.trim(),
      apellido: form.apellido.trim(),
      documento: form.documento.trim() || undefined,
      direccion: form.direccion.trim() || undefined,
      ciudad: form.ciudad.trim() || undefined,
      provincia: form.provincia.trim() || undefined,
      codigoPostal: form.codigoPostal.trim() || undefined,
      telefono: form.telefono.trim() || undefined,
      email: form.email.trim() || undefined,
      montoAlquiler: form.montoAlquiler ? parseFloat(form.montoAlquiler) : 0,
      inicioContrato: form.inicioContrato || undefined,
      finContrato: form.finContrato || undefined,
      montoDeposito: form.montoDeposito ? parseFloat(form.montoDeposito) : 0,
      frecuenciaAjuste: form.frecuenciaAjuste.trim() || undefined,
      garantes: form.garantes.filter((g) => g.nombre.trim() || g.apellido.trim()),
      notas: form.notas.trim() || undefined,
    })
    onOpenChange(false)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{editData ? 'Editar inquilino' : 'Nuevo inquilino'}</DialogTitle>
          <DialogDescription>Unidad: {unidadNombre}</DialogDescription>
        </DialogHeader>

        <div className="grid gap-4 py-2">
          <div className="grid grid-cols-2 gap-4">
            <div className="grid gap-1.5">
              <label className="text-sm font-medium">Nombre *</label>
              <input className={inputClass} value={form.nombre} onChange={(e) => setForm((f) => ({ ...f, nombre: e.target.value }))} autoFocus />
            </div>
            <div className="grid gap-1.5">
              <label className="text-sm font-medium">Apellido *</label>
              <input className={inputClass} value={form.apellido} onChange={(e) => setForm((f) => ({ ...f, apellido: e.target.value }))} />
            </div>
          </div>
          <div className="grid grid-cols-3 gap-4">
            <div className="grid gap-1.5">
              <label className="text-sm font-medium">Documento</label>
              <input className={inputClass} value={form.documento} onChange={(e) => setForm((f) => ({ ...f, documento: e.target.value }))} />
            </div>
            <div className="grid gap-1.5">
              <label className="text-sm font-medium">Teléfono</label>
              <input className={inputClass} value={form.telefono} onChange={(e) => setForm((f) => ({ ...f, telefono: e.target.value }))} />
            </div>
            <div className="grid gap-1.5">
              <label className="text-sm font-medium">Email</label>
              <input className={inputClass} type="email" value={form.email} onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))} />
            </div>
          </div>
          <div className="grid grid-cols-3 gap-4">
            <div className="grid gap-1.5 col-span-2">
              <label className="text-sm font-medium">Dirección</label>
              <input className={inputClass} value={form.direccion} onChange={(e) => setForm((f) => ({ ...f, direccion: e.target.value }))} />
            </div>
            <div className="grid gap-1.5">
              <label className="text-sm font-medium">Ciudad</label>
              <input className={inputClass} value={form.ciudad} onChange={(e) => setForm((f) => ({ ...f, ciudad: e.target.value }))} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4 rounded-lg border p-4">
            <div className="grid gap-1.5">
              <label className="text-sm font-medium">Monto de alquiler</label>
              <input className={inputClass} type="number" min={0} step={0.01} value={form.montoAlquiler} onChange={(e) => setForm((f) => ({ ...f, montoAlquiler: e.target.value }))} />
            </div>
            <div className="grid gap-1.5">
              <label className="text-sm font-medium">Depósito</label>
              <input className={inputClass} type="number" min={0} step={0.01} value={form.montoDeposito} onChange={(e) => setForm((f) => ({ ...f, montoDeposito: e.target.value }))} />
            </div>
            <div className="grid gap-1.5">
              <label className="text-sm font-medium">Inicio de contrato</label>
              <input className={inputClass} type="date" value={form.inicioContrato} onChange={(e) => setForm((f) => ({ ...f, inicioContrato: e.target.value }))} />
            </div>
            <div className="grid gap-1.5">
              <label className="text-sm font-medium">Fin de contrato</label>
              <input className={inputClass} type="date" value={form.finContrato} onChange={(e) => setForm((f) => ({ ...f, finContrato: e.target.value }))} />
            </div>
            <div className="grid gap-1.5 col-span-2">
              <label className="text-sm font-medium">Frecuencia de ajuste</label>
              <input className={inputClass} value={form.frecuenciaAjuste} onChange={(e) => setForm((f) => ({ ...f, frecuenciaAjuste: e.target.value }))} placeholder="Ej: Trimestral, Mensual..." />
            </div>
          </div>

          {/* Garantes */}
          <div className="space-y-3 rounded-lg border p-4">
            <div className="flex items-center justify-between">
              <h4 className="text-sm font-semibold">Garantes</h4>
              <Button variant="outline" size="sm" onClick={handleAddGarante}>
                <Plus className="h-4 w-4 mr-1" />
                Agregar garante
              </Button>
            </div>
            {form.garantes.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-3 border border-dashed rounded-md">Sin garantes cargados.</p>
            ) : (
              <div className="space-y-2">
                {form.garantes.map((g, idx) => (
                  <div key={idx} className="grid grid-cols-[1fr_1fr_1fr_auto] gap-2 items-center">
                    <input className={cn(inputClass, 'text-xs')} value={g.nombre} onChange={(e) => handleUpdateGarante(idx, { nombre: e.target.value })} placeholder="Nombre" />
                    <input className={cn(inputClass, 'text-xs')} value={g.apellido} onChange={(e) => handleUpdateGarante(idx, { apellido: e.target.value })} placeholder="Apellido" />
                    <input className={cn(inputClass, 'text-xs')} value={g.telefono ?? ''} onChange={(e) => handleUpdateGarante(idx, { telefono: e.target.value })} placeholder="Teléfono" />
                    <Button variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground hover:text-red-500" onClick={() => handleDeleteGarante(idx)}>
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="grid gap-1.5">
            <label className="text-sm font-medium">Notas</label>
            <textarea className={textareaClass} value={form.notas} onChange={(e) => setForm((f) => ({ ...f, notas: e.target.value }))} />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button onClick={handleSave} disabled={!esValido}>{editData ? 'Guardar cambios' : 'Asignar inquilino'}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// ─── PagoDialog ───────────────────────────────────────────────────────────────

interface PagoFormData {
  fecha: string
  formaPago: FormaPago
  montoAlquiler: string
  montoTasas: string
  montoExpensas: string
  montoOtros: string
  concepto: string
  cbuAlias: string
  numeroRecibo: string
  notas: string
}

function emptyPagoForm(montoSugerido?: number): PagoFormData {
  return {
    fecha: '', formaPago: 'transferencia', montoAlquiler: montoSugerido != null ? String(montoSugerido) : '',
    montoTasas: '0', montoExpensas: '0', montoOtros: '0', concepto: '', cbuAlias: '', numeroRecibo: '', notas: '',
  }
}

interface PagoDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onSave: (data: {
    fecha: string
    formaPago: FormaPago
    montoAlquiler: number
    montoTasas: number
    montoExpensas: number
    montoOtros: number
    concepto?: string
    datosBancarios?: { cbuAlias?: string }
    numeroRecibo?: string
    notas?: string
  }) => void
  inquilinoNombre: string
  comisionPorcentaje: number
  montoAlquilerSugerido?: number
}

export function PagoDialog({ open, onOpenChange, onSave, inquilinoNombre, comisionPorcentaje, montoAlquilerSugerido }: PagoDialogProps) {
  const [form, setForm] = useState<PagoFormData>(emptyPagoForm())

  useEffect(() => {
    if (open) setForm(emptyPagoForm(montoAlquilerSugerido))
  }, [open, montoAlquilerSugerido])

  const total =
    (parseFloat(form.montoAlquiler) || 0) + (parseFloat(form.montoTasas) || 0) + (parseFloat(form.montoExpensas) || 0) + (parseFloat(form.montoOtros) || 0)
  const comisionAdmin = total * (comisionPorcentaje / 100)
  const saldoPropietario = total - comisionAdmin

  const esValido = form.fecha.length > 0 && total > 0

  function handleSave() {
    if (!esValido) return
    onSave({
      fecha: form.fecha,
      formaPago: form.formaPago,
      montoAlquiler: parseFloat(form.montoAlquiler) || 0,
      montoTasas: parseFloat(form.montoTasas) || 0,
      montoExpensas: parseFloat(form.montoExpensas) || 0,
      montoOtros: parseFloat(form.montoOtros) || 0,
      concepto: form.concepto.trim() || undefined,
      datosBancarios: form.cbuAlias.trim() ? { cbuAlias: form.cbuAlias.trim() } : undefined,
      numeroRecibo: form.numeroRecibo.trim() || undefined,
      notas: form.notas.trim() || undefined,
    })
    onOpenChange(false)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Nueva cobranza</DialogTitle>
          <DialogDescription>Inquilino: {inquilinoNombre}</DialogDescription>
        </DialogHeader>

        <div className="grid gap-4 py-2">
          <div className="grid grid-cols-2 gap-4">
            <div className="grid gap-1.5">
              <label className="text-sm font-medium">Fecha *</label>
              <input className={inputClass} type="date" value={form.fecha} onChange={(e) => setForm((f) => ({ ...f, fecha: e.target.value }))} autoFocus />
            </div>
            <div className="grid gap-1.5">
              <label className="text-sm font-medium">Forma de pago</label>
              <select className={inputClass} value={form.formaPago} onChange={(e) => setForm((f) => ({ ...f, formaPago: e.target.value as FormaPago }))}>
                {FORMAS_PAGO.map((fp) => (
                  <option key={fp.value} value={fp.value}>{fp.label}</option>
                ))}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4 rounded-lg border p-4">
            <div className="grid gap-1.5">
              <label className="text-sm font-medium">Alquiler</label>
              <input className={inputClass} type="number" min={0} step={0.01} value={form.montoAlquiler} onChange={(e) => setForm((f) => ({ ...f, montoAlquiler: e.target.value }))} />
            </div>
            <div className="grid gap-1.5">
              <label className="text-sm font-medium">Tasas</label>
              <input className={inputClass} type="number" min={0} step={0.01} value={form.montoTasas} onChange={(e) => setForm((f) => ({ ...f, montoTasas: e.target.value }))} />
            </div>
            <div className="grid gap-1.5">
              <label className="text-sm font-medium">Expensas</label>
              <input className={inputClass} type="number" min={0} step={0.01} value={form.montoExpensas} onChange={(e) => setForm((f) => ({ ...f, montoExpensas: e.target.value }))} />
            </div>
            <div className="grid gap-1.5">
              <label className="text-sm font-medium">Otros</label>
              <input className={inputClass} type="number" min={0} step={0.01} value={form.montoOtros} onChange={(e) => setForm((f) => ({ ...f, montoOtros: e.target.value }))} />
            </div>
          </div>

          {form.formaPago === 'transferencia' && (
            <div className="grid gap-1.5">
              <label className="text-sm font-medium">CBU / Alias</label>
              <input className={inputClass} value={form.cbuAlias} onChange={(e) => setForm((f) => ({ ...f, cbuAlias: e.target.value }))} />
            </div>
          )}

          <div className="grid gap-1.5">
            <label className="text-sm font-medium">Concepto</label>
            <input className={inputClass} value={form.concepto} onChange={(e) => setForm((f) => ({ ...f, concepto: e.target.value }))} placeholder="Ej: Alquiler sep 2026 + Extras" />
          </div>

          <div className="rounded-lg border bg-muted/30 p-4 text-sm space-y-1">
            <div className="flex justify-between"><span className="text-muted-foreground">Total cobrado</span><span className="font-medium tabular-nums">{total.toLocaleString('es-AR', { style: 'currency', currency: 'ARS' })}</span></div>
            <div className="flex justify-between"><span className="text-muted-foreground">Comisión administración ({comisionPorcentaje}%)</span><span className="tabular-nums">{comisionAdmin.toLocaleString('es-AR', { style: 'currency', currency: 'ARS' })}</span></div>
            <div className="flex justify-between font-semibold"><span>Neto para el propietario</span><span className="tabular-nums">{saldoPropietario.toLocaleString('es-AR', { style: 'currency', currency: 'ARS' })}</span></div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button onClick={handleSave} disabled={!esValido}>Registrar cobranza</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
