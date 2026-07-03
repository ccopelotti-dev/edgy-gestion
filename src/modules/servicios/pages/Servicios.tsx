'use client'

import { useMemo, useState } from 'react'
import { Search, Plus, Pencil, Trash2, Briefcase, ImageOff } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { useServicios, precioDesde } from '../data/store'
import {
  EstadoBadge,
  TipoServicioBadge,
  PrecioDisplay,
  EmptyState,
} from '../components/servicios/display'
import { ServicioDialog } from '../components/servicios/servicio-dialog'
import type { Servicio } from '../types'

const inputClass =
  'flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm'

export default function Servicios() {
  const { state, dispatch } = useServicios()

  const [search, setSearch] = useState('')
  const [rubroFilter, setRubroFilter] = useState('')
  const [estadoFilter, setEstadoFilter] = useState('')

  const [dialogOpen, setDialogOpen] = useState(false)
  const [editing, setEditing] = useState<Servicio | undefined>()

  const rubrosMap = useMemo(() => new Map(state.rubros.map((r) => [r.id, r])), [state.rubros])
  const subRubrosMap = useMemo(
    () => new Map(state.subRubros.map((sr) => [sr.id, sr])),
    [state.subRubros],
  )

  const servicios = useMemo(() => {
    let list = state.servicios
    if (rubroFilter) list = list.filter((s) => s.rubroId === rubroFilter)
    if (estadoFilter) list = list.filter((s) => s.estado === estadoFilter)
    if (search.trim()) {
      const q = search.toLowerCase()
      list = list.filter(
        (s) =>
          s.titulo.toLowerCase().includes(q) || s.descripcion.toLowerCase().includes(q),
      )
    }
    return [...list].sort((a, b) => a.titulo.localeCompare(b.titulo))
  }, [state.servicios, search, rubroFilter, estadoFilter])

  function handleNuevo() {
    setEditing(undefined)
    setDialogOpen(true)
  }

  function handleEditar(s: Servicio) {
    setEditing(s)
    setDialogOpen(true)
  }

  function handleGuardar(data: Omit<Servicio, 'id' | 'createdAt'>) {
    if (editing) {
      dispatch({ type: 'UPDATE_SERVICIO', payload: { ...editing, ...data } })
    } else {
      dispatch({ type: 'ADD_SERVICIO', payload: data })
    }
  }

  function handleEliminar(s: Servicio) {
    if (window.confirm(`¿Eliminar el servicio "${s.titulo}"?`)) {
      dispatch({ type: 'DELETE_SERVICIO', payload: s.id })
    }
  }

  return (
    <div className="space-y-6">
      {/* Filtros y alta */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3">
        <div className="relative flex-1 w-full sm:max-w-xs">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <input
            className={cn(inputClass, 'pl-9')}
            placeholder="Buscar servicio..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <select
          className={cn(inputClass, 'w-full sm:w-48')}
          value={rubroFilter}
          onChange={(e) => setRubroFilter(e.target.value)}
        >
          <option value="">Todos los rubros</option>
          {state.rubros.map((r) => (
            <option key={r.id} value={r.id}>
              {r.nombre}
            </option>
          ))}
        </select>
        <select
          className={cn(inputClass, 'w-full sm:w-40')}
          value={estadoFilter}
          onChange={(e) => setEstadoFilter(e.target.value)}
        >
          <option value="">Todos los estados</option>
          <option value="activo">Activo</option>
          <option value="inactivo">Inactivo</option>
        </select>
        <Button size="sm" className="w-full sm:w-auto sm:ml-auto" onClick={handleNuevo}>
          <Plus className="mr-1 h-4 w-4" />
          Nuevo servicio
        </Button>
      </div>

      {/* Tabla */}
      {servicios.length === 0 ? (
        <EmptyState
          icon={state.servicios.length === 0 ? Briefcase : ImageOff}
          title={state.servicios.length === 0 ? 'Sin servicios cargados' : 'Sin resultados'}
          description={
            state.servicios.length === 0
              ? 'Creá el primer servicio que ofrece tu negocio.'
              : 'No se encontraron servicios con los filtros aplicados.'
          }
        >
          {state.servicios.length === 0 && (
            <Button size="sm" onClick={handleNuevo}>
              <Plus className="mr-1 h-4 w-4" />
              Crear primer servicio
            </Button>
          )}
        </EmptyState>
      ) : (
        <div className="overflow-x-auto rounded-lg border bg-card shadow-sm">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-left text-muted-foreground">
                <th className="px-4 py-2.5 font-medium">Servicio</th>
                <th className="px-4 py-2.5 font-medium">Rubro</th>
                <th className="px-4 py-2.5 font-medium">Tipo</th>
                <th className="px-4 py-2.5 font-medium text-right">Precio</th>
                <th className="px-4 py-2.5 font-medium">Estado</th>
                <th className="px-4 py-2.5 w-20" />
              </tr>
            </thead>
            <tbody>
              {servicios.map((s) => {
                const rubro = rubrosMap.get(s.rubroId)
                const subRubro = s.subRubroId ? subRubrosMap.get(s.subRubroId) : undefined
                const desde = precioDesde(s)
                return (
                  <tr key={s.id} className="border-b last:border-0 hover:bg-muted/30">
                    <td className="px-4 py-3">
                      <p className="font-medium">{s.titulo}</p>
                      {s.descripcion && (
                        <p className="text-xs text-muted-foreground line-clamp-1 max-w-xs">
                          {s.descripcion}
                        </p>
                      )}
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">
                      {rubro?.nombre ?? 'Rubro eliminado'}
                      {subRubro && ` / ${subRubro.nombre}`}
                    </td>
                    <td className="px-4 py-3">
                      <TipoServicioBadge tipo={s.tipo} />
                    </td>
                    <td className="px-4 py-3 text-right">
                      {s.tipo === 'unico' ? (
                        <PrecioDisplay
                          modalidad={s.modalidadPrecio ?? 'a_convenir'}
                          precio={s.precio}
                        />
                      ) : desde != null ? (
                        <span className="text-muted-foreground text-xs">
                          Desde <PrecioDisplay modalidad="fijo" precio={desde} />
                        </span>
                      ) : (
                        <span className="text-muted-foreground italic">A convenir</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <EstadoBadge estado={s.estado} />
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1 justify-end">
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7"
                          onClick={() => handleEditar(s)}
                          title="Editar"
                        >
                          <Pencil className="h-3.5 w-3.5" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="text-muted-foreground h-7 w-7 hover:text-red-500"
                          onClick={() => handleEliminar(s)}
                          title="Eliminar"
                        >
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

      <ServicioDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        onSave={handleGuardar}
        editData={editing}
        rubros={state.rubros}
        subRubros={state.subRubros}
      />
    </div>
  )
}
