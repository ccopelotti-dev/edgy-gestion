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
import { Loader2 } from 'lucide-react'
import type { Rubro, PlantillaGarantia } from '../../types'

const inputClass =
  'flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm'

// ─── RubroDialog ──────────────────────────────────────────────────────────────

interface RubroFormData {
  nombre: string
  tipo: Rubro['tipo']
  /** Garantía default para todos los productos de este rubro (Fase 4). */
  plantillaGarantiaId?: string
  /** Solo de UI -- gatilla si se muestra el selector de plantilla. La
   * mayoría de los rubros no tiene garantía, así que por defecto el
   * selector queda oculto en vez de mostrar un desplegable con "Sin
   * garantía" como una opción más (Fase 41: opt-in explícito). */
  tieneGarantia: boolean
}

interface RubroDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** Guardado confirmado: espera la escritura real en Supabase antes de
   * cerrar. Devuelve un mensaje de error si falló. */
  onSave: (data: Omit<RubroFormData, 'tieneGarantia'>) => Promise<string | void>
  editData?: Rubro
  plantillasGarantia: PlantillaGarantia[]
}

const emptyRubro: RubroFormData = {
  nombre: '',
  tipo: 'ambos',
  plantillaGarantiaId: undefined,
  tieneGarantia: false,
}

export function RubroDialog({
  open,
  onOpenChange,
  onSave,
  editData,
  plantillasGarantia,
}: RubroDialogProps) {
  const [form, setForm] = useState<RubroFormData>(emptyRubro)
  const [guardando, setGuardando] = useState(false)
  const [errorGuardado, setErrorGuardado] = useState('')

  useEffect(() => {
    if (open) {
      setForm(
        editData
          ? {
              nombre: editData.nombre,
              tipo: editData.tipo,
              plantillaGarantiaId: editData.plantillaGarantiaId,
              tieneGarantia: !!editData.plantillaGarantiaId,
            }
          : emptyRubro,
      )
      setGuardando(false)
      setErrorGuardado('')
    }
  }, [open, editData])

  const garantiaIncompleta = form.tieneGarantia && !form.plantillaGarantiaId

  async function handleSave() {
    if (!form.nombre.trim() || garantiaIncompleta || guardando) return
    setErrorGuardado('')
    setGuardando(true)
    const error = await onSave({
      nombre: form.nombre.trim(),
      tipo: form.tipo,
      plantillaGarantiaId: form.tieneGarantia ? form.plantillaGarantiaId : undefined,
    })
    setGuardando(false)
    if (error) {
      setErrorGuardado(error)
      return
    }
    onOpenChange(false)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{editData ? 'Editar rubro' : 'Nuevo rubro'}</DialogTitle>
          <DialogDescription>
            El rubro clasifica productos, insumos o ambos (ej: Bebidas, Panificados).
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4 py-4">
          <div className="grid gap-1.5">
            <label className="text-sm font-medium">Nombre *</label>
            <input
              className={inputClass}
              value={form.nombre}
              onChange={(e) => setForm({ ...form, nombre: e.target.value })}
              placeholder="Ej: Bebidas"
            />
          </div>

          <div className="grid gap-1.5">
            <label className="text-sm font-medium">Aplica a</label>
            <select
              className={inputClass}
              value={form.tipo}
              onChange={(e) => setForm({ ...form, tipo: e.target.value as Rubro['tipo'] })}
            >
              <option value="ambos">Productos e insumos</option>
              <option value="producto">Solo productos</option>
              <option value="insumo">Solo insumos</option>
            </select>
          </div>

          <div className="grid gap-1.5">
            <label className="flex items-center gap-2 text-sm font-medium">
              <input
                type="checkbox"
                className="h-4 w-4 rounded border-input"
                checked={form.tieneGarantia}
                onChange={(e) => {
                  const tieneGarantia = e.target.checked
                  setForm({
                    ...form,
                    tieneGarantia,
                    plantillaGarantiaId: tieneGarantia ? form.plantillaGarantiaId : undefined,
                  })
                }}
              />
              Los productos de este rubro tienen garantía
            </label>

            {form.tieneGarantia && (
              <>
                {plantillasGarantia.length === 0 ? (
                  <p className="text-xs text-amber-600">
                    Todavía no cargaste ninguna plantilla de garantía -- creá una primero en la
                    pestaña Garantías.
                  </p>
                ) : (
                  <>
                    <select
                      className={inputClass}
                      value={form.plantillaGarantiaId ?? ''}
                      onChange={(e) =>
                        setForm({ ...form, plantillaGarantiaId: e.target.value || undefined })
                      }
                    >
                      <option value="">Elegí una plantilla...</option>
                      {plantillasGarantia.map((pg) => (
                        <option key={pg.id} value={pg.id}>
                          {pg.nombre} ({pg.duracionMeses} {pg.duracionMeses === 1 ? 'mes' : 'meses'})
                        </option>
                      ))}
                    </select>
                    <p className="text-xs text-muted-foreground">
                      Se aplica a todos los productos de este rubro, salvo que un producto puntual
                      tenga su propia garantía asignada.
                    </p>
                  </>
                )}
              </>
            )}
          </div>

          {errorGuardado && (
            <div className="rounded-md bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-900 px-3 py-2 text-sm text-red-700 dark:text-red-400">
              {errorGuardado}
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={guardando}>
            Cancelar
          </Button>
          <Button onClick={handleSave} disabled={!form.nombre.trim() || garantiaIncompleta || guardando}>
            {guardando && <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />}
            {editData ? 'Guardar cambios' : 'Crear rubro'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// ─── SubRubroDialog ───────────────────────────────────────────────────────────

interface SubRubroFormData {
  nombre: string
}

interface SubRubroDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onSave: (data: SubRubroFormData) => Promise<string | void>
  rubroNombre: string
  editData?: { nombre: string }
}

export function SubRubroDialog({
  open,
  onOpenChange,
  onSave,
  rubroNombre,
  editData,
}: SubRubroDialogProps) {
  const [nombre, setNombre] = useState('')
  const [guardando, setGuardando] = useState(false)
  const [errorGuardado, setErrorGuardado] = useState('')

  useEffect(() => {
    if (open) {
      setNombre(editData?.nombre ?? '')
      setGuardando(false)
      setErrorGuardado('')
    }
  }, [open, editData])

  async function handleSave() {
    if (!nombre.trim() || guardando) return
    setErrorGuardado('')
    setGuardando(true)
    const error = await onSave({ nombre: nombre.trim() })
    setGuardando(false)
    if (error) {
      setErrorGuardado(error)
      return
    }
    onOpenChange(false)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{editData ? 'Editar sub-rubro' : 'Nuevo sub-rubro'}</DialogTitle>
          <DialogDescription>Dentro de: {rubroNombre}</DialogDescription>
        </DialogHeader>

        <div className="grid gap-4 py-4">
          <div className="grid gap-1.5">
            <label className="text-sm font-medium">Nombre *</label>
            <input
              className={inputClass}
              value={nombre}
              onChange={(e) => setNombre(e.target.value)}
              placeholder="Ej: Gaseosas"
              autoFocus
            />
          </div>

          {errorGuardado && (
            <div className="rounded-md bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-900 px-3 py-2 text-sm text-red-700 dark:text-red-400">
              {errorGuardado}
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={guardando}>
            Cancelar
          </Button>
          <Button onClick={handleSave} disabled={!nombre.trim() || guardando}>
            {guardando && <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />}
            {editData ? 'Guardar cambios' : 'Crear sub-rubro'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
