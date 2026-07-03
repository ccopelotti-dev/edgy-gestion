'use client'

import { useMemo, useState } from 'react'
import { Plus, Pencil, Trash2, Tags, Layers } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { useServicios } from '../data/store'
import { EmptyState } from '../components/servicios/display'
import { RubroServicioDialog, SubRubroServicioDialog } from '../components/servicios/rubro-dialogs'
import type { RubroServicio, SubRubroServicio } from '../types'

// ─── Page ─────────────────────────────────────────────────────────────────────
//
// Administración de Rubros y Sub-rubros de Servicios. Mismo layout
// master-detail que la página equivalente de Productos y Stock, pero con
// tablas propias (no comparte catálogo con Productos/Insumos).

export default function Rubros() {
  const { state, dispatch } = useServicios()

  const [seleccionado, setSeleccionado] = useState<string | null>(null)

  const [rubroDialogOpen, setRubroDialogOpen] = useState(false)
  const [editingRubro, setEditingRubro] = useState<RubroServicio | undefined>()

  const [subRubroDialogOpen, setSubRubroDialogOpen] = useState(false)
  const [editingSubRubro, setEditingSubRubro] = useState<SubRubroServicio | undefined>()

  const rubroActual = useMemo(
    () => state.rubros.find((r) => r.id === seleccionado) ?? null,
    [state.rubros, seleccionado],
  )

  const subRubrosDelActual = useMemo(
    () => state.subRubros.filter((sr) => sr.rubroId === seleccionado),
    [state.subRubros, seleccionado],
  )

  const conteoSubRubros = useMemo(() => {
    const map = new Map<string, number>()
    for (const sr of state.subRubros) {
      map.set(sr.rubroId, (map.get(sr.rubroId) ?? 0) + 1)
    }
    return map
  }, [state.subRubros])

  const conteoServicios = useMemo(() => {
    const map = new Map<string, number>()
    for (const s of state.servicios) {
      map.set(s.rubroId, (map.get(s.rubroId) ?? 0) + 1)
    }
    return map
  }, [state.servicios])

  function handleNuevoRubro() {
    setEditingRubro(undefined)
    setRubroDialogOpen(true)
  }

  function handleEditarRubro(r: RubroServicio) {
    setEditingRubro(r)
    setRubroDialogOpen(true)
  }

  function handleGuardarRubro(data: { nombre: string }) {
    if (editingRubro) {
      dispatch({ type: 'UPDATE_RUBRO', payload: { ...editingRubro, ...data } })
    } else {
      dispatch({ type: 'ADD_RUBRO', payload: data })
    }
  }

  function handleEliminarRubro(r: RubroServicio) {
    const subCount = conteoSubRubros.get(r.id) ?? 0
    const servCount = conteoServicios.get(r.id) ?? 0
    let aviso = `¿Eliminar el rubro "${r.nombre}"?`
    if (subCount > 0 || servCount > 0) {
      aviso = `"${r.nombre}" tiene ${subCount} sub-rubro(s) y ${servCount} servicio(s) asociados. Los sub-rubros también se eliminan (los servicios quedan sin ese rubro). ¿Continuar?`
    }
    if (window.confirm(aviso)) {
      dispatch({ type: 'DELETE_RUBRO', payload: r.id })
      if (seleccionado === r.id) setSeleccionado(null)
    }
  }

  function handleNuevoSubRubro() {
    setEditingSubRubro(undefined)
    setSubRubroDialogOpen(true)
  }

  function handleEditarSubRubro(sr: SubRubroServicio) {
    setEditingSubRubro(sr)
    setSubRubroDialogOpen(true)
  }

  function handleGuardarSubRubro(data: { nombre: string }) {
    if (!seleccionado) return
    if (editingSubRubro) {
      dispatch({ type: 'UPDATE_SUBRUBRO', payload: { ...editingSubRubro, ...data } })
    } else {
      dispatch({ type: 'ADD_SUBRUBRO', payload: { ...data, rubroId: seleccionado } })
    }
  }

  function handleEliminarSubRubro(sr: SubRubroServicio) {
    if (window.confirm(`¿Eliminar el sub-rubro "${sr.nombre}"?`)) {
      dispatch({ type: 'DELETE_SUBRUBRO', payload: sr.id })
    }
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[320px_1fr]">
      {/* Columna: Rubros */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold">Rubros</h2>
          <Button size="sm" onClick={handleNuevoRubro}>
            <Plus className="mr-1 h-4 w-4" />
            Nuevo
          </Button>
        </div>

        {state.rubros.length === 0 ? (
          <EmptyState
            icon={Tags}
            title="Sin rubros"
            description="Creá el primer rubro para poder clasificar servicios (ej: Salud, Legal)."
          >
            <Button variant="outline" size="sm" onClick={handleNuevoRubro}>
              Crear primer rubro
            </Button>
          </EmptyState>
        ) : (
          <div className="divide-y rounded-lg border bg-card shadow-sm">
            {state.rubros.map((r) => (
              <button
                key={r.id}
                type="button"
                onClick={() => setSeleccionado(r.id)}
                className={cn(
                  'flex w-full items-center justify-between gap-2 px-4 py-3 text-left text-sm transition-colors hover:bg-muted/50',
                  seleccionado === r.id && 'bg-muted/70',
                )}
              >
                <div className="min-w-0">
                  <p className="truncate font-medium">{r.nombre}</p>
                  <p className="text-muted-foreground text-xs">
                    {conteoServicios.get(r.id) ?? 0} servicio(s)
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-1">
                  <span className="text-muted-foreground text-xs">
                    {conteoSubRubros.get(r.id) ?? 0} sub
                  </span>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7"
                    onClick={(e) => {
                      e.stopPropagation()
                      handleEditarRubro(r)
                    }}
                    title="Editar"
                  >
                    <Pencil className="h-3.5 w-3.5" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="text-muted-foreground h-7 w-7 hover:text-red-500"
                    onClick={(e) => {
                      e.stopPropagation()
                      handleEliminarRubro(r)
                    }}
                    title="Eliminar"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Columna: Sub-rubros del rubro seleccionado */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold">
            {rubroActual ? `Sub-rubros de "${rubroActual.nombre}"` : 'Sub-rubros'}
          </h2>
          {rubroActual && (
            <Button size="sm" onClick={handleNuevoSubRubro}>
              <Plus className="mr-1 h-4 w-4" />
              Nuevo
            </Button>
          )}
        </div>

        {!rubroActual ? (
          <EmptyState
            icon={Layers}
            title="Seleccioná un rubro"
            description="Elegí un rubro de la izquierda para ver y administrar sus sub-rubros."
          />
        ) : subRubrosDelActual.length === 0 ? (
          <EmptyState
            icon={Layers}
            title="Sin sub-rubros"
            description="Este rubro todavía no tiene sub-rubros. Son opcionales: un servicio puede tener solo rubro."
          >
            <Button variant="outline" size="sm" onClick={handleNuevoSubRubro}>
              Crear primer sub-rubro
            </Button>
          </EmptyState>
        ) : (
          <div className="divide-y rounded-lg border bg-card shadow-sm">
            {subRubrosDelActual.map((sr) => (
              <div key={sr.id} className="flex items-center justify-between gap-2 px-4 py-3 text-sm">
                <p className="font-medium">{sr.nombre}</p>
                <div className="flex shrink-0 items-center gap-1">
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7"
                    onClick={() => handleEditarSubRubro(sr)}
                    title="Editar"
                  >
                    <Pencil className="h-3.5 w-3.5" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="text-muted-foreground h-7 w-7 hover:text-red-500"
                    onClick={() => handleEliminarSubRubro(sr)}
                    title="Eliminar"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Dialogs */}
      <RubroServicioDialog
        open={rubroDialogOpen}
        onOpenChange={setRubroDialogOpen}
        onSave={handleGuardarRubro}
        editData={editingRubro}
      />

      {rubroActual && (
        <SubRubroServicioDialog
          open={subRubroDialogOpen}
          onOpenChange={setSubRubroDialogOpen}
          onSave={handleGuardarSubRubro}
          rubroNombre={rubroActual.nombre}
          editData={editingSubRubro}
        />
      )}
    </div>
  )
}
