'use client'

import { useState } from 'react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { todayISO } from '../../lib/format'

const inputClass =
  'flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm'
const textareaClass =
  'flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm min-h-16'

// ─── SeguimientoDialog ────────────────────────────────────────────────────────

interface SeguimientoDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onSave: (data: { nombre: string; personaNombre: string }) => void
}

export function SeguimientoDialog({ open, onOpenChange, onSave }: SeguimientoDialogProps) {
  const [nombre, setNombre] = useState('')
  const [personaNombre, setPersonaNombre] = useState('')

  function handleSave() {
    if (!nombre.trim() || !personaNombre.trim()) return
    onSave({ nombre: nombre.trim(), personaNombre: personaNombre.trim() })
    setNombre('')
    setPersonaNombre('')
    onOpenChange(false)
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        if (!v) {
          setNombre('')
          setPersonaNombre('')
        }
        onOpenChange(v)
      }}
    >
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Nuevo seguimiento de horas</DialogTitle>
          <DialogDescription>
            Para llevar registro de horas trabajadas por persona o tarea.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4 py-4">
          <div className="grid gap-1.5">
            <label className="text-sm font-medium">Nombre *</label>
            <input
              className={inputClass}
              value={nombre}
              onChange={(e) => setNombre(e.target.value)}
              placeholder="Ej: Proyecto sitio web"
              autoFocus
            />
          </div>
          <div className="grid gap-1.5">
            <label className="text-sm font-medium">Persona *</label>
            <input
              className={inputClass}
              value={personaNombre}
              onChange={(e) => setPersonaNombre(e.target.value)}
              placeholder="Ej: Juan Pérez"
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button onClick={handleSave} disabled={!nombre.trim() || !personaNombre.trim()}>
            Crear seguimiento
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// ─── EntradaHorasDialog ───────────────────────────────────────────────────────

interface EntradaHorasDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onSave: (data: { fecha: string; horas: number; descripcion: string }) => void
}

export function EntradaHorasDialog({ open, onOpenChange, onSave }: EntradaHorasDialogProps) {
  const [fecha, setFecha] = useState(todayISO())
  const [horas, setHoras] = useState('')
  const [descripcion, setDescripcion] = useState('')

  function handleSave() {
    const horasNum = parseFloat(horas)
    if (!fecha || !horasNum || horasNum <= 0) return
    onSave({ fecha, horas: horasNum, descripcion: descripcion.trim() })
    setHoras('')
    setDescripcion('')
    onOpenChange(false)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Cargar horas</DialogTitle>
        </DialogHeader>

        <div className="grid gap-4 py-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="grid gap-1.5">
              <label className="text-sm font-medium">Fecha *</label>
              <input
                type="date"
                className={inputClass}
                value={fecha}
                onChange={(e) => setFecha(e.target.value)}
              />
            </div>
            <div className="grid gap-1.5">
              <label className="text-sm font-medium">Horas *</label>
              <input
                type="number"
                min={0}
                step={0.5}
                className={inputClass}
                value={horas}
                onChange={(e) => setHoras(e.target.value)}
                placeholder="Ej: 2.5"
              />
            </div>
          </div>
          <div className="grid gap-1.5">
            <label className="text-sm font-medium">Descripción</label>
            <textarea
              className={textareaClass}
              value={descripcion}
              onChange={(e) => setDescripcion(e.target.value)}
              placeholder="Qué se hizo en esas horas..."
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button onClick={handleSave} disabled={!fecha || !horas || parseFloat(horas) <= 0}>
            Cargar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
