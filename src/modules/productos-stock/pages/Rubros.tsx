'use client'

import { useMemo, useState } from 'react'
import { Plus, Pencil, Trash2, Tags, Layers } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { useProductosStock } from '../data/store'
import { EmptyState } from '../components/productos/display'
import { RubroDialog, SubRubroDialog } from '../components/productos/rubro-dialogs'
import type { Rubro, SubRubro } from '../types'

// ─── Page ─────────────────────────────────────────────────────────────────────
//
// Administración de Rubros y Sub-rubros, compartidos entre Productos e
// Insumos. Reemplaza a la vieja "Categoria" (un solo nivel, y sin pantalla
// propia -- no existía forma de crear una desde la UI). Layout master-detail:
// rubros a la izquierda, sub-rubros del rubro seleccionado a la derecha.

const tipoLabel: Record<Rubro['tipo'], string> = {
  producto: 'Solo productos',
  insumo: 'Solo insumos',
  ambos: 'Productos e insumos',
}

export default function Rubros() {
  const { state, dispatch } = useProductosStock()

  const [seleccionado, setSeleccionado] = useState<string | null>(null)

  const [rubroDialogOpen, setRubroDialogOpen] = useState(false)
  const [editingRubro, setEditingRubro] = useState<Rubro | undefined>()

  const [subRubroDialogOpen, setSubRubroDialogOpen] = useState(false)
  const [editingSubRubro, setEditingSubRubro] = useState<SubRubro | undefined>()

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

  function handleNuevoRubro() {
    setEditingRubro(undefined)
    setRubroDialogOpen(true)
  }

  function handleEditarRubro(r: Rubro) {
    setEditingRubro(r)
    setRubroDialogOpen(true)
  }

  function handleGuardarRubro(data: { nombre: string; tipo: Rubro['tipo'] }) {
    if (editingRubro) {
      dispatch({ type: 'UPDATE_RUBRO', payload: { ...editingRubro, ...data } })
    } else {
      dispatch({ type: 'ADD_RUBRO', payload: data })
    }
  }

  function handleEliminarRubro(r: Rubro) {
    const subCount = conteoSubRubros.get(r.id) ?? 0
    const aviso =
      subCount > 0
        ? `"${r.nombre}" tiene ${subCount} sub-rubro(s), que también se van a eliminar. ¿Continuar?`
        : `¿Eliminar el rubro "${r.nombre}"?`
    if (window.confirm(aviso)) {
      dispatch({ type: 'DELETE_RUBRO', payload: r.id })
      if (seleccionado === r.id) setSeleccionado(null)
    }
  }

  function handleNuevoSubRubro() {
    setEditingSubRubro(undefined)
    setSubRubroDialogOpen(true)
  }

  function handleEditarSubRubro(sr: SubRubro) {
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

  function handleEliminarSubRubro(sr: SubRubro) {
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
            description="Creá el primer rubro para poder clasificar productos e insumos."
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
                  <p className="text-muted-foreground text-xs">{tipoLabel[r.tipo]}</p>
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
            description="Este rubro todavía no tiene sub-rubros. Son opcionales: un producto puede tener solo rubro."
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
      <RubroDialog
        open={rubroDialogOpen}
        onOpenChange={setRubroDialogOpen}
        onSave={handleGuardarRubro}
        editData={editingRubro}
      />

      {rubroActual && (
        <SubRubroDialog
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
