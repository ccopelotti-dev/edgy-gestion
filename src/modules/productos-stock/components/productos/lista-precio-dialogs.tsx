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
import { sanitizarDecimal, parsearDecimal, decimalATexto } from '@/lib/decimal'
import type { ListaPrecio } from '../../types'

const inputClass =
  'flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm'

// ─── ListaPrecioDialog ────────────────────────────────────────────────────────

interface ListaPrecioFormData {
  nombre: string
  porcentajeRecargo: number
}

interface ListaPrecioDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onSave: (data: ListaPrecioFormData) => Promise<string | void>
  editData?: ListaPrecio
}

const emptyLista: ListaPrecioFormData = { nombre: '', porcentajeRecargo: 0 }

export function ListaPrecioDialog({
  open,
  onOpenChange,
  onSave,
  editData,
}: ListaPrecioDialogProps) {
  const [form, setForm] = useState<ListaPrecioFormData>(emptyLista)
  const [porcentajeRecargoTexto, setPorcentajeRecargoTexto] = useState('')
  const [guardando, setGuardando] = useState(false)
  const [errorGuardado, setErrorGuardado] = useState('')

  useEffect(() => {
    if (open) {
      setForm(
        editData
          ? { nombre: editData.nombre, porcentajeRecargo: editData.porcentajeRecargo }
          : emptyLista,
      )
      setPorcentajeRecargoTexto(editData ? decimalATexto(editData.porcentajeRecargo) : '')
      setGuardando(false)
      setErrorGuardado('')
    }
  }, [open, editData])

  async function handleSave() {
    if (!form.nombre.trim() || guardando) return
    setErrorGuardado('')
    setGuardando(true)
    const error = await onSave({ nombre: form.nombre.trim(), porcentajeRecargo: form.porcentajeRecargo })
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
          <DialogTitle>{editData ? 'Editar lista de precio' : 'Nueva lista de precio'}</DialogTitle>
          <DialogDescription>
            El % de recargo se aplica sobre el costo de cada producto (ej: costo $100 + 30% =
            $130).
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4 py-4">
          <div className="grid gap-1.5">
            <label className="text-sm font-medium">Nombre *</label>
            <input
              className={inputClass}
              value={form.nombre}
              onChange={(e) => setForm({ ...form, nombre: e.target.value })}
              placeholder="Ej: Delivery"
              autoFocus
            />
          </div>

          <div className="grid gap-1.5">
            <label className="text-sm font-medium">% de recargo sobre el costo</label>
            <input
              className={inputClass}
              type="text"
              inputMode="decimal"
              value={porcentajeRecargoTexto}
              onChange={(e) => {
                const texto = sanitizarDecimal(e.target.value)
                setPorcentajeRecargoTexto(texto)
                setForm({ ...form, porcentajeRecargo: parsearDecimal(texto) })
              }}
              placeholder="Ej: 30"
            />
            <p className="text-xs text-muted-foreground">
              Es el recargo por defecto de la lista. Podés pisar el precio de un producto
              puntual desde la tabla de la derecha.
            </p>
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
          <Button onClick={handleSave} disabled={!form.nombre.trim() || guardando}>
            {guardando && <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />}
            {editData ? 'Guardar cambios' : 'Crear lista'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
