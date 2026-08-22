'use client'

import { useMemo, useState } from 'react'
import { Plus, Pencil, Trash2, PackagePlus, ImageIcon } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  useProductosStock,
  crearComboConfirmado,
  actualizarComboConfirmado,
  eliminarComboConfirmado,
} from '../data/store'
import { useClienteActual } from '@/hooks/useClienteActual'
import { EmptyState, Amount } from '../components/productos/display'
import { ComboDialog } from '../components/productos/combo-dialogs'
import { ImagenPromocionalDialog } from '../components/productos/imagen-promocional-dialog'
import type { Combo } from '../types'

// ─── Page ─────────────────────────────────────────────────────────────────────
//
// Fase 5 del refactor de Productos: catálogo de combos. Cada combo agrupa
// productos existentes (componentes fijos + slots a elección por rubro) en
// un ítem vendible a precio fijo. El combo no tiene stock propio -- al
// vender un combo (Fase 19.1) se descuenta el stock de sus componentes
// fijos desde Ventas/Comandas/Menú público, no desde acá.

export default function Combos() {
  const { state, dispatch } = useProductosStock()
  // Fase 27d: selector "Disponible en" del ComboDialog, solo se muestra
  // si el cliente tiene 2+ locales cargados.
  const { cliente, puntosVenta } = useClienteActual()

  const [dialogOpen, setDialogOpen] = useState(false)
  const [editing, setEditing] = useState<Combo | undefined>()
  const [imagenDialogOpen, setImagenDialogOpen] = useState(false)
  const [comboImagen, setComboImagen] = useState<Combo | undefined>()
  const [eliminandoId, setEliminandoId] = useState<string | null>(null)

  const productosMap = useMemo(
    () => new Map(state.productos.map((p) => [p.id, p])),
    [state.productos],
  )
  const rubrosMap = useMemo(() => new Map(state.rubros.map((r) => [r.id, r])), [state.rubros])

  function handleNuevo() {
    setEditing(undefined)
    setDialogOpen(true)
  }

  function handleEditar(c: Combo) {
    setEditing(c)
    setDialogOpen(true)
  }

  async function handleGuardar(data: Omit<Combo, 'id' | 'createdAt'>): Promise<string | void> {
    if (!cliente?.id) return 'No se pudo identificar la cuenta -- probá recargar la página.'
    if (editing) {
      const res = await actualizarComboConfirmado({ ...editing, ...data }, cliente.id)
      if (!res.ok) return res.error
      dispatch({ type: 'CONFIRM_COMBO', payload: res.data })
    } else {
      const res = await crearComboConfirmado(data, cliente.id)
      if (!res.ok) return res.error
      dispatch({ type: 'CONFIRM_COMBO', payload: res.data })
    }
  }

  function handleImagenPromocional(c: Combo) {
    setComboImagen(c)
    setImagenDialogOpen(true)
  }

  async function handleEliminar(c: Combo) {
    if (!window.confirm(`¿Eliminar el combo "${c.nombre}"?`)) return
    setEliminandoId(c.id)
    const res = await eliminarComboConfirmado(c.id)
    setEliminandoId(null)
    if (!res.ok) {
      window.alert(res.error)
      return
    }
    dispatch({ type: 'CONFIRM_DELETE_COMBO', payload: c.id })
  }

  function resumenComponentes(c: Combo): string {
    const partes: string[] = []
    for (const cf of c.componentesFijos) {
      const p = productosMap.get(cf.productoId)
      partes.push(`${cf.cantidad}x ${p?.nombre ?? '(producto eliminado)'}`)
    }
    for (const ce of c.componentesEleccion) {
      const r = rubrosMap.get(ce.rubroId)
      partes.push(`elegí ${ce.cantidad} de ${r?.nombre ?? '(rubro eliminado)'}`)
    }
    return partes.join(' + ') || 'Sin componentes'
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold">Combos</h2>
          <p className="text-muted-foreground text-sm">
            Agrupá productos existentes en un ítem vendible a precio fijo.
          </p>
        </div>
        <Button onClick={handleNuevo}>
          <Plus className="mr-1 h-4 w-4" />
          Nuevo combo
        </Button>
      </div>

      {state.combos.length === 0 ? (
        <EmptyState
          icon={PackagePlus}
          title="Sin combos"
          description="Creá combos (ej: Combo Menú = Hamburguesa + Papas + 1 bebida a elección) a precio fijo."
        >
          <Button variant="outline" size="sm" onClick={handleNuevo}>
            Crear primer combo
          </Button>
        </EmptyState>
      ) : (
        <div className="rounded-lg border bg-card shadow-sm overflow-x-auto scroll-shadow-x">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-left text-muted-foreground">
                <th className="px-4 py-3 font-medium"></th>
                <th className="px-4 py-3 font-medium">Combo</th>
                <th className="px-4 py-3 font-medium">Composición</th>
                <th className="px-4 py-3 font-medium text-right">Precio</th>
                <th className="px-4 py-3 font-medium">Estado</th>
                <th className="px-4 py-3 font-medium text-right">Acciones</th>
              </tr>
            </thead>
            <tbody>
              {state.combos.map((c) => (
                <tr key={c.id} className="border-b last:border-0 hover:bg-muted/50">
                  <td className="px-4 py-3">
                    {c.imagenes?.[0] ? (
                      <img
                        src={c.imagenes[0]}
                        alt=""
                        className="h-10 w-10 rounded-md border object-cover"
                      />
                    ) : (
                      <div className="h-10 w-10 rounded-md border bg-muted" />
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <p className="font-medium">{c.nombre}</p>
                      {c.etiqueta && (
                        <span className="inline-flex items-center rounded-full bg-pink-100 px-2 py-0.5 text-xs font-medium text-pink-700 dark:bg-pink-900/30 dark:text-pink-400">
                          {c.etiqueta}
                        </span>
                      )}
                    </div>
                    {c.descripcion && (
                      <p className="text-muted-foreground text-xs">{c.descripcion}</p>
                    )}
                  </td>
                  <td className="px-4 py-3 text-muted-foreground text-xs max-w-xs">
                    {resumenComponentes(c)}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <Amount value={c.precioVenta} />
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={
                        c.disponible
                          ? 'inline-flex items-center rounded-full bg-green-100 px-2 py-0.5 text-xs font-medium text-green-700 dark:bg-green-900/30 dark:text-green-400'
                          : 'inline-flex items-center rounded-full bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-600 dark:bg-gray-800 dark:text-gray-400'
                      }
                    >
                      {c.disponible ? 'Disponible' : 'No disponible'}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <div className="flex items-center justify-end gap-1">
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8"
                        onClick={() => handleImagenPromocional(c)}
                        title="Generar imagen promocional"
                      >
                        <ImageIcon className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8"
                        onClick={() => handleEditar(c)}
                        title="Editar"
                      >
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 text-muted-foreground hover:text-red-500"
                        onClick={() => handleEliminar(c)}
                        disabled={eliminandoId === c.id}
                        title="Eliminar"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Dialog */}
      <ComboDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        onSave={handleGuardar}
        productos={state.productos}
        rubros={state.rubros}
        combos={state.combos}
        puntosVenta={puntosVenta}
        editData={editing}
      />

      <ImagenPromocionalDialog
        open={imagenDialogOpen}
        onOpenChange={setImagenDialogOpen}
        combo={comboImagen}
      />
    </div>
  )
}
