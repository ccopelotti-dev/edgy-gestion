import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'

// Resumen operativo para DashboardOperativoGastronomico -- mismo
// criterio que useResumenDashboard/useTurnoActivo: /dashboard es una
// ruta hermana, no anidada dentro de ningún módulo, así que no hay
// ningún Provider de mesas-salon/comandas-cocina/caja-turno del que
// leer. Se consulta Supabase directo.
//
// Esquema real (ver 0018_gastronomico_nucleo.sql):
// - mesas: cliente_id, estado ('libre'|'ocupada'|'cobro'|'reservada')
// - turnos_caja: cliente_id, estado ('abierto'|'cerrado')
// - comandas: cliente_id, estado ('abierta'|'cobro'|'cerrada'|'cancelada')
// - comanda_items: comanda_id (sin cliente_id propio), estado_cocina
//   ('pendiente'|'en_preparacion'|'listo'|'entregado')
//
// "Pendientes en cocina" cuenta ítems en 'pendiente' o 'en_preparacion'
// de comandas abiertas -- se resuelve en dos pasos (comandas abiertas
// del cliente, después sus ítems) en vez de un filtro sobre el embed
// (`comanda_items!inner(comandas...)`), para no introducir un patrón de
// query nuevo sin probar: el resto del repo solo usa .eq()/.in() planos.
interface ResumenOperativoGastronomico {
  cargando: boolean
  turnoAbierto: boolean
  mesasLibres: number
  mesasOcupadas: number
  comandasPendientesCocina: number
}

const VACIO: Omit<ResumenOperativoGastronomico, 'cargando'> = {
  turnoAbierto: false,
  mesasLibres: 0,
  mesasOcupadas: 0,
  comandasPendientesCocina: 0,
}

export function useResumenOperativoGastronomico(clienteId: string | undefined): ResumenOperativoGastronomico {
  const [data, setData] = useState(VACIO)
  const [cargando, setCargando] = useState(true)

  useEffect(() => {
    let activo = true
    if (!clienteId) {
      setCargando(false)
      return
    }
    setCargando(true)

    async function cargar() {
      const [turnos, mesas, comandasAbiertas] = await Promise.all([
        supabase.from('turnos_caja').select('id').eq('cliente_id', clienteId).eq('estado', 'abierto').limit(1),
        supabase.from('mesas').select('estado').eq('cliente_id', clienteId),
        supabase.from('comandas').select('id').eq('cliente_id', clienteId).eq('estado', 'abierta'),
      ])

      const idsComandasAbiertas = (comandasAbiertas.data ?? []).map((c) => c.id)
      let comandasPendientesCocina = 0
      if (idsComandasAbiertas.length > 0) {
        const { data: items } = await supabase
          .from('comanda_items')
          .select('id')
          .in('comanda_id', idsComandasAbiertas)
          .in('estado_cocina', ['pendiente', 'en_preparacion'])
        comandasPendientesCocina = (items ?? []).length
      }

      if (!activo) return

      const mesasRows = mesas.data ?? []
      setData({
        turnoAbierto: (turnos.data ?? []).length > 0,
        mesasLibres: mesasRows.filter((m) => m.estado === 'libre').length,
        mesasOcupadas: mesasRows.filter((m) => m.estado !== 'libre').length,
        comandasPendientesCocina,
      })
      setCargando(false)
    }

    cargar()
    return () => {
      activo = false
    }
  }, [clienteId])

  return { ...data, cargando }
}
