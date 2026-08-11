import { useCallback, useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import type { Empleado } from '../types'
import { useClienteId } from './useClienteId'

function filaAEmpleado(row: any): Empleado {
  return {
    id: row.id,
    clienteId: row.cliente_id,
    nombre: row.nombre,
    cuil: row.cuil,
    fechaIngreso: row.fecha_ingreso,
    categoria: row.categoria,
    sueldoBasico: Number(row.sueldo_basico),
    activo: row.activo,
    createdAt: row.created_at,
  }
}

export interface NuevoEmpleado {
  nombre: string
  cuil?: string
  fechaIngreso: string
  categoria?: string
  sueldoBasico: number
}

interface UseEmpleadosResult {
  clienteId: string | null
  empleados: Empleado[]
  cargando: boolean
  error: string | null
  crear: (datos: NuevoEmpleado) => Promise<boolean>
  actualizar: (id: string, datos: Partial<NuevoEmpleado>) => Promise<boolean>
  darDeBaja: (id: string) => Promise<boolean>
  recargar: () => Promise<void>
}

export function useEmpleados(): UseEmpleadosResult {
  const { clienteId, cargando: cargandoClienteId, error: errorClienteId } = useClienteId()
  const [empleados, setEmpleados] = useState<Empleado[]>([])
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
      .from('empleados')
      .select('*')
      .eq('cliente_id', clienteId)
      .order('nombre', { ascending: true })

    if (errFetch) {
      setError('No pudimos cargar los empleados.')
      setCargando(false)
      return
    }

    setEmpleados((data ?? []).map(filaAEmpleado))
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
    async (datos: NuevoEmpleado) => {
      if (!clienteId) return false
      setError(null)

      const { error: errInsert } = await supabase.from('empleados').insert({
        cliente_id: clienteId,
        nombre: datos.nombre,
        cuil: datos.cuil || null,
        fecha_ingreso: datos.fechaIngreso,
        categoria: datos.categoria || null,
        sueldo_basico: datos.sueldoBasico,
      })

      if (errInsert) {
        setError('No pudimos crear el empleado.')
        return false
      }

      await cargar()
      return true
    },
    [clienteId, cargar],
  )

  const actualizar = useCallback(
    async (id: string, datos: Partial<NuevoEmpleado>) => {
      setError(null)
      const patch: Record<string, unknown> = {}
      if (datos.nombre !== undefined) patch.nombre = datos.nombre
      if (datos.cuil !== undefined) patch.cuil = datos.cuil || null
      if (datos.fechaIngreso !== undefined) patch.fecha_ingreso = datos.fechaIngreso
      if (datos.categoria !== undefined) patch.categoria = datos.categoria || null
      if (datos.sueldoBasico !== undefined) patch.sueldo_basico = datos.sueldoBasico

      const { error: errUpdate } = await supabase.from('empleados').update(patch).eq('id', id)

      if (errUpdate) {
        setError('No pudimos actualizar el empleado.')
        return false
      }

      await cargar()
      return true
    },
    [cargar],
  )

  const darDeBaja = useCallback(
    async (id: string) => {
      setError(null)
      const { error: errUpdate } = await supabase.from('empleados').update({ activo: false }).eq('id', id)

      if (errUpdate) {
        setError('No pudimos dar de baja al empleado.')
        return false
      }

      await cargar()
      return true
    },
    [cargar],
  )

  return {
    clienteId,
    empleados,
    cargando: cargando || cargandoClienteId,
    error,
    crear,
    actualizar,
    darDeBaja,
    recargar: cargar,
  }
}
