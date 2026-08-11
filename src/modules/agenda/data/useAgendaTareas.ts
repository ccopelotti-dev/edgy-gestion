import { useCallback, useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import type { CategoriaTarea, EstadoTarea, PrioridadTarea, TareaAgenda } from '../types'
import { useClienteId } from './useClienteId'

function filaATarea(row: any): TareaAgenda {
  return {
    id: row.id,
    clienteId: row.cliente_id,
    titulo: row.titulo,
    descripcion: row.descripcion,
    fecha: row.fecha,
    horaInicio: row.hora_inicio,
    horaFin: row.hora_fin,
    categoria: row.categoria as CategoriaTarea,
    prioridad: row.prioridad as PrioridadTarea,
    estado: row.estado as EstadoTarea,
    createdAt: row.created_at,
  }
}

export interface NuevaTareaAgenda {
  titulo: string
  descripcion?: string
  fecha: string
  horaInicio?: string
  horaFin?: string
  categoria: CategoriaTarea
  prioridad: PrioridadTarea
}

interface UseAgendaTareasResult {
  clienteId: string | null
  tareas: TareaAgenda[]
  cargando: boolean
  error: string | null
  crear: (tarea: NuevaTareaAgenda) => Promise<boolean>
  marcarEstado: (id: string, estado: EstadoTarea) => Promise<boolean>
  eliminar: (id: string) => Promise<boolean>
  recargar: () => Promise<void>
}

export function useAgendaTareas(): UseAgendaTareasResult {
  const { clienteId, cargando: cargandoClienteId, error: errorClienteId } = useClienteId()
  const [tareas, setTareas] = useState<TareaAgenda[]>([])
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const cargar = useCallback(async () => {
    if (!clienteId) {
      setCargando(false)
      return
    }
    setCargando(true)
    setError(null)

    const { data, error: errFetch } = await supabase
      .from('agenda_tareas')
      .select('*')
      .eq('cliente_id', clienteId)
      .order('fecha', { ascending: true })

    if (errFetch) {
      setError('No pudimos cargar la agenda.')
      setCargando(false)
      return
    }

    setTareas((data ?? []).map(filaATarea))
    setCargando(false)
  }, [clienteId])

  useEffect(() => {
    if (cargandoClienteId) return
    if (errorClienteId) {
      setError(errorClienteId)
      setCargando(false)
      return
    }
    cargar()
  }, [cargandoClienteId, errorClienteId, cargar])

  const crear = useCallback(
    async (tarea: NuevaTareaAgenda) => {
      if (!clienteId) return false
      setError(null)

      const { error: errInsert } = await supabase.from('agenda_tareas').insert({
        cliente_id: clienteId,
        titulo: tarea.titulo,
        descripcion: tarea.descripcion || null,
        fecha: tarea.fecha,
        hora_inicio: tarea.horaInicio || null,
        hora_fin: tarea.horaFin || null,
        categoria: tarea.categoria,
        prioridad: tarea.prioridad,
      })

      if (errInsert) {
        setError('No pudimos crear la tarea.')
        return false
      }

      await cargar()
      return true
    },
    [clienteId, cargar],
  )

  const marcarEstado = useCallback(
    async (id: string, estado: EstadoTarea) => {
      setError(null)
      const { error: errUpdate } = await supabase.from('agenda_tareas').update({ estado }).eq('id', id)

      if (errUpdate) {
        setError('No pudimos actualizar la tarea.')
        return false
      }

      await cargar()
      return true
    },
    [cargar],
  )

  const eliminar = useCallback(
    async (id: string) => {
      setError(null)
      const { error: errDelete } = await supabase.from('agenda_tareas').delete().eq('id', id)

      if (errDelete) {
        setError('No pudimos eliminar la tarea.')
        return false
      }

      await cargar()
      return true
    },
    [cargar],
  )

  return {
    clienteId,
    tareas,
    cargando: cargando || cargandoClienteId,
    error,
    crear,
    marcarEstado,
    eliminar,
    recargar: cargar,
  }
}
