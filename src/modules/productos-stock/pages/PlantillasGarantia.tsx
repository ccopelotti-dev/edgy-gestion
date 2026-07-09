'use client'

import { useMemo, useState } from 'react'
import { Plus, Pencil, Trash2, ShieldCheck } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { useProductosStock } from '../data/store'
import { EmptyState } from '../components/productos/display'
import { PlantillaGarantiaDialog } from '../components/productos/garantia-dialogs'
import type { PlantillaGarantia } from '../types'

// ─── Page ─────────────────────────────────────────────────────────────────────
//
// Fase 4 del refactor de Productos: catálogo de plantillas de garantía (ej.
// "Garantía estándar" 12 meses, "Garantía extendida" 24 meses). La
// asignación de una plantilla a un rubro (default) o a un producto puntual
// (override) se hace desde Rubros.tsx y desde el diálogo de Producto -- acá
// solo se administra el catálogo en sí.
//
// La activación real de una garantía (para qué venta, desde cuándo corre)
// queda para la Fase 6, cuando Ventas emita una factura y consulte si el
// producto vendido tiene una plantilla asignada (propia o heredada de su
// rubro).

export default function PlantillasGarantia() {
  const { state, dispatch } = useProductosStock()

  const [dialogOpen, setDialogOpen] = useState(false)
  const [editing, setEditing] = useState<PlantillaGarantia | undefined>()

  // Cuántos rubros y productos usan cada plantilla -- para avisar antes de
  // borrar (igual que conteoSubRubros en Rubros.tsx).
  const usoPorPlantilla = useMemo(() => {
    const map = new Map<string, { rubros: number; productos: number }>()
    for (const r of state.rubros) {
      if (!r.plantillaGarantiaId) continue
      const actual = map.get(r.plantillaGarantiaId) ?? { rubros: 0, productos: 0 }
      actual.rubros += 1
      map.set(r.plantillaGarantiaId, actual)
    }
    for (const p of state.productos) {
      if (!p.plantillaGarantiaId) continue
      const actual = map.get(p.plantillaGarantiaId) ?? { rubros: 0, productos: 0 }
      actual.productos += 1
      map.set(p.plantillaGarantiaId, actual)
    }
    return map
  }, [state.rubros, state.productos])

  function handleNueva() {
    setEditing(undefined)
    setDialogOpen(true)
  }

  function handleEditar(pg: PlantillaGarantia) {
    setEditing(pg)
    setDialogOpen(true)
  }

  function handleGuardar(data: { nombre: string; duracionMeses: number; cobertura: string }) {
    if (editing) {
      dispatch({ type: 'UPDATE_PLANTILLA_GARANTIA', payload: { ...editing, ...data } })
    } else {
      dispatch({ type: 'ADD_PLANTILLA_GARANTIA', payload: data })
    }
  }

  function handleEliminar(pg: PlantillaGarantia) {
    const uso = usoPorPlantilla.get(pg.id)
    const partes: string[] = []
    if (uso?.rubros) partes.push(`${uso.rubros} rubro(s)`)
    if (uso?.productos) partes.push(`${uso.productos} producto(s)`)
    const aviso = partes.length
      ? `"${pg.nombre}" está asignada a ${partes.join(' y ')}, que se quedarán sin garantía. ¿Continuar?`
      : `¿Eliminar la plantilla "${pg.nombre}"?`
    if (window.confirm(aviso)) {
      dispatch({ type: 'DELETE_PLANTILLA_GARANTIA', payload: pg.id })
    }
  }

  return (
    <div className="max-w-2xl space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">Plantillas de garantía</h2>
        <Button size="sm" onClick={handleNueva}>
          <Plus className="mr-1 h-4 w-4" />
          Nueva
        </Button>
      </div>

      {state.plantillasGarantia.length === 0 ? (
        <EmptyState
          icon={ShieldCheck}
          title="Sin plantillas de garantía"
          description="Creá plantillas (ej: Garantía estándar 12 meses) y asignalas a un rubro o a un producto puntual."
        >
          <Button variant="outline" size="sm" onClick={handleNueva}>
            Crear primera plantilla
          </Button>
        </EmptyState>
      ) : (
        <div className="divide-y rounded-lg border bg-card shadow-sm">
          {state.plantillasGarantia.map((pg) => {
            const uso = usoPorPlantilla.get(pg.id)
            return (
              <div
                key={pg.id}
                className={cn(
                  'flex items-center justify-between gap-2 px-4 py-3 text-sm',
                )}
              >
                <div className="min-w-0">
                  <p className="truncate font-medium">
                    {pg.nombre}
                    <span className="ml-2 text-muted-foreground text-xs font-normal">
                      {pg.duracionMeses} {pg.duracionMeses === 1 ? 'mes' : 'meses'}
                    </span>
                  </p>
                  {pg.cobertura && (
                    <p className="text-muted-foreground text-xs truncate">{pg.cobertura}</p>
                  )}
                  {(uso?.rubros || uso?.productos) && (
                    <p className="text-muted-foreground text-xs">
                      {uso?.rubros ? `${uso.rubros} rubro(s)` : ''}
                      {uso?.rubros && uso?.productos ? ' · ' : ''}
                      {uso?.productos ? `${uso.productos} producto(s)` : ''}
                    </p>
                  )}
                </div>
                <div className="flex shrink-0 items-center gap-1">
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7"
                    onClick={() => handleEditar(pg)}
                    title="Editar"
                  >
                    <Pencil className="h-3.5 w-3.5" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="text-muted-foreground h-7 w-7 hover:text-red-500"
                    onClick={() => handleEliminar(pg)}
                    title="Eliminar"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </div>
            )
          })}
        </div>
      )}

      <p className="text-muted-foreground text-xs">
        Asigná una plantilla como default de un rubro entero desde Rubros, o pisala para un
        producto puntual desde su ficha. La activación de la garantía en una venta se conecta
        en una fase futura.
      </p>

      {/* Dialog */}
      <PlantillaGarantiaDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        onSave={handleGuardar}
        editData={editing}
      />
    </div>
  )
}
