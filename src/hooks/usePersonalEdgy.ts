import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'

interface UsePersonalEdgyResult {
  /** null mientras carga, true/false una vez resuelto */
  esStaff: boolean | null
  /** Sesión activa de Supabase (null si no hay nadie logueado) */
  haySesion: boolean | null
  nombre: string | null
  cargando: boolean
}

/**
 * Resuelve si el usuario logueado está en personal_edgy. La policy de esa
 * tabla (personal_edgy_select_staff) ya hace el trabajo pesado: si la
 * persona no es staff, la consulta devuelve 0 filas en vez de un error —
 * por eso no hace falta ningún chequeo de permisos extra acá, solo mirar
 * si vino una fila o no.
 */
export function usePersonalEdgy(): UsePersonalEdgyResult {
  const [esStaff, setEsStaff] = useState<boolean | null>(null)
  const [haySesion, setHaySesion] = useState<boolean | null>(null)
  const [nombre, setNombre] = useState<string | null>(null)
  const [cargando, setCargando] = useState(true)

  useEffect(() => {
    let activo = true

    async function resolver() {
      setCargando(true)
      const { data: authData } = await supabase.auth.getUser()

      if (!authData.user) {
        if (activo) {
          setHaySesion(false)
          setEsStaff(false)
          setNombre(null)
          setCargando(false)
        }
        return
      }

      const { data } = await supabase
        .from('personal_edgy')
        .select('nombre')
        .eq('user_id', authData.user.id)
        .maybeSingle()

      if (!activo) return
      setHaySesion(true)
      setEsStaff(!!data)
      setNombre(data?.nombre ?? null)
      setCargando(false)
    }

    resolver()

    const { data: listener } = supabase.auth.onAuthStateChange(() => {
      resolver()
    })

    return () => {
      activo = false
      listener.subscription.unsubscribe()
    }
  }, [])

  return { esStaff, haySesion, nombre, cargando }
}
