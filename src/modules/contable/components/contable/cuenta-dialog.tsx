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
import { TIPOS_CUENTA } from '../../types'
import type { CuentaContable, TipoCuenta } from '../../types'
import type { CuentaInput } from '../../data/useCuentasContables'

const inputClass =
  'flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm'

interface CuentaDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onSave: (input: CuentaInput) => void
  cuentas: CuentaContable[]
  cuentaEditar?: CuentaContable | null
}

export function CuentaDialog({ open, onOpenChange, onSave, cuentas, cuentaEditar }: CuentaDialogProps) {
  const [codigo, setCodigo] = useState('')
  const [nombre, setNombre] = useState('')
  const [tipo, setTipo] = useState<TipoCuenta>('activo')
  const [cuentaPadreId, setCuentaPadreId] = useState('')
  const [imputable, setImputable] = useState(true)

  useEffect(() => {
    if (!open) return
    if (cuentaEditar) {
      setCodigo(cuentaEditar.codigo)
      setNombre(cuentaEditar.nombre)
      setTipo(cuentaEditar.tipo)
      setCuentaPadreId(cuentaEditar.cuentaPadreId ?? '')
      setImputable(cuentaEditar.imputable)
    } else {
      setCodigo('')
      setNombre('')
      setTipo('activo')
      setCuentaPadreId('')
      setImputable(true)
    }
  }, [open, cuentaEditar])

  function handleSave() {
    if (!codigo.trim() || !nombre.trim()) return
    onSave({
      codigo: codigo.trim(),
      nombre: nombre.trim(),
      tipo,
      cuentaPadreId: cuentaPadreId || null,
      imputable,
    })
    onOpenChange(false)
  }

  const posiblesPadres = cuentas.filter((c) => !cuentaEditar || c.id !== cuentaEditar.id)

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{cuentaEditar ? 'Editar cuenta' : 'Nueva cuenta contable'}</DialogTitle>
          <DialogDescription>
            El código define el orden en el árbol (ej. "1.1.01"). Las cuentas de agrupación (no
            imputables) no reciben movimientos, solo organizan el plan.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4 py-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="grid gap-1.5">
              <label className="text-sm font-medium">Código *</label>
              <input
                className={inputClass}
                value={codigo}
                onChange={(e) => setCodigo(e.target.value)}
                placeholder="Ej: 1.1.06"
                autoFocus
              />
            </div>
            <div className="grid gap-1.5">
              <label className="text-sm font-medium">Tipo *</label>
              <select className={inputClass} value={tipo} onChange={(e) => setTipo(e.target.value as TipoCuenta)}>
                {TIPOS_CUENTA.map((t) => (
                  <option key={t.value} value={t.value}>
                    {t.label}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="grid gap-1.5">
            <label className="text-sm font-medium">Nombre *</label>
            <input
              className={inputClass}
              value={nombre}
              onChange={(e) => setNombre(e.target.value)}
              placeholder="Ej: Caja Chica"
            />
          </div>

          <div className="grid gap-1.5">
            <label className="text-sm font-medium">Cuenta padre</label>
            <select className={inputClass} value={cuentaPadreId} onChange={(e) => setCuentaPadreId(e.target.value)}>
              <option value="">Sin padre (cuenta de primer nivel)</option>
              {posiblesPadres.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.codigo} - {c.nombre}
                </option>
              ))}
            </select>
          </div>

          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={imputable} onChange={(e) => setImputable(e.target.checked)} />
            Imputable (recibe movimientos directos en asientos)
          </label>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button onClick={handleSave} disabled={!codigo.trim() || !nombre.trim()}>
            {cuentaEditar ? 'Guardar cambios' : 'Crear cuenta'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
