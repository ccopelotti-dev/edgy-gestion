// ============================================================
// Hook compartido: ¿hay un turno de caja abierto ahora mismo?
// Edgy Gestión
//
// Mesas y Salón y Comandas y cocina necesitan saber esto para decidir
// si el plano/las comandas quedan editables (igual que Frambuesa: sin
// turno abierto, todo queda en modo lectura). Pero viven en módulos
// (rutas) distintos al de Caja por turno, así que no pueden usar su
// Context — como useResumenDashboard, consultan la tabla directo por
// Supabase en vez de pasar por el store.tsx de otro módulo.
//
// A propósito NO se ubica dentro de src/modules/caja-turno: es un
// hook cross-módulo, vive en src/hooks igual que useClienteActual.
//
// Sin Realtime a propósito: ningún otro módulo del repo lo usa hoy, y
// sumarlo acá exigiría habilitar replication para esta tabla aparte en
// Supabase (fuera de lo que se puede hacer solo con una migración
// SQL). Para no ser la única pantalla con comportamiento distinto,
// refresca al recuperar el foco de la pestaña/ventana en vez de en
// vivo — si el cajero cierra el turno desde otro dispositivo, el mozo
// lo ve la próxima vez que vuelve a esta pestaña, no instantáneamente.
// ============================================================

import { useCallback, useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { useClienteActual } from './useClienteActual'

interface TurnoActivo {
  id: string
  fechaApertura: string
  montoApertura: number
}

interface UseTurnoActivoResult {
  turno: TurnoActivo | null
  cargando: boolean
  refrescar: () => void
}

export function useTurnoActivo(): UseTurnoActivoResult {
  const { cliente } = useClienteActual()
  const [turno, setTurno] = useState<TurnoActivo | null>(null)
  const [cargando, setCargando] = useState(true)

  const cargar = useCallback(async () => {
    setCargando(true)
    const { data } = await supabase
      .from('turnos_caja')
      .select('id, fecha_apertura, monto_apertura')
      .eq('estado', 'abierto')
      .order('fecha_apertura', { ascending: false })
      .limit(1)
      .maybeSingle()

    setTurno(
      data
        ? { id: data.id, fechaApertura: data.fecha_apertura, montoApertura: Number(data.monto_apertura) }
        : null,
    )
    setCargando(false)
  }, [])

  useEffect(() => {
    if (!cliente?.id) return
    cargar()

    function alVolverElFoco() {
      if (document.visibilityState === 'visible') cargar()
    }
    window.addEventListener('focus', alVolverElFoco)
    document.addEventListener('visibilitychange', alVolverElFoco)
    return () => {
      window.removeEventListener('focus', alVolverElFoco)
      document.removeEventListener('visibilitychange', alVolverElFoco)
    }
  }, [cliente?.id, cargar])

  return { turno, cargando, refrescar: cargar }
}
