'use client'

import { useMemo, useState } from 'react'
import { Plus, Pencil, Trash2, UserRound } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useAlquileres } from '../data/store'
import { EmptyState } from '../components/display'
import { PropietarioDialog } from '../components/dialogs'
import { formatARS } from '../lib/format'
import type { Propietario } from '../types'

export default function Propietarios() {
  const { state, dispatch } = useAlquileres()
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editing, setEditing] = useState<Propietario | undefined>()

  const conteoPropiedades = useMemo(() => {
    const map = new Map<string, number>()
    for (const p of state.propiedades) map.set(p.propietarioId, (map.get(p.propietarioId) ?? 0) + 1)
    return map
  }, [state.propiedades])

  function handleNuevo() {
    setEditing(undefined)
    setDialogOpen(true)
  }

  function handleEditar(p: Propietario) {
    setEditing(p)
    setDialogOpen(true)
  }

  function handleGuardar(data: Omit<Propietario, 'id' | 'createdAt'>) {
    if (editing) {
      dispatch({ type: 'UPDATE_PROPIETARIO', payload: { ...editing, ...data } })
    } else {
      dispatch({ type: 'ADD_PROPIETARIO', payload: data })
    }
  }

  function handleEliminar(p: Propietario) {
    const count = conteoPropiedades.get(p.id) ?? 0
    if (count > 0) {
      window.alert(`"${p.nombreCompleto}" tiene ${count} propiedad(es) asociada(s). Reasigná o eliminá esas propiedades primero.`)
      return
    }
    if (window.confirm(`¿Eliminar al propietario "${p.nombreCompleto}"?`)) {
      dispatch({ type: 'DELETE_PROPIETARIO', payload: p.id })
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">Propietarios</h2>
        <Button size="sm" onClick={handleNuevo}>
          <Plus className="mr-1 h-4 w-4" />
          Nuevo propietario
        </Button>
      </div>

      {state.propietarios.length === 0 ? (
        <EmptyState icon={UserRound} title="Sin propietarios" description="Cargá el primer propietario para poder asociarle propiedades.">
          <Button variant="outline" size="sm" onClick={handleNuevo}>Crear primer propietario</Button>
        </EmptyState>
      ) : (
        <div className="overflow-x-auto rounded-lg border bg-card shadow-sm">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-left text-muted-foreground">
                <th className="px-4 py-3 font-medium">Nombre</th>
                <th className="px-4 py-3 font-medium">Documento</th>
                <th className="px-4 py-3 font-medium">Contacto</th>
                <th className="px-4 py-3 font-medium text-right">% Comisión</th>
                <th className="px-4 py-3 font-medium text-right">Propiedades</th>
                <th className="px-4 py-3 w-20" />
              </tr>
            </thead>
            <tbody>
              {state.propietarios.map((p) => (
                <tr key={p.id} className="border-b last:border-0 hover:bg-muted/30">
                  <td className="px-4 py-3 font-medium">{p.nombreCompleto}</td>
                  <td className="px-4 py-3 text-muted-foreground">{p.documento}</td>
                  <td className="px-4 py-3 text-muted-foreground">
                    <div>{p.telefono}</div>
                    {p.email && <div className="text-xs">{p.email}</div>}
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums">{p.comisionPorcentaje}%</td>
                  <td className="px-4 py-3 text-right">{conteoPropiedades.get(p.id) ?? 0}</td>
                  <td className="px-4 py-3">
                    <div className="flex justify-end gap-1">
                      <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => handleEditar(p)} title="Editar">
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                      <Button variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground hover:text-red-500" onClick={() => handleEliminar(p)} title="Eliminar">
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

      {/* Referencia rápida: cuánto cobró cada uno en total histórico (útil sin ir a Liquidaciones). */}
      {state.propietarios.length > 0 && (
        <p className="text-xs text-muted-foreground">
          {formatARS(state.pagos.reduce((acc, p) => acc + p.montoTotal, 0))} cobrados en total, histórico.
        </p>
      )}

      <PropietarioDialog open={dialogOpen} onOpenChange={setDialogOpen} onSave={handleGuardar} editData={editing} />
    </div>
  )
}
