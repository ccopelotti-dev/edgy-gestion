'use client'

import { useMemo, useState } from 'react'
import { Plus, Pencil, Trash2, Users } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useAlquileres } from '../data/store'
import { EmptyState } from '../components/display'
import { InquilinoDialog } from '../components/dialogs'
import { formatARS, formatDate, diasHasta } from '../lib/format'
import type { Inquilino } from '../types'

export default function Inquilinos() {
  const { state, dispatch } = useAlquileres()

  const [unidadParaAsignar, setUnidadParaAsignar] = useState('')
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editing, setEditing] = useState<Inquilino | undefined>()
  const [unidadDelDialogo, setUnidadDelDialogo] = useState<string>('')

  const unidadesLibres = useMemo(
    () => state.unidades.filter((u) => !state.inquilinos.some((i) => i.unidadId === u.id)),
    [state.unidades, state.inquilinos],
  )

  function nombreUnidad(unidadId: string) {
    const u = state.unidades.find((x) => x.id === unidadId)
    if (!u) return '—'
    const propiedad = state.propiedades.find((p) => p.id === u.propiedadId)
    return propiedad ? `${propiedad.nombre} · ${u.nombre}` : u.nombre
  }

  function handleAsignar() {
    if (!unidadParaAsignar) return
    setEditing(undefined)
    setUnidadDelDialogo(unidadParaAsignar)
    setDialogOpen(true)
  }

  function handleEditar(i: Inquilino) {
    setEditing(i)
    setUnidadDelDialogo(i.unidadId)
    setDialogOpen(true)
  }

  function handleGuardar(data: Omit<Inquilino, 'id' | 'createdAt' | 'unidadId'>) {
    if (editing) {
      dispatch({ type: 'UPDATE_INQUILINO', payload: { ...editing, ...data } })
      return
    }
    dispatch({ type: 'ADD_INQUILINO', payload: { ...data, unidadId: unidadDelDialogo } })
    // Mismo comportamiento que el sistema viejo: al asignar un inquilino,
    // la unidad pasa a "ocupada" automáticamente.
    const unidad = state.unidades.find((u) => u.id === unidadDelDialogo)
    if (unidad && unidad.estado !== 'ocupada') {
      dispatch({ type: 'UPDATE_UNIDAD', payload: { ...unidad, estado: 'ocupada' } })
    }
    setUnidadParaAsignar('')
  }

  function handleEliminar(i: Inquilino) {
    if (!window.confirm(`¿Eliminar a "${i.nombre} ${i.apellido}" como inquilino? La unidad queda disponible.`)) return
    dispatch({ type: 'DELETE_INQUILINO', payload: i.id })
    const unidad = state.unidades.find((u) => u.id === i.unidadId)
    if (unidad && unidad.estado !== 'disponible') {
      dispatch({ type: 'UPDATE_UNIDAD', payload: { ...unidad, estado: 'disponible' } })
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <h2 className="text-lg font-semibold">Inquilinos</h2>
        {unidadesLibres.length > 0 && (
          <div className="flex items-center gap-2">
            <select
              className="flex h-9 rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm"
              value={unidadParaAsignar}
              onChange={(e) => setUnidadParaAsignar(e.target.value)}
            >
              <option value="">Elegir unidad libre...</option>
              {unidadesLibres.map((u) => (
                <option key={u.id} value={u.id}>{nombreUnidad(u.id)}</option>
              ))}
            </select>
            <Button size="sm" onClick={handleAsignar} disabled={!unidadParaAsignar}>
              <Plus className="mr-1 h-4 w-4" />
              Asignar inquilino
            </Button>
          </div>
        )}
      </div>

      {state.inquilinos.length === 0 ? (
        <EmptyState icon={Users} title="Sin inquilinos" description="Elegí una unidad libre arriba para asignarle un inquilino.">
          {state.unidades.length === 0 && (
            <p className="text-xs text-muted-foreground">Primero cargá propiedades y unidades en la pestaña "Propiedades y unidades".</p>
          )}
        </EmptyState>
      ) : (
        <div className="overflow-x-auto rounded-lg border bg-card shadow-sm">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-left text-muted-foreground">
                <th className="px-4 py-3 font-medium">Inquilino</th>
                <th className="px-4 py-3 font-medium">Unidad</th>
                <th className="px-4 py-3 font-medium">Contacto</th>
                <th className="px-4 py-3 font-medium text-right">Alquiler</th>
                <th className="px-4 py-3 font-medium">Contrato hasta</th>
                <th className="px-4 py-3 w-20" />
              </tr>
            </thead>
            <tbody>
              {state.inquilinos.map((i) => {
                const dias = i.finContrato ? diasHasta(i.finContrato) : null
                const porVencer = dias != null && dias <= 60
                return (
                  <tr key={i.id} className="border-b last:border-0 hover:bg-muted/30">
                    <td className="px-4 py-3 font-medium">{i.nombre} {i.apellido}</td>
                    <td className="px-4 py-3 text-muted-foreground">{nombreUnidad(i.unidadId)}</td>
                    <td className="px-4 py-3 text-muted-foreground">
                      <div>{i.telefono || '—'}</div>
                      {i.email && <div className="text-xs">{i.email}</div>}
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums">{formatARS(i.montoAlquiler)}</td>
                    <td className="px-4 py-3">
                      {i.finContrato ? (
                        <span className={porVencer ? 'font-medium text-yellow-700 dark:text-yellow-400' : 'text-muted-foreground'}>
                          {formatDate(i.finContrato)}
                          {porVencer && dias != null && (dias >= 0 ? ` (en ${dias} días)` : ' (vencido)')}
                        </span>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex justify-end gap-1">
                        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => handleEditar(i)} title="Editar">
                          <Pencil className="h-3.5 w-3.5" />
                        </Button>
                        <Button variant="ghost" size="icon" className="text-muted-foreground h-7 w-7 hover:text-red-500" onClick={() => handleEliminar(i)} title="Eliminar">
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      <InquilinoDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        onSave={handleGuardar}
        editData={editing}
        unidadNombre={nombreUnidad(unidadDelDialogo)}
      />
    </div>
  )
}
