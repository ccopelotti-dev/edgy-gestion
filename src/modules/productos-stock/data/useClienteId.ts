import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'

interface UseClienteIdResult {
  clienteId: string | null
  cargando: boolean
  error: string | null
}

/**
 * Resuelve el cliente_id del usuario logueado. Copia exacta del hook del
 * mismo nombre en otros módulos Supabase-backed (Configuración, Utilidades,
 * etc.) -- cada módulo mantiene su propia copia liviana, en vez de importar
 * entre módulos. Se agrega acá recién en Fase 48c porque hasta ahora
 * ningún flujo de Productos y Stock necesitaba el cliente_id del lado del
 * cliente (todo pasaba por el middleware de store.tsx) -- InsumoDialog lo
 * necesita para el path del bucket privado "archivos-cliente" del Catálogo
 * Técnico (ver subirArchivo en utilidades/lib/archivos.ts).
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
