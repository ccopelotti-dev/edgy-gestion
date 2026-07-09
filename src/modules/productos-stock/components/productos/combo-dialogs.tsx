'use client'

import { useEffect, useState } from 'react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Plus, Trash2 } from 'lucide-react'
import type { Combo, ComboComponenteFijo, ComboComponenteEleccion, Producto, Rubro } from '../../types'

const inputClass =
  'flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm'

// ─── ids client-side para componentes nuevos (mismo patrón que variantes) ────

let _cSeq = 0
function cUid(): string {
  return `combo-${Date.now()}-${++_cSeq}-${Math.random().toString(36).slice(2, 7)}`
}

// ─── ComboDialog ──────────────────────────────────────────────────────────────
//
// Fase 5 del refactor de Productos. Un combo agrupa componentes FIJOS
// (producto + cantidad exacta) y slots de ELECCIÓN (rubro + cantidad a
// elegir de ese rubro, ej. "elegí 1 bebida"). El precio es fijo, cargado a
// mano -- no se calcula a partir del costo/precio de los componentes. El
// combo no maneja stock propio (ver comentario en types/index.ts).

type ComboFormData = Omit<Combo, 'id' | 'createdAt'>

interface ComboDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onSave: (data: ComboFormData) => void
  productos: Producto[]
  rubros: Rubro[]
  editData?: Combo
}

const emptyCombo: ComboFormData = {
  nombre: '',
  descripcion: '',
  precioVenta: 0,
  disponible: true,
  componentesFijos: [],
  componentesEleccion: [],
}

export function ComboDialog({
  open,
  onOpenChange,
  onSave,
  productos,
  rubros,
  editData,
}: ComboDialogProps) {
  const [form, setForm] = useState<ComboFormData>(emptyCombo)

  useEffect(() => {
    if (open) {
      if (editData) {
        const { id, createdAt, ...rest } = editData
        setForm({
          ...rest,
          componentesFijos: rest.componentesFijos.map((cf) => ({ ...cf })),
          componentesEleccion: rest.componentesEleccion.map((ce) => ({ ...ce })),
        })
      } else {
        setForm(emptyCombo)
      }
    }
  }, [open, editData])

  function update<K extends keyof ComboFormData>(key: K, value: ComboFormData[K]) {
    setForm((prev) => ({ ...prev, [key]: value }))
  }

  // ── Componentes fijos ─────────────────────────────────────────────────────
  function handleAddFijo() {
    setForm((f) => ({
      ...f,
      componentesFijos: [
        ...f.componentesFijos,
        { id: cUid(), productoId: '', cantidad: 1 },
      ],
    }))
  }

  function handleUpdateFijo(id: string, updates: Partial<ComboComponenteFijo>) {
    setForm((f) => ({
      ...f,
      componentesFijos: f.componentesFijos.map((cf) =>
        cf.id === id ? { ...cf, ...updates } : cf,
      ),
    }))
  }

  function handleDeleteFijo(id: string) {
    setForm((f) => ({
      ...f,
      componentesFijos: f.componentesFijos.filter((cf) => cf.id !== id),
    }))
  }

  // ── Componentes a elección ────────────────────────────────────────────────
  function handleAddEleccion() {
    setForm((f) => ({
      ...f,
      componentesEleccion: [
        ...f.componentesEleccion,
        { id: cUid(), rubroId: '', cantidad: 1 },
      ],
    }))
  }

  function handleUpdateEleccion(id: string, updates: Partial<ComboComponenteEleccion>) {
    setForm((f) => ({
      ...f,
      componentesEleccion: f.componentesEleccion.map((ce) =>
        ce.id === id ? { ...ce, ...updates } : ce,
      ),
    }))
  }

  function handleDeleteEleccion(id: string) {
    setForm((f) => ({
      ...f,
      componentesEleccion: f.componentesEleccion.filter((ce) => ce.id !== id),
    }))
  }

  const componentesValidos =
    form.componentesFijos.every((cf) => cf.productoId && cf.cantidad > 0) &&
    form.componentesEleccion.every((ce) => ce.rubroId && ce.cantidad > 0)

  const tieneComponentes =
    form.componentesFijos.length > 0 || form.componentesEleccion.length > 0

  function handleSave() {
    if (!form.nombre.trim()) return
    if (!tieneComponentes || !componentesValidos) return
    onSave({
      ...form,
      nombre: form.nombre.trim(),
      descripcion: form.descripcion.trim(),
    })
    onOpenChange(false)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{editData ? 'Editar combo' : 'Nuevo combo'}</DialogTitle>
          <DialogDescription>
            Agrupa productos existentes en un ítem vendible a precio fijo. El combo no
            maneja stock propio -- descuenta el de sus componentes al venderse (fase futura).
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4 py-4">
          {/* Nombre */}
          <div className="grid gap-1.5">
            <label className="text-sm font-medium">Nombre *</label>
            <input
              className={inputClass}
              value={form.nombre}
              onChange={(e) => update('nombre', e.target.value)}
              placeholder="Ej: Combo Menú"
              autoFocus
            />
          </div>

          {/* Descripcion */}
          <div className="grid gap-1.5">
            <label className="text-sm font-medium">Descripción</label>
            <textarea
              className={`${inputClass} min-h-[50px] resize-y`}
              value={form.descripcion}
              onChange={(e) => update('descripcion', e.target.value)}
              placeholder="Descripción opcional"
              rows={2}
            />
          </div>

          {/* Precio y disponible */}
          <div className="grid grid-cols-2 gap-4 items-end">
            <div className="grid gap-1.5">
              <label className="text-sm font-medium">Precio de venta *</label>
              <input
                className={inputClass}
                type="number"
                min={0}
                step={0.01}
                value={form.precioVenta || ''}
                onChange={(e) => update('precioVenta', parseFloat(e.target.value) || 0)}
              />
            </div>
            <label className="flex items-center gap-2 text-sm pb-2">
              <input
                type="checkbox"
                checked={form.disponible}
                onChange={(e) => update('disponible', e.target.checked)}
                className="rounded border-input"
              />
              Disponible
            </label>
          </div>

          {/* Componentes fijos */}
          <div className="space-y-3 rounded-lg border p-4">
            <div className="flex items-center justify-between">
              <h4 className="text-sm font-semibold">Componentes fijos</h4>
              <Button type="button" variant="outline" size="sm" onClick={handleAddFijo}>
                <Plus className="h-4 w-4 mr-1" />
                Agregar producto
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              Productos que siempre forman parte del combo, con la cantidad exacta.
            </p>

            {form.componentesFijos.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-3 border border-dashed rounded-md">
                Sin componentes fijos.
              </p>
            ) : (
              <div className="space-y-2">
                {form.componentesFijos.map((cf) => (
                  <div key={cf.id} className="flex items-end gap-2">
                    <div className="grid gap-1 flex-1">
                      <label className="text-xs text-muted-foreground">Producto</label>
                      <select
                        className={inputClass}
                        value={cf.productoId}
                        onChange={(e) => handleUpdateFijo(cf.id, { productoId: e.target.value })}
                      >
                        <option value="">Seleccionar...</option>
                        {productos.map((p) => (
                          <option key={p.id} value={p.id}>
                            {p.nombre}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div className="grid gap-1 w-24">
                      <label className="text-xs text-muted-foreground">Cantidad</label>
                      <input
                        className={inputClass}
                        type="number"
                        min={1}
                        step={1}
                        value={cf.cantidad || ''}
                        onChange={(e) =>
                          handleUpdateFijo(cf.id, { cantidad: parseInt(e.target.value, 10) || 0 })
                        }
                      />
                    </div>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="h-9 w-9 text-muted-foreground hover:text-red-500"
                      onClick={() => handleDeleteFijo(cf.id)}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Componentes a elección */}
          <div className="space-y-3 rounded-lg border p-4">
            <div className="flex items-center justify-between">
              <h4 className="text-sm font-semibold">A elección del cliente</h4>
              <Button type="button" variant="outline" size="sm" onClick={handleAddEleccion}>
                <Plus className="h-4 w-4 mr-1" />
                Agregar slot
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              Ej: "elegí 1 bebida" -- se define el rubro y cuántos ítems de ese rubro elige el
              cliente. La elección real sucede al vender el combo (fase futura).
            </p>

            {form.componentesEleccion.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-3 border border-dashed rounded-md">
                Sin slots a elección.
              </p>
            ) : (
              <div className="space-y-2">
                {form.componentesEleccion.map((ce) => (
                  <div key={ce.id} className="flex items-end gap-2">
                    <div className="grid gap-1 flex-1">
                      <label className="text-xs text-muted-foreground">Rubro</label>
                      <select
                        className={inputClass}
                        value={ce.rubroId}
                        onChange={(e) => handleUpdateEleccion(ce.id, { rubroId: e.target.value })}
                      >
                        <option value="">Seleccionar...</option>
                        {rubros.map((r) => (
                          <option key={r.id} value={r.id}>
                            {r.nombre}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div className="grid gap-1 w-32">
                      <label className="text-xs text-muted-foreground">Cant. a elegir</label>
                      <input
                        className={inputClass}
                        type="number"
                        min={1}
                        step={1}
                        value={ce.cantidad || ''}
                        onChange={(e) =>
                          handleUpdateEleccion(ce.id, {
                            cantidad: parseInt(e.target.value, 10) || 0,
                          })
                        }
                      />
                    </div>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="h-9 w-9 text-muted-foreground hover:text-red-500"
                      onClick={() => handleDeleteEleccion(ce.id)}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {!tieneComponentes && (
            <p className="text-xs text-red-500">
              Agregá al menos un componente fijo o un slot a elección.
            </p>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button
            onClick={handleSave}
            disabled={
              !form.nombre.trim() ||
              form.precioVenta <= 0 ||
              !tieneComponentes ||
              !componentesValidos
            }
          >
            {editData ? 'Guardar cambios' : 'Crear combo'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
