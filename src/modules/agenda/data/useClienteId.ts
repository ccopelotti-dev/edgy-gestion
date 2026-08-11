import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'

interface UseClienteIdResult {
  clienteId: string | null
  cargando: boolean
  error: string | null
}

/**
 * Resuelve el cliente_id del usuario logueado. Copia exacta del hook del
 * mismo nombre en Configuración/Utilidades -- cada módulo Supabase-backed
 * mantiene su propia copia liviana, en vez de importar entre módulos.
 */
export function useClienteId(): UseClienteIdResult {
  const [clienteId, setClienteId] = useState<string | null>(null)
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let activo = true

    async function cargar() {
      const { data: authData } = await supabase.auth.getUser()
      if (!authData.user) {
        if (activo) {
          setError('No hay sesión activa.')
          setCargando(false)
        }
        return
      }

      const { data, error: errFetch } = await supabase
        .from('usuarios_cliente')
        .select('cliente_id')
        .eq('user_id', authData.user.id)
        .single()

      if (!activo) return

      if (errFetch || !data) {
        setError('No encontramos un negocio asociado a este usuario.')
        setCargando(false)
        return
      }

      setClienteId(data.cliente_id)
      setCargando(false)
    }

    cargar()
    return () => {
      activo = false
    }
  }, [])

  return { clienteId, cargando, error }
}
