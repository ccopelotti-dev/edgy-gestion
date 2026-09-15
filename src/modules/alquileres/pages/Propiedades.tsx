'use client'

import { useMemo, useState } from 'react'
import { Plus, Pencil, Trash2, Building2, Home } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { useAlquileres } from '../data/store'
import { EmptyState, EstadoUnidadBadge } from '../components/display'
import { PropiedadDialog, UnidadDialog } from '../components/dialogs'
import type { Propiedad, Unidad } from '../types'

export default function Propiedades() {
  const { state, dispatch } = useAlquileres()

  const [seleccionada, setSeleccionada] = useState<string | null>(null)

  const [propiedadDialogOpen, setPropiedadDialogOpen] = useState(false)
  const [editingPropiedad, setEditingPropiedad] = useState<Propiedad | undefined>()

  const [unidadDialogOpen, setUnidadDialogOpen] = useState(false)
  const [editingUnidad, setEditingUnidad] = useState<Unidad | undefined>()

  const propiedadActual = useMemo(
    () => state.propiedades.find((p) => p.id === seleccionada) ?? null,
    [state.propiedades, seleccionada],
  )

  const unidadesDeLaActual = useMemo(
    () => state.unidades.filter((u) => u.propiedadId === seleccionada),
    [state.unidades, seleccionada],
  )

  const conteoUnidades = useMemo(() => {
    const map = new Map<string, number>()
    for (const u of state.unidades) map.set(u.propiedadId, (map.get(u.propiedadId) ?? 0) + 1)
    return map
  }, [state.unidades])

  const propietarioNombre = (id: string) => state.propietarios.find((p) => p.id === id)?.nombreCompleto ?? '—'

  function handleNuevaPropiedad() {
    setEditingPropiedad(undefined)
    setPropiedadDialogOpen(true)
  }

  function handleEditarPropiedad(p: Propiedad) {
    setEditingPropiedad(p)
    setPropiedadDialogOpen(true)
  }

  function handleGuardarPropiedad(data: Omit<Propiedad, 'id' | 'createdAt'>) {
    if (editingPropiedad) {
      dispatch({ type: 'UPDATE_PROPIEDAD', payload: { ...editingPropiedad, ...data } })
    } else {
      dispatch({ type: 'ADD_PROPIEDAD', payload: data })
    }
  }

  function handleEliminarPropiedad(p: Propiedad) {
    const count = conteoUnidades.get(p.id) ?? 0
    const aviso =
      count > 0
        ? `"${p.nombre}" tiene ${count} unidad(es) asociada(s). También se eliminan. ¿Continuar?`
        : `¿Eliminar la propiedad "${p.nombre}"?`
    if (window.confirm(aviso)) {
      dispatch({ type: 'DELETE_PROPIEDAD', payload: p.id })
      if (seleccionada === p.id) setSeleccionada(null)
    }
  }

  function handleNuevaUnidad() {
    setEditingUnidad(undefined)
    setUnidadDialogOpen(true)
  }

  function handleEditarUnidad(u: Unidad) {
    setEditingUnidad(u)
    setUnidadDialogOpen(true)
  }

  function handleGuardarUnidad(data: Omit<Unidad, 'id' | 'createdAt' | 'propiedadId'>) {
    if (!seleccionada) return
    if (editingUnidad) {
      dispatch({ type: 'UPDATE_UNIDAD', payload: { ...editingUnidad, ...data } })
    } else {
      dispatch({ type: 'ADD_UNIDAD', payload: { ...data, propiedadId: seleccionada } })
    }
  }

  function handleEliminarUnidad(u: Unidad) {
    const tieneInquilino = state.inquilinos.some((i) => i.unidadId === u.id)
    if (tieneInquilino) {
      window.alert(`La unidad "${u.nombre}" tiene un inquilino cargado. Eliminá o reasigná ese inquilino primero.`)
      return
    }
    if (window.confirm(`¿Eliminar la unidad "${u.nombre}"?`)) {
      dispatch({ type: 'DELETE_UNIDAD', payload: u.id })
    }
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[360px_1fr]">
      {/* Columna: Propiedades */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold">Propiedades</h2>
          <Button size="sm" onClick={handleNuevaPropiedad}>
            <Plus className="mr-1 h-4 w-4" />
            Nueva
          </Button>
        </div>

        {state.propiedades.length === 0 ? (
          <EmptyState icon={Building2} title="Sin propiedades" description="Creá la primera propiedad para poder cargarle unidades.">
            <Button variant="outline" size="sm" onClick={handleNuevaPropiedad}>Crear primera propiedad</Button>
          </EmptyState>
        ) : (
          <div className="divide-y rounded-lg border bg-card shadow-sm">
            {state.propiedades.map((p) => (
              <button
                key={p.id}
                type="button"
                onClick={() => setSeleccionada(p.id)}
                className={cn(
                  'flex w-full items-center justify-between gap-2 px-4 py-3 text-left text-sm transition-colors hover:bg-muted/50',
                  seleccionada === p.id && 'bg-muted/70',
                )}
              >
                <div className="min-w-0">
                  <p className="truncate font-medium">{p.nombre}</p>
                  <p className="text-muted-foreground text-xs">{propietarioNombre(p.propietarioId)}</p>
                </div>
                <div className="flex shrink-0 items-center gap-1">
                  <span className="text-muted-foreground text-xs">{conteoUnidades.get(p.id) ?? 0} unid.</span>
                  <Button variant="ghost" size="icon" className="h-7 w-7" onClick={(e) => { e.stopPropagation(); handleEditarPropiedad(p) }} title="Editar">
                    <Pencil className="h-3.5 w-3.5" />
                  </Button>
                  <Button variant="ghost" size="icon" className="text-muted-foreground h-7 w-7 hover:text-red-500" onClick={(e) => { e.stopPropagation(); handleEliminarPropiedad(p) }} title="Eliminar">
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Columna: Unidades de la propiedad seleccionada */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold">{propiedadActual ? `Unidades de "${propiedadActual.nombre}"` : 'Unidades'}</h2>
          {propiedadActual && (
            <Button size="sm" onClick={handleNuevaUnidad}>
              <Plus className="mr-1 h-4 w-4" />
              Nueva unidad
            </Button>
          )}
        </div>

        {!propiedadActual ? (
          <EmptyState icon={Home} title="Seleccioná una propiedad" description="Elegí una propiedad de la izquierda para ver y administrar sus unidades." />
        ) : unidadesDeLaActual.length === 0 ? (
          <EmptyState icon={Home} title="Sin unidades" description="Esta propiedad todavía no tiene unidades cargadas.">
            <Button variant="outline" size="sm" onClick={handleNuevaUnidad}>Crear primera unidad</Button>
          </EmptyState>
        ) : (
          <div className="overflow-x-auto rounded-lg border bg-card shadow-sm">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left text-muted-foreground">
                  <th className="px-4 py-3 font-medium">Unidad</th>
                  <th className="px-4 py-3 font-medium">Tipo</th>
                  <th className="px-4 py-3 font-medium">Detalle</th>
                  <th className="px-4 py-3 font-medium">Estado</th>
                  <th className="px-4 py-3 w-20" />
                </tr>
              </thead>
              <tbody>
                {unidadesDeLaActual.map((u) => (
                  <tr key={u.id} className="border-b last:border-0 hover:bg-muted/30">
                    <td className="px-4 py-3 font-medium">{u.nombre}</td>
                    <td className="px-4 py-3 text-muted-foreground capitalize">{u.tipo}</td>
                    <td className="px-4 py-3 text-muted-foreground">
                      {[u.ambientes ? `${u.ambientes} amb.` : null, u.superficieM2 ? `${u.superficieM2} m²` : null, u.extras || null]
                        .filter(Boolean)
                        .join(' · ') || '—'}
                    </td>
                    <td className="px-4 py-3"><EstadoUnidadBadge estado={u.estado} /></td>
                    <td className="px-4 py-3">
                      <div className="flex justify-end gap-1">
                        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => handleEditarUnidad(u)} title="Editar">
                          <Pencil className="h-3.5 w-3.5" />
                        </Button>
                        <Button variant="ghost" size="icon" className="text-muted-foreground h-7 w-7 hover:text-red-500" onClick={() => handleEliminarUnidad(u)} title="Eliminar">
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <PropiedadDialog
        open={propiedadDialogOpen}
        onOpenChange={setPropiedadDialogOpen}
        onSave={handleGuardarPropiedad}
        editData={editingPropiedad}
        propietarios={state.propietarios}
      />

      {propiedadActual && (
        <UnidadDialog
          open={unidadDialogOpen}
          onOpenChange={setUnidadDialogOpen}
          onSave={handleGuardarUnidad}
          editData={editingUnidad}
          propiedadNombre={propiedadActual.nombre}
        />
      )}
    </div>
  )
}
