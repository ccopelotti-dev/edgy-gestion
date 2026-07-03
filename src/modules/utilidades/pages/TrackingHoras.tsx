'use client'

import { useMemo, useState } from 'react'
import { Plus, Trash2, Clock, ChevronLeft, User } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useUtilidades, useEntradasDeSeguimiento, useTotalHoras } from '../data/store'
import { EmptyState } from '../components/utilidades/display'
import { SeguimientoDialog, EntradaHorasDialog } from '../components/utilidades/seguimiento-dialogs'
import { formatDate, formatHoras } from '../lib/format'
import type { SeguimientoHoras } from '../types'

function TarjetaSeguimiento({
  seguimiento,
  onAbrir,
  onEliminar,
}: {
  seguimiento: SeguimientoHoras
  onAbrir: () => void
  onEliminar: () => void
}) {
  const total = useTotalHoras(seguimiento.id)

  return (
    <div className="rounded-lg border bg-card p-4 shadow-sm">
      <div className="flex items-start justify-between">
        <button type="button" onClick={onAbrir} className="text-left">
          <p className="font-medium text-sm">{seguimiento.nombre}</p>
          <p className="text-xs text-muted-foreground flex items-center gap-1 mt-0.5">
            <User className="h-3 w-3" /> {seguimiento.personaNombre}
          </p>
        </button>
        <Button
          variant="ghost"
          size="icon"
          className="h-7 w-7 text-muted-foreground hover:text-red-500"
          onClick={onEliminar}
          title="Eliminar"
        >
          <Trash2 className="h-3.5 w-3.5" />
        </Button>
      </div>
      <div className="mt-3 flex items-center justify-between">
        <span className="text-xs text-muted-foreground">Total acumulado</span>
        <span className="text-sm font-semibold tabular-nums">{formatHoras(total)}</span>
      </div>
    </div>
  )
}

function DetalleSeguimiento({
  seguimiento,
  onVolver,
}: {
  seguimiento: SeguimientoHoras
  onVolver: () => void
}) {
  const { dispatch } = useUtilidades()
  const entradas = useEntradasDeSeguimiento(seguimiento.id)
  const total = useTotalHoras(seguimiento.id)
  const [dialogOpen, setDialogOpen] = useState(false)

  function handleEliminarEntrada(id: string) {
    if (window.confirm('¿Eliminar esta entrada de horas?')) {
      dispatch({ type: 'DELETE_ENTRADA', payload: id })
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <Button variant="ghost" size="sm" onClick={onVolver}>
          <ChevronLeft className="h-4 w-4 mr-1" />
          Volver
        </Button>
        <Button size="sm" onClick={() => setDialogOpen(true)}>
          <Plus className="h-4 w-4 mr-1" />
          Cargar horas
        </Button>
      </div>

      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold">{seguimiento.nombre}</h2>
          <p className="text-sm text-muted-foreground flex items-center gap-1">
            <User className="h-3.5 w-3.5" /> {seguimiento.personaNombre}
          </p>
        </div>
        <div className="text-right">
          <p className="text-xs text-muted-foreground">Total acumulado</p>
          <p className="text-xl font-bold tabular-nums">{formatHoras(total)}</p>
        </div>
      </div>

      {entradas.length === 0 ? (
        <EmptyState icon={Clock} title="Sin horas cargadas" description="Registrá la primera entrada." />
      ) : (
        <div className="overflow-x-auto rounded-lg border bg-card shadow-sm">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-left text-muted-foreground">
                <th className="px-4 py-2 font-medium">Fecha</th>
                <th className="px-4 py-2 font-medium text-right">Horas</th>
                <th className="px-4 py-2 font-medium">Descripción</th>
                <th className="px-4 py-2 w-10" />
              </tr>
            </thead>
            <tbody>
              {entradas.map((e) => (
                <tr key={e.id} className="border-b last:border-0">
                  <td className="px-4 py-2 tabular-nums">{formatDate(e.fecha)}</td>
                  <td className="px-4 py-2 text-right tabular-nums">{formatHoras(e.horas)}</td>
                  <td className="px-4 py-2 text-muted-foreground">{e.descripcion || '-'}</td>
                  <td className="px-4 py-2">
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7 text-muted-foreground hover:text-red-500"
                      onClick={() => handleEliminarEntrada(e.id)}
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

      <EntradaHorasDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        onSave={(data) => dispatch({ type: 'ADD_ENTRADA', payload: { ...data, seguimientoId: seguimiento.id } })}
      />
    </div>
  )
}

export default function TrackingHoras() {
  const { state, dispatch } = useUtilidades()
  const [seleccionado, setSeleccionado] = useState<string | null>(null)
  const [dialogOpen, setDialogOpen] = useState(false)

  const seguimientoActual = useMemo(
    () => state.seguimientos.find((s) => s.id === seleccionado) ?? null,
    [state.seguimientos, seleccionado],
  )

  function handleEliminar(id: string, nombre: string) {
    if (window.confirm(`¿Eliminar el seguimiento "${nombre}"? Se pierden también sus horas cargadas.`)) {
      dispatch({ type: 'DELETE_SEGUIMIENTO', payload: id })
      if (seleccionado === id) setSeleccionado(null)
    }
  }

  if (seguimientoActual) {
    return <DetalleSeguimiento seguimiento={seguimientoActual} onVolver={() => setSeleccionado(null)} />
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground max-w-lg">
          Registro de horas trabajadas por persona o proyecto. Pensado como base para un futuro
          vínculo con Formular Producto (mano de obra) en Productos y Stock.
        </p>
        <Button size="sm" onClick={() => setDialogOpen(true)}>
          <Plus className="h-4 w-4 mr-1" />
          Nuevo seguimiento
        </Button>
      </div>

      {state.seguimientos.length === 0 ? (
        <EmptyState
          icon={Clock}
          title="Aún no creaste ningún seguimiento de horas"
          description="Creá uno para empezar a registrar horas trabajadas."
        >
          <Button size="sm" onClick={() => setDialogOpen(true)}>
            Crea un seguimiento
          </Button>
        </EmptyState>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {state.seguimientos.map((s) => (
            <TarjetaSeguimiento
              key={s.id}
              seguimiento={s}
              onAbrir={() => setSeleccionado(s.id)}
              onEliminar={() => handleEliminar(s.id, s.nombre)}
            />
          ))}
        </div>
      )}

      <SeguimientoDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        onSave={(data) => dispatch({ type: 'ADD_SEGUIMIENTO', payload: data })}
      />
    </div>
  )
}
