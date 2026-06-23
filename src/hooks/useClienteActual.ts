import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import type { Cliente, ClienteModulo, Modulo } from '@/types'

interface ModuloActivo extends Modulo {
  activo: boolean
}

interface UseClienteActualResult {
  cliente: Cliente | null
  modulosActivos: ModuloActivo[]
  cargando: boolean
  error: string | null
}

/**
 * Trae el cliente (tenant) del usuario logueado y la lista de módulos
 * que tiene activos. RLS en Supabase garantiza que solo se vea lo que
 * corresponde a ese cliente, no hace falta filtrar nada extra acá.
 */
export function useClienteActual(): UseClienteActualResult {
  const [cliente, setCliente] = useState<Cliente | null>(null)
  const [modulosActivos, setModulosActivos] = useState<ModuloActivo[]>([])
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let activo = true

    async function cargar() {
      setCargando(true)
      setError(null)

      const { data: authData } = await supabase.auth.getUser()
      if (!authData.user) {
        if (activo) {
          setCliente(null)
          setModulosActivos([])
          setCargando(false)
        }
        return
      }

      const { data: usuarioCliente, error: errUsuario } = await supabase
        .from('usuarios_cliente')
        .select('cliente_id')
        .eq('user_id', authData.user.id)
        .single()

      if (errUsuario || !usuarioCliente) {
        if (activo) {
          setError('No encontramos un negocio asociado a este usuario.')
          setCargando(false)
        }
        return
      }

      const { data: clienteData } = await supabase
        .from('clientes')
        .select('*')
        .eq('id', usuarioCliente.cliente_id)
        .single()

      const { data: clienteModulos } = await supabase
        .from('cliente_modulos')
        .select('activo, modulos(*)')
        .eq('cliente_id', usuarioCliente.cliente_id)
        .eq('activo', true)

      if (!activo) return

      setCliente((clienteData as Cliente) ?? null)
      setModulosActivos(
        (clienteModulos ?? []).map((row: any) => ({
          ...(row.modulos as Modulo),
          activo: row.activo as boolean,
        })),
      )
      setCargando(false)
    }

    cargar()
    return () => {
      activo = false
    }
  }, [])

  return { cliente, modulosActivos, cargando, error }
}

// Tipo auxiliar reexportado para los componentes que listan módulos
export type { ModuloActivo }
export type { ClienteModulo }
