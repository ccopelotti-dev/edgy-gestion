import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import type { Cliente, ClienteModulo, Modulo, VistaRol } from '@/types'

interface ModuloActivo extends Modulo {
  activo: boolean
}

// Rol del usuario logueado, ya resuelto -- lo que necesita el frontend
// para decidir qué ve (ej. DashboardHome usa `vista` para elegir entre
// el resumen ejecutivo y el panel operativo). Usuarios legados sin
// rol_id asignado todavía quedan con rolActual = null.
interface RolActual {
  id: string
  nombre: string
  esAdmin: boolean
  vista: VistaRol
}

interface UseClienteActualResult {
  cliente: Cliente | null
  modulosActivos: ModuloActivo[]
  rolActual: RolActual | null
  cargando: boolean
  error: string | null
}

/**
 * Trae el cliente (tenant) del usuario logueado, la lista de módulos
 * que tiene activos, y el rol de ese usuario (con su `vista`). RLS en
 * Supabase garantiza que solo se vea lo que corresponde a ese cliente,
 * no hace falta filtrar nada extra acá.
 */
export function useClienteActual(): UseClienteActualResult {
  const [cliente, setCliente] = useState<Cliente | null>(null)
  const [modulosActivos, setModulosActivos] = useState<ModuloActivo[]>([])
  const [rolActual, setRolActual] = useState<RolActual | null>(null)
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
          setRolActual(null)
          setCargando(false)
        }
        return
      }

      // Trae también el rol vinculado (rol_id) con su nombre/es_admin/vista
      // -- join por FK, mismo patrón que 'cliente_modulos(activo, modulos(*))'
      // más abajo. rol_id es nullable (usuarios legados), así que `roles`
      // puede venir null sin que la fila deje de resolverse.
      const { data: usuarioCliente, error: errUsuario } = await supabase
        .from('usuarios_cliente')
        .select('cliente_id, rol_id, roles(nombre, es_admin, vista)')
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

      const rolRow = (usuarioCliente as any).roles as
        | { nombre: string; es_admin: boolean; vista: VistaRol }
        | null
      setRolActual(
        usuarioCliente.rol_id && rolRow
          ? { id: usuarioCliente.rol_id as string, nombre: rolRow.nombre, esAdmin: rolRow.es_admin, vista: rolRow.vista }
          : null,
      )

      setCargando(false)
    }

    cargar()
    return () => {
      activo = false
    }
  }, [])

  return { cliente, modulosActivos, rolActual, cargando, error }
}

// Tipo auxiliar reexportado para los componentes que listan módulos
export type { ModuloActivo }
export type { ClienteModulo }
export type { RolActual }
