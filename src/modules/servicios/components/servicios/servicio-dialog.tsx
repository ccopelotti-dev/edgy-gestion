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
import { Switch } from '@/components/ui/switch'
import { cn } from '@/lib/utils'
import type {
  Servicio,
  RubroServicio,
  SubRubroServicio,
  TipoServicio,
  ModalidadPrecio,
  VarianteServicio,
} from '../../types'
import { MODALIDADES_PRECIO } from '../../types'

const inputClass =
  'flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm'
const textareaClass =
  'flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm min-h-20'

let _vSeq = 0
function vUid(): string {
  return `var-${Date.now()}-${++_vSeq}-${Math.random().toString(36).slice(2, 7)}`
}

interface FormData {
  titulo: string
  descripcion: string
  rubroId: string
  subRubroId: string
  tipo: TipoServicio
  estado: Servicio['estado']
  imagenUrl: string
  modalidadPrecio: ModalidadPrecio
  precio: string
  duracionEstimadaMin: string
  variantes: VarianteServicio[]
}

function emptyForm(): FormData {
  return {
    titulo: '',
    descripcion: '',
    rubroId: '',
    subRubroId: '',
    tipo: 'unico',
    estado: 'activo',
    imagenUrl: '',
    modalidadPrecio: 'fijo',
    precio: '',
    duracionEstimadaMin: '',
    variantes: [],
  }
}

function servicioToForm(s: Servicio): FormData {
  return {
    titulo: s.titulo,
    descripcion: s.descripcion,
    rubroId: s.rubroId,
    subRubroId: s.subRubroId ?? '',
    tipo: s.tipo,
    estado: s.estado,
    imagenUrl: s.imagenUrl ?? '',
    modalidadPrecio: s.modalidadPrecio ?? 'fijo',
    precio: s.precio != null ? String(s.precio) : '',
    duracionEstimadaMin: s.duracionEstimadaMin != null ? String(s.duracionEstimadaMin) : '',
    variantes: s.variantes.map((v) => ({ ...v })),
  }
}

interface ServicioDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onSave: (data: Omit<Servicio, 'id' | 'createdAt'>) => void
  editData?: Servicio
  rubros: RubroServicio[]
  subRubros: SubRubroServicio[]
}

export function ServicioDialog({
  open,
  onOpenChange,
  onSave,
  editData,
  rubros,
  subRubros,
}: ServicioDialogProps) {
  const [form, setForm] = useState<FormData>(emptyForm())

  useEffect(() => {
    if (open) {
      setForm(editData ? servicioToForm(editData) : emptyForm())
    }
  }, [open, editData])

  const subRubrosDelRubro = subRubros.filter((sr) => sr.rubroId === form.rubroId)

  function handleRubroChange(rubroId: string) {
    setForm((f) => ({ ...f, rubroId, subRubroId: '' }))
  }

  function handleAddVariante() {
    setForm((f) => ({
      ...f,
      variantes: [
        ...f.variantes,
        { id: vUid(), nombre: '', modalidadPrecio: 'fijo', precio: undefined },
      ],
    }))
  }

  function handleUpdateVariante(id: string, updates: Partial<VarianteServicio>) {
    setForm((f) => ({
      ...f,
      variantes: f.variantes.map((v) => (v.id === id ? { ...v, ...updates } : v)),
    }))
  }

  function handleDeleteVariante(id: string) {
    setForm((f) => ({ ...f, variantes: f.variantes.filter((v) => v.id !== id) }))
  }

  const esValido =
    form.titulo.trim().length > 0 &&
    form.rubroId.length > 0 &&
    (form.tipo === 'unico' || form.variantes.every((v) => v.nombre.trim().length > 0))

  function handleSave() {
    if (!esValido) return

    const base = {
      titulo: form.titulo.trim(),
      descripcion: form.descripcion.trim(),
      rubroId: form.rubroId,
      subRubroId: form.subRubroId || undefined,
      tipo: form.tipo,
      estado: form.estado,
      imagenUrl: form.imagenUrl.trim() || undefined,
    }

    if (form.tipo === 'unico') {
      onSave({
        ...base,
        modalidadPrecio: form.modalidadPrecio,
        precio:
          form.modalidadPrecio !== 'a_convenir' && form.precio !== ''
            ? parseFloat(form.precio)
            : undefined,
        duracionEstimadaMin: form.duracionEstimadaMin
          ? parseInt(form.duracionEstimadaMin, 10)
          : undefined,
        variantes: [],
      })
    } else {
      onSave({
        ...base,
        modalidadPrecio: undefined,
        precio: undefined,
        duracionEstimadaMin: undefined,
        variantes: form.variantes.map((v) => ({
          ...v,
          nombre: v.nombre.trim(),
        })),
      })
    }

    onOpenChange(false)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{editData ? 'Editar servicio' : 'Nuevo servicio'}</DialogTitle>
          <DialogDescription>
            Información principal, precio y variantes del servicio ofrecido.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-5 py-2">
          {/* Tipo de servicio */}
          <div className="grid gap-1.5">
            <label className="text-sm font-medium">Tipo de servicio</label>
            <div className="flex gap-4">
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="radio"
                  checked={form.tipo === 'unico'}
                  onChange={() => setForm((f) => ({ ...f, tipo: 'unico' }))}
                />
                Único
              </label>
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="radio"
                  checked={form.tipo === 'con_variantes'}
                  onChange={() => setForm((f) => ({ ...f, tipo: 'con_variantes' }))}
                />
                Con variantes
              </label>
            </div>
          </div>

          {/* Título */}
          <div className="grid gap-1.5">
            <label className="text-sm font-medium">Título *</label>
            <input
              className={inputClass}
              value={form.titulo}
              onChange={(e) => setForm((f) => ({ ...f, titulo: e.target.value }))}
              placeholder="Ej: Consulta médica"
            />
          </div>

          {/* Rubro / Sub-rubro */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="grid gap-1.5">
              <label className="text-sm font-medium">Rubro *</label>
              <select
                className={inputClass}
                value={form.rubroId}
                onChange={(e) => handleRubroChange(e.target.value)}
              >
                <option value="">Seleccionar...</option>
                {rubros.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.nombre}
                  </option>
                ))}
              </select>
              {rubros.length === 0 && (
                <p className="text-xs text-muted-foreground">
                  Creá un rubro primero, en la pestaña "Rubros".
                </p>
              )}
            </div>
            <div className="grid gap-1.5">
              <label className="text-sm font-medium">Sub-rubro</label>
              <select
                className={inputClass}
                value={form.subRubroId}
                onChange={(e) => setForm((f) => ({ ...f, subRubroId: e.target.value }))}
                disabled={!form.rubroId}
              >
                <option value="">Sin sub-rubro</option>
                {subRubrosDelRubro.map((sr) => (
                  <option key={sr.id} value={sr.id}>
                    {sr.nombre}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Estado */}
          <div className="flex items-center gap-3">
            <Switch
              checked={form.estado === 'activo'}
              onChange={(checked) =>
                setForm((f) => ({ ...f, estado: checked ? 'activo' : 'inactivo' }))
              }
            />
            <span className="text-sm font-medium">
              {form.estado === 'activo' ? 'Activo' : 'Inactivo'}
            </span>
          </div>

          {/* Descripción */}
          <div className="grid gap-1.5">
            <label className="text-sm font-medium">Descripción</label>
            <textarea
              className={textareaClass}
              value={form.descripcion}
              onChange={(e) => setForm((f) => ({ ...f, descripcion: e.target.value }))}
              placeholder="Detalle del servicio ofrecido..."
            />
          </div>

          {/* Imagen */}
          <div className="grid gap-1.5">
            <label className="text-sm font-medium">Imagen (URL)</label>
            <input
              className={inputClass}
              value={form.imagenUrl}
              onChange={(e) => setForm((f) => ({ ...f, imagenUrl: e.target.value }))}
              placeholder="https://..."
            />
          </div>

          {/* Precio: único o variantes */}
          {form.tipo === 'unico' ? (
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 rounded-lg border p-4">
              <div className="grid gap-1.5">
                <label className="text-sm font-medium">Modalidad de precio</label>
                <select
                  className={inputClass}
                  value={form.modalidadPrecio}
                  onChange={(e) =>
                    setForm((f) => ({
                      ...f,
                      modalidadPrecio: e.target.value as ModalidadPrecio,
                    }))
                  }
                >
                  {MODALIDADES_PRECIO.map((m) => (
                    <option key={m.value} value={m.value}>
                      {m.label}
                    </option>
                  ))}
                </select>
              </div>
              <div className="grid gap-1.5">
                <label className="text-sm font-medium">Precio</label>
                <input
                  className={inputClass}
                  type="number"
                  min={0}
                  step={0.01}
                  value={form.precio}
                  disabled={form.modalidadPrecio === 'a_convenir'}
                  onChange={(e) => setForm((f) => ({ ...f, precio: e.target.value }))}
                  placeholder={form.modalidadPrecio === 'a_convenir' ? 'A convenir' : '0.00'}
                />
              </div>
              <div className="grid gap-1.5">
                <label className="text-sm font-medium">Duración estimada (min)</label>
                <input
                  className={inputClass}
                  type="number"
                  min={0}
                  value={form.duracionEstimadaMin}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, duracionEstimadaMin: e.target.value }))
                  }
                  placeholder="Opcional"
                />
              </div>
            </div>
          ) : (
            <div className="space-y-3 rounded-lg border p-4">
              <div className="flex items-center justify-between">
                <h4 className="text-sm font-semibold">Variantes</h4>
                <Button variant="outline" size="sm" onClick={handleAddVariante}>
                  <Plus className="h-4 w-4 mr-1" />
                  Agregar variante
                </Button>
              </div>

              {form.variantes.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-4 border border-dashed rounded-md">
                  Sin variantes. Agregá al menos una (ej: "Primera vez", "Control").
                </p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b text-left text-muted-foreground">
                        <th className="px-2 py-2 font-medium">Nombre</th>
                        <th className="px-2 py-2 font-medium w-36">Modalidad</th>
                        <th className="px-2 py-2 font-medium w-28 text-right">Precio</th>
                        <th className="px-2 py-2 font-medium w-24 text-right">Min.</th>
                        <th className="px-2 py-2 w-10" />
                      </tr>
                    </thead>
                    <tbody>
                      {form.variantes.map((v) => (
                        <tr key={v.id} className="border-b last:border-0">
                          <td className="px-2 py-2">
                            <input
                              className={cn(inputClass, 'text-xs')}
                              value={v.nombre}
                              onChange={(e) =>
                                handleUpdateVariante(v.id, { nombre: e.target.value })
                              }
                              placeholder="Ej: Primera vez"
                            />
                          </td>
                          <td className="px-2 py-2">
                            <select
                              className={cn(inputClass, 'text-xs')}
                              value={v.modalidadPrecio}
                              onChange={(e) =>
                                handleUpdateVariante(v.id, {
                                  modalidadPrecio: e.target.value as ModalidadPrecio,
                                })
                              }
                            >
                              {MODALIDADES_PRECIO.map((m) => (
                                <option key={m.value} value={m.value}>
                                  {m.label}
                                </option>
                              ))}
                            </select>
                          </td>
                          <td className="px-2 py-2">
                            <input
                              className={cn(inputClass, 'text-xs text-right')}
                              type="number"
                              min={0}
                              step={0.01}
                              value={v.precio ?? ''}
                              disabled={v.modalidadPrecio === 'a_convenir'}
                              onChange={(e) =>
                                handleUpdateVariante(v.id, {
                                  precio: e.target.value ? parseFloat(e.target.value) : undefined,
                                })
                              }
                            />
                          </td>
                          <td className="px-2 py-2">
                            <input
                              className={cn(inputClass, 'text-xs text-right')}
                              type="number"
                              min={0}
                              value={v.duracionEstimadaMin ?? ''}
                              onChange={(e) =>
                                handleUpdateVariante(v.id, {
                                  duracionEstimadaMin: e.target.value
                                    ? parseInt(e.target.value, 10)
                                    : undefined,
                                })
                              }
                            />
                          </td>
                          <td className="px-2 py-2">
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-7 w-7 text-muted-foreground hover:text-red-500"
                              onClick={() => handleDeleteVariante(v.id)}
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button onClick={handleSave} disabled={!esValido}>
            {editData ? 'Guardar cambios' : 'Crear servicio'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
